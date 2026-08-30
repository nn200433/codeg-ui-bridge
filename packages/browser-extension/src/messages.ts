export const MESSAGE_TYPES = {
  popupSaveConfig: "codeg/popup/save-config",
  popupGetConfig: "codeg/popup/get-config",
  popupTestConnection: "codeg/popup/test-connection",
  popupLoadCodegInfo: "codeg/popup/load-codeg-info",
  popupAttachPage: "codeg/popup/attach-page",
  contentGetRuntime: "codeg/content/get-runtime",
  contentSetSelecting: "codeg/content/set-selecting",
  contentGetApplyContext: "codeg/content/get-apply-context",
  contentSelectionSync: "codeg/content/selection-sync",
  contentApply: "codeg/content/apply",
  contentCancelTurn: "codeg/content/cancel-turn",
  contentRespondRequest: "codeg/content/respond-request",
  contentDisconnect: "codeg/content/disconnect"
} as const;

export const SIDE_PANEL_PORT_NAME = "sidepanel";

export type CodegProject = {
  folderId: number;
  folderName: string;
  folderPath: string;
  alias?: string | null;
};

export type BridgeConfig = {
  host: string;
  port: string;
  token: string;
  agentType: string;
  project: CodegProject | null;
};

export type BridgeRuntime = {
  config: BridgeConfig;
  connectionId: string;
  agentType: string;
  workingDir: string;
  conversationId?: number;
};

export type CodegAgentOption = {
  agentType: string;
  name: string;
  description?: string;
  installedVersion?: string | null;
};

export type CodegVersionInfo = {
  status?: string;
  version?: string;
};

export type CodegQuestionOption = {
  label: string;
  description?: string;
};

export type CodegQuestionSpec = {
  id: string;
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: CodegQuestionOption[];
};

export type AgentStreamEvent =
  | { kind: "status"; status: string }
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; toolCallId: string; title?: string; status?: string; content?: string }
  | { kind: "turn_complete"; stopReason?: string }
  | { kind: "error"; message: string }
  | { kind: "permission"; requestId: string; title?: string; options: { optionId: string; name: string }[] }
  | { kind: "question"; questionId: string; questions: CodegQuestionSpec[] }
  | { kind: "question_resolved"; questionId: string }
  | { kind: "plan_approval"; approvalId: string; planMarkdown: string }
  | { kind: "plan_approval_resolved"; approvalId: string };

/** Background → side panel pushes over the long-lived port. */
export type PanelPortEvent =
  | {
      kind: "state";
      connected: boolean;
      selecting: boolean;
      attachedTabId?: number;
      attachedPageUrl?: string;
      attachedTitle?: string;
      attachedFavIconUrl?: string;
      runtime?: BridgeRuntime;
    }
  | { kind: "event"; event: AgentStreamEvent }
  | {
      kind: "selection";
      pageUrl: string;
      selection: ContentSelection;
      sourceHint?: ContentSourceHint;
    };

export type ContentSourceHint = {
  file?: string;
  line?: number;
  column?: number;
  component?: string;
  sourceId?: string;
};

export type ConsoleErrorEntry = {
  level: string;
  message: string;
  source?: string;
  line?: number;
};

export type ApplyExtra = {
  computedStyle?: Record<string, string>;
  consoleErrors?: ConsoleErrorEntry[];
};

export type ContentSelection = {
  tag: string;
  selector?: string;
  domPath?: string;
  semanticPath?: string;
  text?: string;
  testAttributes?: string[];
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type PopupSaveConfigRequest = {
  type: typeof MESSAGE_TYPES.popupSaveConfig;
  config: BridgeConfig;
};

export type PopupGetConfigRequest = {
  type: typeof MESSAGE_TYPES.popupGetConfig;
  pageUrl?: string;
};

export type PopupTestConnectionRequest = {
  type: typeof MESSAGE_TYPES.popupTestConnection;
};

export type PopupLoadCodegInfoRequest = {
  type: typeof MESSAGE_TYPES.popupLoadCodegInfo;
};

export type PopupAttachPageRequest = {
  type: typeof MESSAGE_TYPES.popupAttachPage;
  tabId: number;
  pageUrl: string;
  pageTitle?: string;
};

export type ContentGetRuntimeRequest = {
  type: typeof MESSAGE_TYPES.contentGetRuntime;
};

export type ContentSetSelectingRequest = {
  type: typeof MESSAGE_TYPES.contentSetSelecting;
  selecting: boolean;
};

/** Raw apply context collected by the content script in the page world. */
export type ContentApplyContext = {
  pageUrl: string;
  selection: ContentSelection;
  sourceHint?: ContentSourceHint;
  computedStyle?: Record<string, string>;
  consoleErrors?: ConsoleErrorEntry[];
};

export type ContentSelectionSyncRequest = {
  type: typeof MESSAGE_TYPES.contentSelectionSync;
  pageUrl: string;
  selection: ContentSelection;
  sourceHint?: ContentSourceHint;
};

export type ContentApplyRequest = {
  type: typeof MESSAGE_TYPES.contentApply;
  pageUrl: string;
  selection: ContentSelection;
  sourceHint?: ContentSourceHint;
  prompt: string;
  extra?: ApplyExtra;
};

export type ContentCancelTurnRequest = {
  type: typeof MESSAGE_TYPES.contentCancelTurn;
};

export type ContentRespondRequestMessage = {
  type: typeof MESSAGE_TYPES.contentRespondRequest;
  respond:
    | { kind: "permission"; requestId: string; optionId: string }
    | { kind: "question"; questionId: string; labels: string[] }
    | { kind: "question_decline"; questionId: string }
    | { kind: "plan_approval"; approvalId: string; decision: "approve" | "request_changes" | "abandon" };
};

export type ContentDisconnectRequest = {
  type: typeof MESSAGE_TYPES.contentDisconnect;
};

export type RuntimeRequest =
  | PopupSaveConfigRequest
  | PopupGetConfigRequest
  | PopupTestConnectionRequest
  | PopupLoadCodegInfoRequest
  | PopupAttachPageRequest
  | ContentSetSelectingRequest
  | ContentSelectionSyncRequest
  | ContentApplyRequest
  | ContentCancelTurnRequest
  | ContentRespondRequestMessage
  | ContentDisconnectRequest;

export type RuntimeResponse = {
  ok: boolean;
  error?: string;
  config?: BridgeConfig;
  runtime?: BridgeRuntime;
  requestId?: string;
  connected?: boolean;
  attachedPageUrl?: string;
  attachedTabId?: number;
  connectionId?: string;
  codegVersion?: string;
  agents?: CodegAgentOption[];
  folders?: CodegProject[];
  projectPref?: CodegProject | null;
  agentPref?: string;
};
