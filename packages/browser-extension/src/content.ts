import { MESSAGE_TYPES } from "./messages";
import type {
  AgentStreamEvent,
  ApplyExtra,
  BridgeRuntime,
  CodegQuestionSpec,
  ContentAgentEventMessage,
  ContentSelection,
  ContentSourceHint,
  RuntimeResponse
} from "./messages";

declare global {
  interface Window {
    __CODEG_UI_BRIDGE_CONTENT_BOOTED__?: boolean;
    __CODEG_UI_BRIDGE_LAST_SELECTION__?: {
      pageUrl: string;
      selection: ContentSelection;
      sourceHint?: ContentSourceHint;
    };
  }
}

type Locale = "zh-CN" | "en-US";

type StreamItem =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; toolCallId: string; title: string; status: string; content: string };

type PendingPermission = { requestId: string; title?: string; options: { optionId: string; name: string }[] };
type PendingQuestion = { questionId: string; questions: CodegQuestionSpec[] };
type PendingPlan = { approvalId: string; planMarkdown: string };

const STREAM_MAX_ITEMS = 80;
const STREAM_TEXT_MAX_CHARS = 24_000;

type PanelState = {
  collapsed: boolean;
  selecting: boolean;
  domModalOpen: boolean;
  composerOpen: boolean;
  childrenExpanded: boolean;
  detailsOpen: boolean;
  attachStyle: boolean;
  attachErrors: boolean;
  promptDraft: string;
  statusText: string;
  runtime: BridgeRuntime | null;
  selectedElement: HTMLElement | null;
  hoveredElement: HTMLElement | null;
  selectedSelection: ContentSelection | null;
  selectedSourceHint?: ContentSourceHint;
  panelX: number;
  panelY: number;
  modalX: number;
  modalY: number;
  locale: Locale;
  stream: StreamItem[];
  turnState: "idle" | "running" | "complete" | "error";
  turnNote: string;
  pendingPermission: PendingPermission | null;
  pendingQuestion: PendingQuestion | null;
  pendingPlan: PendingPlan | null;
};

type DragState = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  target: "panel" | "modal";
} | null;

const PANEL_WIDTH = 392;
const COMPOSER_WIDTH = 360;
const PANEL_MARGIN = 16;
const CHILD_PREVIEW_COUNT = 6;
const HOST_ID = "codeg-ui-bridge-overlay-host";
const PANEL_POSITION_STORAGE_KEY = "codeg-ui-bridge.panel-position";
const DIALOG_LIKE_SELECTOR = '[role="dialog"], [aria-modal="true"], dialog, .el-dialog, .ant-modal, .ant-modal-root, .el-overlay, .el-drawer, .van-popup, .MuiModal-root, .MuiDialog-root';
const TEXT_LIKE_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "SPAN", "STRONG", "EM", "SMALL"]);
const SELF_STABLE_TAGS = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT", "LABEL", "IMG", "VIDEO", "CANVAS"]);
const LANDMARK_TAGS = new Set(["HEADER", "MAIN", "NAV", "ASIDE", "SECTION", "ARTICLE", "FOOTER", "FORM", "DIALOG"]);
const TEST_ATTRIBUTE_NAMES = [
  "data-testid",
  "data-test",
  "data-qa",
  "data-cy",
  "data-slot",
  "data-state",
  "data-variant",
  "data-component",
  "name",
  "aria-controls",
  "aria-labelledby"
] as const;

const STRINGS: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    title: "Codeg UI Bridge",
    subtitle: "选中页面元素后直接发给 Codeg",
    collapse: "收",
    expand: "开",
    locale: "EN",
    selectOn: "选择:开",
    selectOff: "选择:关",
    refresh: "刷新",
    dom: "DOM",
    selection: "当前选中",
    source: "源码绑定",
    request: "修改需求",
    send: "发送",
    locate: "定位",
    copyJson: "复制JSON",
    copySource: "复制源码",
    currentNode: "当前节点",
    ancestorPath: "祖先路径",
    childPreview: "子节点预览",
    moreChildren: "展开子节点",
    lessChildren: "收起子节点",
    noSelection: "当前未选中元素",
    noSource: "(none)",
    noChildren: "没有可展示的子节点",
    promptPlaceholder: "在元素下方输入修改需求",
    hintTree: "点击祖先或子节点可直接切换目标",
    waiting: "等待连接 Codeg",
    notConnected: "当前页面未连接，请先在 popup 中连接页面",
    connectedPrefix: "已连接",
    selectedRecorded: "已记录选中元素",
    selectingEnabled: "选择模式开启：页面点击事件已拦截",
    selectingDisabled: "选择模式关闭：页面点击事件已恢复",
    treeRelocateFailed: "无法通过 DOM 视图重新定位该节点",
    sourceMissing: "当前选中元素没有 sourceHint",
    noElement: "请先点击页面中的目标元素",
    noPrompt: "请先输入修改需求",
    sending: "正在发送到 Codeg...",
    sentPrefix: "已发送到 Codeg，请求号",
    copiedJson: "已复制当前 selection JSON",
    copiedSource: "已复制 source",
    copiedLocate: "已复制源码定位",
    copiedInline: "已发送当前元素请求",
    rect: "Rect",
    domPath: "DOM Path",
    semanticPath: "Semantic Path",
    component: "component",
    sourceId: "sourceId",
    selector: "selector",
    text: "text",
    childrenCount: "子节点数",
    siblingHint: "层级较长时，优先从祖先路径切换父级容器，而不是展开整棵树",
    modalTitle: "DOM 视图",
    modalClose: "关闭",
    inlineSend: "发送",
    inlineOpen: "展开面板",
    promptOpen: "直接输入",
    stream: "执行流",
    streamIdle: "尚未发送请求",
    running: "执行中...",
    complete: "已完成",
    failed: "出错",
    stop: "停止",
    clearStream: "清空",
    thinkingLabel: "思考",
    permissionTitle: "等待权限确认",
    questionTitle: "智能体提问",
    planTitle: "等待计划确认",
    planApprove: "批准",
    planRequestChanges: "需修改",
    planAbandon: "放弃",
    decline: "跳过",
    selectToggle: "选择元素",
    pickHint: "点击页面任意元素，AI 将以它为上下文",
    changePlaceholder: "描述你要的改动，或这里的问题…",
    details: "详情",
    copyLocate: "复制定位",
    clearPick: "取消选中",
    attachStyle: "附带元素样式",
    attachErrors: "附带控制台报错",
    openInPanel: "面板中展开",
    noSourceBound: "未绑定源码",
    inlineClose: "关闭"
  },
  "en-US": {
    title: "Codeg UI Bridge",
    subtitle: "Select page elements and send them to Codeg",
    collapse: "-",
    expand: "+",
    locale: "CN",
    selectOn: "Pick:On",
    selectOff: "Pick:Off",
    refresh: "Refresh",
    dom: "DOM",
    selection: "Selected",
    source: "Source",
    request: "Request",
    send: "Send",
    locate: "Locate",
    copyJson: "Copy JSON",
    copySource: "Copy Source",
    currentNode: "Current Node",
    ancestorPath: "Ancestor Path",
    childPreview: "Child Preview",
    moreChildren: "More Children",
    lessChildren: "Collapse Children",
    noSelection: "Nothing selected",
    noSource: "(none)",
    noChildren: "No visible children to preview",
    promptPlaceholder: "Type the change request below the selected element",
    hintTree: "Click an ancestor chip or child node to switch the current target",
    waiting: "Waiting for Codeg connection",
    notConnected: "This page is not connected yet. Connect it from the popup first.",
    connectedPrefix: "Connected",
    selectedRecorded: "Element captured",
    selectingEnabled: "Selection mode enabled: page click events are blocked",
    selectingDisabled: "Selection mode disabled: page click events pass through again",
    treeRelocateFailed: "Failed to relocate this node from the DOM view",
    sourceMissing: "The current element has no sourceHint",
    noElement: "Select a page element first",
    noPrompt: "Enter a change request first",
    sending: "Sending to Codeg...",
    sentPrefix: "Sent to Codeg, request id",
    copiedJson: "Copied current selection JSON",
    copiedSource: "Copied source",
    copiedLocate: "Copied source location",
    copiedInline: "Sent current element request",
    rect: "Rect",
    domPath: "DOM Path",
    semanticPath: "Semantic Path",
    component: "component",
    sourceId: "sourceId",
    selector: "selector",
    text: "text",
    childrenCount: "child count",
    siblingHint: "When the hierarchy is long, switch to an ancestor container from the path instead of expanding the whole tree",
    modalTitle: "DOM View",
    modalClose: "Close",
    inlineSend: "Send",
    inlineOpen: "Open Panel",
    promptOpen: "Prompt",
    stream: "Agent Stream",
    streamIdle: "No request sent yet",
    running: "Running...",
    complete: "Completed",
    failed: "Failed",
    stop: "Stop",
    clearStream: "Clear",
    thinkingLabel: "Thinking",
    permissionTitle: "Permission required",
    questionTitle: "Agent question",
    planTitle: "Plan approval",
    planApprove: "Approve",
    planRequestChanges: "Request changes",
    planAbandon: "Abandon",
    decline: "Skip",
    selectToggle: "Pick element",
    pickHint: "Click any element on the page; AI will use it as context",
    changePlaceholder: "Describe the change you want, or the problem here…",
    details: "Details",
    copyLocate: "Copy location",
    clearPick: "Clear selection",
    attachStyle: "Include element styles",
    attachErrors: "Include console errors",
    openInPanel: "Open in panel",
    noSourceBound: "No source binding",
    inlineClose: "Close"
  }
};

const PRESETS: Record<Locale, { label: string; text: string }[]> = {
  "zh-CN": [
    { label: "改样式", text: "请调整这个元素的样式：" },
    { label: "对齐/间距", text: "这个元素的对齐/间距看起来不对，请检查并修正。" },
    { label: "排查问题", text: "请排查这个元素的问题：结合它的样式、控制台报错和布局表现，给出结论与修复方案。" }
  ],
  "en-US": [
    { label: "Restyle", text: "Please adjust the styles of this element: " },
    { label: "Spacing", text: "The alignment/spacing of this element looks off. Please check and fix it." },
    { label: "Diagnose", text: "Please diagnose this element: check its styles, console errors and layout, then give findings and a fix." }
  ]
};

