# Codeg UI Bridge 侧边栏整合方案（v0.4）

> 日期：2026-08-30
> 状态：P0 已实施（sidepanel 工作台 + Port 事件改道 + 会话历史 + Markdown + content 瘦身 + 删除 popup；P1 项待办）
> 参照：[deepseek-pp](https://github.com/zhu1090093659/deepseek-pp) —— 侧边栏为 Agent 工作台中枢，页面只留极轻入口；浏览器控制明确绑定受控标签页。

## 1. 结论先行

**整合更好，且应弃悬浮面板、改用 Chrome 侧边栏（Side Panel API）。**

popup 与悬浮面板分居两处确实割裂：popup 点外部即消失（不适合承载"工作台"）、悬浮面板漂在页面上（遮挡内容、拖拽/层级/裁剪问题不断，此前下拉截断即为例证），两端还要靠 background 中转同步状态。侧边栏一次性解决这三件事：**常驻不消失、单一大屏承载全部配置与会话、扩展页面环境无样式隔离之苦**。

## 2. 目标形态

```text
┌─ 浏览器 ──────────────────────────────────────┐
│ 页面                      │ ▎Codeg Bridge ▾   │
│                           │ ▎● 已连接 conn-12  │
│   （正常浏览/开发）        │ ▎绑定: 订单页 ⚇断开 │
│                           │ ▎────────────────  │
│   [提交订单] ←──绿色选中框 │ ▎⬚ 选择元素        │
│    └ content 只剩选框      │ ▎🎯 button·提交订单 │
│                           │ ▎📄 Order.tsx:42 ⧉ │
│                           │ ▎[需求输入……][发送▶]│
│                           │ ▎[改样式][对齐][排查]│
│                           │ ▎────────────────  │
│                           │ ▎会话（历史+实时）   │
│                           │ ▎  用户：把按钮改红  │
│                           │ ▎  AI：已完成 **样式**│
│                           │ ▎    ▸ 工具调用(2)   │
│                           │ ▎▸ 详情            │
└───────────────────────────┴───────────────────┘
        点扩展图标 = 打开侧边栏（不再弹 popup）
```

- **页面内只保留**：选择模式的高亮框（hover 蓝框 / 选中绿框）与点击拦截。悬浮输入框、会话、审批卡、DOM 视图全部移入侧边栏。
- **侧边栏自上而下**：连接状态 + 绑定标签页指示 → 配置区（IP/端口/Token、智能体、项目，沿用现有可搜索组合框与别名展示）→ 选择开关 → 选中元素卡 → 需求输入（预设 chips、样式/报错附带开关）→ **会话区（完整历史 + 实时流）** → 详情折叠。

## 3. 为什么是侧边栏

| 维度 | 现状（popup + 悬浮） | 侧边栏 |
|------|---------------------|--------|
| 常驻性 | popup 点外部即关，执行流随弹窗消失 | 常驻，边看页面边看 AI 执行 |
| 空间 | popup 480px 上限、悬浮面板遮内容 | 全高、可拖宽，流式内容好读 |
| 状态一致性 | popup / content 两处状态经 background 对账 | 单一界面单一状态源 |
| 样式工程 | content 内嵌 style，z-index/裁剪/拖拽自管 | 普通扩展页面，原生滚动与布局 |
| 与 deepseek-pp 对比 | —— | 同构：侧栏工作台 + 受控标签页绑定 |

## 4. 会话区设计（完整历史 + 实时流 + Markdown）

### 6.1 数据来源

Codeg 服务端已有现成接口，`conversationId` 早已随连接记录存档：

| 接口 | 用途 |
|------|------|
| `get_conversation`（`agentType + conversationId`） | 返回 `ConversationDetail`：完整 `turns`（role / 内容块 / 时间戳 / 耗时 / 模型） |
| `get_folder_conversation_turns`（`conversationId + before_index + limit`） | 分页拉取更早轮次（历史很长时兜底） |

bridge-core 的 `CodegClient` 增加 `getConversation()` 等对应封装即可，无服务端改动。

### 6.2 渲染模型

- **打开侧栏 / 重连时**：按当前连接的 `conversationId` 拉取历史轮次渲染（取最近 N 轮，如 50），随后挂接实时流。
- **实时流**：WS 事件照旧增量追加到"进行中"轮次；`turn_complete` 后该轮落定为历史样式。
- **轮次结构**：
  - 用户轮：显示意图正文（我们发送的结构化请求中的人话部分），可展开查看完整 payload（选中元素、源码绑定、附带样式/报错）。
  - AI 轮：Markdown 正文 + 折叠的思考块 + 工具调用卡（默认折叠，含状态与耗时）+ 轮次耗时。
- **自动滚动**：新内容时滚至底部；用户向上翻阅时暂停自动滚动（显示"回到底部"浮标）。

### 6.3 Markdown 渲染

- 引入 `marked`（解析）+ `dompurify`（消毒）两个依赖，随 esbuild 打进扩展。**AI 输出是不可信输入，消毒是信任边界上的必选项，不可省略。**
- 支持范围：标题、列表、表格、代码块（带复制按钮）、行内代码、链接（`target="_blank"` + `rel="noopener"`）、引用、粗斜体。
- 流式期间节流渲染（如 150ms 一帧或 rAF），`turn_complete` 做最终整轮渲染，避免逐 token 全量重排。

## 5. 技术要点（Chrome Side Panel API，Chrome/Edge 114+）

- manifest：`"sidePanel": { "default_path": "sidepanel.html" }` + `permissions: ["sidePanel"]`；移除 `action.default_popup`，background 启动时 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`——点图标即开侧栏。
- 侧边栏页与 background 用**长连 Port**（`chrome.runtime.connect`）双向通信：请求沿用现有 `popup*` 消息（popupGetConfig / popupSaveConfig / popupLoadCodegInfo / popupAttachPage 语义不变），事件经 Port 推送。
- **Agent 事件改道**：`forwardToAttachedTab`（tabs.sendMessage）改为转发到侧边栏 Port 集合；content 不再收流、不再渲染执行流/审批卡。
- **绑定标签页显式化**（deepseek-pp「受控标签页」模式）：侧栏显示当前绑定 tab 的标题/图标，支持切换目标 tab、断开；`tabs.query` 默认取当前活跃 tab 预填。
- **选择开关移到侧栏**：新增 `codeg/content/set-selecting` 消息，content 收令开关选择模式；选中后 content 上报（现有 `contentSelectionSync`），侧栏更新选中元素卡。
- **content.ts 大幅瘦身**：保留 hover/选中高亮框、点击拦截、sourceHint 采集；删除面板/悬浮输入框/执行流/审批卡/DOM 弹窗（DOM 视图移入侧栏，空间更大）。
- **不动**：bridge-core 全部（CodegClient、buildBridgePrompt、ApplyRequest/extra）、WS 事件泵、会话保活与恢复、`acp_*` 命令面。

## 6. 取舍与代价（明示）

1. **Chrome/Edge ≥ 114**（Side Panel API 门槛）。开发/内网场景可接受；Firefox 本就不在支持列表。
2. **悬浮输入框（就地发送）取消**：选中后需到侧栏输入。侧栏常驻在页面旁，路径其实更短；若日后怀念就地发送，可按 deepseek-pp 模式加"可选悬浮入口"，列 P2。
3. **侧栏是窗口级而非标签级**：必须靠"绑定标签页"指示消除"我此刻在控制哪个页面"的歧义——这是本方案唯一新增的认知负担，用显式状态行化解。
4. 选择模式开启期间点击拦截仍在页面发生，用户视线需在页面与侧栏间移动——与 deepseek-pp 浏览器控制一致，属可接受范式。

## 7. 实施分期

- **P0（本次）**：sidepanel 页骨架（配置区 + 连接/断开 + 绑定 tab 指示 + 选择开关 + 选中元素卡 + 需求输入 + 会话区 + 审批卡）；Port 事件改道；会话历史拉取与 Markdown 渲染（`marked` + `dompurify` 入依赖）；content 瘦身为纯选择器；manifest 切换；删除 popup。
- **P1**：历史分页加载（长会话按 `get_folder_conversation_turns` 向上翻页）；DOM 结构树移入侧栏详情；语言切换；会话区视觉完善（复制单轮、清空本地视图）。
- **P2（可选）**：可选悬浮快速入口；截图标注。

## 8. 迁移与回滚

- 存储键（`codegui.bridge.*`）与 Codeg 服务端零变更，升级即用。
- 若侧栏方案不合用，悬浮面板代码保留在 git 历史，可整体回退；bridge-core 与 background 核心不受影响。
