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
  connected: boolean;
  attachedPageUrl: string;
};

const CSS_TEXT = `
* { box-sizing: border-box; margin: 0; }
.wrap {
  width: 400px; padding: 16px; display: grid; gap: 12px;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  background: #f8fafc; color: #0f172a;
}
.head { display: flex; align-items: center; gap: 10px; }
.logo {
  width: 36px; height: 36px; border-radius: 10px; flex: 0 0 auto;
  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff;
  font-size: 18px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
}
.head-title { font-size: 15px; font-weight: 700; line-height: 1.3; }
.head-sub { font-size: 11px; color: #64748b; }
.card {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 10px 12px; display: grid; gap: 7px;
}
.row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
.dot-ok { background: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15); }
.dot-off { background: #cbd5e1; }
.row-key { color: #64748b; flex: 0 0 auto; }
.row-val { margin-left: auto; font-weight: 600; }
.row-val--page {
  font-weight: 400; color: #475569; max-width: 240px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.grid2 { display: grid; grid-template-columns: 1fr 90px; gap: 8px; }
.field { display: grid; gap: 4px; font-size: 12px; }
.field-label { font-weight: 600; color: #334155; }
input, select {
  width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 10px;
  font-size: 13px; font-family: inherit; background: #fff; color: #0f172a; outline: none;
}
input:focus, select:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15); }
select {
  appearance: none; -webkit-appearance: none; padding-right: 28px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
}
select:disabled { background-color: #f1f5f9; color: #94a3b8; }
.hint {
  font-size: 11px; color: #94a3b8;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.hint-warn { color: #b45309; font-weight: 600; }
.actions { display: flex; gap: 8px; }
.btn {
  flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #cbd5e1;
  background: #fff; color: #334155; font-size: 13px; font-weight: 600;
  font-family: inherit; cursor: pointer;
}
.btn:hover { background: #f1f5f9; }
.btn-primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.btn-primary:hover { background: #4338ca; }
.btn:disabled { opacity: 0.55; cursor: default; }
.msg { font-size: 12px; color: #475569; min-height: 18px; line-height: 1.5; }
.msg-error { color: #dc2626; }
.msg-success { color: #059669; }
`;

/** Install status comes only from installed_version; `available` on the server
 * just means "runnable on this platform" (always true for npx agents). */
