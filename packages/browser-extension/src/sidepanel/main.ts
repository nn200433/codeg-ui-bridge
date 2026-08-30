import { CodegClient, normalizeBaseUrl } from "@codeg-ui-bridge/bridge-core";
import type { CodegMessageTurn, CodegTurnBlock } from "@codeg-ui-bridge/bridge-core";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { MESSAGE_TYPES, SIDE_PANEL_PORT_NAME } from "../messages";
import type {
  AgentStreamEvent,
  ApplyExtra,
  BridgeConfig,
  BridgeRuntime,
  CodegAgentOption,
  CodegProject,
  ContentApplyContext,
  ContentSelection,
  ContentSourceHint,
  PanelPortEvent,
  RuntimeResponse
} from "../messages";

type ToolItem = { toolCallId: string; title: string; status: string; content: string };

type SessionTurn =
  | { role: "user"; text: string; fullText?: string }
  | { role: "assistant"; text: string; thinking: string; tools: ToolItem[]; meta: string };

type LiveTurn = {
  text: string;
  thinking: string;
  tools: ToolItem[];
  note: string;
  failed: boolean;
};

type RespondPayload =
  | { kind: "permission"; requestId: string; optionId: string }
  | { kind: "question"; questionId: string; labels: string[] }
  | { kind: "question_decline"; questionId: string }
  | { kind: "plan_approval"; approvalId: string; decision: "approve" | "request_changes" | "abandon" };

type PendingPermission = { requestId: string; title?: string; options: { optionId: string; name: string }[] };
type PendingQuestion = { questionId: string; questions: BridgeQuestionSpec[] };
type PendingPlan = { approvalId: string; planMarkdown: string };
type BridgeQuestionSpec = {
  id: string;
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: { label: string; description?: string }[];
};

const HISTORY_TURN_LIMIT = 50;
const LIVE_RENDER_THROTTLE_MS = 150;

