# Codeg UI Bridge 架构 v0.2（直连 Codeg）

> 取代 [v0.1 Pi UI Bridge 架构](./20260320-pi-ui-bridge-v0.1.md)，v0.1 中运行在 Pi 扩展进程内的 bridge server 已删除。

## 总览

```text
┌──────────────────────────── 浏览器扩展 ────────────────────────────┐
│ popup/main.ts      配置 IP/端口/Token，拉取智能体与项目列表，连接页面 │
│ background.ts      连接管理 + acp_prompt + WebSocket 事件泵         │
│ content.ts         overlay：选择模式 / DOM 面板 / inline 输入 / 执行流 │
└──────────────┬─────────────────────────────────────────────────────┘
               │ POST /api/<command>（Bearer Token）
               │ WS   /ws/events   attach 协议
┌──────────────▼─────────────────────────────────────────────────────┐
│ Codeg Web 服务                                                      │
│   acp_connect → ACP 子进程（pi / claude_code / codex / ...）        │
│   acp_prompt → 结构化 prompt → 会话轮次                             │
│   /ws/events → snapshot / replay / event(envelope)                  │
└─────────────────────────────────────────────────────────────────────┘
```

## 模块职责

### packages/bridge-core

- `codeg-api.ts`：`CodegClient` 封装全部 HTTP 命令（`health`、`acp_list_agents`、`list_all_folder_details`、`open_folder`、`acp_connect`、`acp_prompt`、`acp_cancel`、`acp_touch_connection`、`acp_respond_permission`、`acp_answer_question`、`acp_answer_plan_approval`、`acp_get_session_snapshot`、`acp_list_connections`），以及 WS URL / 子协议（`codeg-events` + `codeg-token.<base64url(token)>`）构造。`acp_connect` 的响应是裸 connection id 字符串。
- `message.ts`：`buildBridgePrompt(payload)` 把 `ApplyRequest` 渲染为中文 prompt（页面信息、选中元素、sourceHint、用户需求、执行要求、原始 JSON）。
- `protocol.ts`：`Rect / SourceHint / SelectionPayload / ApplyIntent / ApplyRequest` 等智能体无关的协议类型。

### packages/browser-extension

- `background.ts`（MV3 service worker）：
  - 配置与状态持久化在 `chrome.storage.local`（`codegui.bridge.*`）：config、connection record（connectionId / agentType / workingDir / externalSessionId / conversationId）、绑定的 tab 与页面、按 origin 记忆的项目+智能体偏好。
  - `ensureConnection`：先 `acp_list_connections` 复用存活连接（同时 touch 保活），否则 `acp_connect` 重建，优先携带已记录的外部 session id 恢复历史。
  - `applyRequest`：`buildBridgePrompt` → `acp_prompt`（`clientMessageId` 作 requestId）；`turn_in_progress`（HTTP 409）映射为友好提示；连接失效时清空记录重连并重试一次。
  - WebSocket 单例管理器：`__ready__` 握手 → attach（带 `since_seq` 增量）→ `snapshot / replay / event` 归一化 → `chrome.tabs.sendMessage` 转发到绑定 tab；断线指数退避重连；20s 应用层 ping 同时做 `acp_touch_connection` 保活。
  - 事件归一化：`content_delta/thinking/tool_call/tool_call_update/turn_complete/status_changed/error/permission_request/question_request/plan_approval_request/*_resolved`，`session_started` 与 `conversation_linked` 顺手回写 connection record。
- `content.ts`：overlay 面板。在 v0.1 的选择模式、高亮、DOM 视图、inline composer 之上新增「执行流」区域：流式正文、思考折叠块、工具调用卡片、权限/提问/计划确认卡片（可直接点击回应，multiSelect 问题先勾选后确认）、停止与清空按钮；通过 `chrome.runtime.onMessage` 接收 `codeg/content/agent-event`。
- `popup/main.ts`：Codeg IP / 端口 / Token 输入 + 测试连接；智能体下拉（`acp_list_agents`，默认 `pi`，失败时内置兜底列表）；项目下拉（`list_all_folder_details`，过滤 `chat` 类型）或手动路径（`open_folder` 登记后取得真实 folderId）；连接页面；展示 Codeg 版本与连接状态。

### packages/source-binder-react

Vite 开发模式插件，为每个 JSX 固有元素注入 `data-codeg-source-id/-file/-line/-column` 与 `data-codeg-component`，content overlay 读取后生成 `sourceHint` 随请求发送。

## 会话与数据流

1. popup「连接页面」→ `health` 校验 → `ensureConnection` → WS attach → 绑定 tab。
2. 用户选中元素并提交 → background 组装 prompt → `acp_prompt`。
3. Codeg 流式推送事件 → background 归一化 → content 面板实时渲染。
4. 轮次内智能体可发起 permission / question / plan approval，面板直接回应；用户可随时 `acp_cancel`。
5. `turn_complete` 后面板进入完成态；连接被 Codeg 回收后，下次请求自动以外部 session id 重连，会话上下文不丢。

## 安全边界

- Token 仅存于 `chrome.storage.local`，不落仓库、不写日志。
- 所有请求目标是用户显式配置的 Codeg 地址；Codeg 侧按 Token 鉴权。
- 扩展对页面点击的拦截只发生在选择模式开启期间。