const CSS_TEXT = `
:host { all: initial; }
.cuib-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  color: #0f172a;
  font-family: "Fira Sans", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
}
.cuib-frame {
  position: fixed;
  top: 0;
  left: 0;
  border-radius: 12px;
  box-sizing: border-box;
  pointer-events: none;
  transition: transform 120ms ease-out, width 120ms ease-out, height 120ms ease-out;
}
.cuib-frame--hover {
  border: 2px solid rgba(37, 99, 235, 0.95);
  box-shadow: 0 0 0 1px rgba(147, 197, 253, 0.55) inset, 0 0 0 9999px rgba(37, 99, 235, 0.04);
}
.cuib-frame--selected {
  border: 2px solid rgba(16, 185, 129, 0.98);
  box-shadow: 0 0 0 1px rgba(167, 243, 208, 0.5) inset, 0 16px 32px rgba(15, 23, 42, 0.12);
}
.cuib-frame__label {
  position: absolute;
  top: -30px;
  left: 0;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 4px 10px;
  border-radius: 999px;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  white-space: nowrap;
  background: rgba(15, 23, 42, 0.9);
}
.cuib-panel,
.cuib-inline,
.cuib-modal {
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(18px);
  pointer-events: auto;
}
.cuib-panel {
  position: fixed;
  width: min(392px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px;
}
.cuib-panel--collapsed {
  width: min(348px, calc(100vw - 24px));
}
.cuib-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.cuib-header--collapsed {
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: none;
}
.cuib-header:active { cursor: grabbing; }
.cuib-header-drag-zone { flex: 1; min-width: 0; }
.cuib-header-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.cuib-header-actions--compact {
  width: 100%;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-start;
  overflow-x: auto;
  scrollbar-width: none;
}
.cuib-header-actions--compact::-webkit-scrollbar { display: none; }
.cuib-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid rgba(59, 130, 246, 0.18);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(15, 23, 42, 0.82));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 24px rgba(15, 23, 42, 0.16);
}
.cuib-status-pill .cuib-status-indicator {
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
}
.cuib-toggle--mini {
  min-height: 32px;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  flex: 0 0 auto;
}
.cuib-toggle--mini.cuib-button--chip.is-active {
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
.cuib-eyebrow,
.cuib-section-label,
.cuib-hint {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2563eb;
}
.cuib-title {
  margin: 4px 0 0;
  font-family: "Fira Code", "PingFang SC", "Microsoft YaHei", "Consolas", monospace;
  font-size: 18px;
}
.cuib-subtitle {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cuib-status-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #ef4444;
}
.cuib-status-indicator.connected {
  background-color: #22c55e;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.cuib-toggle,
.cuib-button,
.cuib-button--primary,
.cuib-button--ghost,
.cuib-button--chip {
  min-height: 38px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  font: inherit;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}
.cuib-toggle,
.cuib-button,
.cuib-button--ghost,
.cuib-button--chip {
  background: #ffffff;
  color: #0f172a;
}
.cuib-button--primary {
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  color: #ffffff;
  border-color: transparent;
  box-shadow: 0 16px 28px rgba(37, 99, 235, 0.18);
}
.cuib-button--primary:disabled,
.cuib-button--chip:disabled,
.cuib-button--ghost:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
  box-shadow: none;
}
.cuib-button--chip.is-active {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.14), rgba(59, 130, 246, 0.08));
  border-color: rgba(37, 99, 235, 0.36);
  color: #1d4ed8;
}
.cuib-toggle:hover,
.cuib-button:hover,
.cuib-button--primary:hover,
.cuib-button--ghost:hover,
.cuib-button--chip:hover {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.32);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.cuib-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  overflow-y: auto;
}
.cuib-toolbar,
.cuib-actions,
.cuib-secondary-actions,
.cuib-inline-actions {
  display: grid;
  gap: 10px;
}
.cuib-toolbar,
.cuib-secondary-actions,
.cuib-inline-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.cuib-actions {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.cuib-card,
.cuib-empty,
.cuib-modal-body {
  padding: 12px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.94);
}
.cuib-card strong {
  display: block;
  font-size: 13px;
  line-height: 1.5;
}
.cuib-card p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #475569;
}
.cuib-source-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
  font-family: "Fira Code", "PingFang SC", "Microsoft YaHei", "Consolas", monospace;
  font-size: 11px;
  font-weight: 600;
}
.cuib-status {
  padding: 0 4px 2px;
  font-size: 12px;
  line-height: 1.5;
  color: #475569;
}
.cuib-request-actions {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.cuib-inline {
  position: fixed;
  width: min(360px, calc(100vw - 24px));
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
}
.cuib-inline-title {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}
.cuib-inline-subtitle {
  font-size: 11px;
  line-height: 1.5;
  color: #64748b;
}
.cuib-textarea {
  width: 100%;
  min-height: 88px;
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 14px;
  box-sizing: border-box;
  background: #ffffff;
  color: #0f172a;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  pointer-events: auto;
}
.cuib-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.24);
  pointer-events: none;
}
.cuib-modal {
  position: fixed;
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px;
}
.cuib-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.cuib-modal-header:active { cursor: grabbing; }
.cuib-modal-content {
  display: grid;
  gap: 12px;
  padding: 14px;
  overflow-y: auto;
}
.cuib-path-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cuib-path-chip,
.cuib-child-node,
.cuib-tree-node {
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: #ffffff;
  color: #0f172a;
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
}
.cuib-path-chip {
  padding: 6px 10px;
  font-size: 11px;
  font-family: "Fira Code", "PingFang SC", "Microsoft YaHei", "Consolas", monospace;
}
.cuib-current-node {
  padding: 10px;
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.18);
}
.cuib-current-node strong { display: block; font-size: 13px; }
.cuib-current-node p { margin: 6px 0 0; font-size: 12px; color: #475569; }
.cuib-children-list {
  display: grid;
  gap: 8px;
}
.cuib-child-node {
  width: 100%;
  padding: 8px 10px;
  text-align: left;
}
.cuib-tree-node {
  width: 100%;
  text-align: left;
  padding: 5px 8px;
  margin-top: 6px;
}
.cuib-tree-node--selected {
  color: #2563eb;
  font-weight: 700;
}
.cuib-tree-block {
  font-family: "Fira Code", "PingFang SC", "Microsoft YaHei", "Consolas", monospace;
  font-size: 11px;
  line-height: 1.7;
}
.cuib-tree-meta {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
}
.cuib-stream-block {
  display: grid;
  gap: 8px;
}
.cuib-stream-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cuib-stream-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(100, 116, 139, 0.14);
  color: #475569;
}
.cuib-stream-badge.running {
  background: rgba(37, 99, 235, 0.14);
  color: #1d4ed8;
}
.cuib-stream-badge.complete {
  background: rgba(16, 185, 129, 0.16);
  color: #047857;
}
.cuib-stream-badge.error {
  background: rgba(239, 68, 68, 0.14);
  color: #b91c1c;
}
.cuib-stream-body {
  display: grid;
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
}
.cuib-stream-text {
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: #0f172a;
}
.cuib-stream-thinking {
  font-size: 11px;
  color: #64748b;
}
.cuib-stream-thinking summary {
  cursor: pointer;
  font-weight: 600;
}
.cuib-stream-tool {
  display: grid;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: #ffffff;
  font-size: 11px;
  line-height: 1.5;
}
.cuib-stream-tool strong {
  font-size: 11px;
}
.cuib-stream-tool .cuib-stream-tool-status {
  color: #64748b;
}
.cuib-stream-tool .cuib-stream-tool-status.done {
  color: #047857;
}
.cuib-stream-tool .cuib-stream-tool-status.failed {
  color: #b91c1c;
}
.cuib-stream-tool pre {
  margin: 4px 0 0;
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: "Fira Code", "PingFang SC", "Microsoft YaHei", "Consolas", monospace;
  font-size: 10px;
  color: #475569;
}
.cuib-pending-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(234, 179, 8, 0.4);
  background: rgba(254, 249, 195, 0.6);
  font-size: 12px;
  line-height: 1.5;
}
.cuib-pending-card pre {
  margin: 0;
  max-height: 160px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11px;
  color: #475569;
}
.cuib-pending-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cuib-stream-empty {
  font-size: 12px;
  color: #94a3b8;
}
.cuib-select-toggle {
  width: 100%;
  min-height: 40px;
  font-size: 13px;
  font-weight: 700;
}
.cuib-pick-card {
  display: grid;
  gap: 6px;
}
.cuib-pick-card--empty {
  padding: 16px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
  text-align: center;
}
.cuib-pick-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.cuib-pick-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.5;
}
.cuib-pick-file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: "Fira Code", "PingFang SC", "Microsoft YaHei", "Consolas", monospace;
  font-size: 11px;
  font-weight: 600;
  color: #1d4ed8;
}
.cuib-pick-file--none {
  color: #94a3b8;
}
.cuib-icon-btn {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: #ffffff;
  font: inherit;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}
.cuib-icon-btn:hover {
  border-color: rgba(37, 99, 235, 0.4);
  color: #1d4ed8;
}
.cuib-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.cuib-preset {
  min-height: 26px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: #ffffff;
  font: inherit;
  font-size: 11px;
  color: #475569;
  cursor: pointer;
}
.cuib-preset:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.4);
  color: #1d4ed8;
}
.cuib-preset:disabled {
  opacity: 0.5;
  cursor: default;
}
.cuib-attach-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  color: #475569;
}
.cuib-attach-row label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}
.cuib-attach-row input {
  accent-color: #2563eb;
  margin: 0;
}
.cuib-textarea:disabled {
  background: #f1f5f9;
  color: #94a3b8;
}
.cuib-details-toggle {
  width: 100%;
  min-height: 32px;
  padding: 6px 10px;
  font-size: 12px;
  text-align: left;
}
.cuib-details-body {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.94);
}
.cuib-detail-row {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 8px;
  align-items: baseline;
  font-size: 11px;
  line-height: 1.5;
}
.cuib-detail-row span {
  color: #94a3b8;
}
.cuib-detail-row code {
  word-break: break-all;
  font-family: "Fira Code", "PingFang SC", "Microsoft YaHei", "Consolas", monospace;
  font-size: 11px;
  color: #334155;
}
.cuib-details-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cuib-details-actions .cuib-button--ghost {
  min-height: 28px;
  padding: 3px 10px;
  font-size: 11px;
}
@media (max-width: 640px) {
  .cuib-panel,
  .cuib-modal,
  .cuib-inline {
    width: calc(100vw - 24px);
  }
  .cuib-actions,
  .cuib-secondary-actions,
  .cuib-toolbar,
  .cuib-inline-actions {
    grid-template-columns: 1fr;
  }
}
`;

