import { MESSAGE_TYPES } from "./messages";
import type {
  ContentApplyContext,
  ContentSelection,
  ContentSourceHint,
  RuntimeResponse
} from "./messages";

declare global {
  interface Window {
    __CODEG_UI_BRIDGE_CONTENT_BOOTED__?: boolean;
  }
}

const HOST_ID = "codeg-ui-bridge-overlay-host";
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
`;

type SelectionState = {
  selecting: boolean;
  selectedElement: HTMLElement | null;
  hoveredElement: HTMLElement | null;
  selectedSelection: ContentSelection | null;
  selectedSourceHint?: ContentSourceHint;
};

const state: SelectionState = {
  selecting: false,
  selectedElement: null,
  hoveredElement: null,
  selectedSelection: null,
  selectedSourceHint: undefined
};

// Overlay DOM lives only while selection mode is on; frames are pure
// indicators (pointer-events: none) so the page keeps receiving real events.
let host: HTMLElement | null = null;
let hoverFrame: HTMLElement | null = null;
let hoverLabel: HTMLElement | null = null;
let selectedFrame: HTMLElement | null = null;
let selectedLabel: HTMLElement | null = null;

function getTextPreview(element: HTMLElement): string | undefined {
  const text = element.innerText || element.textContent || "";
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 120) : undefined;
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
  // Binder attributes land on template elements; walk up to the nearest
  // instrumented ancestor when the clicked node itself carries none.
  const host =
    element.hasAttribute("data-codeg-source-id")
      ? element
      : (element.closest<HTMLElement>("[data-codeg-source-id]") ?? element);
  const file = host.getAttribute("data-codeg-source-file") || undefined;
  const line = host.getAttribute("data-codeg-source-line") || undefined;
  const column = host.getAttribute("data-codeg-source-column") || undefined;
  const sourceId = host.getAttribute("data-codeg-source-id") || undefined;
  const component = host.getAttribute("data-codeg-component") || undefined;

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

const PROBE_EVENT = "codeg-source-probe";
const PROBE_DONE_EVENT = "codeg-source-probe-done";
const PROBE_TOKEN_ATTR = "data-codeg-probe-token";
const PROBE_TIMEOUT_MS = 300;

/**
 * No binder attributes on the node? Ask the MAIN-world probe (probe.js) to
 * fill data-codeg-source-* from Vue dev runtime props. Resolves true when a
 * file attribute appeared.
 */
function probeSourceHint(element: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const token = `probe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener(PROBE_DONE_EVENT, onDone);
      element.removeAttribute(PROBE_TOKEN_ATTR);
      resolve(element.getAttribute("data-codeg-source-file") != null);
    };
    const onDone = (event: Event) => {
      if ((event as CustomEvent<string>).detail === token) {
        finish();
      }
    };
    window.addEventListener(PROBE_DONE_EVENT, onDone);
    element.setAttribute(PROBE_TOKEN_ATTR, token);
    window.dispatchEvent(new CustomEvent(PROBE_EVENT, { detail: token }));
    setTimeout(finish, PROBE_TIMEOUT_MS);
  });
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

function getElementLabel(element: HTMLElement): string {
  const selector = getSelector(element);
  const text = getElementText(element);
  return text ? `${selector} · ${text}` : selector;
}

async function safeSendMessage<T extends RuntimeResponse>(message: object): Promise<T> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: text.includes("Extension context invalidated") ? "Extension context invalidated. Please reload the extension on this page." : text
    } as T;
  }
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

