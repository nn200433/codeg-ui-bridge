import {
  CodegApiError,
  CodegClient,
  buildBridgePrompt,
  normalizeBaseUrl
} from "@codeg-ui-bridge/bridge-core";
import type {
  ApplyExtra,
  ApplyRequest,
  CodegEventEnvelope,
  CodegSessionSnapshot
} from "@codeg-ui-bridge/bridge-core";
import { MESSAGE_TYPES } from "./messages";
import type {
  AgentStreamEvent,
  BridgeConfig,
  BridgeRuntime,
  CodegProject,
  ContentSelection,
  ContentSourceHint,
  RuntimeRequest,
  RuntimeResponse
} from "./messages";

const CONFIG_KEY = "codegui.bridge.config";
const CONNECTION_KEY = "codegui.bridge.connection";
const TAB_ID_KEY = "codegui.bridge.attached-tab-id";
const PAGE_URL_KEY = "codegui.bridge.attached-page-url";
const ORIGIN_PREFS_KEY = "codegui.bridge.origin-prefs";
const LAST_SELECTION_KEY = "codegui.bridge.last-selection";

const WS_PING_INTERVAL_MS = 20_000;
const WS_RECONNECT_MAX_MS = 30_000;

type ConnectionRecord = {
  connectionId: string;
  agentType: string;
  workingDir: string;
  externalSessionId?: string;
  conversationId?: number;
};

type OriginPrefs = Record<string, { agentType: string; project: CodegProject | null }>;

type SocketState = {
  socket: WebSocket | null;
  ready: boolean;
  desiredConnectionId: string | null;
  subscriptionId: string | null;
  lastSeqByConnection: Record<string, number>;
  attempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  intentionallyClosed: boolean;
};

const socketState: SocketState = {
  socket: null,
  ready: false,
  desiredConnectionId: null,
  subscriptionId: null,
  lastSeqByConnection: {},
  attempts: 0,
  reconnectTimer: null,
  pingTimer: null,
  intentionallyClosed: false
};

function newSubscriptionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getConfig(): Promise<BridgeConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const config = result[CONFIG_KEY] as BridgeConfig | undefined;
  return (
    config ?? {
      host: "127.0.0.1",
      port: "23080",
      token: "",
      agentType: "",
      project: null
    }
  );
}

async function saveConfig(config: BridgeConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

function hasEndpoint(config: BridgeConfig): boolean {
  return Boolean(config.host && config.port && config.token);
}

function getClient(config: BridgeConfig): CodegClient {
  return new CodegClient(normalizeBaseUrl(config.host, config.port), config.token);
}

async function getConnection(): Promise<ConnectionRecord | null> {
  const result = await chrome.storage.local.get(CONNECTION_KEY);
  return (result[CONNECTION_KEY] as ConnectionRecord | undefined) ?? null;
}

async function saveConnection(record: ConnectionRecord | null): Promise<void> {
  if (record) {
    await chrome.storage.local.set({ [CONNECTION_KEY]: record });
  } else {
    await chrome.storage.local.remove(CONNECTION_KEY);
  }
}

async function patchConnection(patch: Partial<ConnectionRecord>): Promise<void> {
  const record = await getConnection();
  if (!record) {
    return;
  }
  await saveConnection({ ...record, ...patch });
}

async function getAttachedTabId(): Promise<number | null> {
  const result = await chrome.storage.local.get(TAB_ID_KEY);
  const value = result[TAB_ID_KEY] as number | undefined;
  return typeof value === "number" ? value : null;
}

async function getAttachedPageUrl(): Promise<string> {
  const result = await chrome.storage.local.get(PAGE_URL_KEY);
  return (result[PAGE_URL_KEY] as string | undefined) ?? "";
}

function originOf(pageUrl: string): string {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return pageUrl;
  }
}

async function getOriginPref(pageUrl?: string): Promise<{ agentType?: string; project?: CodegProject | null }> {
  if (!pageUrl) {
    return {};
  }
  const result = await chrome.storage.local.get(ORIGIN_PREFS_KEY);
  const prefs = (result[ORIGIN_PREFS_KEY] as OriginPrefs | undefined) ?? {};
  const pref = prefs[originOf(pageUrl)];
  return pref ? { agentType: pref.agentType, project: pref.project } : {};
}

