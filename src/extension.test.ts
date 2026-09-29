import assert from "node:assert/strict";
import test from "node:test";
import extension from "./extension.js";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

test("default export is an extension factory", () => {
  assert.equal(typeof extension, "function");
});

test("extension registers the three skill tools", async () => {
  const tools: ToolDefinition[] = [];
  const pi = { registerTool(tool: ToolDefinition) { tools.push(tool); } } as unknown as ExtensionAPI;
  extension(pi);
  for (let attempt = 0; attempt < 50 && tools.length === 0; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["get_available_skills", "read_skill_file", "run_skill_script"]);
});
