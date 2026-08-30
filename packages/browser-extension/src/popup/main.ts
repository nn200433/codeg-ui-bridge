import { MESSAGE_TYPES } from "../messages";
import type { BridgeConfig, CodegAgentOption, CodegProject, RuntimeResponse } from "../messages";

function sendMessage<T extends RuntimeResponse>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

type PopupState = {
  config: BridgeConfig;
  agents: CodegAgentOption[];
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

type ComboOption = { value: string; label: string; sub?: string };

/**
 * Minimal searchable combobox. Options can only come from a live Codeg
 * connection, so while the option list is empty the input stays disabled.
 * Typing filters by label/value/sub (case-insensitive substring).
 */
function bindCombo(
  scope: HTMLElement,
  comboId: string,
  options: ComboOption[],
  currentLabel: string,
  disabledPlaceholder: string,
  onPick: (value: string) => void
): void {
  const box = scope.querySelector<HTMLDivElement>(`#${comboId}`);
  const input = box?.querySelector<HTMLInputElement>("input");
  const list = box?.querySelector<HTMLDivElement>(".combo-list");
  if (!box || !input || !list) {
    return;
  }

  if (options.length === 0) {
    input.disabled = true;
    input.value = "";
    input.placeholder = disabledPlaceholder;
    return;
  }

  input.disabled = false;
  input.placeholder = "输入筛选";
  input.value = currentLabel;

  const renderList = (filterOverride?: string) => {
    const filter = (filterOverride ?? input.value).trim().toLowerCase();
    const items = options.filter((option) =>
      !filter ? true : `${option.label} ${option.value} ${option.sub ?? ""}`.toLowerCase().includes(filter)
    );
    list.innerHTML = items.length
      ? items
          .map(
            (option) =>
              `<div class="combo-option" data-value="${escapeHtml(option.value)}"><span>${escapeHtml(option.label)}</span>${
                option.sub ? `<span class="combo-sub">${escapeHtml(option.sub)}</span>` : ""
              }</div>`
          )
          .join("")
      : `<div class="combo-empty">无匹配项</div>`;
  };

  const closeList = () => {
    list.style.display = "none";
  };

  input.addEventListener("focus", () => {
    input.select();
    renderList("");
    list.style.display = "grid";
  });
  input.addEventListener("input", () => {
    renderList();
    list.style.display = "grid";
  });
  input.addEventListener("blur", () => {
    setTimeout(closeList, 150);
  });

  list.addEventListener("mousedown", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".combo-option");
    if (!target?.dataset.value) {
      return;
    }
    event.preventDefault();
    const option = options.find((item) => item.value === target.dataset.value);
    if (option) {
      input.value = option.label;
      onPick(option.value);
    }
    closeList();
    input.blur();
  });
}

