import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSkillStore } from "../core/store.js";
import type { SkillRoot } from "../core/types.js";
import { registerInjection, renderAvailableSkillsBlock } from "./injection.js";

const temp = await mkdtemp(path.join(os.tmpdir(), "skills-injection-"));
after(async () => rm(temp, { recursive: true, force: true }));

async function writeSkill(root: string, name: string, description: string): Promise<void> {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n`);
}

test("renderer includes advertised details and returns empty for no skills", () => {
  const rendered = renderAvailableSkillsBlock([{ name: "demo", description: "Useful demo", path: "/skills/demo/SKILL.md" }]);
  assert.match(rendered, /demo/);
  assert.match(rendered, /Useful demo/);
  assert.match(rendered, /\/skills\/demo\/SKILL.md/);
  assert.equal(renderAvailableSkillsBlock([]), "");
});

test("injection advertises only selected roots, overwrites its stable section, and compact invalidates the store", async () => {
  const advertisedPath = path.join(temp, "claude");
  const nativePath = path.join(temp, "agents");
  const advertised: SkillRoot = { path: advertisedPath, scope: "project", source: ".claude", maxDepth: 3 };
  const native: SkillRoot = { path: nativePath, scope: "project", source: ".agents", maxDepth: 3 };
  await writeSkill(advertisedPath, "external", "External skill");
  await writeSkill(nativePath, "native", "Native skill");
  const store = createSkillStore([advertised, native]);
  type PromptEvent = { systemPromptOptions: { sections: Record<string, string> } };
  const handlers = new Map<string, (event: PromptEvent) => unknown>();
  const pi = { on(name: string, handler: (event: PromptEvent) => unknown) { handlers.set(name, handler); } } as unknown as ExtensionAPI;
  registerInjection(pi, { store, advertisedRoots: [advertised] });
  const event = () => ({ systemPromptOptions: { sections: {} as Record<string, string> } });
  const first = event();
  await handlers.get("before_agent_start")?.(first);
  const firstBlock = first.systemPromptOptions.sections["available-skills"];
  assert.ok(firstBlock);
  assert.match(firstBlock, /external/);
  assert.doesNotMatch(firstBlock, /^- native$/m);
  const second = event();
  await handlers.get("before_agent_start")?.(second);
  assert.deepEqual(Object.keys(second.systemPromptOptions.sections), ["available-skills"]);
  assert.equal(second.systemPromptOptions.sections["available-skills"], first.systemPromptOptions.sections["available-skills"]);
  await writeSkill(advertisedPath, "after-compact", "Added after compact");
  await handlers.get("session_compact")?.({ systemPromptOptions: { sections: {} } });
  assert.deepEqual((await store.all()).map((skill) => skill.name).sort(), ["after-compact", "external", "native"]);
});

test("empty advertised results leave the section unset and clear stale content", async () => {
  const skillRoot: SkillRoot = { path: path.join(temp, "empty-advertised"), scope: "project", source: ".claude", maxDepth: 3 };
  const store = createSkillStore([skillRoot]);
  type PromptEvent = { systemPromptOptions: { sections: Record<string, string> } };
  const handlers = new Map<string, (event: PromptEvent) => unknown>();
  const pi = { on(name: string, handler: (event: PromptEvent) => unknown) { handlers.set(name, handler); } } as unknown as ExtensionAPI;
  registerInjection(pi, { store, advertisedRoots: [] });
  const empty = { systemPromptOptions: { sections: {} as Record<string, string> } };
  await handlers.get("before_agent_start")?.(empty);
  assert.equal(empty.systemPromptOptions.sections["available-skills"], undefined);
  const stale = { systemPromptOptions: { sections: { "available-skills": "stale" } } };
  await handlers.get("before_agent_start")?.(stale);
  assert.equal(stale.systemPromptOptions.sections["available-skills"], undefined);
});