async function saveOriginPref(pageUrl: string, config: BridgeConfig): Promise<void> {
  const result = await chrome.storage.local.get(ORIGIN_PREFS_KEY);
  const prefs = (result[ORIGIN_PREFS_KEY] as OriginPrefs | undefined) ?? {};
  prefs[originOf(pageUrl)] = { agentType: config.agentType, project: config.project };
  await chrome.storage.local.set({ [ORIGIN_PREFS_KEY]: prefs });
}

async function forwardToAttachedTab(event: AgentStreamEvent): Promise<void> {
  const tabId = await getAttachedTabId();
  if (tabId == null) {
    return;
  }
  try {
    await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.contentAgentEvent, event });
  } catch {
    // The attached tab may be gone or has no content script; ignore delivery failures.
  }
}

function isDeadConnectionStatus(status: string): boolean {
  const normalized = (status || "").toLowerCase();
  return normalized.includes("fail") || normalized.includes("disconnect") || normalized.includes("exit") || normalized.includes("error");
}

/**
 * Returns a live connection for the configured agent + working dir.
 * Reuses the recorded connection when it still exists on the server
 * (Codeg reaps idle connections), otherwise reconnects — resuming the
 * previous agent session through its external session id when known.
 */
async function ensureConnection(config: BridgeConfig): Promise<ConnectionRecord> {
  const client = getClient(config);
  let record = await getConnection();

  if (record) {
    const connections = await client.listConnections().catch(() => []);
    const alive = connections.find((item) => item.id === record!.connectionId);
    if (alive && !isDeadConnectionStatus(alive.status)) {
      void client.touchConnection(record.connectionId).catch(() => undefined);
      return record;
    }
  }

  const workingDir = config.project?.folderPath || "";
  const agentType = config.agentType;
  if (!agentType) {
    throw new Error("请先在 popup 中选择智能体");
  }

  const attemptConnect = async (sessionId?: string): Promise<string> =>
    client.connect(agentType, workingDir || undefined, sessionId);

  let connectionId: string;
  try {
    connectionId = await attemptConnect(record?.externalSessionId);
  } catch (error) {
    if (record?.externalSessionId) {
      connectionId = await attemptConnect();
    } else {
      throw error;
    }
  }

  record = {
    connectionId,
    agentType,
    workingDir,
    externalSessionId: record?.externalSessionId,
    conversationId: record?.conversationId
  };
  await saveConnection(record);
  attachConnectionStream(connectionId);
  void captureSessionIdentity(config, connectionId);
  return record;
}

async function captureSessionIdentity(config: BridgeConfig, connectionId: string): Promise<void> {
  const client = getClient(config);
  const snapshot = await client.getSessionSnapshot(connectionId).catch(() => null);
  if (!snapshot) {
    return;
  }
  await patchConnection({
    externalSessionId: snapshot.external_id ?? undefined,
    conversationId: typeof snapshot.conversation_id === "number" ? snapshot.conversation_id : undefined
  });
}

function sendSocketMessage(payload: unknown): void {
  const socket = socketState.socket;
  if (socket && socket.readyState === WebSocket.OPEN && socketState.ready) {
    socket.send(JSON.stringify(payload));
  }
}

function attachConnectionStream(connectionId: string): void {
  socketState.desiredConnectionId = connectionId;
  void ensureSocket();

  if (socketState.ready && socketState.subscriptionId) {
    const sinceSeq = socketState.lastSeqByConnection[connectionId] ?? null;
    sendSocketMessage({
      action: "attach",
      subscription_id: socketState.subscriptionId,
      connection_id: connectionId,
      since_seq: sinceSeq
    });
  }
}

function detachConnectionStream(): void {
  if (socketState.subscriptionId && socketState.desiredConnectionId) {
    sendSocketMessage({
      action: "detach",
      subscription_id: socketState.subscriptionId,
      connection_id: socketState.desiredConnectionId
    });
  }
  socketState.desiredConnectionId = null;
  closeSocket();
}