const CSS_TEXT = `
* { box-sizing: border-box; margin: 0; }
html, body { height: 100%; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #f8fafc; color: #0f172a;
}
#app { height: 100%; display: flex; flex-direction: column; }
.wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 12px; gap: 10px; }
.head { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.logo {
  width: 32px; height: 32px; border-radius: 9px; flex: 0 0 auto;
  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff;
  font-size: 16px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.head-title { font-size: 14px; font-weight: 700; line-height: 1.3; }
.head-sub { font-size: 11px; color: #64748b; }
.card {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 10px 12px; display: grid; gap: 7px; flex: 0 0 auto;
}
.row { display: flex; align-items: center; gap: 8px; font-size: 12px; min-width: 0; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
.dot-ok { background: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15); }
.dot-off { background: #cbd5e1; }
.row-key { color: #64748b; flex: 0 0 auto; }
.row-val { margin-left: auto; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-val--page { font-weight: 400; color: #475569; display: inline-flex; align-items: center; gap: 6px; }
.row-favicon { width: 14px; height: 14px; border-radius: 3px; flex: 0 0 auto; }
.grid2 { display: grid; grid-template-columns: 1fr 90px; gap: 8px; }
.field { display: grid; gap: 4px; font-size: 12px; }
.field-label { font-weight: 600; color: #334155; }
input, select {
  width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 9px;
  font-size: 13px; font-family: inherit; background: #fff; color: #0f172a; outline: none;
  min-width: 0;
}
input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15); }
.combo-input {
  appearance: none; padding-right: 28px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
}
.combo-input:disabled { background-color: #f1f5f9; color: #94a3b8; }
.combo-list {
  display: none; margin-top: 4px; max-height: 180px; overflow-y: auto;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
}
.combo.open .combo-list { display: block; }
.combo-option { padding: 7px 10px; cursor: pointer; display: grid; gap: 1px; font-size: 12px; }
.combo-option:hover { background: #f1f5f9; }
.combo-option.is-active { background: #eef2ff; }
.combo-option-label { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.combo-option-sub { color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.combo-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; }
.hint { font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint-warn { color: #b45309; font-weight: 600; }
.actions { display: flex; gap: 8px; }
.btn {
  flex: 1; padding: 9px; border-radius: 10px; border: 1px solid #cbd5e1;
  background: #fff; color: #334155; font-size: 13px; font-weight: 600;
  font-family: inherit; cursor: pointer;
}
.btn:hover { background: #f1f5f9; }
.btn-primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.btn-primary:hover { background: #4338ca; }
.btn-danger { color: #b91c1c; border-color: #fecaca; }
.btn-danger:hover { background: #fef2f2; }
.btn:disabled { opacity: 0.55; cursor: default; }
.btn-icon { flex: 0 0 auto; width: 32px; padding: 6px 0; }
.msg { font-size: 12px; color: #475569; min-height: 17px; line-height: 1.5; flex: 0 0 auto; }
.msg-error { color: #dc2626; }
.msg-success { color: #059669; }
.select-toggle {
  width: 100%; min-height: 36px; border-radius: 10px; border: 1px solid #cbd5e1;
  background: #fff; color: #334155; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer;
  flex: 0 0 auto;
}
.select-toggle.is-active { background: #eef2ff; border-color: #6366f1; color: #4338ca; }
.pick-card { display: grid; gap: 5px; }
.pick-card--empty { font-size: 12px; color: #64748b; text-align: center; padding: 8px 0; }
.pick-row { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; }
.pick-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.pick-file {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: ui-monospace, Consolas, monospace; font-size: 11px; font-weight: 600; color: #1d4ed8;
}
.pick-file--none { color: #94a3b8; font-weight: 400; }
.icon-btn {
  flex: 0 0 auto; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;
  padding: 0; border-radius: 7px; border: 1px solid #cbd5e1; background: #fff;
  font-size: 12px; color: #334155; cursor: pointer; font-family: inherit;
}
.icon-btn:hover { border-color: #6366f1; color: #4338ca; }
.pick-details { font-size: 11px; color: #64748b; }
.pick-details summary { cursor: pointer; font-weight: 600; }
.pick-detail-row { display: grid; grid-template-columns: 84px 1fr; gap: 6px; padding: 2px 0; }
.pick-detail-row code { word-break: break-all; font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
.composer { display: grid; gap: 7px; flex: 0 0 auto; }
textarea {
  width: 100%; min-height: 64px; resize: vertical; padding: 9px 11px;
  border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; font-size: 13px;
  font-family: inherit; line-height: 1.55; background: #fff; color: #0f172a; outline: none;
}
textarea:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15); }
.presets { display: flex; flex-wrap: wrap; gap: 6px; }
.preset {
  min-height: 24px; padding: 2px 10px; border-radius: 999px; border: 1px solid #cbd5e1;
  background: #fff; font: inherit; font-size: 11px; color: #475569; cursor: pointer;
}
.preset:hover { border-color: #6366f1; color: #4338ca; }
.preset:disabled { opacity: 0.5; cursor: default; }
.attach-row { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: #475569; }
.attach-row label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.attach-row input { width: auto; accent-color: #4f46e5; margin: 0; }
.composer-actions { display: flex; gap: 8px; }
.session { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
.session-head { display: flex; align-items: center; gap: 8px; padding: 2px 2px 6px; flex: 0 0 auto; }
.session-title { font-size: 12px; font-weight: 700; color: #334155; }
.badge {
  display: inline-flex; align-items: center; min-height: 20px; padding: 1px 9px;
  border-radius: 999px; font-size: 11px; font-weight: 600;
  background: rgba(100, 116, 139, 0.14); color: #475569;
}
.badge.running { background: rgba(79, 70, 229, 0.14); color: #4338ca; }
.badge.complete { background: rgba(16, 185, 129, 0.16); color: #047857; }
.badge.error { background: rgba(239, 68, 68, 0.14); color: #b91c1c; }
.session-spacer { flex: 1; }
.session-body {
  flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;
  padding: 4px 2px 10px; scroll-behavior: smooth;
}
.back-bottom {
  position: absolute; bottom: 12px; right: 8px; z-index: 2; display: none;
  padding: 5px 12px; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff;
  font-size: 11px; font-weight: 600; color: #334155; cursor: pointer; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
}
.back-bottom.is-visible { display: block; }
.pending { display: grid; gap: 8px; }
.pending-card {
  display: grid; gap: 8px; padding: 10px; border-radius: 12px;
  border: 1px solid rgba(234, 179, 8, 0.4); background: rgba(254, 249, 195, 0.6);
  font-size: 12px; line-height: 1.5;
}
.pending-card pre {
  margin: 0; max-height: 180px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;
  font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: #475569;
}
.pending-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.pending-actions .btn { flex: 0 0 auto; padding: 5px 12px; font-size: 12px; }
.turn { display: grid; gap: 6px; }
.turn--user {
  justify-self: end; max-width: 88%; background: #eef2ff; border: 1px solid #e0e7ff;
  border-radius: 12px 12px 4px 12px; padding: 8px 11px; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
}
.turn--user details { margin-top: 4px; font-size: 11px; color: #6366f1; }
.turn--user summary { cursor: pointer; }
.turn--user pre {
  margin-top: 4px; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto;
  font-family: ui-monospace, Consolas, monospace; font-size: 10px; color: #475569;
}
.turn--assistant {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px 12px 12px 4px;
  padding: 9px 11px; font-size: 13px; line-height: 1.65;
}
.turn--live { border-style: dashed; opacity: 0.97; }
.turn-meta { font-size: 10px; color: #94a3b8; }
.md > :first-child { margin-top: 0; }
.md > :last-child { margin-bottom: 0; }
.md h1, .md h2, .md h3, .md h4 { font-size: 13px; margin: 8px 0 4px; }
.md p { margin: 4px 0; }
.md ul, .md ol { margin: 4px 0; padding-left: 18px; }
.md table { border-collapse: collapse; margin: 6px 0; font-size: 12px; }
.md th, .md td { border: 1px solid #e2e8f0; padding: 3px 7px; }
.md code {
  font-family: ui-monospace, Consolas, monospace; font-size: 11.5px;
  background: #f1f5f9; border-radius: 4px; padding: 1px 4px;
}
.md pre { position: relative; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 9px 11px; margin: 6px 0; overflow-x: auto; }
.md pre code { background: transparent; color: inherit; padding: 0; font-size: 11px; line-height: 1.6; }
.md blockquote { border-left: 3px solid #cbd5e1; margin: 6px 0; padding: 2px 10px; color: #64748b; }
.md a { color: #4338ca; }
.md-copy {
  position: absolute; top: 5px; right: 5px; padding: 2px 8px; border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.4); background: rgba(15, 23, 42, 0.6); color: #cbd5e1;
  font-size: 10px; cursor: pointer; opacity: 0; transition: opacity 120ms;
}
.md pre:hover .md-copy { opacity: 1; }
.thinking details, .md-thinking { font-size: 11px; color: #64748b; }
.thinking summary, .md-thinking summary { cursor: pointer; font-weight: 600; }
.thinking > div, .md-thinking > div { margin-top: 4px; white-space: pre-wrap; word-break: break-word; max-height: 180px; overflow-y: auto; }
.tool-card { border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; font-size: 11px; }
.tool-card summary { display: flex; align-items: center; gap: 6px; padding: 5px 9px; cursor: pointer; min-width: 0; }
.tool-card summary strong { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-status { margin-left: auto; flex: 0 0 auto; color: #64748b; }
.tool-status.done { color: #047857; }
.tool-status.failed { color: #b91c1c; }
.tool-card pre {
  margin: 0; padding: 6px 9px; border-top: 1px solid #e2e8f0; max-height: 130px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, Consolas, monospace; font-size: 10px; color: #475569;
}
.session-empty { font-size: 12px; color: #94a3b8; text-align: center; padding: 14px 0; }
.live-note-error { font-size: 12px; color: #dc2626; }
`;

const PRESETS = [
  { label: "改样式", text: "请调整这个元素的样式：" },
  { label: "对齐/间距", text: "这个元素的对齐/间距看起来不对，请检查并修正。" },
  { label: "排查问题", text: "请排查这个元素的问题：结合它的样式、控制台报错和布局表现，给出结论与修复方案。" }
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendMessage<T extends RuntimeResponse>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

function agentLabel(agent: CodegAgentOption): string {
  return agent.installedVersion ? `${agent.name}（已安装 v${agent.installedVersion}）` : `${agent.name}（未安装）`;
}

function folderLabel(folder: CodegProject): string {
  return folder.alias ? `${folder.alias} [${folder.folderName}]` : folder.folderName;
}

type ComboItem = { value: string; label: string; sub?: string; keywords: string };

type ComboController = {
  set: (items: ComboItem[], value: string, disabled: boolean, disabledPlaceholder: string) => void;
};

function createCombo(box: HTMLElement, placeholder: string, onPick: (value: string) => void): ComboController {
  const input = box.querySelector<HTMLInputElement>(".combo-input")!;
  const list = box.querySelector<HTMLElement>(".combo-list")!;
  let items: ComboItem[] = [];
  let value = "";
  let open = false;
  let placeholderNow = placeholder;

  const currentLabel = () => items.find((item) => item.value === value)?.label ?? "";

  function render(): void {
    list.innerHTML = "";
    if (!open) {
      return;
    }
    const filter = input.value.trim().toLowerCase();
    const visible = filter ? items.filter((item) => item.keywords.includes(filter)) : items;
    for (const item of visible) {
      const option = document.createElement("div");
      option.className = `combo-option${item.value === value ? " is-active" : ""}`;
      const label = document.createElement("span");
      label.className = "combo-option-label";
      label.textContent = item.label;
      option.append(label);
      if (item.sub) {
        const sub = document.createElement("span");
        sub.className = "combo-option-sub";
        sub.textContent = item.sub;
        option.append(sub);
      }
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        value = item.value;
        input.value = item.label;
        close();
        onPick(item.value);
      });
      list.append(option);
    }
    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "combo-empty";
      empty.textContent = "无匹配项";
      list.append(empty);
    }
  }

  function close(): void {
    open = false;
    box.classList.remove("open");
    input.value = currentLabel();
    input.placeholder = placeholderNow;
    render();
  }

  input.addEventListener("focus", () => {
    if (input.disabled) {
      return;
    }
    open = true;
    box.classList.add("open");
    input.value = "";
    input.placeholder = "输入筛选";
    render();
  });
  input.addEventListener("input", () => {
    open = true;
    box.classList.add("open");
    render();
  });
  input.addEventListener("blur", () => {
    setTimeout(close, 120);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      input.blur();
      return;
    }
    if (event.key === "Enter") {
      const filter = input.value.trim().toLowerCase();
      const first = filter ? items.find((item) => item.keywords.includes(filter)) : items[0];
      if (first) {
        value = first.value;
        input.value = first.label;
        onPick(first.value);
      }
      close();
      input.blur();
    }
  });

  return {
    set(nextItems, nextValue, disabled, disabledPlaceholder) {
      items = nextItems;
      value = nextValue;
      input.disabled = disabled;
      placeholderNow = disabled ? disabledPlaceholder : placeholder;
      input.placeholder = placeholderNow;
      close();
    }
  };
}