function getInitialLocale(): Locale {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

function t(state: PanelState, key: string): string {
  return STRINGS[state.locale][key] ?? key;
}

function getInitialPanelPosition() {
  const width = Math.min(PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
  return {
    x: Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN),
    y: PANEL_MARGIN
  };
}

function loadStoredPanelPosition(): { x: number; y: number } | null {
  try {
    const raw = window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return null;
    }
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function saveStoredPanelPosition(x: number, y: number) {
  try {
    window.localStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify({ x, y }));
  } catch {
    // ignore localStorage failures
  }
}

function clampPanelPosition(x: number, y: number, panelWidth: number, panelHeight: number) {
  const maxX = Math.max(PANEL_MARGIN, window.innerWidth - panelWidth - PANEL_MARGIN);
  const maxY = Math.max(PANEL_MARGIN, window.innerHeight - panelHeight - PANEL_MARGIN);
  return {
    x: Math.min(Math.max(x, PANEL_MARGIN), maxX),
    y: Math.min(Math.max(y, PANEL_MARGIN), maxY)
  };
}

function clampInlinePosition(x: number, y: number, width: number, height: number) {
  return clampPanelPosition(x, y, width, height);
}

function getRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function getTextPreview(element: HTMLElement): string | undefined {
  const text = element.innerText || element.textContent || "";
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 120) : undefined;
}

function buildSelectorSegment(element: HTMLElement): string {
  const parts = [element.tagName.toLowerCase()];
  if (element.id) {
    parts.push(`#${element.id}`);
  }
  if (element.classList.length > 0) {
    parts.push(
      Array.from(element.classList)
        .slice(0, 2)
        .map((name) => `.${name}`)
        .join("")
    );
  }
  return parts.join("");
}

function shouldPromoteSelection(element: HTMLElement): boolean {
  if (SELF_STABLE_TAGS.has(element.tagName)) {
    return false;
  }
  if (TEXT_LIKE_TAGS.has(element.tagName) && (element.textContent || "").trim().length < 80) {
    return true;
  }
  return element.childElementCount === 0;
}

function isReasonablePromotionTarget(current: HTMLElement, candidate: HTMLElement): boolean {
  if (candidate === document.body || candidate === document.documentElement) {
    return false;
  }
  if (candidate.closest(`[data-codeg-ui-bridge-ui="true"]`)) {
    return false;
  }
  if (LANDMARK_TAGS.has(candidate.tagName)) {
    return true;
  }

  const currentRect = current.getBoundingClientRect();
  const candidateRect = candidate.getBoundingClientRect();
  const currentArea = currentRect.width * currentRect.height;
  const candidateArea = candidateRect.width * candidateRect.height;

  if (candidateArea <= 0 || currentArea <= 0) {
    return false;
  }
  if (candidateArea > window.innerWidth * window.innerHeight * 0.72) {
    return false;
  }
  if (candidateArea > currentArea * 30) {
    return false;
  }

  const style = window.getComputedStyle(candidate);
  const isLayoutContainer =
    style.display === "block" ||
    style.display === "flex" ||
    style.display === "grid" ||
    style.display === "inline-flex" ||
    style.display === "inline-grid";

  return isLayoutContainer || candidate.classList.length > 0 || candidate.childElementCount > 1 || candidate.hasAttribute("role");
}

function resolvePreferredSelectionTarget(element: HTMLElement): HTMLElement {
  if (!shouldPromoteSelection(element)) {
    return element;
  }

  let current = element;
  let best = element;
  let depth = 0;

  while (current.parentElement && depth < 4) {
    const parent = current.parentElement;
    if (isReasonablePromotionTarget(current, parent)) {
      best = parent;
      break;
    }
    current = parent;
    depth += 1;
  }

  return best;
}

function toHTMLElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) {
    return target;
  }
  if (target instanceof Element) {
    let current: Element | null = target;
    while (current && !(current instanceof HTMLElement)) {
      current = current.parentElement;
    }
    return current;
  }
  return null;
}

function sendMessage<T extends RuntimeResponse>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

async function safeSendMessage<T extends RuntimeResponse>(message: object): Promise<T> {
  try {
    return await sendMessage<T>(message);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: text.includes("Extension context invalidated") ? "Extension context invalidated. Please reload the extension on this page." : text
    } as T;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getElementText(element: HTMLElement): string | undefined {
  return getTextPreview(element);
}

function getSelector(element: HTMLElement): string {
  return buildSelectorSegment(element);
}

function getDomPath(element: HTMLElement, depth = 5): string {
  const segments: string[] = [];
  let current: HTMLElement | null = element;

  while (current && segments.length < depth) {
    const parentElement: HTMLElement | null = current.parentElement;
    const index = parentElement ? Array.from(parentElement.children).indexOf(current) + 1 : 1;
    segments.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parentElement;
  }

  return segments.join(" > ");
}

function getSemanticPath(element: HTMLElement): string {
  const labels: string[] = [];
  let current: HTMLElement | null = element;

  while (current && labels.length < 5) {
    const label = current.getAttribute("aria-label") || current.getAttribute("data-testid") || current.getAttribute("name") || current.tagName.toLowerCase();
    labels.unshift(label);
    current = current.parentElement;
  }

  return labels.join(" / ");
}

function getTestAttributeHints(element: HTMLElement): string[] {
  return TEST_ATTRIBUTE_NAMES.flatMap((name) => {
    const value = element.getAttribute(name);
    return value ? [`${name}=${value}`] : [];
  });
}

function getSourceHint(element: HTMLElement): ContentSourceHint | undefined {
  const file = element.getAttribute("data-codeg-source-file") || undefined;
  const line = element.getAttribute("data-codeg-source-line") || undefined;
  const column = element.getAttribute("data-codeg-source-column") || undefined;
  const sourceId = element.getAttribute("data-codeg-source-id") || undefined;
  const component = element.getAttribute("data-codeg-component") || undefined;

  if (!file && !line && !column && !sourceId && !component) {
    return undefined;
  }

  return {
    file,
    sourceId,
    line: line ? Number(line) : undefined,
    column: column ? Number(column) : undefined,
    component
  };
}

function toSelection(element: HTMLElement): ContentSelection {
  return {
    tag: element.tagName.toLowerCase(),
    selector: getSelector(element),
    domPath: getDomPath(element),
    semanticPath: getSemanticPath(element),
    text: getElementText(element),
    testAttributes: getTestAttributeHints(element),
    rect: getRect(element)
  };
}

type ConsoleEntry = { level: string; message: string; source?: string; line?: number };

const consoleEntries: ConsoleEntry[] = [];
const CONSOLE_ENTRY_LIMIT = 20;

function recordConsoleEntry(entry: ConsoleEntry): void {
  consoleEntries.push(entry);
  if (consoleEntries.length > CONSOLE_ENTRY_LIMIT) {
    consoleEntries.shift();
  }
}

const COMPUTED_STYLE_PROPS = [
  "display",
  "position",
  "top",
  "left",
  "width",
  "height",
  "margin",
  "padding",
  "color",
  "background-color",
  "border",
  "border-radius",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "z-index",
  "opacity",
  "overflow",
  "flex-direction",
  "gap",
  "box-shadow"
];

function collectComputedStyle(element: HTMLElement): Record<string, string> {
  const style = window.getComputedStyle(element);
  const result: Record<string, string> = {};
  for (const prop of COMPUTED_STYLE_PROPS) {
    const value = style.getPropertyValue(prop);
    if (value) {
      result[prop] = value;
    }
  }
  return result;
}

function collectApplyExtra(state: PanelState): ApplyExtra {
  const extra: ApplyExtra = {};
  if (state.attachStyle && state.selectedElement) {
    extra.computedStyle = collectComputedStyle(state.selectedElement);
  }
  if (state.attachErrors && consoleEntries.length > 0) {
    extra.consoleErrors = consoleEntries.slice();
  }
  return extra;
}

function isInsideUi(event: Event): boolean {
  const inPath = event.composedPath().some((node) => {
    if (node instanceof HTMLElement) {
      if (node.className === "cuib-modal-mask" || node.className === "cuib-modal") {
        return false;
      }
      return node.dataset.codegUiBridgeUi === "true" || node.id === HOST_ID;
    }
    return false;
  });

  if (inPath) {
    return true;
  }

  if (!("clientX" in event) || !("clientY" in event) || typeof event.clientX !== "number" || typeof event.clientY !== "number") {
    return false;
  }

  const elements = document.elementsFromPoint(event.clientX, event.clientY);
  return elements.some((node) => {
    if (node instanceof HTMLElement) {
      if (node.className === "cuib-modal-mask" || node.className === "cuib-modal") {
        return false;
      }
      return node.dataset.codegUiBridgeUi === "true" || node.id === HOST_ID || node.closest(`#${HOST_ID}`) !== null;
    }
    return false;
  });
}

function getElementLabel(element: HTMLElement): string {
  const selector = getSelector(element);
  const text = getElementText(element);
  return text ? `${selector} · ${text}` : selector;
}

function buildSelectionJson(selection: ContentSelection | null, sourceHint?: ContentSourceHint): string {
  return JSON.stringify({ selection, sourceHint }, null, 2);
}

function appendStreamText(state: PanelState, kind: "text" | "thinking", text: string): void {
  if (!text) {
    return;
  }
  const last = state.stream[state.stream.length - 1];
  if (last && last.type === kind) {
    last.text += text;
    if (last.text.length > STREAM_TEXT_MAX_CHARS) {
      last.text = last.text.slice(-Math.floor(STREAM_TEXT_MAX_CHARS / 2));
    }
    return;
  }
  state.stream.push({ type: kind, text });
  if (state.stream.length > STREAM_MAX_ITEMS) {
    state.stream = state.stream.slice(-STREAM_MAX_ITEMS);
  }
}

function resetTurnState(state: PanelState): void {
  state.stream = [];
  state.turnState = "running";
  state.turnNote = "";
  state.pendingPermission = null;
  state.pendingQuestion = null;
  state.pendingPlan = null;
}

function applyAgentEventToState(state: PanelState, event: AgentStreamEvent): void {
  switch (event.kind) {
    case "text":
      appendStreamText(state, "text", event.text);
      break;
    case "thinking":
      appendStreamText(state, "thinking", event.text);
      break;
    case "tool": {
      const existing = state.stream.find((item) => item.type === "tool" && item.toolCallId === event.toolCallId);
      if (existing && existing.type === "tool") {
        if (event.title !== undefined) {
          existing.title = event.title;
        }
        if (event.status !== undefined) {
          existing.status = event.status;
        }
        if (event.content !== undefined && event.content !== "") {
          existing.content = event.content;
        }
      } else {
        state.stream.push({
          type: "tool",
          toolCallId: event.toolCallId,
          title: event.title || event.toolCallId,
          status: event.status || "pending",
          content: event.content || ""
        });
        if (state.stream.length > STREAM_MAX_ITEMS) {
          state.stream = state.stream.slice(-STREAM_MAX_ITEMS);
        }
      }
      break;
    }
    case "turn_complete":
      state.turnState = "complete";
      state.turnNote = "";
      state.pendingPermission = null;
      state.pendingQuestion = null;
      state.pendingPlan = null;
      break;
    case "error":
      state.turnState = "error";
      state.turnNote = event.message;
      break;
    case "permission":
      state.pendingPermission = { requestId: event.requestId, title: event.title, options: event.options };
      state.turnState = "running";
      break;
    case "question":
      state.pendingQuestion = { questionId: event.questionId, questions: event.questions };
      break;
    case "question_resolved":
      if (state.pendingQuestion?.questionId === event.questionId) {
        state.pendingQuestion = null;
      }
      break;
    case "plan_approval":
      state.pendingPlan = { approvalId: event.approvalId, planMarkdown: event.planMarkdown };
      break;
    case "plan_approval_resolved":
      if (state.pendingPlan?.approvalId === event.approvalId) {
        state.pendingPlan = null;
      }
      break;
    default:
      break;
  }
}

function streamBadge(state: PanelState): { cls: string; label: string } {
  switch (state.turnState) {
    case "running":
      return { cls: "running", label: t(state, "running") };
    case "complete":
      return { cls: "complete", label: t(state, "complete") };
    case "error":
      return { cls: "error", label: t(state, "failed") };
    default:
      return { cls: "", label: t(state, "streamIdle") };
  }
}

function buildStreamHeadMarkup(state: PanelState): string {
  const badge = streamBadge(state);
  return `
    <p class="cuib-section-label" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "stream"))}</p>
    <span id="cuibStreamBadge" class="cuib-stream-badge ${badge.cls}" data-codeg-ui-bridge-ui="true">${escapeHtml(badge.label)}</span>
    <span style="flex:1" data-codeg-ui-bridge-ui="true"></span>
    ${state.turnState === "running" ? `<button id="cuibStopTurn" class="cuib-button--ghost" style="min-height:26px;padding:2px 10px;" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "stop"))}</button>` : ""}
    <button id="cuibClearStream" class="cuib-button--ghost" style="min-height:26px;padding:2px 10px;" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "clearStream"))}</button>
  `;
}