function closeSocket(): void {
  socketState.intentionallyClosed = true;
  if (socketState.pingTimer) {
    clearInterval(socketState.pingTimer);
    socketState.pingTimer = null;
  }
  if (socketState.reconnectTimer) {
    clearTimeout(socketState.reconnectTimer);
    socketState.reconnectTimer = null;
  }
  const socket = socketState.socket;
  socketState.socket = null;
  socketState.ready = false;
  socketState.subscriptionId = null;
  socket?.close();
}

async function ensureSocket(): Promise<void> {
  if (socketState.socket && socketState.socket.readyState !== WebSocket.CLOSED) {
    return;
  }

  const config = await getConfig();
  if (!hasEndpoint(config)) {
    return;
  }
  const client = getClient(config);

  socketState.intentionallyClosed = false;
  const socket = new WebSocket(client.wsUrl, client.wsProtocols);
  socketState.socket = socket;
  socketState.ready = false;
  socketState.subscriptionId = newSubscriptionId();

  socket.onopen = () => {
    // Wait for the server's __ready__ channel frame before attaching.
  };

  socket.onmessage = (message) => {
    void handleSocketFrame(message.data);
  };

  socket.onclose = () => {
    socketState.ready = false;
    if (socketState.intentionallyClosed) {
      return;
    }
    scheduleSocketReconnect();
  };

  socket.onerror = () => {
    // onclose follows; reconnection handled there.
  };

  if (socketState.pingTimer) {
    clearInterval(socketState.pingTimer);
  }
  socketState.pingTimer = setInterval(() => {
    if (socketState.socket?.readyState === WebSocket.OPEN) {
      sendSocketMessage({ action: "ping" });
      void keepConnectionAlive();
    }
  }, WS_PING_INTERVAL_MS);
}

let reconnectInFlight = false;

async function scheduleSocketReconnect(): Promise<void> {
  if (socketState.reconnectTimer || socketState.intentionallyClosed || reconnectInFlight) {
    return;
  }
  if (!socketState.desiredConnectionId) {
    return;
  }
  const config = await getConfig();
  if (!hasEndpoint(config)) {
    return;
  }

  reconnectInFlight = true;
  const delay = Math.min(WS_RECONNECT_MAX_MS, 1000 * 2 ** socketState.attempts);
  socketState.attempts += 1;
  socketState.reconnectTimer = setTimeout(() => {
    socketState.reconnectTimer = null;
    reconnectInFlight = false;
    if (socketState.desiredConnectionId) {
      void ensureSocket();
    }
  }, delay);
}

async function keepConnectionAlive(): Promise<void> {
  if (!socketState.desiredConnectionId) {
    return;
  }
  const config = await getConfig();
  if (!hasEndpoint(config)) {
    return;
  }
  void getClient(config).touchConnection(socketState.desiredConnectionId).catch(() => undefined);
}