/** The user-facing intent lives between "用户需求：" and "执行要求：". */
function extractIntent(fullText: string): string {
  const match = fullText.match(/用户需求：\n- ([\s\S]*?)(?=\n\n执行要求：)/);
  return match?.[1]?.trim() || fullText;
}

function toolStatusClass(status: string): string {
  return status === "completed" ? "done" : status === "failed" || status === "errored" ? "failed" : "";
}

function toolStatusIcon(status: string): string {
  if (status === "completed") {
    return "✓";
  }
  if (status === "failed" || status === "errored") {
    return "✕";
  }
  return "⋯";
}

function mdToHtml(text: string): string {
  const raw = marked.parse(text, { async: false, breaks: true });
  return DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
}

/** Post-sanitize hardening: safe links + copy buttons on code blocks. */
function enhanceMarkdown(container: HTMLElement): void {
  container.querySelectorAll("a").forEach((anchor) => {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  });
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".md-copy")) {
      return;
    }
    const button = document.createElement("button");
    button.className = "md-copy";
    button.textContent = "复制";
    button.addEventListener("click", () => {
      const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      void navigator.clipboard.writeText(code).then(() => {
        button.textContent = "已复制";
        setTimeout(() => {
          button.textContent = "复制";
        }, 1200);
      });
    });
    pre.appendChild(button);
  });
}

function historyTurnToSessionTurn(turn: CodegMessageTurn): SessionTurn {
  if (turn.role === "user") {
    const fullText = turn.blocks
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    return { role: "user", text: extractIntent(fullText), fullText };
  }

  let text = "";
  let thinking = "";
  const tools: ToolItem[] = [];
  const resultByToolId = new Map<string, string>();
  for (const block of turn.blocks as CodegTurnBlock[]) {
    if (block.type === "text") {
      text += block.text ?? "";
    } else if (block.type === "thinking") {
      thinking += block.text ?? "";
    } else if (block.type === "tool_use") {
      tools.push({
        toolCallId: String((block as { tool_use_id?: string }).tool_use_id ?? `tool-${tools.length}`),
        title: String(block.tool_name ?? "tool"),
        status: String(block.status ?? "completed"),
        content: String(block.input_preview ?? "")
      });
    } else if (block.type === "tool_result") {
      const id = String((block as { tool_use_id?: string }).tool_use_id ?? "");
      const output = String((block as { output_preview?: string | null }).output_preview ?? "");
      if (id && output) {
        resultByToolId.set(id, output);
      } else if (output) {
        tools.push({ toolCallId: `result-${tools.length}`, title: "结果", status: "completed", content: output });
      }
    }
  }
  for (const tool of tools) {
    const output = resultByToolId.get(tool.toolCallId);
    if (output && !tool.content) {
      tool.content = output;
    } else if (output) {
      tool.content = `${tool.content}\n→ ${output}`;
    }
  }
  const metaParts = [turn.model, turn.duration_ms != null ? `${(turn.duration_ms / 1000).toFixed(1)}s` : ""].filter(Boolean);
  return { role: "assistant", text, thinking, tools, meta: metaParts.join(" · ") };
}

