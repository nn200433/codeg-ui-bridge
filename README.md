# Codeg UI Bridge

Codeg UI Bridge 是一个浏览器与 [Codeg](https://github.com/xintaofei/codeg) 之间的 UI-to-code bridge。

它可以让你：

- 在浏览器里直接选中真实页面元素
- 输入你希望的 UI 修改需求
- 把结构化页面上下文通过 Codeg Web 服务发给任意 ACP 智能体（默认 `pi`）
- 基于 source binder 元信息把页面节点绑定回代码位置
- 在页面面板里实时看到智能体的流式回复、工具调用，并可随时停止

## 架构

```text
浏览器扩展（content overlay + MV3 background）
   │  HTTP:  POST http://{ip}:{port}/api/<command>   Authorization: Bearer <token>
   │  WS:    ws://{ip}:{port}/ws/events              子协议: codeg-events + codeg-token.<base64url(token)>
   ▼
Codeg Web 服务（桌面应用内置或独立 codeg-server）
   │  acp_connect 拉起 ACP 子进程
   ▼
pi / claude_code / codex / gemini / ... 任意 Agent CLI
```

本仓库不包含任何智能体宿主逻辑：扩展直连 Codeg 的 Web 服务，Codeg 负责拉起并管理智能体进程。

## 仓库结构

```text
packages/bridge-core          Codeg HTTP/WS 客户端封装 + prompt 构建 + 协议类型
packages/browser-extension    Chrome 扩展（popup / background / overlay）
packages/source-binder-react  Vite 插件，为 JSX 元素注入源码定位属性
packages/ui-runtime           预留：DOM 扫描与运行时模型
packages/intent-engine        预留：move / resize / describe 意图模型
examples/react-vite-demo      可运行的 React 演示项目
docs/                         架构、ADR、指南、历史 issue 记录
```

## 前置要求

1. 一个正在运行的 Codeg Web 服务（桌面应用开启 Web 服务，或独立部署的 `codeg-server`）
   - 默认地址按 `http://127.0.0.1:23080` 配置，IP、端口、Token 全部在扩展 popup 中填写
2. Codeg 中至少一个可用的 ACP 智能体（推荐 `pi`，需本机已安装对应 CLI）
3. Chrome / Edge 浏览器

## 快速开始

```bash
pnpm install
pnpm build:browser-extension
```

1. 在 Chrome `chrome://extensions` 开发者模式中加载 `packages/browser-extension/dist`
2. 打开目标页面，点击扩展图标
3. 填写 Codeg IP、端口、Token，点击「测试连接」确认版本号
4. 测试连接成功后，智能体与项目下拉才会从 Codeg 加载（均支持输入筛选）：
   - 智能体只显示已在 Codeg 中启用的（未启用的不会出现，避免选中未安装的 CLI）
   - 项目为 Codeg 文件夹列表，也可在「手动输入项目路径」中直接填路径
5. 选择智能体与该页面所属的项目
6. 点击「连接页面」——页面右上方出现 overlay 面板
7. 开启选择模式，点击目标元素，在 inline 输入框或面板中输入需求并发送

发送后，面板的「执行流」区域会通过 WebSocket 实时显示：

- 智能体的流式回复与思考摘要（默认折叠）
- 工具调用卡片（标题、状态、输出）
- 权限确认 / 智能体提问 / 计划确认卡片，可直接在面板中点击回应
- 完成或出错状态，执行中可点击「停止」中断当前轮次

popup 会按页面 origin 记住「项目 + 智能体」组合，同一站点下次自动预填。

## 与 Codeg 的接口对接

所有命令均为 `POST /api/<command>`，鉴权头 `Authorization: Bearer <token>`，事件通过 `GET /ws/events` 的 attach 协议推送：

| 命令 | 用途 |
| --- | --- |
| `health` | 连接测试，返回 Codeg 版本 |
| `acp_list_agents` | 拉取可用智能体列表 |
| `list_all_folder_details` | 拉取项目（文件夹）列表 |
| `open_folder` | 手动输入路径时登记项目 |
| `acp_connect` | 按 `agentType + workingDir` 拉起会话，返回 connection id |
| `acp_prompt` | 发送结构化 UI 修改请求 |
| `acp_cancel` | 停止当前轮次 |
| `acp_respond_permission` / `acp_answer_question` / `acp_answer_plan_approval` | 回应智能体的交互请求 |
| `acp_get_session_snapshot` | 获取会话状态与外部 session id |
| `acp_touch_connection` | 保活（Codeg 默认 60s 回收空闲连接） |

客户端封装集中在 [`packages/bridge-core/src/codeg-api.ts`](./packages/bridge-core/src/codeg-api.ts)。

### 断线与恢复

- WebSocket 断开后按指数退避自动重连，重连时携带 `since_seq` 补齐漏掉的事件
- 连接被 Codeg 空闲回收后，下次发送会自动重连，并通过已记录的外部 session id 恢复会话历史

## 源码绑定

React + Vite 项目接入 [`packages/source-binder-react`](./packages/source-binder-react) 后，开发模式下每个 JSX 元素会带上：

- `data-codeg-source-id`
- `data-codeg-source-file`
- `data-codeg-source-line`
- `data-codeg-source-column`
- `data-codeg-component`

选中元素后，发送给智能体的请求会自动包含 `sourceHint`（文件、行号、组件名），智能体可以精确定位源码。使用方式见 [source-binder-react README](./packages/source-binder-react/README.md)。

## 本地演示

```bash
pnpm dev:react-demo
```

启动 [examples/react-vite-demo](./examples/react-vite-demo) 后连接该页面即可验证完整链路。

## 当前限制

- 面向本地 / 内网 Codeg 服务，未做公网穿透场景优化
- Token 保存在浏览器 `chrome.storage.local`，请勿在共用机器上明文留存
- source binder 目前只覆盖 React + Vite 开发模式
- 图片等多媒体上下文暂未接入（Codeg 支持经 `upload_attachment` 上传后引用）

## 设计文档

- [ADR-002 直连 Codeg](./docs/adr/20260829-002-codeg-direct-connection.md)
- [架构说明 v0.2](./docs/architecture/20260829-codeg-direct-connection-v0.2.md)
- [本地测试指南](./docs/guides/20260320-local-testing.md)
- [项目结构指南](./docs/guides/20260320-project-structure.md)
