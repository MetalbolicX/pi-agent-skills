import assert from "node:assert/strict";
import test from "node:test";
import extension from "./extension.js";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

test("default export is an extension factory", () => {
  assert.equal(typeof extension, "function");
});

test("extension registers three skill tools and both session handlers", async () => {
  const tools: ToolDefinition[] = [];
  const events: string[] = [];
  const pi = {
    registerTool(tool: ToolDefinition) { tools.push(tool); },
    on(name: string) { events.push(name); },
  } as unknown as ExtensionAPI;
  extension(pi);
  for (let attempt = 0; attempt < 50 && tools.length === 0; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["get_available_skills", "read_skill_file", "run_skill_script"]);
  assert.deepEqual(events.sort(), ["before_agent_start", "session_compact"]);
});