async function handleSocketFrame(raw: unknown): Promise<void> {
  let frame: Record<string, unknown>;
  try {
    frame = JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return;
  }

  if (frame.channel === "__ready__") {
    socketState.ready = true;
    socketState.attempts = 0;
    if (socketState.desiredConnectionId && socketState.subscriptionId) {
      const sinceSeq = socketState.lastSeqByConnection[socketState.desiredConnectionId] ?? null;
      sendSocketMessage({
        action: "attach",
        subscription_id: socketState.subscriptionId,
        connection_id: socketState.desiredConnectionId,
        since_seq: sinceSeq
      });
    }
    return;
  }

  const type = frame.type as string | undefined;
  if (!type) {
    return;
  }

  if (type === "snapshot") {
    const snapshot = frame.snapshot as CodegSessionSnapshot | undefined;
    const connectionId = frame.connection_id as string | undefined;
    if (connectionId) {
      socketState.lastSeqByConnection[connectionId] =
        typeof frame.event_seq === "number" ? frame.event_seq : 0;
    }
    if (typeof snapshot?.external_id === "string") {
      await patchConnection({ externalSessionId: snapshot.external_id });
    }
    if (typeof snapshot?.conversation_id === "number") {
      await patchConnection({ conversationId: snapshot.conversation_id });
    }
    await forwardToAttachedTab({ kind: "status", status: String(snapshot?.status ?? "ready") });
    const pendingPermission = snapshot?.pending_permission as
      | { request_id?: string; tool_call?: { title?: string }; options?: { option_id?: string; name?: string }[] }
      | undefined;
    if (pendingPermission?.request_id) {
      await forwardToAttachedTab({
        kind: "permission",
        requestId: pendingPermission.request_id,
        title: pendingPermission.tool_call?.title,
        options: (pendingPermission.options ?? []).map((option) => ({
          optionId: option.option_id ?? "",
          name: option.name ?? ""
        }))
      });
    }
    const pendingQuestion = snapshot?.pending_question as
      | { question_id?: string; questions?: CodegEventEnvelope[] }
      | undefined;
    if (pendingQuestion?.question_id) {
      await forwardToAttachedTab({
        kind: "question",
        questionId: pendingQuestion.question_id,
        questions: normalizeQuestionSpecs(pendingQuestion.questions ?? [])
      });
    }
    const pendingPlan = snapshot?.pending_plan_approval as
      | { approval_id?: string; plan_markdown?: string }
      | undefined;
    if (pendingPlan?.approval_id) {
      await forwardToAttachedTab({
        kind: "plan_approval",
        approvalId: pendingPlan.approval_id,
        planMarkdown: pendingPlan.plan_markdown ?? ""
      });
    }
    return;
  }

  if (type === "replay") {
    const events = (frame.events ?? []) as CodegEventEnvelope[];
    const highWater = frame.high_water_seq;
    for (const envelope of events) {
      const event = normalizeEvent(envelope);
      if (event) {
        await forwardToAttachedTab(event);
      }
    }
    if (typeof highWater === "number" && socketState.desiredConnectionId) {
      socketState.lastSeqByConnection[socketState.desiredConnectionId] = highWater;
    }
    return;
  }

  if (type === "event") {
    const envelope = frame.envelope as CodegEventEnvelope | undefined;
    if (!envelope) {
      return;
    }
    if (typeof envelope.seq === "number" && envelope.connection_id) {
      socketState.lastSeqByConnection[envelope.connection_id] = envelope.seq;
    }
    const event = normalizeEvent(envelope);
    if (event) {
      await forwardToAttachedTab(event);
    }
    return;
  }

  if (type === "detached") {
    const reason = String(frame.reason ?? "");
    if (reason === "connection_gone") {
      await saveConnection(null);
      await forwardToAttachedTab({
        kind: "error",
        message: "Codeg 连接已被服务端回收，下次发送时会自动重连。"
      });
    }
    return;
  }
}

function normalizeQuestionSpecs(
  questions: CodegEventEnvelope[]
): { id: string; question: string; header?: string; multiSelect?: boolean; options: { label: string; description?: string }[] }[] {
  return questions.map((item) => ({
    id: String(item.id ?? ""),
    question: String(item.question ?? ""),
    header: typeof item.header === "string" ? item.header : undefined,
    multiSelect: Boolean(item.multi_select),
    options: Array.isArray(item.options)
      ? (item.options as { label?: string; description?: string }[]).map((option) => ({
          label: String(option.label ?? ""),
          description: option.description
        }))
      : []
  }));
}

