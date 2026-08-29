import { MESSAGE_TYPES } from "../messages";
import type { BridgeConfig, CodegProject, RuntimeResponse } from "../messages";

const FALLBACK_AGENTS = [
  { agentType: "pi", name: "pi" },
  { agentType: "claude_code", name: "claude_code" },
  { agentType: "codex", name: "codex" },
  { agentType: "gemini", name: "gemini" },
  { agentType: "open_code", name: "open_code" }
];

function sendMessage<T extends RuntimeResponse>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

type PopupState = {
  config: BridgeConfig;
  agents: { agentType: string; name: string }[];
  folders: CodegProject[];
  codegVersion: string;
  message: string;
  error: string;
  busy: boolean;
  connected: boolean;
  connectionId: string;
  attachedPageUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(root: HTMLElement, state: PopupState) {
  // 智能体与项目列表都需要连上 Codeg 才能读取；连通前智能体用内置兜底列表。
  const usingFallbackAgents = state.agents.length === 0;
  const agentOptions = (state.agents.length ? state.agents : FALLBACK_AGENTS)
    .map(
      (agent) =>
        `<option value="${escapeHtml(agent.agentType)}" ${agent.agentType === state.config.agentType ? "selected" : ""}>${escapeHtml(
          agent.name || agent.agentType
        )}</option>`
    )
    .join("");

  const folderOptions = state.folders
    .map(
      (folder) =>
        `<option value="${folder.folderId}" ${folder.folderId === state.config.project?.folderId ? "selected" : ""}>${escapeHtml(
          `${folder.folderName} (${folder.folderPath})`
        )}</option>`
    )
    .join("");

  root.innerHTML = `
    <div style="font-family: ui-sans-serif, system-ui; width: 380px; padding: 16px; box-sizing: border-box; color: #111827;">
      <h2 style="margin: 0 0 4px; font-size: 18px;">Codeg UI Bridge</h2>
      <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
        ${state.codegVersion ? `Codeg v${escapeHtml(state.codegVersion)}` : "未连接 Codeg"}
      </div>
      <div style="display:grid; gap:8px; margin-bottom:12px; padding:10px; border-radius:10px; background:#f8fafc; border:1px solid #e2e8f0; font-size:12px;">
        <div><strong>Codeg:</strong> ${state.codegVersion ? `已连通（v${escapeHtml(state.codegVersion)}）` : "未测试"}</div>
        <div><strong>页面绑定:</strong> ${state.connected ? "已连接" : "未连接"}</div>
        ${state.connectionId ? `<div><strong>connectionId:</strong> ${escapeHtml(state.connectionId)}</div>` : ""}
        <div><strong>页面:</strong> ${state.attachedPageUrl ? escapeHtml(state.attachedPageUrl) : "(none)"}</div>
      </div>
      <div style="display: grid; gap: 10px;">
        <div style="display:grid; grid-template-columns: 1fr 88px; gap:8px;">
          <label style="display:grid; gap:4px; font-size:12px;">
            <span>Codeg IP</span>
            <input id="host" value="${escapeHtml(state.config.host)}" placeholder="127.0.0.1" style="padding:8px; border:1px solid #d1d5db; border-radius:8px;" />
          </label>
          <label style="display:grid; gap:4px; font-size:12px;">
            <span>端口</span>
            <input id="port" value="${escapeHtml(state.config.port)}" placeholder="23080" style="padding:8px; border:1px solid #d1d5db; border-radius:8px;" />
          </label>
        </div>
        <label style="display:grid; gap:4px; font-size:12px;">
          <span>Token</span>
          <input id="token" type="password" value="${escapeHtml(state.config.token)}" placeholder="Codeg Web 服务 Token" style="padding:8px; border:1px solid #d1d5db; border-radius:8px;" />
        </label>
        <label style="display:grid; gap:4px; font-size:12px;">
          <span>智能体（用于修改开发）${usingFallbackAgents ? '<span style="color:#94a3b8;">· 测试连接后加载实际列表</span>' : ""}</span>
          <select id="agent" style="padding:8px; border:1px solid #d1d5db; border-radius:8px; background:white;">${agentOptions}</select>
        </label>
        <label style="display:grid; gap:4px; font-size:12px;">
          <span>所属项目（Codeg 文件夹）</span>
          <select id="folder" style="padding:8px; border:1px solid #d1d5db; border-radius:8px; background:white;">
            <option value="">${state.folders.length ? "-- 选择项目 --" : "-- Codeg 中暂无项目，可手动输入路径 --"}</option>
            ${folderOptions}
          </select>
        </label>
        <label style="display:grid; gap:4px; font-size:12px;">
          <span>或手动输入项目路径</span>
          <input id="manualPath" placeholder="D:/path/to/project" style="padding:8px; border:1px solid #d1d5db; border-radius:8px;" />
        </label>
        <div style="display:flex; gap:8px;">
          <button id="testBtn" style="flex:1; padding:10px; border:1px solid #d1d5db; border-radius:8px; background:white;">测试连接</button>
          <button id="attachBtn" style="flex:1; padding:10px; border:none; border-radius:8px; background:#111827; color:white;">连接页面</button>
        </div>
        <div style="font-size:12px; color:${state.error ? "#b91c1c" : "#374151"}; min-height: 18px;">${escapeHtml(state.error || state.message)}</div>
      </div>
    </div>
  `;
}

async function boot() {
  const rootCandidate = document.getElementById("app");
  if (!rootCandidate) {
    return;
  }
  const root: HTMLElement = rootCandidate;

  const tab = await getCurrentTab();
  const state: PopupState = {
    config: { host: "127.0.0.1", port: "23080", token: "", agentType: "pi", project: null },
    agents: [],
    folders: [],
    codegVersion: "",
    message: "填写 Codeg 地址与 Token，测试连接成功后再选择项目和智能体，最后连接页面",
    error: "",
    busy: false,
    connected: false,
    connectionId: "",
    attachedPageUrl: ""
  };

  const loaded = await sendMessage<RuntimeResponse>({
    type: MESSAGE_TYPES.popupGetConfig,
    pageUrl: tab?.url
  });
  if (loaded.config) {
    state.config = loaded.config;
  }
  if (loaded.agentPref) {
    state.config.agentType = loaded.agentPref;
  }
  if (loaded.projectPref) {
    state.config.project = loaded.projectPref;
  }
  state.connected = Boolean(loaded.connected);
  state.connectionId = loaded.connectionId || "";
  state.attachedPageUrl = loaded.attachedPageUrl || "";

  async function loadCodegInfo(): Promise<void> {
    const response = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupLoadCodegInfo });
    if (response.ok) {
      state.agents = response.agents ?? [];
      state.folders = response.folders ?? [];
      state.codegVersion = response.codegVersion || "";
      if (!state.config.agentType && state.agents.length > 0) {
        state.config.agentType = state.agents[0]!.agentType;
      }
    } else if (response.error) {
      state.error = response.error;
    }
  }

  type ReadFieldsResult = { ok: true; manualPath?: string } | { ok: false; error: string };

  /**
   * `requireProject` is only true for 连接页面: testing the connection must
   * work before the folder list has been loaded (the list itself comes from
   * the tested connection), so it only validates IP/port/token.
   */
  function readFields(config: BridgeConfig, requireProject: boolean): ReadFieldsResult {
    const hostInput = root.querySelector<HTMLInputElement>("#host");
    const portInput = root.querySelector<HTMLInputElement>("#port");
    const tokenInput = root.querySelector<HTMLInputElement>("#token");
    const agentSelect = root.querySelector<HTMLSelectElement>("#agent");
    const folderSelect = root.querySelector<HTMLSelectElement>("#folder");
    const manualPathInput = root.querySelector<HTMLInputElement>("#manualPath");

    if (!hostInput || !portInput || !tokenInput || !agentSelect || !folderSelect || !manualPathInput) {
      return { ok: false, error: "popup 渲染异常" };
    }

    config.host = hostInput.value.trim() || "127.0.0.1";
    config.port = portInput.value.trim() || "23080";
    config.token = tokenInput.value.trim();
    config.agentType = agentSelect.value || "pi";
    if (!config.token) {
      return { ok: false, error: "请填写 Token" };
    }

    const manualPath = manualPathInput.value.trim();
    if (manualPath) {
      config.project = {
        folderId: -1,
        folderName: manualPath.split(/[\\/]/).filter(Boolean).pop() || manualPath,
        folderPath: manualPath
      };
      return { ok: true, manualPath };
    }

    if (folderSelect.value) {
      const selected = state.folders.find((folder) => String(folder.folderId) === folderSelect.value);
      if (selected) {
        config.project = selected;
        return { ok: true };
      }
    }

    if (config.project) {
      return { ok: true };
    }

    if (!requireProject) {
      return { ok: true };
    }

    return { ok: false, error: "请选择项目或输入项目路径" };
  }

  /** Registers a manually-typed path in Codeg so the project gets a real folder id. */
  async function resolveProject(config: BridgeConfig, manualPath?: string): Promise<string | null> {
    if (!manualPath || !config.project) {
      return null;
    }
    const opened = await sendMessage<RuntimeResponse>({
      type: MESSAGE_TYPES.popupOpenFolder,
      path: config.project.folderPath
    });
    if (!opened.ok || !opened.project) {
      return opened.error || "打开项目路径失败";
    }
    config.project = opened.project;
    return null;
  }

  function bindEvents() {
    const testBtn = root.querySelector<HTMLButtonElement>("#testBtn");
    const attachBtn = root.querySelector<HTMLButtonElement>("#attachBtn");

    const rerender = () => {
      render(root, state);
      bindEvents();
    };

    const withBusy = async (label: string, action: () => Promise<void>) => {
      state.busy = true;
      state.error = "";
      state.message = label;
      rerender();
      await action();
      state.busy = false;
      rerender();
    };

    if (testBtn) {
      testBtn.disabled = state.busy;
      testBtn.onclick = () => {
        // Capture the current input values BEFORE any re-render: withBusy
        // redraws the popup from state, which would otherwise wipe the
        // freshly typed fields before they are read.
        const config = { ...state.config };
        const fields = readFields(config, false);
        if (!fields.ok) {
          state.error = fields.error;
          state.message = "";
          rerender();
          return;
        }
        state.config = config;
        state.error = "";
        void withBusy("正在连接 Codeg...", async () => {
          const resolveError = await resolveProject(config, fields.manualPath);
          if (resolveError) {
            state.error = resolveError;
            return;
          }
          const saved = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupSaveConfig, config });
          if (!saved.ok) {
            state.error = saved.error || "保存失败";
            return;
          }
          state.config = config;
          const tested = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupTestConnection });
          if (!tested.ok) {
            state.error = tested.error || "连接失败";
            return;
          }
          state.codegVersion = tested.codegVersion || "";
          state.message = `Codeg 连接成功${tested.codegVersion ? `（v${tested.codegVersion}）` : ""}`;
          await loadCodegInfo();
        });
      };
    }

    if (attachBtn) {
      attachBtn.disabled = state.busy;
      attachBtn.onclick = () => {
        const config = { ...state.config };
        const fields = readFields(config, true);
        if (!fields.ok) {
          state.error = fields.error;
          state.message = "";
          rerender();
          return;
        }
        state.config = config;
        state.error = "";
        void withBusy("正在保存并连接当前页面...", async () => {
          const resolveError = await resolveProject(config, fields.manualPath);
          if (resolveError) {
            state.error = resolveError;
            return;
          }
          if (!config.project) {
            state.error = "请选择项目或输入项目路径";
            return;
          }

          const saved = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupSaveConfig, config });
          if (!saved.ok) {
            state.error = saved.error || "保存失败";
            return;
          }
          state.config = config;

          if (!tab?.url || tab.id == null) {
            state.error = "未找到当前页面";
            return;
          }

          const response = await sendMessage<RuntimeResponse>({
            type: MESSAGE_TYPES.popupAttachPage,
            tabId: tab.id,
            pageUrl: tab.url,
            pageTitle: tab.title
          });

          if (!response.ok) {
            state.error = response.error || "连接失败";
            return;
          }
          state.connected = true;
          state.connectionId = response.connectionId || "";
          state.attachedPageUrl = response.attachedPageUrl || tab.url;
          state.codegVersion = response.codegVersion || state.codegVersion;
          state.message = "已连接，页面上出现面板后即可选中元素发送需求";
        });
      };
    }
  }

  if (state.config.host && state.config.port && state.config.token) {
    await loadCodegInfo();
  }

  render(root, state);
  bindEvents();
}

void boot();
