# source-binder-react

React + Vite 开发态源码绑定模块。

目标：给页面 DOM 节点注入 `data-codeg-source-*` 元信息，实现页面和源码的直接绑定。

## 当前已实现

开发态 Vite 插件会为 JSX/TSX 中的原生 DOM 节点注入：

- `data-codeg-source-id`
- `data-codeg-source-file`
- `data-codeg-source-line`
- `data-codeg-source-column`
- `data-codeg-component`

## 用法

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { codegSourceBinderReact } from "@pi-ui-bridge/source-binder-react";

export default defineConfig({
  plugins: [
    codegSourceBinderReact(),
    react()
  ]
});
```

## 说明

- 当前仅在 `serve` 模式生效
- 仅处理 `tsx/jsx`
- 仅处理原生 DOM 节点，不处理大写组件标签
- 已存在 `data-codeg-source-id` 的节点会跳过
