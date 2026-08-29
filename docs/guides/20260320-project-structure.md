# 项目初始化结构说明

> v0.2 起移除了 Pi 扩展宿主与 Pi skills，扩展直连 Codeg Web 服务。

## 顶层目录

- `docs/`：架构、ADR、Issue、PR、指南
- `packages/`：可复用代码模块
- `examples/`：示例项目

## 当前目录规划

```text
packages/bridge-core/           Codeg 客户端封装 + prompt 构建 + 协议类型
packages/browser-extension/     Chrome 扩展（popup / background / overlay）
packages/intent-engine/         预留：意图模型
packages/ui-runtime/            预留：DOM 扫描与运行时模型
packages/source-binder-react/   Vite 源码绑定插件
examples/react-vite-demo/       演示项目
```

## 设计原则

1. 浏览器扩展是唯一入口，直连 Codeg Web 服务，本地无常驻进程
2. Codeg 客户端封装收敛在 `bridge-core/codeg-api.ts`，协议变化只改一处
3. Browser extension 与 bridge 协议解耦
4. Source binder 独立成包，不塞进 overlay