function buildPendingMarkup(state: PanelState): string {
  const cards: string[] = [];

  if (state.pendingPermission) {
    const options = state.pendingPermission.options
      .map(
        (option) =>
          `<button class="cuib-button--ghost cuib-perm-option" data-perm-request-id="${escapeHtml(state.pendingPermission!.requestId)}" data-perm-option-id="${escapeHtml(
            option.optionId
          )}" data-codeg-ui-bridge-ui="true">${escapeHtml(option.name || option.optionId)}</button>`
      )
      .join("");
    cards.push(`
      <div class="cuib-pending-card" data-codeg-ui-bridge-ui="true">
        <strong>${escapeHtml(t(state, "permissionTitle"))}${state.pendingPermission.title ? `: ${escapeHtml(state.pendingPermission.title)}` : ""}</strong>
        <div class="cuib-pending-actions" data-codeg-ui-bridge-ui="true">${options}</div>
      </div>
    `);
  }

  if (state.pendingQuestion) {
    for (const question of state.pendingQuestion.questions) {
      const options = question.options
        .map(
          (option) =>
            `<button class="cuib-button--ghost cuib-question-option" data-question-id="${escapeHtml(question.id)}" data-question-label="${escapeHtml(
              option.label
            )}" data-question-multi="${question.multiSelect ? "1" : ""}" data-codeg-ui-bridge-ui="true" title="${escapeHtml(option.description || "")}">${escapeHtml(option.label)}</button>`
        )
        .join("");
      const multiControls = question.multiSelect
        ? `<button class="cuib-button--primary cuib-question-confirm" data-question-id="${escapeHtml(question.id)}" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "send"))}</button>`
        : "";
      cards.push(`
        <div class="cuib-pending-card" data-codeg-ui-bridge-ui="true">
          <strong>${escapeHtml(t(state, "questionTitle"))}${question.header ? `: ${escapeHtml(question.header)}` : ""}</strong>
          <div class="cuib-stream-text" data-codeg-ui-bridge-ui="true">${escapeHtml(question.question)}</div>
          <div class="cuib-pending-actions" data-codeg-ui-bridge-ui="true">${options}${multiControls}
            <button class="cuib-button--ghost cuib-question-decline" data-question-id="${escapeHtml(question.id)}" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "decline"))}</button>
          </div>
        </div>
      `);
    }
  }

  if (state.pendingPlan) {
    const plan = state.pendingPlan.planMarkdown.length > 4000
      ? `${state.pendingPlan.planMarkdown.slice(0, 4000)}\n...`
      : state.pendingPlan.planMarkdown;
    cards.push(`
      <div class="cuib-pending-card" data-codeg-ui-bridge-ui="true">
        <strong>${escapeHtml(t(state, "planTitle"))}</strong>
        <pre data-codeg-ui-bridge-ui="true">${escapeHtml(plan)}</pre>
        <div class="cuib-pending-actions" data-codeg-ui-bridge-ui="true">
          <button class="cuib-button--primary cuib-plan-option" data-plan-approval-id="${escapeHtml(state.pendingPlan.approvalId)}" data-plan-decision="approve" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "planApprove"))}</button>
          <button class="cuib-button--ghost cuib-plan-option" data-plan-approval-id="${escapeHtml(state.pendingPlan.approvalId)}" data-plan-decision="request_changes" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "planRequestChanges"))}</button>
          <button class="cuib-button--ghost cuib-plan-option" data-plan-approval-id="${escapeHtml(state.pendingPlan.approvalId)}" data-plan-decision="abandon" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "planAbandon"))}</button>
        </div>
      </div>
    `);
  }

  return cards.join("");
}

function buildStreamMarkup(state: PanelState): string {
  const parts: string[] = [];

  if (state.turnNote && state.turnState === "error") {
    parts.push(`<div class="cuib-stream-text" data-codeg-ui-bridge-ui="true">${escapeHtml(state.turnNote)}</div>`);
  }

  for (const item of state.stream) {
    if (item.type === "text") {
      parts.push(`<div class="cuib-stream-text" data-codeg-ui-bridge-ui="true">${escapeHtml(item.text)}</div>`);
    } else if (item.type === "thinking") {
      parts.push(`
        <details class="cuib-stream-thinking" data-codeg-ui-bridge-ui="true">
          <summary data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "thinkingLabel"))}</summary>
          <div class="cuib-stream-text" data-codeg-ui-bridge-ui="true">${escapeHtml(item.text)}</div>
        </details>
      `);
    } else {
      const statusClass = item.status === "completed" ? "done" : item.status === "failed" || item.status === "errored" ? "failed" : "";
      parts.push(`
        <div class="cuib-stream-tool" data-codeg-ui-bridge-ui="true">
          <strong data-codeg-ui-bridge-ui="true">${escapeHtml(item.title || item.toolCallId)}</strong>
          <span class="cuib-stream-tool-status ${statusClass}" data-codeg-ui-bridge-ui="true">${escapeHtml(item.status || "")}</span>
          ${item.content ? `<pre data-codeg-ui-bridge-ui="true">${escapeHtml(item.content)}</pre>` : ""}
        </div>
      `);
    }
  }

  if (parts.length === 0) {
    return `<div class="cuib-stream-empty" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "streamIdle"))}</div>`;
  }
  return parts.join("");
}

