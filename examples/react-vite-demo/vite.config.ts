import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { codegSourceBinderReact } from "../../packages/source-binder-react/src/index";

export default defineConfig({
  plugins: [codegSourceBinderReact(), react()]
});
