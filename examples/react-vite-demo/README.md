# react-vite-demo

最小 React + Vite 示例项目。

用于验证：

- source binder metadata 注入
- browser extension 元素选中
- Codeg UI Bridge 请求链路

## 启动

```bash
pnpm dev:react-demo
```

启动后可在页面中检查节点是否带有：

- `data-codeg-source-id`
- `data-codeg-source-file`
- `data-codeg-source-line`
- `data-codeg-source-column`
- `data-codeg-component`
