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
  api: ExtensionAPI;
};
function fakePi(): FakePi {
  const tools: ToolDefinition[] = [];
  const events: string[] = [];
  const api = {
    registerTool(tool: ToolDefinition) { tools.push(tool); },
    on(name: string) { events.push(name); },
  } as unknown as ExtensionAPI;
  return { tools, events, api };
}
async function waitForRegistration(pi: FakePi): Promise<void> {
  for (let attempt = 0; attempt < 50 && pi.tools.length === 0; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

test("default export directly satisfies Pi's loader contract", async () => {
  const pi = fakePi();
  assert.equal(extension(pi.api), undefined);
  await waitForRegistration(pi);
  assert.deepEqual(pi.tools.map((tool) => tool.name).sort(), ["get_available_skills", "read_skill_file", "run_skill_script"]);
  assert.deepEqual(pi.events.sort(), ["before_agent_start", "session_compact"]);
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
    createExtension({ cwd, home, env: { PI_SKILLS_ROOTS: configured } })(pi.api);
    await waitForRegistration(pi);
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