function render(root: HTMLElement, state: PopupState) {
  const agentLabel =
    state.agents.find((agent) => agent.agentType === state.config.agentType)?.name ||
    (state.config.agentType ? state.config.agentType : "");
  const agentAvailable = state.agents.some((agent) => agent.agentType === state.config.agentType);
  const folderLabel = state.folders.find(
    (folder) => state.config.project && folder.folderId === state.config.project.folderId
  )?.folderName;

  root.innerHTML = `
    <style>
      .combo { position: relative; }
      .combo input {
        width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px;
        box-sizing: border-box; font-size: 12px; background: white; color: #111827;
      }
      .combo input:disabled { background: #f1f5f9; color: #94a3b8; }
      .combo-list {
        position: absolute; top: calc(100% + 2px); left: 0; right: 0; z-index: 20;
        max-height: 180px; overflow-y: auto; background: white; border: 1px solid #d1d5db;
        border-radius: 8px; display: none; box-shadow: 0 8px 20px rgba(0,0,0,0.14);
      }
      .combo-option {
        padding: 8px 10px; cursor: pointer; display: flex; align-items: center;
        justify-content: space-between; gap: 8px; font-size: 12px;
      }
      .combo-option:hover { background: #f1f5f9; }
      .combo-sub { color: #94a3b8; font-size: 11px; white-space: nowrap; }
      .combo-empty { padding: 8px 10px; font-size: 12px; color: #94a3b8; }
    </style>
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
        <div style="display:grid; gap:4px; font-size:12px;">
          <span>智能体（仅显示已在 Codeg 启用的）</span>
          <div class="combo" id="agentCombo">
            <input id="agentInput" autocomplete="off" placeholder="测试连接后加载" />
            <div class="combo-list" style="display:none"></div>
          </div>
          ${state.config.agentType && !agentAvailable ? `<div style="color:#b45309;">当前保存的智能体不在启用列表中，请重新选择</div>` : ""}
        </div>
        <div style="display:grid; gap:4px; font-size:12px;">
          <span>所属项目（Codeg 文件夹）</span>
          <div class="combo" id="folderCombo">
            <input id="folderInput" autocomplete="off" placeholder="测试连接后加载" />
            <div class="combo-list" style="display:none"></div>
          </div>
        </div>
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
    config: { host: "127.0.0.1", port: "23080", token: "", agentType: "", project: null },
    agents: [],
    folders: [],
    codegVersion: "",
    message: "填写 Codeg 地址与 Token，测试连接成功后再选择智能体和项目，最后连接页面",
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
      // Previously saved selections must still exist in the enabled list /
      // folder list, otherwise force a fresh pick.
      if (state.config.agentType && !state.agents.some((agent) => agent.agentType === state.config.agentType)) {
        state.config.agentType = "";
      }
      if (state.config.project && !state.folders.some((folder) => folder.folderId === state.config.project?.folderId)) {
        state.config.project = null;
      }
    } else if (response.error) {
      state.error = response.error;
    }
  }

  type ReadFieldsResult = { ok: true; manualPath?: string } | { ok: false; error: string };

  /**
   * Agent and project live in state.config (picked via the comboboxes after a
   * successful test connection); host/port/token/manualPath are read from the
   * DOM. `requireSelection` is only true for 连接页面: testing the connection
   * must work before the agent/folder lists have been loaded.
   */
  function readFields(config: BridgeConfig, requireSelection: boolean): ReadFieldsResult {
    const hostInput = root.querySelector<HTMLInputElement>("#host");
    const portInput = root.querySelector<HTMLInputElement>("#port");
    const tokenInput = root.querySelector<HTMLInputElement>("#token");
    const manualPathInput = root.querySelector<HTMLInputElement>("#manualPath");

    if (!hostInput || !portInput || !tokenInput || !manualPathInput) {
      return { ok: false, error: "popup 渲染异常" };
    }

    config.host = hostInput.value.trim() || "127.0.0.1";
    config.port = portInput.value.trim() || "23080";
    config.token = tokenInput.value.trim();
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

    if (requireSelection && !config.agentType) {
      return { ok: false, error: "请选择智能体" };
    }
    if (config.project) {
      return { ok: true };
    }
    if (!requireSelection) {
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

    const agentOptions: ComboOption[] = state.agents.map((agent) => ({
      value: agent.agentType,
      label: agent.name || agent.agentType,
      sub: agent.installedVersion
        ? `已安装 ${agent.installedVersion}`
        : agent.available
          ? "已启用"
          : "未安装"
    }));
    bindCombo(root, "agentCombo", agentOptions, agentOptions.find((option) => option.value === state.config.agentType)?.label ?? "", "测试连接后加载", (value) => {
      state.config.agentType = value;
    });

    const folderOptions: ComboOption[] = state.folders.map((folder) => ({
      value: String(folder.folderId),
      label: folder.folderName,
      sub: folder.folderPath
    }));
    bindCombo(root, "folderCombo", folderOptions, folderOptions.find((option) => state.config.project && option.value === String(state.config.project.folderId))?.label ?? "", "测试连接后加载", (value) => {
      const selected = state.folders.find((folder) => String(folder.folderId) === value);
      if (selected) {
        state.config.project = selected;
      }
    });

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
          state.message = `Codeg 连接成功${tested.codegVersion ? `（v${tested.codegVersion}）` : ""}，请在下方选择智能体和项目`;
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
