import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import extension, { createExtension } from "./extension.js";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

type FakePi = {
  tools: ToolDefinition[];
  events: string[];
  handlers: Map<string, (...args: unknown[]) => unknown>;
  api: ExtensionAPI;
};
function fakePi(): FakePi {
  const tools: ToolDefinition[] = [];
  const events: string[] = [];
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const api = {
    registerTool(tool: ToolDefinition) { tools.push(tool); },
    on(name: string, handler: (...args: unknown[]) => unknown) { events.push(name); handlers.set(name, handler); },
  } as unknown as ExtensionAPI;
  return { tools, events, handlers, api };
}

test("default export directly satisfies Pi's loader contract", async () => {
  const pi = fakePi();
  await extension(pi.api);
  assert.deepEqual(pi.tools.map((tool) => tool.name).sort(), ["get_available_skills", "read_skill_file", "run_skill_script"]);
  assert.deepEqual(pi.events.sort(), ["before_agent_start", "session_compact"]);
});

test("before_agent_start is registered and renders immediately after activation resolves", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "extension-ordering-"));
  try {
    const cwd = path.join(base, "workspace");
    const home = path.join(base, "home");
    const skill = path.join(cwd, ".claude", "skills", "instant");
    await fs.mkdir(skill, { recursive: true });
    await fs.mkdir(home, { recursive: true });
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: instant\ndescription: immediately available\n---\n");

    const pi = fakePi();
    await createExtension({ cwd, home, env: {} })(pi.api);
    const beforeAgentStart = pi.handlers.get("before_agent_start");
    assert.ok(beforeAgentStart);
    const options = { sections: {} as Record<string, string> };
    await beforeAgentStart({ systemPromptOptions: options });
    assert.match(options.sections["available-skills"]!, /instant/);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("createExtension injects cwd, home, and environment discovery roots", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "extension-injection-"));
  try {
    const cwd = path.join(base, "workspace");
    const home = path.join(base, "home");
    const configured = path.join(base, "configured-roots");
    await fs.mkdir(path.join(cwd, ".git"), { recursive: true });
    const writeSkill = async (root: string, name: string): Promise<void> => {
      const dir = path.join(root, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: fixture\n---\n`);
      await fs.writeFile(path.join(dir, "info.txt"), name);
    };
    await writeSkill(path.join(cwd, ".pi", "skills"), "project-native");
    await writeSkill(path.join(home, ".pi", "agent", "skills"), "user-native");
    await writeSkill(configured, "from-env");

    const pi = fakePi();
    await createExtension({ cwd, home, env: { PI_SKILLS_ROOTS: configured } })(pi.api);
    const reader = pi.tools.find((tool) => tool.name === "read_skill_file");
    assert.ok(reader);
    const execute = reader.execute as unknown as (id: string, params: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
    for (const skill of ["project-native", "user-native", "from-env"]) {
      const result = await execute("id", { skill, file: "info.txt" });
      assert.equal(result.content[0]?.text, skill);
    }
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});
