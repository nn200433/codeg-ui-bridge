# Codeg UI Bridge

Codeg UI Bridge 是一个浏览器与 [Codeg](https://github.com/xintaofei/codeg) 之间的 UI-to-code bridge。

它可以让你：

- 在浏览器里直接选中真实页面元素（选中即锁定，防误选）
- 用一句话描述改动或问题，可附带元素 computed style 与控制台报错，帮助 AI 精确定位
- 把结构化页面上下文通过 Codeg Web 服务发给任意已启用的 ACP 智能体
- 基于 source binder 元信息把页面节点绑定回代码位置
- 在常驻侧边栏工作台里看到完整会话历史与实时流式回复、工具调用，并直接回应权限/提问/计划确认

## 架构

```text
浏览器扩展（Side Panel 工作台 + MV3 background + content 选择器）
   │  HTTP:  POST http://{ip}:{port}/api/<command>   Authorization: Bearer <token>
   │  WS:    ws://{ip}:{port}/ws/events              子协议: codeg-events + codeg-token.<base64url(token)>
   ▼
Codeg Web 服务（桌面应用内置或独立 codeg-server）
   │  acp_connect 拉起 ACP 子进程
   ▼
claude_code / codex / gemini / ... 任意 Agent CLI
```

本仓库不包含任何智能体宿主逻辑：扩展直连 Codeg 的 Web 服务，Codeg 负责拉起并管理智能体。页面内只保留选择模式的高亮框与点击拦截，配置、输入、会话、审批全部在侧边栏。

## 请求链路

一次典型的「选中元素 → AI 改页面」链路：

```text
┌─ 侧边栏工作台 ───────┐
│ 测试连接 health       │
│ 拉取智能体/项目列表    │
│ 连接页面 ─────────────┼──► background: ensureConnection（复用或 acp_connect）
└──────────────────────┘         └► WS attach（/ws/events，带 since_seq 增量）
                                  └► Port 推送状态 → 侧栏显示绑定 tab
┌─ 页面（content）─────┐
│ 选择模式高亮框 + 点击  │
│ 拦截，选中即回传 ──────┼──► background: contentSelectionSync → 侧栏选中元素卡
└──────────────────────┘
┌─ 侧边栏会话区 ───────┐
│ 输入需求 + 发送 ───────┼──► background: buildBridgePrompt(ApplyRequest)
└──────────────────────┘         组装页面 URL / DOM·语义路径 / sourceHint
                                 / computed style / 控制台报错（extra，可开关）
                                  └► POST acp_prompt → Codeg 拉起会话轮次
┌─ 执行流 ─────────────┐
│ Codeg /ws/events 推送 │◄─ WS → background → Port：text / thinking / tool_call
│ 侧栏实时渲染 + Markdown│      / permission / question / plan_approval / turn_complete
│ 权限·提问·计划可直接回应┼──► POST acp_respond_permission 等
│ 停止 ─────────────────┼──► POST acp_cancel
└──────────────────────┘
```

会话保持：连接被 Codeg 空闲回收后，下次发送自动以已记录的外部 session id 重连，上下文不丢；WebSocket 断线按指数退避重连并用 `since_seq` 补事件。侧边栏「断开」会真正结束会话（`acp_disconnect` + 清空连接记录）。

## 仓库结构

```text
packages/bridge-core          Codeg HTTP/WS 客户端封装 + prompt 构建 + 协议类型
packages/browser-extension    Chrome 扩展（sidepanel / background / content 选择器）
packages/source-binder-react  Vite 插件，为 JSX 元素注入源码定位属性
packages/source-binder-vue    Vite 插件，为 .vue 模板元素注入源码定位属性（Vue 2/3 通用）
packages/ui-runtime           预留：DOM 扫描与运行时模型
packages/intent-engine        预留：move / resize / describe 意图模型
examples/react-vite-demo      可运行的 React 演示项目
docs/                         架构、ADR、指南、历史 issue 记录
```

## 前置要求

1. 一个正在运行的 Codeg Web 服务（桌面应用开启 Web 服务，或独立部署的 `codeg-server`）
   - 默认地址按 `http://127.0.0.1:23080` 配置，IP、端口、Token 全部在扩展侧边栏中填写
2. Codeg 中至少一个**已启用**的 ACP 智能体（需本机已安装对应 CLI）
3. Chrome / Edge 浏览器（Side Panel API 要求 **Chrome/Edge ≥ 114**）

## 快速开始

```bash
pnpm install
pnpm build:browser-extension
```

1. 在 Chrome `chrome://extensions` 开发者模式中加载 `packages/browser-extension/dist`
2. 打开目标页面，点击扩展图标——浏览器右侧打开侧边栏工作台（常驻，不随点击消失）
3. 填写 Codeg IP、端口、Token，点击「测试连接」确认版本号
4. 测试连接成功后，智能体与项目下拉才从 Codeg 加载（均可输入即筛选）：
   - 智能体只显示已在 Codeg 中启用的，并标注安装状态（`已安装 vX.Y` / `未安装`）
   - 项目为 Codeg 文件夹，支持按**别名 / 名称 / 路径**搜索，别名按 Codeg 惯例显示为 `别名 [原名]`，选中后路径显示在下发提示行
5. 在「目标标签页」下拉选择要控制的页面（默认预选当前活跃标签页），选择智能体与所属项目后点击「连接页面」——侧栏显示绑定状态并自动进入选择模式
6. 点击页面目标元素（选中后自动退出选择模式），在侧栏输入需求发送；也可用快捷预设（改样式 / 对齐间距 / 排查问题）一键填入

发送后，侧栏「会话」区会实时显示：

- 本次连接的**历史轮次**（打开侧栏 / 重连时按 `conversationId` 自动拉取，经 Markdown 渲染）
- 智能体的流式回复（Markdown）与思考摘要（默认折叠）
- 工具调用卡片（标题、状态、输入/输出，默认折叠）
- 权限确认 / 智能体提问 / 计划确认卡片，可直接在侧栏中点击回应
- 完成或出错状态，执行中可点击「停止」中断当前轮次

选中元素卡提供 DOM / 语义路径、Rect、源码绑定细节与复制 JSON；⧉ 一键复制源码定位（`file:line` + selector）。

侧边栏会按页面 origin 记住「项目 + 智能体」组合，同一站点下次自动预填。

## 与 Codeg 的接口对接

所有命令均为 `POST /api/<command>`，鉴权头 `Authorization: Bearer <token>`，事件通过 `GET /ws/events` 的 attach 协议推送：

| 命令 | 用途 |
| --- | --- |
| `health` | 连接测试，返回 Codeg 版本 |
| `acp_list_agents` | 拉取智能体列表（仅展示 `enabled` 的条目，安装状态取 `installed_version`） |
| `list_all_folder_details` | 拉取项目（文件夹）列表，含 `alias` 别名 |
| `acp_connect` | 按 `agentType + workingDir` 拉起会话，返回 connection id |
| `acp_prompt` | 发送结构化 UI 修改请求（含 `extra`：元素样式与控制台报错） |
| `acp_cancel` | 停止当前轮次 |
| `acp_disconnect` | 断开时真正结束 ACP 连接 |
| `acp_respond_permission` / `acp_answer_question` / `acp_answer_plan_approval` | 回应智能体的交互请求 |
| `acp_get_session_snapshot` | 获取会话状态与外部 session id |
| `acp_touch_connection` | 保活（Codeg 默认 60s 回收空闲连接） |
| `get_conversation` | 拉取会话历史轮次，供侧边栏会话区回放 |

客户端封装集中在 [`packages/bridge-core/src/codeg-api.ts`](./packages/bridge-core/src/codeg-api.ts)。

### 断线与恢复

- WebSocket 断开后按指数退避自动重连，重连时携带 `since_seq` 补齐漏掉的事件
- 连接被 Codeg 空闲回收后，下次发送会自动重连，并通过已记录的外部 session id 恢复会话历史
- 侧边栏「断开」为完全断开：通知 Codeg 结束会话并清空本地连接记录

## 源码绑定

**零配置（默认启用）**：扩展会向页面注入一个 MAIN world 探针（`probe.js`）。Vue 的 dev 构建会把组件身份挂在 DOM 上（Vue 3 的 `__vueParentComponent` / Vue 2 的 `__vue__`），点选元素时探针沿 DOM 向上找到最近组件，自动回填源码文件与组件名——**Vue 2/3 通用、不限构建工具（Vite/webpack 均可）、项目零改动**，文件级定位。仅 dev 模式页面有效。

**行级精度（可选）**：需要精确到行号时再接入 binder 插件，注入五个 `data-codeg-*` 属性后自动覆盖探针结果：

- React + Vite：[`packages/source-binder-react`](./packages/source-binder-react)
- Vue 2/Vue 3 + Vite：[`packages/source-binder-vue`](./packages/source-binder-vue)

选中元素后，发送给智能体的请求会自动包含 `sourceHint`（文件、行号、组件名），智能体可以精确定位源码；面板选中卡也会显示 `file:line`。

## 本地演示

```bash
pnpm dev:react-demo
```

启动 [examples/react-vite-demo](./examples/react-vite-demo) 后连接该页面即可验证完整链路。

## 当前限制

- 面向本地 / 内网 Codeg 服务，未做公网穿透场景优化
- Token 保存在浏览器 `chrome.storage.local`，请勿在共用机器上明文留存
- source binder 目前只覆盖 React + Vite 开发模式
- 控制台报错捕获的是页面未捕获异常与未处理的 Promise 拒绝（content script 隔离环境看不到页面自身的 `console.error` 调用）
- 图片等多媒体上下文暂未接入（Codeg 支持经 `upload_attachment` 上传后引用）
- 侧边栏为窗口级而非标签级：以「绑定页面」状态行显式指示当前控制的标签页

## 设计文档

- [ADR-002 直连 Codeg](./docs/adr/20260829-002-codeg-direct-connection.md)
- [架构说明 v0.2](./docs/architecture/20260829-codeg-direct-connection-v0.2.md)
- [面板重设计方案 v0.3](./docs/architecture/20260830-panel-redesign-v0.3.md)
- [侧边栏整合方案 v0.4（已实施 P0）](./docs/architecture/20260830-side-panel-v0.4.md)
- [本地测试指南](./docs/guides/20260320-local-testing.md)
- [项目结构指南](./docs/guides/20260320-project-structure.md)