function normalizeEvent(envelope: CodegEventEnvelope): AgentStreamEvent | null {
  switch (envelope.type) {
    case "content_delta":
      return { kind: "text", text: String(envelope.text ?? "") };
    case "thinking":
      return { kind: "thinking", text: String(envelope.text ?? "") };
    case "tool_call":
    case "tool_call_update":
      return {
        kind: "tool",
        toolCallId: String(envelope.tool_call_id ?? ""),
        title: typeof envelope.title === "string" ? envelope.title : undefined,
        status: typeof envelope.status === "string" ? envelope.status : undefined,
        content: typeof envelope.content === "string" ? envelope.content : undefined
      };
    case "turn_complete":
      return { kind: "turn_complete", stopReason: typeof envelope.stop_reason === "string" ? envelope.stop_reason : undefined };
    case "status_changed":
      return { kind: "status", status: String(envelope.status ?? "") };
    case "error":
      return { kind: "error", message: String(envelope.message ?? "Codeg 会话错误") };
    case "permission_request": {
      const options = Array.isArray(envelope.options) ? envelope.options : [];
      return {
        kind: "permission",
        requestId: String(envelope.request_id ?? ""),
        title:
          (envelope.tool_call as { title?: string } | undefined)?.title,
        options: options.map((option) => {
          const record = option as { option_id?: string; name?: string };
          return { optionId: String(record.option_id ?? ""), name: String(record.name ?? "") };
        })
      };
    }
    case "question_request":
      return {
        kind: "question",
        questionId: String(envelope.question_id ?? ""),
        questions: normalizeQuestionSpecs(Array.isArray(envelope.questions) ? envelope.questions : [])
      };
    case "question_resolved":
      return { kind: "question_resolved", questionId: String(envelope.question_id ?? "") };
    case "plan_approval_request":
      return {
        kind: "plan_approval",
        approvalId: String(envelope.approval_id ?? ""),
        planMarkdown: String(envelope.plan_markdown ?? "")
      };
    case "plan_approval_resolved":
      return { kind: "plan_approval_resolved", approvalId: String(envelope.approval_id ?? "") };
    case "session_started":
      void patchConnection({ externalSessionId: String(envelope.session_id ?? "") });
      return null;
    case "conversation_linked":
      void patchConnection({ conversationId: Number(envelope.conversation_id) });
      return null;
    default:
      return null;
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof CodegApiError) {
    if (error.status === 401 || error.status === 422) {
      return "Codeg 鉴权失败，请检查 Token 是否正确";
    }
    if (error.status === 409 || error.code === "turn_in_progress") {
      return "上一轮请求仍在执行中，请等待完成或先停止当前任务";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function toRuntime(config: BridgeConfig, record: ConnectionRecord): BridgeRuntime {
  return {
    config,
    connectionId: record.connectionId,
    agentType: record.agentType,
    workingDir: record.workingDir
  };
}

async function applyRequest(
  pageUrl: string,
  selection: ContentSelection,
  prompt: string,
  sourceHint?: ContentSourceHint,
  extra?: ApplyExtra
): Promise<RuntimeResponse> {
  const config = await getConfig();
  if (!hasEndpoint(config)) {
    return { ok: false, error: "请先在扩展 popup 中配置 Codeg 地址与 Token" };
  }
  if (!config.project?.folderPath) {
    return { ok: false, error: "请先在 popup 中选择该项目对应的文件夹" };
  }

  const client = getClient(config);
  let record: ConnectionRecord;
  try {
    record = await ensureConnection(config);
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }

  attachConnectionStream(record.connectionId);

  const payload: ApplyRequest = {
    pageUrl,
    selection,
    intent: { type: "describe", prompt },
    sourceHint,
    extra
  };
  const requestId = `req-${Date.now()}`;

  try {
    await client.prompt(
      record.connectionId,
      [{ type: "text", text: buildBridgePrompt(payload) }],
      {
        folderId: config.project?.folderId,
        conversationId: record.conversationId,
        clientMessageId: requestId
      }
    );
  } catch (error) {
    const retryable =
      error instanceof CodegApiError &&
      (error.status === 404 || error.status === 500 || error.status === 0);
    if (!retryable) {
      return { ok: false, error: friendlyError(error) };
    }
    // The connection may have been reaped between ensure and prompt; rebuild once.
    await saveConnection(null);
    try {
      record = await ensureConnection(config);
      await client.prompt(
        record.connectionId,
        [{ type: "text", text: buildBridgePrompt(payload) }],
        {
          folderId: config.project?.folderId,
          conversationId: record.conversationId,
          clientMessageId: requestId
        }
      );
    } catch (retryError) {
      return { ok: false, error: friendlyError(retryError) };
    }
  }

  await chrome.storage.local.set({
    [LAST_SELECTION_KEY]: { pageUrl, selection, sourceHint, prompt, requestId }
  });
  void captureSessionIdentity(config, record.connectionId);
  return { ok: true, requestId, runtime: toRuntime(config, record) };
}

async function handleAttachPage(
  tabId: number,
  pageUrl: string,
  pageTitle?: string
): Promise<RuntimeResponse> {
  const config = await getConfig();
  if (!hasEndpoint(config)) {
    return { ok: false, error: "请先填写 Codeg IP、端口与 Token" };
  }
  if (!config.project?.folderPath) {
    return { ok: false, error: "请先选择该页面所属的项目文件夹" };
  }

  const client = getClient(config);

  try {
    const health = await client.health();
    if (health.status && health.status !== "ok") {
      return { ok: false, error: `Codeg 服务状态异常：${health.status}` };
    }

    const record = await ensureConnection(config);
    attachConnectionStream(record.connectionId);

    await chrome.storage.local.set({ [TAB_ID_KEY]: tabId, [PAGE_URL_KEY]: pageUrl });
    await saveOriginPref(pageUrl, config);
    await ensureContentScript(tabId);
    // An already-injected content script only learns about the new connection
    // when told; a fresh injection reloads the runtime by itself at boot.
    void chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.contentRefreshRuntime }).catch(() => {});

    return {
      ok: true,
      connected: true,
      connectionId: record.connectionId,
      codegVersion: health.version,
      runtime: toRuntime(config, record),
      attachedPageUrl: pageUrl,
      attachedTabId: tabId
    };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.contentGetRuntime });
    return;
  } catch {
    // No content script in this tab yet; inject it below.
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function handleLoadCodegInfo(): Promise<RuntimeResponse> {
  const config = await getConfig();
  if (!hasEndpoint(config)) {
    return { ok: false, error: "请先填写 Codeg IP、端口与 Token" };
  }
  const client = getClient(config);
  try {
    const [health, agents, folders] = await Promise.all([
      client.health(),
      client.listAgents().catch(() => []),
      client.listAllFolderDetails().catch(() => [])
    ]);
    const projects: CodegProject[] = folders
      .filter((folder) => folder.kind !== "chat")
      .map((folder) => ({
        folderId: folder.id,
        folderName: folder.name,
        folderPath: folder.path,
        alias: typeof folder.alias === "string" ? folder.alias : null
      }));
    // Only agents the user explicitly enabled in Codeg are offered; the full
    // registry (including disabled entries) is never surfaced here.
    const agentList = agents
      .filter((agent) => agent.enabled === true)
      .map((agent) => ({
        agentType: String(agent.agent_type ?? ""),
        name: String(agent.name ?? agent.agent_type ?? ""),
        description: typeof agent.description === "string" ? agent.description : undefined,
        installedVersion: agent.installed_version ?? null
      }));
    return {
      ok: true,
      codegVersion: health.version,
      agents: agentList.filter((agent) => agent.agentType),
      folders: projects
    };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

async function handleMessage(message: RuntimeRequest, sender?: chrome.runtime.MessageSender): Promise<RuntimeResponse> {
  const senderTabId = sender?.tab?.id;
  const attachedTabId = await getAttachedTabId();
  const attachedPageUrl = await getAttachedPageUrl();

  switch (message.type) {
    case MESSAGE_TYPES.popupGetConfig: {
      const config = await getConfig();
      const pref = await getOriginPref(message.pageUrl);
      return {
        ok: true,
        config,
        connected: Boolean(hasEndpoint(config) && attachedTabId != null),
        attachedPageUrl: attachedPageUrl || undefined,
        attachedTabId: attachedTabId ?? undefined,
        agentPref: pref.agentType,
        projectPref: pref.project ?? null
      };
    }
    case MESSAGE_TYPES.popupSaveConfig:
      await saveConfig(message.config);
      return { ok: true, config: message.config };
    case MESSAGE_TYPES.popupTestConnection: {
      const config = await getConfig();
      if (!hasEndpoint(config)) {
        return { ok: false, error: "请先填写 Codeg IP、端口与 Token" };
      }
      try {
        const health = await getClient(config).health();
        return { ok: true, codegVersion: health.version };
      } catch (error) {
        return { ok: false, error: friendlyError(error) };
      }
    }
    case MESSAGE_TYPES.popupLoadCodegInfo:
      return handleLoadCodegInfo();
    case MESSAGE_TYPES.popupAttachPage:
      return handleAttachPage(message.tabId, message.pageUrl, message.pageTitle);
    case MESSAGE_TYPES.popupApplyCurrentSelection: {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        func: () => {
          const runtime = window as typeof window & {
            __CODEG_UI_BRIDGE_LAST_SELECTION__?: {
              pageUrl: string;
              selection: ContentSelection;
              sourceHint?: ContentSourceHint;
            };
          };
          return runtime.__CODEG_UI_BRIDGE_LAST_SELECTION__ || null;
        }
      });
      const current = result?.result as {
        pageUrl: string;
        selection: ContentSelection;
        sourceHint?: ContentSourceHint;
      } | null;
      if (!current?.selection) {
        return {
          ok: false,
          error: "No current selection found on this page. Select an element first."
        };
      }
      return applyRequest(current.pageUrl, current.selection, message.prompt, current.sourceHint);
    }
    case MESSAGE_TYPES.contentGetRuntime: {
      const config = await getConfig();
      const record = await getConnection();
      if (record && hasEndpoint(config)) {
        // Re-arm the stream subscription so the panel keeps receiving events
        // after a service worker restart dropped the socket.
        attachConnectionStream(record.connectionId);
      }
      return {
        ok: true,
        runtime: record && hasEndpoint(config) ? toRuntime(config, record) : undefined,
        connectionId: record?.connectionId,
        attachedPageUrl: attachedPageUrl || undefined,
        attachedTabId: attachedTabId ?? undefined,
        requestTabId: senderTabId,
        isCurrentTabAttached: attachedTabId != null && senderTabId != null ? attachedTabId === senderTabId : undefined
      };
    }
    case MESSAGE_TYPES.contentSelectionSync: {
      await chrome.storage.local.set({
        [LAST_SELECTION_KEY]: {
          pageUrl: message.pageUrl,
          selection: message.selection,
          sourceHint: message.sourceHint
        }
      });
      return { ok: true, connected: Boolean(attachedTabId != null), attachedPageUrl };
    }
    case MESSAGE_TYPES.contentApply:
      return applyRequest(message.pageUrl, message.selection, message.prompt, message.sourceHint, message.extra);
    case MESSAGE_TYPES.contentCancelTurn: {
      const config = await getConfig();
      const record = await getConnection();
      if (!record) {
        return { ok: false, error: "当前没有活动连接" };
      }
      try {
        await getClient(config).cancel(record.connectionId);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: friendlyError(error) };
      }
    }
    case MESSAGE_TYPES.contentRespondRequest: {
      const config = await getConfig();
      const record = await getConnection();
      if (!record) {
        return { ok: false, error: "当前没有活动连接" };
      }
      const client = getClient(config);
      try {
        if (message.respond.kind === "permission") {
          await client.respondPermission(record.connectionId, message.respond.requestId, message.respond.optionId);
        } else if (message.respond.kind === "question") {
          await client.answerQuestion(record.connectionId, message.respond.questionId, {
            answers: [{ questionId: message.respond.questionId, labels: message.respond.labels }]
          });
        } else if (message.respond.kind === "question_decline") {
          await client.answerQuestion(record.connectionId, message.respond.questionId, {
            answers: [],
            declined: true
          });
        } else {
          await client.answerPlanApproval(record.connectionId, message.respond.approvalId, {
            decision: message.respond.decision
          });
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: friendlyError(error) };
      }
    }
    case MESSAGE_TYPES.contentDisconnect: {
      detachConnectionStream();
      await chrome.storage.local.remove([TAB_ID_KEY, PAGE_URL_KEY, LAST_SELECTION_KEY]);
      return { ok: true, connected: false, attachedPageUrl: undefined, attachedTabId: undefined };
    }
    default:
      return { ok: false, error: "Unknown message type" };
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown background error"
      });
    });

  return true;
});
