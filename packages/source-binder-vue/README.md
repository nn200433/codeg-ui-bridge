# @codeg-ui-bridge/source-binder-vue

Vite 开发期插件：为 `.vue` 模板中的元素注入源码定位属性，供 Codeg UI Bridge 选中元素时回传 `sourceHint`（文件、行号、组件名）。**Vue 2 / Vue 3 通用**——插件不依赖任何 Vue 编译器，只是把 `data-codeg-*` 静态属性写进模板源码，两代编译器都会原样输出到 DOM。

> **不接插件也有保底**：扩展内置的运行时探针会在 Vue dev 页面上自动提供**文件级**定位（零项目改动、不限构建工具）。本插件的价值是**行级精度**（精确到 `.vue:行:列`），按需接入。

## 接入步骤（手把手）

> **前提**：你的项目用 **Vite** 构建（项目根目录有 `vite.config.ts` 或 `vite.config.js`）。
> 老 Vue CLI（webpack）工程不适用，本文末尾有说明。

假设：

- 本仓库位于 `D:\IDEA\project_ai\codeg-ui-bridge`
- 你的 Vue 项目位于 `D:\IDEA\project\hf-fbjwy`（下文路径请按你的实际位置替换）

### 第 1 步：让项目能找到插件（二选一）

**方案 A：直接引用源码，零安装（推荐先用它验证）**

不改你项目的任何依赖，只在 `vite.config.ts` 里用**相对路径** import 本仓库的源文件：

```ts
// D:\IDEA\project\hf-fbjwy\vite.config.ts
// 相对路径 = 从你的项目出发，走到 codeg-ui-bridge 里的 index.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue"; // Vue2 项目则是 vite-plugin-vue2 提供的插件
import { codegSourceBinderVue } from "../../project_ai/codeg-ui-bridge/packages/source-binder-vue/src/index";

export default defineConfig({
  plugins: [codegSourceBinderVue(), vue()]
});
```

**方案 B：装成本地依赖（多个项目长期复用时用）**

在你的 Vue 项目根目录执行：

```bash
# pnpm 项目
pnpm add -D "file:../../../project_ai/codeg-ui-bridge/packages/source-binder-vue"
# npm / yarn 项目
npm add -D "file:../../../project_ai/codeg-ui-bridge/packages/source-binder-vue"
```

然后 `vite.config.ts` 里就能按包名引用：

```ts
import { codegSourceBinderVue } from "@codeg-ui-bridge/source-binder-vue";
```

> 两种方案都是引用 TypeScript 源码，Vite 加载 `vite.config.ts` 时自带 TS 编译，无需本包预先构建。

### 第 2 步：在 plugins 里注册（放在 vue 插件前面）

插件的 `enforce: "pre"` 已自动保证它先于 vue 插件执行，你只需把它写进数组：

**Vue 3 项目**（`@vitejs/plugin-vue`）：

```ts
export default defineConfig({
  plugins: [codegSourceBinderVue(), vue()]
});
```

**Vue 2 + Vite 项目**（`vite-plugin-vue2` / `@vitejs/plugin-vue2`）：

```ts
import { createVuePlugin } from "vite-plugin-vue2";

export default defineConfig({
  plugins: [codegSourceBinderVue(), createVuePlugin()]
});
```

### 第 3 步：重启开发服务器

插件只在 **dev 模式**生效。改动 `vite.config.ts` 后必须完全重启：

```bash
# Ctrl+C 停掉当前 dev server，然后
pnpm dev   # 或 npm run dev / yarn dev
```

### 第 4 步：验证生效

任选其一：

- **看 DOM**：浏览器 DevTools 里选中页面任意元素，Elements 面板应看到一串属性：

  ```html
  <div
    data-codeg-source-id="src/views/Knowledge.vue:42:9"
    data-codeg-source-file="src/views/Knowledge.vue"
    data-codeg-source-line="42"
    data-codeg-source-column="9"
    data-codeg-component="Knowledge"
    class="tree-panel-body"
  >
  ```

- **用扩展**：打开 Codeg UI Bridge 侧边栏 → 点选页面元素 → 面板 chip 显示
  `📄 src/views/Knowledge.vue:42`，发送的提示语里出现 `源码: src/views/Knowledge.vue:42` 行——智能体将直读该文件，不再按文本检索。

## 常见问题

- **元素上看不到 `data-codeg-*` 属性？**
  按顺序检查：① 项目确实是 Vite（有 `vite.config.ts`），不是老 Vue CLI；② `vite.config.ts` 改完后 dev server 已完全重启；③ 方案 A 的相对路径写对（从 `vite.config.ts` 所在目录算起）。
- **模板用了 `lang="pug"`？** 插件会自动跳过该文件（非 HTML 模板无法打点）。
- **生产构建会带上这些属性吗？** 不会。插件 `apply: "serve"`，只在 dev 生效。
- **`<template>`/`<transition>` 这类标签会注入吗？** 不会，它们不直接产出 DOM；PascalCase 组件标签也跳过。
- **webpack 的老 Vue CLI 工程怎么办？** 暂不支持（与 React 版同限）。可考虑迁移 Vite，或接受该工程内 agent 按文本检索。

## 行为细节

- 每个模板元素注入后形如上例；行号列号是元素在 **`.vue` 文件**中的位置。
- 注释、`{{ }}` 插值、属性字符串里长得像标签的文本一律不会误注入。
- ponytail 提示：Vue 2 kebab-case 组件标签（如 `<tree-panel>`）与原生标签无法区分，也会被注入——属性透传后定位可能指向使用处而非定义处，属可接受的噪音。