function getChildrenElements(element: HTMLElement): HTMLElement[] {
  return Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function findElementByDomPath(domPath: string): HTMLElement | null {
  if (!domPath) {
    return null;
  }

  const segments = domPath.split(" > ");
  let current: Element | null = document.documentElement;

  for (const segment of segments) {
    const nextElement: Element | null | undefined = current?.querySelector(`:scope > ${segment}`);
    if (!nextElement) {
      return null;
    }
    current = nextElement;
  }

  return current instanceof HTMLElement ? current : null;
}

function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

function closeTransientUi(state: PanelState) {
  state.domModalOpen = false;
  state.composerOpen = false;
  state.childrenExpanded = false;
}

function clearSelectionState(state: PanelState) {
  state.selectedElement = null;
  state.hoveredElement = null;
  state.selectedSelection = null;
  state.selectedSourceHint = undefined;
  state.promptDraft = "";
  closeTransientUi(state);
}

function isDialogLikeElement(element: HTMLElement | null): boolean {
  if (!element) {
    return false;
  }
  return Boolean(element.closest(DIALOG_LIKE_SELECTOR));
}

function isTextInputElement(element: EventTarget | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

function buildDomExplorerMarkup(state: PanelState): string {
  if (!state.selectedElement) {
    return `<div class="cuib-empty">${escapeHtml(t(state, "noSelection"))}</div>`;
  }

  const ancestors: HTMLElement[] = [];
  let current = state.selectedElement.parentElement;
  while (current && current.tagName !== "BODY" && current.tagName !== "HTML") {
    ancestors.unshift(current);
    current = current.parentElement;
  }

  const children = getChildrenElements(state.selectedElement);
  const visibleChildren = state.childrenExpanded ? children : children.slice(0, CHILD_PREVIEW_COUNT);

  const chips = ancestors.length
    ? `<div class="cuib-path-chips">${ancestors
        .map(
          (item) =>
            `<button class="cuib-path-chip" data-codeg-node-path="${escapeHtml(getDomPath(item, 8))}" data-codeg-ui-bridge-ui="true">${escapeHtml(getElementLabel(item))}</button>`
        )
        .join("")}</div>`
    : `<div class="cuib-empty">${escapeHtml(t(state, "noSource"))}</div>`;

  const treeLines = visibleChildren.length
    ? visibleChildren
        .map(
          (item) =>
            `<button class="cuib-tree-node${item === state.selectedElement ? " cuib-tree-node--selected" : ""}" data-codeg-node-path="${escapeHtml(
              getDomPath(item, 8)
            )}" data-codeg-ui-bridge-ui="true">${escapeHtml(getElementLabel(item))}</button>`
        )
        .join("")
    : `<div class="cuib-empty">${escapeHtml(t(state, "noChildren"))}</div>`;

  const childToggle = children.length > CHILD_PREVIEW_COUNT
    ? `<button id="cuibToggleChildren" class="cuib-button--ghost" data-codeg-ui-bridge-ui="true">${escapeHtml(
        state.childrenExpanded ? t(state, "lessChildren") : t(state, "moreChildren")
      )}</button>`
    : "";

  return `
    <div class="cuib-modal-body">
      <p class="cuib-section-label">${escapeHtml(t(state, "ancestorPath"))}</p>
      ${chips}
    </div>
    <div class="cuib-modal-body">
      <p class="cuib-section-label">${escapeHtml(t(state, "currentNode"))}</p>
      <div class="cuib-current-node">
        <strong>${escapeHtml(getElementLabel(state.selectedElement))}</strong>
        <p>${escapeHtml(`${t(state, "selector")}: ${state.selectedSelection?.selector || t(state, "noSource")}`)}</p>
        <p>${escapeHtml(`${t(state, "text")}: ${state.selectedSelection?.text || t(state, "noSource")}`)}</p>
      </div>
    </div>
    <div class="cuib-modal-body">
      <p class="cuib-section-label">${escapeHtml(t(state, "childPreview"))}</p>
      <div class="cuib-children-list">${visibleChildren
        .map(
          (item) =>
            `<button class="cuib-child-node" data-codeg-node-path="${escapeHtml(getDomPath(item, 8))}" data-codeg-ui-bridge-ui="true">${escapeHtml(
              getElementLabel(item)
            )}</button>`
        )
        .join("") || `<div class="cuib-empty">${escapeHtml(t(state, "noChildren"))}</div>`}</div>
      ${childToggle}
    </div>
    <div class="cuib-card cuib-tree-block">
      ${treeLines}
      <div class="cuib-tree-meta">${escapeHtml(`${t(state, "childrenCount")}: ${children.length}`)}</div>
      <div class="cuib-tree-meta">${escapeHtml(t(state, "siblingHint"))}</div>
    </div>
  `;
}

async function boot() {
  if (window.__CODEG_UI_BRIDGE_CONTENT_BOOTED__) {
    return;
  }
  window.__CODEG_UI_BRIDGE_CONTENT_BOOTED__ = true;

  const existingHost = document.getElementById(HOST_ID);
  if (existingHost) {
    return;
  }

  const initialPosition = getInitialPanelPosition();
  const storedPanelPosition = loadStoredPanelPosition();
  const restoredPanelPosition = storedPanelPosition
    ? clampPanelPosition(storedPanelPosition.x, storedPanelPosition.y, PANEL_WIDTH, 320)
    : initialPosition;
  const state: PanelState = {
    collapsed: false,
    selecting: true,
    domModalOpen: false,
    composerOpen: false,
    childrenExpanded: false,
    detailsOpen: false,
    attachStyle: true,
    attachErrors: true,
    promptDraft: "",
    statusText: STRINGS[getInitialLocale()].waiting,
    runtime: null,
    selectedElement: null,
    hoveredElement: null,
    selectedSelection: null,
    selectedSourceHint: undefined,
    panelX: restoredPanelPosition.x,
    panelY: restoredPanelPosition.y,
    modalX: Math.max(PANEL_MARGIN, window.innerWidth / 2 - 280),
    modalY: Math.max(PANEL_MARGIN, window.innerHeight / 2 - 260),
    locale: getInitialLocale(),
    stream: [],
    turnState: "idle",
    turnNote: "",
    pendingPermission: null,
    pendingQuestion: null,
    pendingPlan: null
  };

  let dragState: DragState = null;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.dataset.codegUiBridgeUi = "true";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "2147483647";
  host.tabIndex = -1;

  const style = document.createElement("style");
  style.textContent = CSS_TEXT;
  style.id = "codeg-ui-bridge-styles";

  const root = document.createElement("div");
  root.className = "cuib-root";
  root.dataset.codegUiBridgeUi = "true";

  const hoverFrame = document.createElement("div");
  hoverFrame.className = "cuib-frame cuib-frame--hover";
  hoverFrame.style.display = "none";
  const hoverLabel = document.createElement("span");
  hoverLabel.className = "cuib-frame__label";
  hoverFrame.appendChild(hoverLabel);

  const selectedFrame = document.createElement("div");
  selectedFrame.className = "cuib-frame cuib-frame--selected";
  selectedFrame.style.display = "none";
  const selectedLabel = document.createElement("span");
  selectedLabel.className = "cuib-frame__label";
  selectedFrame.appendChild(selectedLabel);

  const panel = document.createElement("aside");
  panel.className = "cuib-panel";
  panel.dataset.codegUiBridgeUi = "true";

  const inlineComposer = document.createElement("div");
  inlineComposer.className = "cuib-inline";
  inlineComposer.style.display = "none";
  inlineComposer.dataset.codegUiBridgeUi = "true";

  const modalMask = document.createElement("div");
  modalMask.className = "cuib-modal-mask";
  modalMask.style.display = "none";
  modalMask.dataset.codegUiBridgeUi = "true";

  const modal = document.createElement("div");
  modal.className = "cuib-modal";
  modal.style.display = "none";
  modal.dataset.codegUiBridgeUi = "true";

  root.appendChild(hoverFrame);
  root.appendChild(selectedFrame);
  root.appendChild(panel);
  root.appendChild(inlineComposer);
  root.appendChild(modalMask);
  root.appendChild(modal);
  host.appendChild(style);
  host.appendChild(root);
  document.documentElement.appendChild(host);

  function getActiveDialogRoot(): HTMLElement | null {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(DIALOG_LIKE_SELECTOR));
    if (candidates.length === 0) {
      return null;
    }
    return candidates[candidates.length - 1] ?? null;
  }

  function renderPanel() {
    const sourceText = state.selectedSourceHint?.file || state.selectedSourceHint?.sourceId
      ? `${state.selectedSourceHint.file || state.selectedSourceHint.sourceId}${state.selectedSourceHint.line ? `:${state.selectedSourceHint.line}` : ""}`
      : t(state, "noSource");

    panel.style.left = `${state.panelX}px`;
    panel.style.top = `${state.panelY}px`;
    panel.style.display = "flex";
    panel.className = `cuib-panel${state.collapsed ? " cuib-panel--collapsed" : ""}`;

    const collapsedHeader = `
      <div class="cuib-header cuib-header--collapsed" data-codeg-ui-bridge-ui="true">
        <div class="cuib-header-actions cuib-header-actions--compact" data-codeg-ui-bridge-ui="true">
          <div class="cuib-status-pill" data-codeg-ui-bridge-ui="true" aria-label="bridge-status">
            <span class="cuib-status-indicator ${state.runtime?.connectionId ? "connected" : "disconnected"}" data-codeg-ui-bridge-ui="true"></span>
          </div>
          <button id="cuibToggleSelect" class="cuib-toggle cuib-toggle--mini cuib-button--chip ${state.selecting ? "is-active" : ""}" data-codeg-ui-bridge-ui="true">${escapeHtml(state.selecting ? "选择:开" : "选择:关")}</button>
          ${state.runtime?.connectionId ? `<button id="cuibDisconnect" class="cuib-toggle cuib-toggle--mini" data-codeg-ui-bridge-ui="true">断开</button>` : ""}
          <button id="cuibToggleCollapse" class="cuib-toggle cuib-toggle--mini" data-codeg-ui-bridge-ui="true">展开</button>
          <button id="cuibClosePanel" class="cuib-toggle cuib-toggle--mini" aria-label="Close panel" data-codeg-ui-bridge-ui="true">×</button>
        </div>
      </div>
    `;

    const hasSelection = Boolean(state.selectedElement && state.selectedSelection);
    const selectionCard = hasSelection
      ? `
      <div class="cuib-card cuib-pick-card" data-codeg-ui-bridge-ui="true">
        <div class="cuib-pick-row" data-codeg-ui-bridge-ui="true">
          <strong class="cuib-pick-label" data-codeg-ui-bridge-ui="true">🎯 ${escapeHtml(getElementLabel(state.selectedElement!))}</strong>
          <button id="cuibClearPick" class="cuib-icon-btn" title="${escapeHtml(t(state, "clearPick"))}" data-codeg-ui-bridge-ui="true">×</button>
        </div>
        <div class="cuib-pick-row" data-codeg-ui-bridge-ui="true">
          <span class="cuib-pick-file${state.selectedSourceHint ? "" : " cuib-pick-file--none"}" data-codeg-ui-bridge-ui="true">📄 ${escapeHtml(state.selectedSourceHint ? sourceText : t(state, "noSourceBound"))}</span>
          <button id="cuibCopyLocate" class="cuib-icon-btn" title="${escapeHtml(t(state, "copyLocate"))}" data-codeg-ui-bridge-ui="true">⧉</button>
        </div>
      </div>
    `
      : `
      <div class="cuib-card cuib-pick-card cuib-pick-card--empty" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "pickHint"))}</div>
    `;

    const presetChips = PRESETS[state.locale]
      .map(
        (preset, index) =>
          `<button class="cuib-preset" data-preset-index="${index}" ${hasSelection ? "" : "disabled"} data-codeg-ui-bridge-ui="true">${escapeHtml(preset.label)}</button>`
      )
      .join("");

    const streamActive =
      state.turnState !== "idle" ||
      state.stream.length > 0 ||
      Boolean(state.pendingPermission || state.pendingQuestion || state.pendingPlan);

    panel.innerHTML = state.collapsed ? collapsedHeader : `
      <div class="cuib-header" data-codeg-ui-bridge-ui="true">
        <div class="cuib-header-drag-zone" data-codeg-ui-bridge-ui="true">
          <p class="cuib-eyebrow">${escapeHtml(t(state, "title"))}</p>
          <h2 class="cuib-title">${escapeHtml(t(state, "subtitle"))}</h2>
          <p class="cuib-subtitle">
            <span class="cuib-status-indicator ${state.runtime?.connectionId ? "connected" : "disconnected"}" data-codeg-ui-bridge-ui="true"></span>
            ${escapeHtml(state.statusText)}
          </p>
        </div>
        <div class="cuib-header-actions" data-codeg-ui-bridge-ui="true">
          ${state.runtime?.connectionId ? `<button id="cuibDisconnect" class="cuib-toggle" data-codeg-ui-bridge-ui="true">断开</button>` : ""}
          <button id="cuibToggleCollapse" class="cuib-toggle" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "collapse"))}</button>
          <button id="cuibClosePanel" class="cuib-toggle" aria-label="Close panel" data-codeg-ui-bridge-ui="true">×</button>
        </div>
      </div>
      <div class="cuib-body" data-codeg-ui-bridge-ui="true">
        <button id="cuibToggleSelect" class="cuib-button--chip cuib-select-toggle ${state.selecting ? "is-active" : ""}" data-codeg-ui-bridge-ui="true">⬚ ${escapeHtml(t(state, "selectToggle"))}</button>
        ${selectionCard}
        <div data-codeg-ui-bridge-ui="true">
          <textarea id="cuibPanelPrompt" class="cuib-textarea" ${hasSelection ? "" : "disabled"} placeholder="${escapeHtml(hasSelection ? t(state, "changePlaceholder") : t(state, "pickHint"))}" data-codeg-ui-bridge-ui="true">${escapeHtml(state.promptDraft)}</textarea>
          <div class="cuib-presets" data-codeg-ui-bridge-ui="true">${presetChips}</div>
          <div class="cuib-attach-row" data-codeg-ui-bridge-ui="true">
            <label data-codeg-ui-bridge-ui="true"><input type="checkbox" id="cuibAttachStyle" ${state.attachStyle ? "checked" : ""} data-codeg-ui-bridge-ui="true" />${escapeHtml(t(state, "attachStyle"))}</label>
            <label data-codeg-ui-bridge-ui="true"><input type="checkbox" id="cuibAttachErrors" ${state.attachErrors ? "checked" : ""} data-codeg-ui-bridge-ui="true" />${escapeHtml(t(state, "attachErrors"))}${consoleEntries.length ? ` (${consoleEntries.length})` : ""}</label>
          </div>
          <div class="cuib-request-actions" data-codeg-ui-bridge-ui="true">
            <button id="cuibPanelSend" class="cuib-button--primary" ${hasSelection ? "" : "disabled"} data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "send"))} ▶</button>
          </div>
        </div>
        <section id="cuibStreamSection" style="${streamActive ? "" : "display: none;"}" data-codeg-ui-bridge-ui="true">
          <div id="cuibStreamHead" class="cuib-stream-head" data-codeg-ui-bridge-ui="true">${buildStreamHeadMarkup(state)}</div>
          <div id="cuibPendingArea" style="display:grid; gap:8px;" data-codeg-ui-bridge-ui="true">${buildPendingMarkup(state)}</div>
          <div id="cuibStreamBody" class="cuib-stream-body" data-codeg-ui-bridge-ui="true">${buildStreamMarkup(state)}</div>
        </section>
        <div class="cuib-details" data-codeg-ui-bridge-ui="true">
          <button id="cuibToggleDetails" class="cuib-button--ghost cuib-details-toggle" data-codeg-ui-bridge-ui="true">${state.detailsOpen ? "▾" : "▸"} ${escapeHtml(t(state, "details"))}</button>
          ${
            state.detailsOpen
              ? `<div class="cuib-details-body" data-codeg-ui-bridge-ui="true">
            <div class="cuib-detail-row" data-codeg-ui-bridge-ui="true"><span>${escapeHtml(t(state, "domPath"))}</span><code>${escapeHtml(state.selectedSelection?.domPath || t(state, "noSource"))}</code></div>
            <div class="cuib-detail-row" data-codeg-ui-bridge-ui="true"><span>${escapeHtml(t(state, "semanticPath"))}</span><code>${escapeHtml(state.selectedSelection?.semanticPath || t(state, "noSource"))}</code></div>
            <div class="cuib-detail-row" data-codeg-ui-bridge-ui="true"><span>${escapeHtml(t(state, "rect"))}</span><code>${escapeHtml(state.selectedSelection?.rect ? `${state.selectedSelection.rect.x}, ${state.selectedSelection.rect.y}, ${state.selectedSelection.rect.width}×${state.selectedSelection.rect.height}` : t(state, "noSource"))}</code></div>
            <div class="cuib-detail-row" data-codeg-ui-bridge-ui="true"><span>${escapeHtml(t(state, "component"))}</span><code>${escapeHtml(state.selectedSourceHint?.component || t(state, "noSource"))}</code></div>
            <div class="cuib-detail-row" data-codeg-ui-bridge-ui="true"><span>${escapeHtml(t(state, "sourceId"))}</span><code>${escapeHtml(state.selectedSourceHint?.sourceId || t(state, "noSource"))}</code></div>
            <div class="cuib-details-actions" data-codeg-ui-bridge-ui="true">
              <button id="cuibOpenDom" class="cuib-button--ghost" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "dom"))}</button>
              <button id="cuibCopyJson" class="cuib-button--ghost" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "copyJson"))}</button>
              <button id="cuibToggleLocale" class="cuib-button--ghost" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "locale"))}</button>
              <button id="cuibRefresh" class="cuib-button--ghost" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "refresh"))}</button>
            </div>
          </div>`
              : ""
          }
        </div>
      </div>
    `;

    const header = panel.querySelector<HTMLElement>(".cuib-header");
    const toggleLocaleButton = panel.querySelector<HTMLButtonElement>("#cuibToggleLocale");
    const toggleCollapseButton = panel.querySelector<HTMLButtonElement>("#cuibToggleCollapse");
    const toggleSelectButton = panel.querySelector<HTMLButtonElement>("#cuibToggleSelect");
    const refreshButton = panel.querySelector<HTMLButtonElement>("#cuibRefresh");
    const closePanelButton = panel.querySelector<HTMLButtonElement>("#cuibClosePanel");
    const openDomButton = panel.querySelector<HTMLButtonElement>("#cuibOpenDom");
    const copyJsonButton = panel.querySelector<HTMLButtonElement>("#cuibCopyJson");
    const clearPickButton = panel.querySelector<HTMLButtonElement>("#cuibClearPick");
    const copyLocateButton = panel.querySelector<HTMLButtonElement>("#cuibCopyLocate");
    const detailsToggleButton = panel.querySelector<HTMLButtonElement>("#cuibToggleDetails");
    const attachStyleInput = panel.querySelector<HTMLInputElement>("#cuibAttachStyle");
    const attachErrorsInput = panel.querySelector<HTMLInputElement>("#cuibAttachErrors");
    const panelPrompt = panel.querySelector<HTMLTextAreaElement>("#cuibPanelPrompt");
    const panelSendButton = panel.querySelector<HTMLButtonElement>("#cuibPanelSend");

    if (header) {
      header.onpointerdown = (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button")) return;
        event.preventDefault();
        dragState = { startX: event.clientX, startY: event.clientY, originX: state.panelX, originY: state.panelY, target: "panel" };
      };
    }
    toggleLocaleButton?.addEventListener("click", () => {
      state.locale = state.locale === "zh-CN" ? "en-US" : "zh-CN";
      state.statusText = state.runtime?.connectionId ? `${t(state, "connectedPrefix")}: ${state.runtime.connectionId}` : t(state, "waiting");
      renderAll();
    });
    toggleCollapseButton?.addEventListener("click", () => { state.collapsed = !state.collapsed; renderAll(); });
    toggleSelectButton?.addEventListener("click", () => {
      state.selecting = !state.selecting;
      state.statusText = state.selecting ? t(state, "selectingEnabled") : t(state, "selectingDisabled");
      if (!state.selecting) {
        clearSelectionState(state);
      }
      renderAll();
    });
    closePanelButton?.addEventListener("click", () => {
      destroyOverlay();
    });

    const disconnectButton = panel.querySelector<HTMLButtonElement>("#cuibDisconnect");
    disconnectButton?.addEventListener("click", async () => {
      try {
        const response = await safeSendMessage<RuntimeResponse>({
          type: MESSAGE_TYPES.contentDisconnect
        });
        if (!response.ok) {
          state.statusText = response.error || "断开连接失败";
          renderAll();
          return;
        }
        destroyOverlay();
      } catch (error) {
        console.error("[Codeg UI Bridge] Disconnect error:", error);
        state.statusText = "断开连接失败";
        renderAll();
      }
    });

    refreshButton?.addEventListener("click", () => { void loadRuntime(); });
    openDomButton?.addEventListener("click", () => {
      if (!state.selectedElement) {
        state.statusText = t(state, "noElement");
        renderAll();
        return;
      }
      state.domModalOpen = true;
      renderAll();
    });
    clearPickButton?.addEventListener("click", () => {
      clearSelectionState(state);
      state.statusText = t(state, "pickHint");
      renderAll();
    });
    copyLocateButton?.addEventListener("click", async () => {
      const hint = state.selectedSourceHint;
      const locate = hint?.file
        ? `${hint.file}${hint.line ? `:${hint.line}` : ""}`
        : hint?.sourceId || "";
      if (!locate) {
        state.statusText = t(state, "sourceMissing");
        renderAll();
        return;
      }
      const selector = state.selectedSelection?.selector;
      await copyText(selector ? `${locate}\nselector: ${selector}` : locate);
      state.statusText = `${t(state, "copiedLocate")}: ${locate}`;
      renderAll();
    });
    detailsToggleButton?.addEventListener("click", () => {
      state.detailsOpen = !state.detailsOpen;
      renderAll();
    });
    attachStyleInput?.addEventListener("change", () => {
      state.attachStyle = attachStyleInput.checked;
    });
    attachErrorsInput?.addEventListener("change", () => {
      state.attachErrors = attachErrorsInput.checked;
    });
    panel.querySelectorAll<HTMLButtonElement>(".cuib-preset").forEach((chip) => {
      chip.addEventListener("click", () => {
        const preset = PRESETS[state.locale][Number(chip.dataset.presetIndex ?? "-1")];
        if (!preset || !panelPrompt) {
          return;
        }
        state.promptDraft = preset.text;
        panelPrompt.value = preset.text;
        panelPrompt.focus();
      });
    });
    copyJsonButton?.addEventListener("click", async () => {
      await copyText(buildSelectionJson(state.selectedSelection, state.selectedSourceHint));
      state.statusText = t(state, "copiedJson");
      renderAll();
    });
    panelPrompt?.addEventListener("input", () => {
      state.promptDraft = panelPrompt.value;
    });
    panelPrompt?.addEventListener("pointerdown", (event) => {
      panelPrompt?.focus();
      if (panelPrompt) {
        panelPrompt.setSelectionRange(panelPrompt.value.length, panelPrompt.value.length);
      }
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);
    panelPrompt?.addEventListener("click", (event) => {
      event.stopPropagation();
      event.stopImmediatePropagation();
    });
    panelPrompt?.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
    panelPrompt?.addEventListener("focusin", (event) => {
      event.stopPropagation();
    });
    panelSendButton?.addEventListener("click", async () => {
      if (!state.runtime?.connectionId) {
        state.statusText = t(state, "notConnected");
        renderAll();
        return;
      }
      if (!state.selectedSelection || !state.selectedElement) {
        state.statusText = t(state, "noElement");
        renderAll();
        return;
      }
      const promptText = (panelPrompt?.value || state.promptDraft).trim();
      if (!promptText) {
        state.statusText = t(state, "noPrompt");
        renderAll();
        return;
      }
      state.statusText = t(state, "sending");
      renderAll();
      const response = await safeSendMessage<RuntimeResponse>({
        type: MESSAGE_TYPES.contentApply,
        pageUrl: window.location.href,
        selection: state.selectedSelection,
        sourceHint: state.selectedSourceHint,
        prompt: promptText,
        extra: collectApplyExtra(state)
      });
      if (!response.ok) {
        state.statusText = response.error || "Apply failed";
        renderAll();
        return;
      }
      state.promptDraft = "";
      resetTurnState(state);
      state.statusText = `${t(state, "sentPrefix")}: ${response.requestId}`;
      renderAll();
    });
  }

  function renderStream() {
    const head = panel.querySelector<HTMLElement>("#cuibStreamHead");
    const pendingArea = panel.querySelector<HTMLElement>("#cuibPendingArea");
    const streamBody = panel.querySelector<HTMLElement>("#cuibStreamBody");
    if (!head || !pendingArea || !streamBody) {
      return;
    }
    head.innerHTML = buildStreamHeadMarkup(state);
    pendingArea.innerHTML = buildPendingMarkup(state);
    streamBody.innerHTML = buildStreamMarkup(state);
    streamBody.scrollTop = streamBody.scrollHeight;
    bindStreamControls();
  }

  function respondWith(message: {
    type: typeof MESSAGE_TYPES.contentRespondRequest;
    respond:
      | { kind: "permission"; requestId: string; optionId: string }
      | { kind: "question"; questionId: string; labels: string[] }
      | { kind: "question_decline"; questionId: string }
      | { kind: "plan_approval"; approvalId: string; decision: "approve" | "request_changes" | "abandon" };
  }): () => Promise<void> {
    return async () => {
      const response = await safeSendMessage<RuntimeResponse>(message);
      state.statusText = response.ok ? t(state, "complete") : response.error || "Respond failed";
      renderStream();
    };
  }

  function bindStreamControls() {
    const stopButton = panel.querySelector<HTMLButtonElement>("#cuibStopTurn");
    stopButton?.addEventListener("click", async () => {
      const response = await safeSendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.contentCancelTurn });
      state.statusText = response.ok ? t(state, "stop") : response.error || "Cancel failed";
      renderStream();
    });

    const clearButton = panel.querySelector<HTMLButtonElement>("#cuibClearStream");
    clearButton?.addEventListener("click", () => {
      state.stream = [];
      if (state.turnState !== "running") {
        state.turnState = "idle";
        state.turnNote = "";
      }
      state.pendingPermission = null;
      state.pendingQuestion = null;
      state.pendingPlan = null;
      renderStream();
    });

    panel.querySelectorAll<HTMLButtonElement>(".cuib-perm-option").forEach((button) => {
      button.addEventListener("click", () => {
        void respondWith({
          type: MESSAGE_TYPES.contentRespondRequest,
          respond: {
            kind: "permission",
            requestId: button.dataset.permRequestId || "",
            optionId: button.dataset.permOptionId || ""
          }
        })();
      });
    });

    panel.querySelectorAll<HTMLButtonElement>(".cuib-question-option").forEach((button) => {
      button.addEventListener("click", () => {
        const questionId = button.dataset.questionId || "";
        const label = button.dataset.questionLabel || "";
        const multi = Boolean(button.dataset.questionMulti);
        if (multi) {
          button.classList.toggle("is-active");
          return;
        }
        void respondWith({
          type: MESSAGE_TYPES.contentRespondRequest,
          respond: { kind: "question", questionId, labels: [label] }
        })();
      });
    });

    panel.querySelectorAll<HTMLButtonElement>(".cuib-question-confirm").forEach((button) => {
      button.addEventListener("click", () => {
        const questionId = button.dataset.questionId || "";
        const labels = Array.from(
          panel.querySelectorAll<HTMLButtonElement>(`.cuib-question-option[data-question-id="${questionId}"].is-active`)
        ).map((active) => active.dataset.questionLabel || "");
        void respondWith({
          type: MESSAGE_TYPES.contentRespondRequest,
          respond: { kind: "question", questionId, labels }
        })();
      });
    });

    panel.querySelectorAll<HTMLButtonElement>(".cuib-question-decline").forEach((button) => {
      button.addEventListener("click", () => {
        void respondWith({
          type: MESSAGE_TYPES.contentRespondRequest,
          respond: { kind: "question_decline", questionId: button.dataset.questionId || "" }
        })();
      });
    });

    panel.querySelectorAll<HTMLButtonElement>(".cuib-plan-option").forEach((button) => {
      button.addEventListener("click", () => {
        void respondWith({
          type: MESSAGE_TYPES.contentRespondRequest,
          respond: {
            kind: "plan_approval",
            approvalId: button.dataset.planApprovalId || "",
            decision: (button.dataset.planDecision as "approve" | "request_changes" | "abandon") || "approve"
          }
        })();
      });
    });
  }

  function renderInlineComposer() {
    if (!state.selectedElement || !state.composerOpen) {
      inlineComposer.style.display = "none";
      return;
    }
    const rect = state.selectedElement.getBoundingClientRect();
    const placeBelow = rect.bottom + 12 + 180 <= window.innerHeight;
    const rawX = rect.left;
    const rawY = placeBelow ? rect.bottom + 10 : Math.max(PANEL_MARGIN, rect.top - 170);
    const next = clampInlinePosition(rawX, rawY, COMPOSER_WIDTH, 170);
    inlineComposer.style.display = "grid";
    inlineComposer.style.left = `${next.x}px`;
    inlineComposer.style.top = `${next.y}px`;
    inlineComposer.innerHTML = `
      <div class="cuib-inline-title" data-codeg-ui-bridge-ui="true">🎯 ${escapeHtml(getElementLabel(state.selectedElement))}<button id="cuibInlineClose" class="cuib-icon-btn" title="${escapeHtml(t(state, "inlineClose"))}" data-codeg-ui-bridge-ui="true">×</button></div>
      <div class="cuib-inline-subtitle" data-codeg-ui-bridge-ui="true">📄 ${escapeHtml(state.selectedSourceHint?.file || state.selectedSourceHint?.sourceId || t(state, "noSourceBound"))}</div>
      <textarea id="cuibInlinePrompt" class="cuib-textarea" data-codeg-ui-bridge-ui="true" placeholder="${escapeHtml(t(state, "changePlaceholder"))}">${escapeHtml(state.promptDraft)}</textarea>
      <div class="cuib-inline-actions" data-codeg-ui-bridge-ui="true">
        <button id="cuibInlinePanel" class="cuib-button--ghost" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "openInPanel"))}</button>
        <button id="cuibInlineSend" class="cuib-button--primary" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "send"))} ▶</button>
      </div>
    `;
    const prompt = inlineComposer.querySelector<HTMLTextAreaElement>("#cuibInlinePrompt");
    const sendButton = inlineComposer.querySelector<HTMLButtonElement>("#cuibInlineSend");
    const panelButton = inlineComposer.querySelector<HTMLButtonElement>("#cuibInlinePanel");
    const closeButton = inlineComposer.querySelector<HTMLButtonElement>("#cuibInlineClose");
    window.requestAnimationFrame(() => {
      prompt?.focus();
      prompt?.setSelectionRange(prompt.value.length, prompt.value.length);
    });
    prompt?.addEventListener("input", () => { state.promptDraft = prompt.value; });
    prompt?.addEventListener("pointerdown", (event) => {
      prompt?.focus();
      if (prompt) {
        prompt.setSelectionRange(prompt.value.length, prompt.value.length);
      }
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);
    prompt?.addEventListener("click", (event) => {
      event.stopPropagation();
      event.stopImmediatePropagation();
    });
    prompt?.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
    prompt?.addEventListener("focusin", (event) => {
      event.stopPropagation();
    });
    closeButton?.addEventListener("click", () => {
      state.composerOpen = false;
      renderAll();
    });
    panelButton?.addEventListener("click", () => {
      state.composerOpen = false;
      state.collapsed = false;
      renderAll();
      window.requestAnimationFrame(() => {
        panel.querySelector<HTMLTextAreaElement>("#cuibPanelPrompt")?.focus();
      });
    });
    sendButton?.addEventListener("click", async () => {
      if (!state.runtime?.connectionId) {
        state.statusText = t(state, "notConnected");
        renderAll();
        return;
      }
      if (!state.selectedSelection || !state.selectedElement) {
        state.statusText = t(state, "noElement");
        renderAll();
        return;
      }
      const promptText = (prompt?.value || state.promptDraft).trim();
      if (!promptText) {
        state.statusText = t(state, "noPrompt");
        renderAll();
        return;
      }
      state.statusText = t(state, "sending");
      renderAll();
      const response = await safeSendMessage<RuntimeResponse>({
        type: MESSAGE_TYPES.contentApply,
        pageUrl: window.location.href,
        selection: state.selectedSelection,
        sourceHint: state.selectedSourceHint,
        prompt: promptText,
        extra: collectApplyExtra(state)
      });
      if (!response.ok) {
        state.statusText = response.error || "Apply failed";
        renderAll();
        return;
      }
      state.promptDraft = "";
      state.composerOpen = false;
      resetTurnState(state);
      state.statusText = `${t(state, "sentPrefix")}: ${response.requestId}`;
      renderAll();
    });
  }

  function renderDomModal() {
    if (!state.domModalOpen) {
      modalMask.style.display = "none";
      modal.style.display = "none";
      return;
    }
    modalMask.style.display = "block";
    modal.style.display = "flex";
    modal.style.left = `${state.modalX}px`;
    modal.style.top = `${state.modalY}px`;
    modal.innerHTML = `
      <div class="cuib-modal-header" data-codeg-ui-bridge-ui="true">
        <div data-codeg-ui-bridge-ui="true">
          <p class="cuib-eyebrow">${escapeHtml(t(state, "dom"))}</p>
          <h2 class="cuib-title">${escapeHtml(t(state, "modalTitle"))}</h2>
        </div>
        <button id="cuibCloseModal" class="cuib-toggle" data-codeg-ui-bridge-ui="true">${escapeHtml(t(state, "modalClose"))}</button>
      </div>
      <div class="cuib-modal-content" data-codeg-ui-bridge-ui="true">${buildDomExplorerMarkup(state)}</div>
    `;
    const modalHeader = modal.querySelector<HTMLElement>(".cuib-modal-header");
    modalHeader?.addEventListener("pointerdown", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button")) {
        return;
      }
      event.preventDefault();
      dragState = { startX: event.clientX, startY: event.clientY, originX: state.modalX, originY: state.modalY, target: "modal" };
    });
    modal.querySelector<HTMLButtonElement>("#cuibCloseModal")?.addEventListener("click", () => {
      state.domModalOpen = false;
      renderAll();
    });
    modal.querySelector<HTMLButtonElement>("#cuibToggleChildren")?.addEventListener("click", () => {
      state.childrenExpanded = !state.childrenExpanded;
      renderAll();
    });
    modal.querySelectorAll<HTMLElement>("[data-codeg-node-path]").forEach((node) => {
      node.addEventListener("click", () => {
        const domPath = node.dataset.codegNodePath || "";
        const target = findElementByDomPath(domPath);
        if (!target) {
          state.statusText = t(state, "treeRelocateFailed");
          renderAll();
          return;
        }
        state.domModalOpen = false;
        selectElement(target, false);
      });
    });
  }

  function renderAll() {
    renderPanel();
    renderInlineComposer();
    renderDomModal();
    renderStream();
    syncFrames();
  }

  function updateFrame(frame: HTMLElement, label: HTMLElement, element: HTMLElement | null, visible: boolean) {
    if (!element || !visible) {
      frame.style.display = "none";
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      frame.style.display = "none";
      return;
    }

    frame.style.display = "block";
    frame.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
    label.textContent = getElementLabel(element);
  }

  function syncFrames() {
    updateFrame(hoverFrame, hoverLabel, state.hoveredElement, state.selecting && Boolean(state.hoveredElement) && state.hoveredElement !== state.selectedElement);
    updateFrame(selectedFrame, selectedLabel, state.selectedElement, Boolean(state.selectedElement));
  }

  function selectElement(element: HTMLElement, syncRemote: boolean) {
    const promoted = resolvePreferredSelectionTarget(element);
    state.selectedElement = promoted;
    state.selectedSelection = toSelection(promoted);
    state.selectedSourceHint = getSourceHint(promoted);
    state.hoveredElement = null;
    state.childrenExpanded = false;
    // Auto-exit picking so follow-up page clicks don't silently re-target;
    // the toggle chip re-enters selection mode.
    state.selecting = false;
    state.composerOpen = true;
    state.statusText = t(state, "selectedRecorded");
    window.__CODEG_UI_BRIDGE_LAST_SELECTION__ = {
      pageUrl: window.location.href,
      selection: state.selectedSelection,
      sourceHint: state.selectedSourceHint
    };
    renderAll();

    if (syncRemote && state.runtime?.connectionId) {
      void safeSendMessage<RuntimeResponse>({
        type: MESSAGE_TYPES.contentSelectionSync,
        pageUrl: window.location.href,
        selection: state.selectedSelection,
        sourceHint: state.selectedSourceHint
      });
    }
  }

  async function loadRuntime() {
    const response = await safeSendMessage<RuntimeResponse>({
      type: MESSAGE_TYPES.contentGetRuntime
    });

    const hasActiveConnection = Boolean(response.runtime?.connectionId);
    if (!hasActiveConnection) {
      destroyOverlay();
      return;
    }

    const isAttachedToCurrentTab = response.isCurrentTabAttached ?? (response.attachedTabId == null);
    const isAttachedToCurrentPage = !response.attachedPageUrl || response.attachedPageUrl === window.location.href;
    const isCurrentContextActive = isAttachedToCurrentTab && isAttachedToCurrentPage;

    if (!isCurrentContextActive) {
      destroyOverlay();
      return;
    }

    state.runtime = response.runtime ?? null;
    state.statusText = `${t(state, "connectedPrefix")}: ${response.runtime?.connectionId}`;
    renderAll();
  }

  function handleHover(target: EventTarget | null) {
    if (!state.selecting) {
      state.hoveredElement = null;
      syncFrames();
      return;
    }

    const element = toHTMLElement(target);
    if (!element) {
      state.hoveredElement = null;
      syncFrames();
      return;
    }

    state.hoveredElement = resolvePreferredSelectionTarget(element);
    syncFrames();
  }

  const handleModalMaskClick = () => {
    state.domModalOpen = false;
    renderAll();
  };

  const handleRootPointerDown = (event: PointerEvent) => {
    if (isInsideUi(event)) {
      return;
    }
    event.stopPropagation();
  };

  const handleDocumentMouseMove = (event: MouseEvent) => {
    if (isInsideUi(event)) {
      state.hoveredElement = null;
      syncFrames();
      return;
    }
    handleHover(event.target);
  };

  const handleDocumentMouseMoveCapture = (event: MouseEvent) => {
    if (!state.selecting) {
      return;
    }
    if (isInsideUi(event)) {
      return;
    }
    const element = toHTMLElement(event.target);
    if (element) {
      state.hoveredElement = resolvePreferredSelectionTarget(element);
      syncFrames();
    }
  };

  const handleDocumentClick = (event: MouseEvent) => {
    if (isInsideUi(event)) {
      return;
    }
    if (!state.selecting) {
      return;
    }
    const target = toHTMLElement(event.target);
    if (!target) {
      return;
    }
    if (isTextInputElement(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    selectElement(target, true);
  };

  const handleWindowPointerMove = (event: PointerEvent) => {
    if (!dragState) {
      return;
    }

    if (dragState.target === "panel") {
      const next = clampPanelPosition(
        dragState.originX + (event.clientX - dragState.startX),
        dragState.originY + (event.clientY - dragState.startY),
        panel.offsetWidth || PANEL_WIDTH,
        panel.offsetHeight || 320
      );
      state.panelX = next.x;
      state.panelY = next.y;
      panel.style.left = `${state.panelX}px`;
      panel.style.top = `${state.panelY}px`;
      return;
    }

    const next = clampPanelPosition(
      dragState.originX + (event.clientX - dragState.startX),
      dragState.originY + (event.clientY - dragState.startY),
      modal.offsetWidth || 560,
      modal.offsetHeight || 520
    );
    state.modalX = next.x;
    state.modalY = next.y;
    modal.style.left = `${state.modalX}px`;
    modal.style.top = `${state.modalY}px`;
  };

  const handleWindowPointerUp = () => {
    if (dragState?.target === "panel") {
      saveStoredPanelPosition(state.panelX, state.panelY);
    }
    dragState = null;
  };

  const handleWindowResize = () => {
    const nextPanel = clampPanelPosition(state.panelX, state.panelY, panel.offsetWidth || PANEL_WIDTH, panel.offsetHeight || 320);
    state.panelX = nextPanel.x;
    state.panelY = nextPanel.y;
    const nextModal = clampPanelPosition(state.modalX, state.modalY, modal.offsetWidth || 560, modal.offsetHeight || 520);
    state.modalX = nextModal.x;
    state.modalY = nextModal.y;
    renderAll();
  };

  const handleWindowScroll = () => {
    renderInlineComposer();
    syncFrames();
  };

  function destroyOverlay() {
    dragState = null;
    clearSelectionState(state);
    modalMask.removeEventListener("click", handleModalMaskClick);
    document.removeEventListener("pointerdown", handleRootPointerDown, true);
    document.removeEventListener("mousemove", handleDocumentMouseMove, true);
    document.removeEventListener("mousemove", handleDocumentMouseMoveCapture, true);
    document.removeEventListener("click", handleDocumentClick, true);
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerUp);
    window.removeEventListener("resize", handleWindowResize);
    window.removeEventListener("scroll", handleWindowScroll, true);
    host.remove();
    window.__CODEG_UI_BRIDGE_CONTENT_BOOTED__ = false;
  }

  modalMask.addEventListener("click", handleModalMaskClick);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || modal.contains(event.target as Node)) {
      return;
    }
    handleModalMaskClick();
  }, true);

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && (target.id === "cuibPanelPrompt" || target.id === "cuibInlinePrompt")) {
      event.stopPropagation();
    }
  }, true);

  document.addEventListener("focusout", (event) => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && (target.id === "cuibPanelPrompt" || target.id === "cuibInlinePrompt")) {
      const activeDialog = getActiveDialogRoot();
      if (activeDialog) {
        event.preventDefault();
        event.stopPropagation();
        target.focus();
      }
    }
  }, true);

  document.addEventListener("pointerdown", handleRootPointerDown, true);
  document.addEventListener("mousemove", handleDocumentMouseMove, true);
  document.addEventListener("mousemove", handleDocumentMouseMoveCapture, true);
  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("pointermove", handleWindowPointerMove);
  window.addEventListener("pointerup", handleWindowPointerUp);
  window.addEventListener("resize", handleWindowResize);
  window.addEventListener("scroll", handleWindowScroll, true);

  chrome.runtime.onMessage.addListener((message: unknown) => {
    const generic = message as { type?: string } | undefined;
    if (generic?.type === MESSAGE_TYPES.contentRefreshRuntime) {
      void loadRuntime();
      return false;
    }
    const agentMessage = message as ContentAgentEventMessage | undefined;
    if (agentMessage && agentMessage.type === MESSAGE_TYPES.contentAgentEvent && agentMessage.event) {
      applyAgentEventToState(state, agentMessage.event);
      renderStream();
    }
    return false;
  });

  // Console capture: the page's own console.* calls are not visible from the
  // isolated content world, but uncaught errors and rejections dispatch on
  // window and are. ponytail: patch console in MAIN world only if raw
  // console.error capture is ever needed.
  window.addEventListener("error", (event) => {
    recordConsoleEntry({
      level: "error",
      message: event.message || String(event.error || "unknown error"),
      source: event.filename || undefined,
      line: event.lineno || undefined
    });
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    recordConsoleEntry({
      level: "error",
      message: `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`
    });
  });

  await loadRuntime();
}

void boot();
