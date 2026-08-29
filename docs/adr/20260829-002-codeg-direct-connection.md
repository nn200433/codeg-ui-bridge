# ADR-002: 移除 Pi 扩展宿主，改为浏览器扩展直连 Codeg

- 状态: Accepted
- 日期: 2026-08-29
- 取代: [ADR-001 扩展 + Skill 架构](./20260320-001-extension-plus-skill.md)

## 背景

v0.1 的 Pi UI Bridge 需要把一个扩展宿主进 `pi-coding-agent`：本地 bridge server 运行在 Pi 进程内，浏览器扩展通过 `/attach /selection /apply` 与其通信，再由 `pi.sendUserMessage()` 注入会话。这套设计存在几个问题：

- 必须先启动 Pi 并执行 `/pi-ui:start` 才能拿到 bridgeUrl + token，链路长
- 扩展能力受限于 Pi 的 ExtensionAPI，无法服务其他智能体
- 需要额外的 `install:pi` 安装脚本维护 `~/.pi/agent`

Codeg 是多智能体编码工作台，其 Web 服务提供完整的 HTTP + WebSocket API（官方 iOS/Android 客户端即使用该协议），通过 ACP 协议可拉起任意 Agent CLI（pi、claude_code、codex 等），并且 CORS 全开，允许浏览器扩展直接访问。

## 决策

1. **删除整个 Pi 扩展宿主**：`extensions/pi-ui-bridge/`、`scripts/install-to-pi.mjs`、`scripts/uninstall-from-pi.mjs`、`skills/` 及 package.json 中的 `pi` 配置与依赖全部移除。
2. **浏览器扩展直连 Codeg**：background 直接调用 `POST /api/<command>`（Bearer Token 鉴权），不再存在本地中间服务。发送链路为 `acp_connect` → `acp_prompt`。
3. **实时回传用 WebSocket**：订阅 `/ws/events` 的 attach 协议，把 `content_delta`、`tool_call`、`turn_complete`、`permission_request`、`question_request`、`plan_approval_request` 等事件归一化后转发给页面 overlay 面板，面板内可直接回应交互请求或取消轮次。
4. **连接生命周期**：连接按 `agentType + workingDir` 维护；发送前检查 `acp_list_connections` 复用存活连接，否则用记录的外部 session id 重新 `acp_connect` 恢复会话；面板打开期间周期性 `acp_touch_connection` 保活。
5. **配置收敛到 popup**：Codeg IP、端口、Token、智能体、项目（Codeg 文件夹）全部由用户在 popup 中配置，按页面 origin 记忆「项目 + 智能体」组合；Token 只存 `chrome.storage.local`。

## 后果

- 正向：无需任何本地常驻进程；一套扩展可驱动 Codeg 中所有 ACP 智能体；实时流式反馈取代了 v0.1 的 fire-and-forget。
- 正向：`packages/bridge-core` 的协议类型与 prompt 构建保持智能体无关，仅新增 `codeg-api.ts` 客户端封装，Codeg API 变化时只需改一个文件。
- 负面：Codeg 的 `/api` 协议没有公开稳定性承诺，需要跟随 Codeg 演进（有官方移动客户端使用同一协议，事实上稳定）。
- 负面：MV3 Service Worker 中的 WebSocket 依赖 Chrome ≥116 的保活行为，断线自愈逻辑（快照 attach + since_seq 重放）必须保留。