function agentLabel(agent: CodegAgentOption): string {
  return agent.installedVersion
    ? `${agent.name}（已安装 v${agent.installedVersion}）`
    : `${agent.name}（未安装）`;
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
    connected: false,
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
  state.attachedPageUrl = loaded.attachedPageUrl || "";

  root.innerHTML = `
    <style>${CSS_TEXT}</style>
    <div class="wrap">
      <header class="head">
        <div class="logo">C</div>
        <div>
          <div class="head-title">Codeg UI Bridge</div>
          <div class="head-sub" id="codegVer">未连接 Codeg</div>
        </div>
      </header>
      <section class="card">
        <div class="row" id="rowCodeg"><span class="dot dot-off"></span><span class="row-key">Codeg 服务</span><span class="row-val">未连接</span></div>
        <div class="row" id="rowBind"><span class="dot dot-off"></span><span class="row-key">页面绑定</span><span class="row-val">未连接</span></div>
        <div class="row"><span class="row-key">页面</span><span class="row-val row-val--page" id="rowPage">(none)</span></div>
      </section>
      <div class="grid2">
        <label class="field"><span class="field-label">Codeg IP</span><input id="host" placeholder="127.0.0.1" /></label>
        <label class="field"><span class="field-label">端口</span><input id="port" placeholder="23080" /></label>
      </div>
      <label class="field"><span class="field-label">Token</span><input id="token" type="password" placeholder="Codeg Web 服务 Token" /></label>
      <label class="field">
        <span class="field-label">智能体</span>
        <select id="agentSelect"></select>
        <span class="hint" id="agentHint"></span>
      </label>
      <label class="field">
        <span class="field-label">所属项目</span>
        <select id="folderSelect"></select>
        <span class="hint" id="folderHint"></span>
      </label>
      <div class="actions">
        <button id="testBtn" class="btn">测试连接</button>
        <button id="attachBtn" class="btn btn-primary">连接页面</button>
      </div>
      <div class="msg" id="msg"></div>
    </div>
  `;

  const hostInput = root.querySelector<HTMLInputElement>("#host")!;
  const portInput = root.querySelector<HTMLInputElement>("#port")!;
  const tokenInput = root.querySelector<HTMLInputElement>("#token")!;
  const agentSelect = root.querySelector<HTMLSelectElement>("#agentSelect")!;
  const folderSelect = root.querySelector<HTMLSelectElement>("#folderSelect")!;
  const testBtn = root.querySelector<HTMLButtonElement>("#testBtn")!;
  const attachBtn = root.querySelector<HTMLButtonElement>("#attachBtn")!;
  const msgEl = root.querySelector<HTMLElement>("#msg")!;

  hostInput.value = state.config.host;
  portInput.value = state.config.port;
  tokenInput.value = state.config.token;

  function setMsg(text: string, kind: "info" | "error" | "success" = "info"): void {
    msgEl.textContent = text;
    msgEl.className = `msg${kind === "error" ? " msg-error" : kind === "success" ? " msg-success" : ""}`;
  }

  function setBusy(busy: boolean): void {
    testBtn.disabled = busy;
    attachBtn.disabled = busy;
  }

  function setRow(id: string, text: string, ok: boolean): void {
    const row = root.querySelector<HTMLElement>(id);
    if (!row) {
      return;
    }
    row.querySelector<HTMLElement>(".dot")!.className = `dot ${ok ? "dot-ok" : "dot-off"}`;
    row.querySelector<HTMLElement>(".row-val")!.textContent = text;
  }

  function updateStatus(): void {
    root.querySelector<HTMLElement>("#codegVer")!.textContent = state.codegVersion
      ? `Codeg v${state.codegVersion}`
      : "未连接 Codeg";
    setRow("#rowCodeg", state.codegVersion ? `已连通（v${state.codegVersion}）` : "未连接", Boolean(state.codegVersion));
    setRow("#rowBind", state.connected ? "已连接" : "未连接", state.connected);
    const pageEl = root.querySelector<HTMLElement>("#rowPage")!;
    pageEl.textContent = state.attachedPageUrl || "(none)";
    pageEl.title = state.attachedPageUrl;
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
    folderHint.className = "hint";
  }

  function fillSelects(): void {
    const placeholder = (text: string) => {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = text;
      return option;
    };

    agentSelect.innerHTML = "";
    if (state.agents.length === 0) {
      agentSelect.disabled = true;
      agentSelect.append(placeholder("测试连接后加载"));
    } else {
      agentSelect.disabled = false;
      if (!state.agents.some((agent) => agent.agentType === state.config.agentType)) {
        state.config.agentType = "";
      }
      if (!state.config.agentType) {
        agentSelect.append(placeholder("请选择智能体"));
      }
      for (const agent of state.agents) {
        const option = document.createElement("option");
        option.value = agent.agentType;
        option.textContent = agentLabel(agent);
        agentSelect.append(option);
      }
      agentSelect.value = state.config.agentType;
    }

    folderSelect.innerHTML = "";
    if (state.folders.length === 0) {
      folderSelect.disabled = true;
      folderSelect.append(placeholder("测试连接后加载"));
    } else {
      folderSelect.disabled = false;
      if (state.config.project && !state.folders.some((folder) => folder.folderId === state.config.project?.folderId)) {
        state.config.project = null;
      }
      if (!state.config.project) {
        folderSelect.append(placeholder("请选择项目"));
      }
      for (const folder of state.folders) {
        const option = document.createElement("option");
        option.value = String(folder.folderId);
        option.textContent = folder.folderName;
        option.title = folder.folderPath;
        folderSelect.append(option);
      }
      folderSelect.value = state.config.project ? String(state.config.project.folderId) : "";
    }

    updateHints();
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
    fillSelects();
    updateStatus();
  }

  type ReadFieldsResult = { ok: true } | { ok: false; error: string };

  /** Agent/project live in state.config (select onchange); host/port/token are read from the DOM. */
  function readFields(config: BridgeConfig, requireSelection: boolean): ReadFieldsResult {
    config.host = hostInput.value.trim() || "127.0.0.1";
    config.port = portInput.value.trim() || "23080";
    config.token = tokenInput.value.trim();
    if (!config.token) {
      return { ok: false, error: "请填写 Token" };
    }
    if (requireSelection) {
      if (!config.agentType) {
        return { ok: false, error: "请选择智能体" };
      }
      if (!config.project) {
        return { ok: false, error: "请选择项目" };
      }
    }
    return { ok: true };
  }

  async function withBusy(label: string, action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMsg(label);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  testBtn.onclick = () => {
    const config = { ...state.config };
    const fields = readFields(config, false);
    if (!fields.ok) {
      setMsg(fields.error, "error");
      return;
    }
    state.config = config;
    void withBusy("正在连接 Codeg...", async () => {
      const saved = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupSaveConfig, config });
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
      setMsg(
        `Codeg 连接成功${state.codegVersion ? `（v${state.codegVersion}）` : ""}，请在下方选择智能体和项目`,
        "success"
      );
    });
  };

  attachBtn.onclick = () => {
    const config = { ...state.config };
    const fields = readFields(config, true);
    if (!fields.ok) {
      setMsg(fields.error, "error");
      return;
    }
    state.config = config;
    void withBusy("正在保存并连接当前页面...", async () => {
      const saved = await sendMessage<RuntimeResponse>({ type: MESSAGE_TYPES.popupSaveConfig, config });
      if (!saved.ok) {
        setMsg(saved.error || "保存失败", "error");
        return;
      }
      if (!tab?.url || tab.id == null) {
        setMsg("未找到当前页面", "error");
        return;
      }
      const response = await sendMessage<RuntimeResponse>({
        type: MESSAGE_TYPES.popupAttachPage,
        tabId: tab.id,
        pageUrl: tab.url,
        pageTitle: tab.title
      });
      if (!response.ok) {
        setMsg(response.error || "连接失败", "error");
        return;
      }
      state.connected = true;
      state.attachedPageUrl = response.attachedPageUrl || tab.url;
      state.codegVersion = response.codegVersion || state.codegVersion;
      updateStatus();
      setMsg("已连接，页面上出现面板后即可选中元素发送需求", "success");
    });
  };

  agentSelect.onchange = () => {
    state.config.agentType = agentSelect.value;
    updateHints();
  };

  folderSelect.onchange = () => {
    const selected = state.folders.find((folder) => String(folder.folderId) === folderSelect.value);
    if (selected) {
      state.config.project = selected;
    }
    updateHints();
  };

  updateStatus();
  fillSelects();
  setMsg(
    state.connected
      ? "页面绑定已连接，可在页面上直接发送需求"
      : "填写 Codeg 地址与 Token，测试连接成功后再选择智能体和项目，最后连接页面"
  );
  if (state.config.host && state.config.port && state.config.token) {
    await loadCodegInfo();
  }
}

void boot();
