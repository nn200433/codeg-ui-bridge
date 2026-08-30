import type { ApplyRequest } from "./protocol";

export type CodegHealth = {
  status: string;
  version?: string;
};

export type CodegAgentInfo = {
  agent_type: string;
  name: string;
  description?: string;
  enabled?: boolean;
  available?: boolean;
  installed_version?: string | null;
} & Record<string, unknown>;

export type CodegFolderInfo = {
  id: number;
  name: string;
  path: string;
  gitBranch?: string | null;
  defaultAgentType?: string | null;
  kind?: string;
} & Record<string, unknown>;

export type CodegConnectionInfo = {
  id: string;
  agent_type: string;
  status: string;
};

export type CodegPromptBlock = {
  type: "text";
  text: string;
};

export type CodegPromptOptions = {
  folderId?: number;
  conversationId?: number;
  clientMessageId?: string;
};

export type CodegSessionSnapshot = {
  status?: string;
  external_id?: string;
  conversation_id?: number;
  folder_id?: number;
  live_message?: unknown;
  event_seq?: number;
} & Record<string, unknown>;

export type CodegEventEnvelope = {
  seq?: number;
  connection_id?: string;
  type: string;
} & Record<string, unknown>;

export class CodegApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CodegApiError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeBaseUrl(host: string, port: string | number): string {
  const trimmedHost = (host || "127.0.0.1").trim().replace(/\/+$/, "");
  const trimmedPort = String(port || "23080").trim();
  const hasScheme = /^https?:\/\//i.test(trimmedHost);
  const base = hasScheme ? trimmedHost : `http://${trimmedHost}`;
  return trimmedPort && !/:\d+$/.test(base.replace(/\/+$/, "")) ? `${base}:${trimmedPort}` : base;
}

export function buildCodegWsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/^http/i, "ws").replace(/\/+$/, "")}/ws/events`;
}

export function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildCodegWsProtocols(token: string): string[] {
  return ["codeg-events", `codeg-token.${base64UrlEncode(token)}`];
}

export class CodegClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  get wsUrl(): string {
    return buildCodegWsUrl(this.baseUrl);
  }

  get wsProtocols(): string[] {
    return buildCodegWsProtocols(this.token);
  }

  private async command<T>(name: string, body: unknown = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/${name}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify(body ?? {})
      });
    } catch (error) {
      throw new CodegApiError(
        `无法连接 Codeg（${this.baseUrl}）：${error instanceof Error ? error.message : String(error)}`,
        0
      );
    }

    if (!response.ok) {
      let message = `Codeg 命令 ${name} 失败（HTTP ${response.status}）`;
      let code: string | undefined;
      try {
        const data = (await response.json()) as { code?: string; message?: string };
        if (data?.message) {
          message = data.message;
        }
        code = data?.code;
      } catch {
        // keep default message when the body is not JSON
      }
      throw new CodegApiError(message, response.status, code);
    }

    if (response.status === 204) {
      return null as T;
    }

    const text = await response.text();
    if (!text) {
      return null as T;
    }
    return JSON.parse(text) as T;
  }

  health(): Promise<CodegHealth> {
    return this.command<CodegHealth>("health");
  }

  listAgents(): Promise<CodegAgentInfo[]> {
    return this.command<CodegAgentInfo[]>("acp_list_agents");
  }

  listAllFolderDetails(): Promise<CodegFolderInfo[]> {
    return this.command<CodegFolderInfo[]>("list_all_folder_details");
  }

  openFolder(path: string): Promise<CodegFolderInfo> {
    return this.command<CodegFolderInfo>("open_folder", { path });
  }

  /** Resolves to the bare connection id string (Codeg returns `Json<String>`). */
  connect(agentType: string, workingDir?: string, sessionId?: string): Promise<string> {
    return this.command<string>("acp_connect", {
      agentType,
      workingDir: workingDir || undefined,
      sessionId: sessionId || undefined
    });
  }

  listConnections(): Promise<CodegConnectionInfo[]> {
    return this.command<CodegConnectionInfo[]>("acp_list_connections");
  }

  prompt(
    connectionId: string,
    blocks: CodegPromptBlock[],
    options: CodegPromptOptions = {}
  ): Promise<null> {
    return this.command<null>("acp_prompt", {
      connectionId,
      blocks,
      folderId: options.folderId,
      conversationId: options.conversationId,
      clientMessageId: options.clientMessageId
    });
  }

  cancel(connectionId: string): Promise<null> {
    return this.command<null>("acp_cancel", { connectionId });
  }

  touchConnection(connectionId: string): Promise<boolean> {
    return this.command<boolean>("acp_touch_connection", { connectionId });
  }

  disconnect(connectionId: string): Promise<null> {
    return this.command<null>("acp_disconnect", { connectionId });
  }

  respondPermission(connectionId: string, requestId: string, optionId: string): Promise<null> {
    return this.command<null>("acp_respond_permission", { connectionId, requestId, optionId });
  }

  answerQuestion(
    connectionId: string,
    questionId: string,
    answer: { answers: { questionId: string; labels: string[] }[]; declined?: boolean }
  ): Promise<null> {
    return this.command<null>("acp_answer_question", { connectionId, questionId, answer });
  }

  answerPlanApproval(
    connectionId: string,
    approvalId: string,
    answer: { decision: "approve" | "request_changes" | "abandon"; feedback?: string }
  ): Promise<null> {
    return this.command<null>("acp_answer_plan_approval", { connectionId, approvalId, answer });
  }

  getSessionSnapshot(connectionId: string): Promise<CodegSessionSnapshot | null> {
    return this.command<CodegSessionSnapshot | null>("acp_get_session_snapshot", { connectionId });
  }
}

export type { ApplyRequest };