function isTextInputElement(element: EventTarget | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

function ensureOverlay(): void {
  if (host) {
    return;
  }

  host = document.createElement("div");
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

  hoverFrame = document.createElement("div");
  hoverFrame.className = "cuib-frame cuib-frame--hover";
  hoverFrame.style.display = "none";
  hoverLabel = document.createElement("span");
  hoverLabel.className = "cuib-frame__label";
  hoverFrame.appendChild(hoverLabel);

  selectedFrame = document.createElement("div");
  selectedFrame.className = "cuib-frame cuib-frame--selected";
  selectedFrame.style.display = "none";
  selectedLabel = document.createElement("span");
  selectedLabel.className = "cuib-frame__label";
  selectedFrame.appendChild(selectedLabel);

  root.append(hoverFrame, selectedFrame);
  host.append(style, root);
  document.documentElement.appendChild(host);
}

function destroyOverlay(): void {
  host?.remove();
  host = null;
  hoverFrame = null;
  hoverLabel = null;
  selectedFrame = null;
  selectedLabel = null;
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
  if (!hoverFrame || !hoverLabel || !selectedFrame || !selectedLabel) {
    return;
  }
  updateFrame(
    hoverFrame,
    hoverLabel,
    state.hoveredElement,
    state.selecting && Boolean(state.hoveredElement) && state.hoveredElement !== state.selectedElement
  );
  updateFrame(selectedFrame, selectedLabel, state.selectedElement, Boolean(state.selectedElement));
}

function clearSelection() {
  state.selectedElement = null;
  state.hoveredElement = null;
  state.selectedSelection = null;
  state.selectedSourceHint = undefined;
  syncFrames();
}

function selectElement(element: HTMLElement) {
  const promoted = resolvePreferredSelectionTarget(element);
  state.selectedElement = promoted;
  state.selectedSelection = toSelection(promoted);
  state.selectedSourceHint = getSourceHint(promoted);
  state.hoveredElement = null;
  // Auto-exit picking so follow-up page clicks don't silently re-target;
  // the side panel toggle re-enters selection mode.
  state.selecting = false;
  syncFrames();

  const syncSelection = () => {
    void safeSendMessage<RuntimeResponse>({
      type: MESSAGE_TYPES.contentSelectionSync,
      pageUrl: window.location.href,
      selection: state.selectedSelection,
      sourceHint: state.selectedSourceHint
    });
  };
  syncSelection();

  if (!state.selectedSourceHint) {
    // Vite/webpack binder absent: fall back to the Vue dev runtime probe for
    // file-level binding, then push the enriched hint to the panel.
    void probeSourceHint(promoted).then((found) => {
      if (!found || state.selectedElement !== promoted) {
        return;
      }
      state.selectedSourceHint = getSourceHint(promoted);
      if (state.selectedSourceHint) {
        syncSelection();
      }
    });
  }
}

function handleHover(target: EventTarget | null) {
  const element = toHTMLElement(target);
  if (!element) {
    state.hoveredElement = null;
    syncFrames();
    return;
  }
  state.hoveredElement = resolvePreferredSelectionTarget(element);
  syncFrames();
}

const handleDocumentMouseMove = (event: MouseEvent) => {
  if (!state.selecting) {
    return;
  }
  handleHover(event.target);
};

const handleDocumentClick = (event: MouseEvent) => {
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
  selectElement(target);
};

const handleWindowScroll = () => {
  syncFrames();
};

function setSelecting(selecting: boolean): void {
  state.selecting = selecting;
  if (selecting) {
    ensureOverlay();
  } else {
    clearSelection();
    destroyOverlay();
  }
}

async function boot() {
  if (window.__CODEG_UI_BRIDGE_CONTENT_BOOTED__) {
    return;
  }
  window.__CODEG_UI_BRIDGE_CONTENT_BOOTED__ = true;

  document.addEventListener("mousemove", handleDocumentMouseMove, true);
  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("scroll", handleWindowScroll, true);

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const generic = message as { type?: string } | undefined;
    if (generic?.type === MESSAGE_TYPES.contentGetRuntime) {
      sendResponse({ ok: true });
      return false;
    }
    if (generic?.type === MESSAGE_TYPES.contentSetSelecting) {
      const selecting = (message as { selecting?: boolean }).selecting === true;
      setSelecting(selecting);
      sendResponse({ ok: true });
      return false;
    }
    if (generic?.type === MESSAGE_TYPES.contentGetApplyContext) {
      const extra: ContentApplyContext = {
        pageUrl: window.location.href,
        selection: state.selectedSelection ?? { tag: "" },
        sourceHint: state.selectedSourceHint,
        computedStyle: state.selectedElement ? collectComputedStyle(state.selectedElement) : undefined,
        consoleErrors: consoleEntries.slice()
      };
      sendResponse(extra);
      return false;
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
}

void boot();
