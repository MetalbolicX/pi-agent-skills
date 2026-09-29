import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/extension.ts",
  output: {
    file: "dist/extension.js",
    format: "esm",
  },
  platform: "node",
  external: ["node:*", "@earendil-works/pi-coding-agent", "typebox"],
  minify: false,
});