async function boot() {
  const rootCandidate = document.getElementById("app");
  if (!rootCandidate) {
    return;
  }
  const root: HTMLElement = rootCandidate;

  const state = {
    config: { host: "127.0.0.1", port: "23080", token: "", agentType: "", project: null } as BridgeConfig,
    agents: [] as CodegAgentOption[],
    folders: [] as CodegProject[],
    codegVersion: "",
    connected: false,
    selecting: false,
    attachedTabId: undefined as number | undefined,
    attachedPageUrl: "",
    attachedTitle: "",
    attachedFavIconUrl: "",
    runtime: null as BridgeRuntime | null,
    selection: null as ContentSelection | null,
    sourceHint: undefined as ContentSourceHint | undefined,
    attachStyle: true,
    attachErrors: true,
    turns: [] as SessionTurn[],
    live: null as LiveTurn | null,
    turnState: "idle" as "idle" | "running" | "complete" | "error",
    pendingPermission: null as PendingPermission | null,
    pendingQuestion: null as PendingQuestion | null,
    pendingPlan: null as PendingPlan | null,
    fetchedConversationId: undefined as number | undefined,
    stickToBottom: true
  };

  root.innerHTML = `
    <style>${CSS_TEXT}</style>
    <div class="wrap">
      <header class="head">
        <div class="logo">C</div>
        <div>
          <div class="head-title">Codeg Bridge</div>
          <div class="head-sub" id="codegVer">未连接 Codeg</div>
        </div>
      </header>
      <section class="card">
        <div class="row" id="rowConn"><span class="dot dot-off"></span><span class="row-key">Codeg 服务</span><span class="row-val">未连接</span></div>
        <div class="row" id="rowBind"><span class="row-key">绑定页面</span><span class="row-val row-val--page" id="rowBindVal">未绑定</span><button id="disconnectBtn" class="btn btn-danger" style="flex:0 0 auto;padding:4px 10px;font-size:11px;display:none;">断开</button></div>
        <div class="row"><span class="row-key">目标标签页</span><span id="tabSelectWrap" style="flex:1;min-width:0;display:flex;gap:6px;"><select id="tabSelect"></select><button id="refreshTabs" class="btn btn-icon" title="刷新标签页列表">↻</button></span></div>
      </section>
      <section class="card" id="configCard">
        <div class="grid2">
          <label class="field"><span class="field-label">Codeg IP</span><input id="host" placeholder="127.0.0.1" /></label>
          <label class="field"><span class="field-label">端口</span><input id="port" placeholder="23080" /></label>
        </div>
        <label class="field"><span class="field-label">Token</span><input id="token" type="password" placeholder="Codeg Web 服务 Token" /></label>
        <div class="field">
          <span class="field-label">智能体</span>
          <div class="combo" id="agentCombo">
            <input class="combo-input" autocomplete="off" placeholder="测试连接后加载" />
            <div class="combo-list"></div>
          </div>
          <span class="hint" id="agentHint"></span>
        </div>
        <div class="field">
          <span class="field-label">所属项目</span>
          <div class="combo" id="folderCombo">
            <input class="combo-input" autocomplete="off" placeholder="搜索或选择项目" />
            <div class="combo-list"></div>
          </div>
          <span class="hint" id="folderHint"></span>
        </div>
        <div class="actions">
          <button id="testBtn" class="btn">测试连接</button>
          <button id="attachBtn" class="btn btn-primary">连接页面</button>
        </div>
      </section>
      <button id="selectToggle" class="select-toggle">⬚ 选择元素</button>
      <section class="card pick-card" id="pickCard"></section>
      <section class="composer">
        <textarea id="prompt" placeholder="描述你要的改动，或这里的问题…"></textarea>
        <div class="presets" id="presets"></div>
        <div class="attach-row">
          <label><input type="checkbox" id="attachStyle" checked />附带元素样式</label>
          <label><input type="checkbox" id="attachErrors" checked />附带控制台报错</label>
        </div>
        <div class="composer-actions">
          <button id="sendBtn" class="btn btn-primary">发送 ▶</button>
        </div>
      </section>
      <div class="msg" id="msg"></div>
      <section class="session">
        <div class="session-head">
          <span class="session-title">会话</span>
          <span class="badge" id="turnBadge">空闲</span>
          <span class="session-spacer"></span>
          <button id="stopBtn" class="btn" style="flex:0 0 auto;padding:3px 12px;font-size:11px;display:none;">停止</button>
        </div>
        <div class="session-body" id="sessionBody">
          <div class="pending" id="pendingArea"></div>
          <div id="turnsArea" style="display:grid;gap:10px;"></div>
          <div id="liveArea" style="display:grid;gap:6px;"></div>
        </div>
        <button class="back-bottom" id="backBottom">↓ 回到底部</button>
      </section>
    </div>
  `;

  const hostInput = root.querySelector<HTMLInputElement>("#host")!;
  const portInput = root.querySelector<HTMLInputElement>("#port")!;
  const tokenInput = root.querySelector<HTMLInputElement>("#token")!;
  const testBtn = root.querySelector<HTMLButtonElement>("#testBtn")!;
  const attachBtn = root.querySelector<HTMLButtonElement>("#attachBtn")!;
  const disconnectBtn = root.querySelector<HTMLButtonElement>("#disconnectBtn")!;
  const selectToggle = root.querySelector<HTMLButtonElement>("#selectToggle")!;
  const pickCard = root.querySelector<HTMLElement>("#pickCard")!;
  const promptInput = root.querySelector<HTMLTextAreaElement>("#prompt")!;
  const sendBtn = root.querySelector<HTMLButtonElement>("#sendBtn")!;
  const stopBtn = root.querySelector<HTMLButtonElement>("#stopBtn")!;
  const turnBadge = root.querySelector<HTMLElement>("#turnBadge")!;
  const pendingArea = root.querySelector<HTMLElement>("#pendingArea")!;
  const turnsArea = root.querySelector<HTMLElement>("#turnsArea")!;
  const liveArea = root.querySelector<HTMLElement>("#liveArea")!;
  const sessionBody = root.querySelector<HTMLElement>("#sessionBody")!;
  const backBottom = root.querySelector<HTMLButtonElement>("#backBottom")!;
  const tabSelect = root.querySelector<HTMLSelectElement>("#tabSelect")!;
  const msgEl = root.querySelector<HTMLElement>("#msg")!;

  function setMsg(text: string, kind: "info" | "error" | "success" = "info"): void {
    msgEl.textContent = text;
    msgEl.className = `msg${kind === "error" ? " msg-error" : kind === "success" ? " msg-success" : ""}`;
  }

  function maybeScroll(force = false): void {
    if (force || state.stickToBottom) {
      sessionBody.scrollTop = sessionBody.scrollHeight;
    }
  }

  function renderStatus(): void {
    root.querySelector<HTMLElement>("#codegVer")!.textContent = state.codegVersion ? `Codeg v${state.codegVersion}` : "未连接 Codeg";
    const connRow = root.querySelector<HTMLElement>("#rowConn")!;
    connRow.querySelector<HTMLElement>(".dot")!.className = `dot ${state.connected ? "dot-ok" : "dot-off"}`;
    connRow.querySelector<HTMLElement>(".row-val")!.textContent = state.connected
      ? `已连接 ${state.runtime?.connectionId ?? ""}`
      : "未连接";
    const bindVal = root.querySelector<HTMLElement>("#rowBindVal")!;
    if (state.attachedTabId != null) {
      bindVal.innerHTML = "";
      if (state.attachedFavIconUrl) {
        const icon = document.createElement("img");
        icon.className = "row-favicon";
        icon.src = state.attachedFavIconUrl;
        bindVal.appendChild(icon);
      }
      bindVal.appendChild(document.createTextNode(state.attachedTitle || state.attachedPageUrl || "已绑定"));
      bindVal.title = state.attachedPageUrl;
    } else {
      bindVal.textContent = "未绑定";
      bindVal.title = "";
    }
    disconnectBtn.style.display = state.attachedTabId != null ? "" : "none";
  }

  function updateHints(): void {
    const agentHint = root.querySelector<HTMLElement>("#agentHint")!;
    const agent = state.agents.find((item) => item.agentType === state.config.agentType);
    if (!agent) {
      agentHint.textContent = "";
      agentHint.className = "hint";
    } else if (agent.installedVersion) {
      agentHint.textContent = `已安装 v${agent.installedVersion}`;
      agentHint.className = "hint";
    } else {
      agentHint.textContent = "该智能体尚未安装，请先在 Codeg 中安装";
      agentHint.className = "hint hint-warn";
    }
    const folderHint = root.querySelector<HTMLElement>("#folderHint")!;
    const folder = state.folders.find((item) => item.folderId === state.config.project?.folderId);
    folderHint.textContent = folder?.folderPath ?? "";
  }

  const agentCombo = createCombo(root.querySelector<HTMLElement>("#agentCombo")!, "搜索或选择智能体", (value) => {
    state.config.agentType = value;
    updateHints();
  });
  const folderCombo = createCombo(root.querySelector<HTMLElement>("#folderCombo")!, "搜索或选择项目", (value) => {
    state.config.project = state.folders.find((folder) => String(folder.folderId) === value) ?? null;
    updateHints();
  });

  function refreshCombos(): void {
    agentCombo.set(
      state.agents.map((agent) => ({
        value: agent.agentType,
        label: agentLabel(agent),
        sub: agent.description,
        keywords: `${agent.name} ${agent.agentType} ${agent.description ?? ""}`.toLowerCase()
      })),
      state.config.agentType,
      state.agents.length === 0,
      "测试连接后加载"
    );
    folderCombo.set(
      state.folders.map((folder) => ({
        value: String(folder.folderId),
        label: folderLabel(folder),
        sub: folder.folderPath,
        keywords: `${folder.alias ?? ""} ${folder.folderName} ${folder.folderPath}`.toLowerCase()
      })),
      state.config.project ? String(state.config.project.folderId) : "",
      state.folders.length === 0,
      "测试连接后加载"
    );
    updateHints();
  }

  function renderSelectToggle(): void {
    selectToggle.classList.toggle("is-active", state.selecting);
    selectToggle.textContent = state.selecting ? "⬚ 选择中：点击页面元素" : "⬚ 选择元素";
  }

  function renderPickCard(): void {
    if (!state.selection) {
      pickCard.innerHTML = `<div class="pick-card--empty">开启「选择元素」后点击页面任意元素，AI 将以它为上下文</div>`;
      return;
    }
    const hint = state.sourceHint;
    const sourceText = hint?.file || hint?.sourceId
      ? `${hint.file || hint.sourceId}${hint.line ? `:${hint.line}` : ""}`
      : "";
    pickCard.innerHTML = `
      <div class="pick-row">
        <span class="pick-label">🎯 ${escapeHtml(state.selection.selector || state.selection.tag)}</span>
        <button class="icon-btn" id="clearPickBtn" title="取消选中">×</button>
      </div>
      <div class="pick-row">
        <span class="pick-file${sourceText ? "" : " pick-file--none"}">📄 ${escapeHtml(sourceText || "未绑定源码")}</span>
        ${sourceText ? `<button class="icon-btn" id="copyLocateBtn" title="复制定位">⧉</button>` : ""}
      </div>
      <details class="pick-details">
        <summary>详情</summary>
        <div class="pick-detail-row"><span>DOM Path</span><code>${escapeHtml(state.selection.domPath || "-")}</code></div>
        <div class="pick-detail-row"><span>Semantic</span><code>${escapeHtml(state.selection.semanticPath || "-")}</code></div>
        <div class="pick-detail-row"><span>Rect</span><code>${escapeHtml(state.selection.rect ? `${state.selection.rect.x}, ${state.selection.rect.y} · ${state.selection.rect.width}×${state.selection.rect.height}` : "-")}</code></div>
        <div class="pick-detail-row"><span>component</span><code>${escapeHtml(state.sourceHint?.component || "-")}</code></div>
        <div class="pick-detail-row"><span>sourceId</span><code>${escapeHtml(state.sourceHint?.sourceId || "-")}</code></div>
      </details>
    `;
    pickCard.querySelector<HTMLButtonElement>("#clearPickBtn")?.addEventListener("click", () => {
      void clearPick();
    });
    pickCard.querySelector<HTMLButtonElement>("#copyLocateBtn")?.addEventListener("click", () => {
      if (!state.sourceHint) {
        return;
      }
      const locate = state.sourceHint.file
        ? `${state.sourceHint.file}${state.sourceHint.line ? `:${state.sourceHint.line}` : ""}`
        : state.sourceHint.sourceId || "";
      const selector = state.selection?.selector;
      void navigator.clipboard.writeText(selector ? `${locate}\nselector: ${selector}` : locate);
      setMsg(`已复制定位：${locate}`, "success");
    });
  }

  async function clearPick(): Promise<void> {
    // Toggling the content script off clears its highlight state; toggling
    // back on keeps the picking mode available for the next pick.
    await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.contentSetSelecting, selecting: false }).catch(() => undefined);
    state.selection = null;
    state.sourceHint = undefined;
    await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.contentSetSelecting, selecting: true }).catch(() => undefined);
    renderPickCard();
  }

  function renderBadge(): void {
    const map = {
      idle: { cls: "", label: "空闲" },
      running: { cls: "running", label: "执行中…" },
      complete: { cls: "complete", label: "已完成" },
      error: { cls: "error", label: "出错" }
    } as const;
    const badge = map[state.turnState];
    turnBadge.className = `badge ${badge.cls}`;
    turnBadge.textContent = badge.label;
    stopBtn.style.display = state.turnState === "running" ? "" : "none";
  }

  function renderPending(): void {
    const cards: string[] = [];
    if (state.pendingPermission) {
      const options = state.pendingPermission.options
        .map(
          (option) =>
            `<button class="btn perm-option" data-perm-request-id="${escapeHtml(state.pendingPermission!.requestId)}" data-perm-option-id="${escapeHtml(option.optionId)}">${escapeHtml(option.name || option.optionId)}</button>`
        )
        .join("");
      cards.push(`
        <div class="pending-card">
          <strong>等待权限确认${state.pendingPermission.title ? `: ${escapeHtml(state.pendingPermission.title)}` : ""}</strong>
          <div class="pending-actions">${options}</div>
        </div>
      `);
    }
    if (state.pendingQuestion) {
      for (const question of state.pendingQuestion.questions) {
        const options = question.options
          .map(
            (option) =>
              `<button class="btn question-option" data-question-id="${escapeHtml(question.id)}" data-question-label="${escapeHtml(option.label)}" data-question-multi="${question.multiSelect ? "1" : ""}" title="${escapeHtml(option.description || "")}">${escapeHtml(option.label)}</button>`
          )
          .join("");
        const multiControls = question.multiSelect
          ? `<button class="btn btn-primary question-confirm" data-question-id="${escapeHtml(question.id)}">确认</button>`
          : "";
        cards.push(`
          <div class="pending-card">
            <strong>智能体提问${question.header ? `: ${escapeHtml(question.header)}` : ""}</strong>
            <div>${escapeHtml(question.question)}</div>
            <div class="pending-actions">${options}${multiControls}
              <button class="btn question-decline" data-question-id="${escapeHtml(question.id)}">跳过</button>
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
        <div class="pending-card">
          <strong>等待计划确认</strong>
          <pre>${escapeHtml(plan)}</pre>
          <div class="pending-actions">
            <button class="btn btn-primary plan-option" data-plan-approval-id="${escapeHtml(state.pendingPlan.approvalId)}" data-plan-decision="approve">批准</button>
            <button class="btn plan-option" data-plan-approval-id="${escapeHtml(state.pendingPlan.approvalId)}" data-plan-decision="request_changes">需修改</button>
            <button class="btn plan-option" data-plan-approval-id="${escapeHtml(state.pendingPlan.approvalId)}" data-plan-decision="abandon">放弃</button>
          </div>
        </div>
      `);
    }
    pendingArea.innerHTML = cards.join("");
  }

  function toolCardMarkup(tool: ToolItem): string {
    return `
      <details class="tool-card">
        <summary>
          <span>${toolStatusIcon(tool.status)}</span>
          <strong>${escapeHtml(tool.title || tool.toolCallId)}</strong>
          <span class="tool-status ${toolStatusClass(tool.status)}">${escapeHtml(tool.status || "")}</span>
        </summary>
        ${tool.content ? `<pre>${escapeHtml(tool.content)}</pre>` : ""}
      </details>
    `;
  }

  function renderTurns(): void {
    if (state.turns.length === 0) {
      turnsArea.innerHTML = `<div class="session-empty">暂无会话历史，发送第一条需求后开始记录</div>`;
      return;
    }
    const parts = state.turns.map((turn) => {
      if (turn.role === "user") {
        return `
          <div class="turn turn--user">
            ${escapeHtml(turn.text)}
            ${turn.fullText ? `<details><summary>完整请求</summary><pre>${escapeHtml(turn.fullText)}</pre></details>` : ""}
          </div>
        `;
      }
      return `
        <div class="turn turn--assistant">
          ${turn.thinking ? `<details class="md-thinking"><summary>思考</summary><div>${escapeHtml(turn.thinking)}</div></details>` : ""}
          <div class="md">${mdToHtml(turn.text || "（无文本输出）")}</div>
          ${turn.tools.map(toolCardMarkup).join("")}
          ${turn.meta ? `<div class="turn-meta">${escapeHtml(turn.meta)}</div>` : ""}
        </div>
      `;
    });
    turnsArea.innerHTML = parts.join("");
    enhanceMarkdown(turnsArea);
  }

  function renderLive(): void {
    if (!state.live) {
      liveArea.innerHTML = "";
      return;
    }
    const live = state.live;
    const parts: string[] = [];
    if (live.failed && live.note) {
      parts.push(`<div class="live-note-error">${escapeHtml(live.note)}</div>`);
    }
    if (live.thinking) {
      parts.push(`<details class="md-thinking"><summary>思考</summary><div>${escapeHtml(live.thinking)}</div></details>`);
    }
    if (live.text) {
      parts.push(`<div class="turn turn--assistant turn--live"><div class="md">${mdToHtml(live.text)}</div></div>`);
    }
    for (const tool of live.tools) {
      parts.push(toolCardMarkup(tool));
    }
    if (parts.length === 0) {
      parts.push(`<div class="turn turn--assistant turn--live"><div class="md">…</div></div>`);
    }
    liveArea.innerHTML = parts.join("");
    // Live text keeps re-rendering; skip copy-button enhancement until settle.
  }

  let liveRenderTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleLiveRender(): void {
    if (liveRenderTimer) {
      return;
    }
    liveRenderTimer = setTimeout(() => {
      liveRenderTimer = null;
      renderLive();
      maybeScroll();
    }, LIVE_RENDER_THROTTLE_MS);
  }

  function ensureLive(): LiveTurn {
    if (!state.live) {
      state.live = { text: "", thinking: "", tools: [], note: "", failed: false };
    }
    return state.live;
  }

  function pushUserTurn(text: string): void {
    state.turns.push({ role: "user", text });
    state.live = { text: "", thinking: "", tools: [], note: "", failed: false };
    state.turnState = "running";
    state.pendingPermission = null;
    state.pendingQuestion = null;
    state.pendingPlan = null;
    renderPending();
    renderTurns();
    renderBadge();
    maybeScroll(true);
  }

  function applyEvent(event: AgentStreamEvent): void {
    switch (event.kind) {
      case "text":
        ensureLive().text += event.text;
        scheduleLiveRender();
        break;
      case "thinking":
        ensureLive().thinking += event.text;
        scheduleLiveRender();
        break;
      case "tool": {
        const live = ensureLive();
        const existing = live.tools.find((item) => item.toolCallId === event.toolCallId);
        if (existing) {
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
          live.tools.push({
            toolCallId: event.toolCallId,
            title: event.title || event.toolCallId,
            status: event.status || "pending",
            content: event.content || ""
          });
        }
        scheduleLiveRender();
        break;
      }
      case "turn_complete": {
        if (state.live) {
          state.turns.push({
            role: "assistant",
            text: state.live.text,
            thinking: state.live.thinking,
            tools: state.live.tools,
            meta: ""
          });
          state.live = null;
        }
        state.turnState = "complete";
        state.pendingPermission = null;
        state.pendingQuestion = null;
        state.pendingPlan = null;
        renderPending();
        renderTurns();
        renderLive();
        renderBadge();
        maybeScroll();
        break;
      }
      case "error": {
        if (state.live && (state.live.text || state.live.tools.length > 0)) {
          state.live.note = event.message;
          state.live.failed = true;
        } else {
          state.live = { text: "", thinking: "", tools: [], note: event.message, failed: true };
        }
        state.turnState = "error";
        renderLive();
        renderBadge();
        maybeScroll();
        break;
      }
      case "permission":
        state.pendingPermission = { requestId: event.requestId, title: event.title, options: event.options };
        state.turnState = "running";
        renderPending();
        renderBadge();
        maybeScroll();
        break;
      case "question":
        state.pendingQuestion = { questionId: event.questionId, questions: event.questions };
        renderPending();
        maybeScroll();
        break;
      case "question_resolved":
        if (state.pendingQuestion?.questionId === event.questionId) {
          state.pendingQuestion = null;
          renderPending();
        }
        break;
      case "plan_approval":
        state.pendingPlan = { approvalId: event.approvalId, planMarkdown: event.planMarkdown };
        renderPending();
        maybeScroll(true);
        break;
      case "plan_approval_resolved":
        if (state.pendingPlan?.approvalId === event.approvalId) {
          state.pendingPlan = null;
          renderPending();
        }
        break;
      default:
        break;
    }
  }

  async function fetchHistory(): Promise<void> {
    const runtime = state.runtime;
    if (!runtime?.conversationId || !runtime.agentType) {
      return;
    }
    if (state.fetchedConversationId === runtime.conversationId) {
      return;
    }
    state.fetchedConversationId = runtime.conversationId;
    // Local turns came from the live stream of this same session; fetching
    // would duplicate them. History loads only on panel (re)open.
    if (state.turns.length > 0) {
      return;
    }
    try {
      const client = new CodegClient(normalizeBaseUrl(state.config.host, state.config.port), state.config.token);
      const detail = await client.getConversation(runtime.agentType, runtime.conversationId);
      state.turns = detail.turns.slice(-HISTORY_TURN_LIMIT).map(historyTurnToSessionTurn);
      renderTurns();
      maybeScroll(true);
    } catch (error) {
      setMsg(`会话历史加载失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function loadCodegInfo(): Promise<void> {
    const response = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupLoadCodegInfo });
    if (!response.ok) {
      if (response.error) {
        setMsg(response.error, "error");
      }
      return;
    }
    state.agents = response.agents ?? [];
    state.folders = response.folders ?? [];
    state.codegVersion = response.codegVersion || "";
    if (state.config.agentType && !state.agents.some((agent) => agent.agentType === state.config.agentType)) {
      state.config.agentType = "";
    }
    if (state.config.project && !state.folders.some((folder) => folder.folderId === state.config.project?.folderId)) {
      state.config.project = null;
    }
    refreshCombos();
    renderStatus();
  }

  type ReadFieldsResult = { ok: true } | { ok: false; error: string };

  function readFields(requireSelection: boolean): ReadFieldsResult {
    state.config.host = hostInput.value.trim() || "127.0.0.1";
    state.config.port = portInput.value.trim() || "23080";
    state.config.token = tokenInput.value.trim();
    if (!state.config.token) {
      return { ok: false, error: "请填写 Token" };
    }
    if (requireSelection) {
      if (!state.config.agentType) {
        return { ok: false, error: "请选择智能体" };
      }
      if (!state.config.project) {
        return { ok: false, error: "请选择项目" };
      }
    }
    return { ok: true };
  }

  async function refreshTabList(): Promise<void> {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*", "file:///*"] });
    tabSelect.innerHTML = "";
    for (const tab of tabs) {
      if (tab.id == null) {
        continue;
      }
      const option = document.createElement("option");
      option.value = String(tab.id);
      option.textContent = tab.title || tab.url || `Tab ${tab.id}`;
      if (tab.id === state.attachedTabId) {
        option.selected = true;
      }
      tabSelect.appendChild(option);
    }
    if (state.attachedTabId == null) {
      const active = tabs.find((tab) => tab.active);
      if (active?.id != null) {
        tabSelect.value = String(active.id);
      }
    }
  }

  testBtn.addEventListener("click", () => {
    const fields = readFields(false);
    if (!fields.ok) {
      setMsg(fields.error, "error");
      return;
    }
    testBtn.disabled = true;
    setMsg("正在连接 Codeg...");
    void (async () => {
      try {
        const saved = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupSaveConfig, config: state.config });
        if (!saved.ok) {
          setMsg(saved.error || "保存失败", "error");
          return;
        }
        const tested = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupTestConnection });
        if (!tested.ok) {
          setMsg(tested.error || "连接失败", "error");
          return;
        }
        state.codegVersion = tested.codegVersion || "";
        await loadCodegInfo();
        setMsg(`Codeg 连接成功${state.codegVersion ? `（v${state.codegVersion}）` : ""}，请选择智能体和项目后连接页面`, "success");
      } finally {
        testBtn.disabled = false;
      }
    })().catch((error) => {
      testBtn.disabled = false;
      setMsg(error instanceof Error ? error.message : String(error), "error");
    });
  });

  attachBtn.addEventListener("click", () => {
    const fields = readFields(true);
    if (!fields.ok) {
      setMsg(fields.error, "error");
      return;
    }
    const tabId = Number(tabSelect.value);
    if (!Number.isFinite(tabId) || tabId <= 0) {
      setMsg("请先选择目标标签页", "error");
      return;
    }
    attachBtn.disabled = true;
    setMsg("正在保存并连接目标页面...");
    void (async () => {
      try {
        const saved = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupSaveConfig, config: state.config });
        if (!saved.ok) {
          setMsg(saved.error || "保存失败", "error");
          return;
        }
        const tab = await chrome.tabs.get(tabId);
        const response = await sendMessage<RuntimeResponse>({
          type: MESSAGE_TYPES.popupAttachPage,
          tabId,
          pageUrl: tab.url ?? "",
          pageTitle: tab.title
        });
        if (!response.ok) {
          setMsg(response.error || "连接失败", "error");
          return;
        }
        state.codegVersion = response.codegVersion || state.codegVersion;
        state.runtime = response.runtime ?? state.runtime;
        state.attachedTabId = tabId;
        state.attachedPageUrl = tab.url ?? "";
        state.attachedTitle = tab.title ?? "";
        renderStatus();
        await refreshTabList();
        setMsg("已连接，开启「选择元素」后点击页面即可选中", "success");
        await fetchHistory();
      } finally {
        attachBtn.disabled = false;
      }
    })().catch((error) => {
      attachBtn.disabled = false;
      setMsg(error instanceof Error ? error.message : String(error), "error");
    });
  });

  disconnectBtn.addEventListener("click", () => {
    void (async () => {
      const response = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.contentDisconnect });
      if (!response.ok) {
        setMsg(response.error || "断开连接失败", "error");
        return;
      }
      state.connected = false;
      state.attachedTabId = undefined;
      state.attachedPageUrl = "";
      state.attachedTitle = "";
      state.attachedFavIconUrl = "";
      state.runtime = null;
      state.fetchedConversationId = undefined;
      state.turns = [];
      state.live = null;
      state.turnState = "idle";
      renderStatus();
      renderTurns();
      renderLive();
      renderBadge();
      await refreshTabList();
      setMsg("已断开连接", "success");
    })();
  });

  selectToggle.addEventListener("click", () => {
    state.selecting = !state.selecting;
    renderSelectToggle();
    void sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.contentSetSelecting, selecting: state.selecting })
      .then((response) => {
        if (!response.ok) {
          setMsg(response.error || "切换选择模式失败", "error");
        }
      })
      .catch(() => setMsg("切换选择模式失败", "error"));
  });

  root.querySelector<HTMLButtonElement>("#refreshTabs")!.addEventListener("click", () => {
    void refreshTabList();
  });

  const presetsEl = root.querySelector<HTMLElement>("#presets")!;
  presetsEl.innerHTML = PRESETS.map((preset, index) => `<button class="preset" data-preset-index="${index}">${escapeHtml(preset.label)}</button>`).join("");
  presetsEl.querySelectorAll<HTMLButtonElement>(".preset").forEach((chip) => {
    chip.addEventListener("click", () => {
      const preset = PRESETS[Number(chip.dataset.presetIndex ?? "-1")];
      if (!preset) {
        return;
      }
      promptInput.value = preset.text;
      promptInput.focus();
    });
  });

  root.querySelector<HTMLInputElement>("#attachStyle")!.addEventListener("change", (event) => {
    state.attachStyle = (event.target as HTMLInputElement).checked;
  });
  root.querySelector<HTMLInputElement>("#attachErrors")!.addEventListener("change", (event) => {
    state.attachErrors = (event.target as HTMLInputElement).checked;
  });

  sendBtn.addEventListener("click", () => {
    sendPromptSafe();
  });
  promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sendPromptSafe();
    }
  });

  async function sendPrompt(): Promise<void> {
    const promptText = promptInput.value.trim();
    if (!promptText) {
      setMsg("请先输入修改需求", "error");
      return;
    }
    if (state.attachedTabId == null) {
      setMsg("请先连接页面", "error");
      return;
    }
    let context: ContentApplyContext;
    try {
      context = (await chrome.tabs.sendMessage(state.attachedTabId, {
        type: MESSAGE_TYPES.contentGetApplyContext
      })) as unknown as ContentApplyContext;
    } catch {
      setMsg("无法与页面通信，请重新连接页面", "error");
      return;
    }
    const selection = context.selection?.tag ? context.selection : state.selection;
    if (!selection?.tag) {
      setMsg("请先开启「选择元素」并点击页面元素", "error");
      return;
    }
    const extra: ApplyExtra = {};
    if (state.attachStyle && context.computedStyle) {
      extra.computedStyle = context.computedStyle;
    }
    if (state.attachErrors && context.consoleErrors?.length) {
      extra.consoleErrors = context.consoleErrors;
    }
    sendBtn.disabled = true;
    setMsg("正在发送到 Codeg...");
    try {
      const response = await sendMessage<RuntimeResponse>({
        type: MESSAGE_TYPES.contentApply,
        pageUrl: context.pageUrl,
        selection,
        sourceHint: context.sourceHint ?? state.sourceHint,
        prompt: promptText,
        extra
      });
      if (!response.ok) {
        setMsg(response.error || "发送失败", "error");
        return;
      }
      promptInput.value = "";
      pushUserTurn(promptText);
      setMsg(`已发送到 Codeg，请求号 ${response.requestId ?? ""}`, "success");
    } finally {
      sendBtn.disabled = false;
    }
  }

  function sendPromptSafe(): void {
    void sendPrompt().catch((error) => {
      sendBtn.disabled = false;
      setMsg(error instanceof Error ? error.message : String(error), "error");
    });
  }

  stopBtn.addEventListener("click", () => {
    void (async () => {
      const response = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.contentCancelTurn });
      if (!response.ok) {
        setMsg(response.error || "停止失败", "error");
        return;
      }
      setMsg("已请求停止当前任务", "success");
    })();
  });

  pendingArea.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) {
      return;
    }
    let respond: RespondPayload | undefined;
    if (button.classList.contains("perm-option")) {
      respond = {
        kind: "permission",
        requestId: button.dataset.permRequestId || "",
        optionId: button.dataset.permOptionId || ""
      };
    } else if (button.classList.contains("question-option")) {
      const questionId = button.dataset.questionId || "";
      const label = button.dataset.questionLabel || "";
      if (button.dataset.questionMulti) {
        button.classList.toggle("is-active");
        return;
      }
      respond = { kind: "question", questionId, labels: [label] };
    } else if (button.classList.contains("question-confirm")) {
      const questionId = button.dataset.questionId || "";
      const labels = Array.from(
        pendingArea.querySelectorAll<HTMLButtonElement>(`.question-option[data-question-id="${questionId}"].is-active`)
      ).map((active) => active.dataset.questionLabel || "");
      respond = { kind: "question", questionId, labels };
    } else if (button.classList.contains("question-decline")) {
      respond = { kind: "question_decline", questionId: button.dataset.questionId || "" };
    } else if (button.classList.contains("plan-option")) {
      respond = {
        kind: "plan_approval",
        approvalId: button.dataset.planApprovalId || "",
        decision: (button.dataset.planDecision as "approve" | "request_changes" | "abandon") || "approve"
      };
    }
    if (respond) {
      void respondRequest(respond);
    }
  });

  async function respondRequest(respond: RespondPayload): Promise<void> {
    const response = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.contentRespondRequest, respond });
    if (!response.ok) {
      setMsg(response.error || "响应失败", "error");
    }
  }

  sessionBody.addEventListener("scroll", () => {
    const distance = sessionBody.scrollHeight - sessionBody.scrollTop - sessionBody.clientHeight;
    state.stickToBottom = distance < 40;
    backBottom.classList.toggle("is-visible", !state.stickToBottom);
  });
  backBottom.addEventListener("click", () => {
    state.stickToBottom = true;
    backBottom.classList.remove("is-visible");
    maybeScroll(true);
  });

  // --- Port wiring ---------------------------------------------------------
  let portRetries = 0;

  function connectPort(): void {
    const port = chrome.runtime.connect({ name: SIDE_PANEL_PORT_NAME });
    port.onMessage.addListener((message: PanelPortEvent) => {
      portRetries = 0;
      if (message.kind === "state") {
        state.connected = message.connected;
        state.selecting = message.selecting;
        state.attachedTabId = message.attachedTabId;
        state.attachedPageUrl = message.attachedPageUrl ?? "";
        state.attachedTitle = message.attachedTitle ?? "";
        state.attachedFavIconUrl = message.attachedFavIconUrl ?? "";
        if (message.runtime) {
          const conversationChanged = state.runtime?.conversationId !== message.runtime.conversationId;
          state.runtime = message.runtime;
          if (conversationChanged && message.runtime.conversationId != null) {
            void fetchHistory();
          }
        } else {
          state.runtime = null;
        }
        renderStatus();
        renderSelectToggle();
        void refreshTabList();
      } else if (message.kind === "event") {
        applyEvent(message.event);
      } else if (message.kind === "selection") {
        state.selection = message.selection;
        state.sourceHint = message.sourceHint;
        renderPickCard();
      }
    });
    port.onDisconnect.addListener(() => {
      // Service worker restarts drop the port; reconnect to get a fresh state
      // push. Capped retries avoid a hot loop while the extension reloads.
      if (portRetries < 8) {
        portRetries += 1;
        setTimeout(connectPort, 600 * portRetries);
      }
    });
  }

  // --- Boot ----------------------------------------------------------------
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const loaded = await sendMessage<RuntimeResponse>({
    type: MESSAGE_TYPES.popupGetConfig,
    pageUrl: activeTab?.url
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
  hostInput.value = state.config.host;
  portInput.value = state.config.port;
  tokenInput.value = state.config.token;

  renderStatus();
  renderSelectToggle();
  renderPickCard();
  renderBadge();
  renderTurns();
  refreshCombos();
  setMsg(
    state.attachedTabId != null
      ? "页面绑定已连接，开启「选择元素」后点击页面即可选中"
      : "填写 Codeg 地址与 Token，测试连接后选择智能体和项目，再连接页面"
  );
  if (state.config.host && state.config.port && state.config.token) {
    await loadCodegInfo();
  }
  await refreshTabList();
  connectPort();
}

void boot();
