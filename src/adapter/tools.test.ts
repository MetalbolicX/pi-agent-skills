import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { createSkillStore } from "../core/store.js";
import type { SkillRoot } from "../core/types.js";
import { getAvailableSkillsTool, readSkillFileTool, runSkillScriptTool } from "./tools.js";

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

test("hidden advertised skills stay readable but are excluded from discovery", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "skills-hidden-tools-"));
  try {
    const rootPath = path.join(base, ".claude", "skills");
    const hiddenDir = path.join(rootPath, "hidden-security-review");
    const visibleDir = path.join(rootPath, "visible-security-review");
    await fs.mkdir(hiddenDir, { recursive: true });
    await fs.mkdir(visibleDir, { recursive: true });
    await fs.writeFile(path.join(hiddenDir, "SKILL.md"), "---\nname: hidden-security-review\ndescription: Security review checklist\ndisable-model-invocation: true\n---\nhidden body");
    await fs.writeFile(path.join(visibleDir, "SKILL.md"), "---\nname: visible-security-review\ndescription: Security review checklist\n---\nvisible body");

    const root: SkillRoot = { path: rootPath, scope: "project", source: ".claude", maxDepth: 3 };
    const deps = { store: createSkillStore([root]), advertisedRoots: [root], config: { roots: undefined, scriptTimeoutMs: 30_000, debug: false } };
    const tool = getAvailableSkillsTool(deps);
    const listing = JSON.parse(textOf(await tool.execute("id", {}, undefined, undefined, {} as never))) as { skills: Array<{ name: string }>; pagination: { totalMatched: number; returned: number; truncated: boolean } };
    assert.deepEqual(listing.skills.map(({ name }) => name), ["visible-security-review"]);
    assert.deepEqual(listing.pagination, { totalMatched: 1, returned: 1, truncated: false });

    const queried = JSON.parse(textOf(await tool.execute("id", { query: "security review" }, undefined, undefined, {} as never))) as typeof listing;
    assert.deepEqual(queried.skills.map(({ name }) => name), ["visible-security-review"]);
    assert.deepEqual(queried.pagination, { totalMatched: 1, returned: 1, truncated: false });

    const hiddenRead = await readSkillFileTool(deps).execute("id", { skill: "hidden-security-review", file: "SKILL.md" }, undefined, undefined, {} as never);
    assert.match(textOf(hiddenRead), /hidden body/);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test("list advertises extension roots while native skills remain readable and runnable", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "skills-tools-"));
  try {
    const nativeRootPath = path.join(base, ".agents", "skills");
    const extensionRootPath = path.join(base, ".claude", "skills");
    const overrideRootPath = path.join(base, "custom", "skills");
    const nativeDir = path.join(nativeRootPath, "native-demo");
    const extensionDir = path.join(extensionRootPath, "public-demo");
    const overrideDir = path.join(overrideRootPath, "override-demo");
    await fs.mkdir(nativeDir, { recursive: true });
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.mkdir(overrideDir, { recursive: true });
    await fs.writeFile(path.join(nativeDir, "SKILL.md"), "---\nname: native-demo\ndescription: native fixture\n---\nhello");
    await fs.writeFile(path.join(nativeDir, "reference.md"), "native reference");
    const scriptPath = path.join(nativeDir, "helper.sh");
    await fs.writeFile(scriptPath, "#!/bin/sh\nprintf native-ran");
    await fs.chmod(scriptPath, 0o755);
    await fs.writeFile(path.join(extensionDir, "SKILL.md"), "---\nname: public-demo\ndescription: Security review checklist\ntrigger: inspect source\n---\nhello");
    await fs.writeFile(path.join(overrideDir, "SKILL.md"), "---\nname: override-demo\ndescription: override fixture\n---\nhello");

    const nativeRoot: SkillRoot = { path: nativeRootPath, scope: "project", source: ".agents", maxDepth: 3 };
    const extensionRoot: SkillRoot = { path: extensionRootPath, scope: "project", source: ".claude", maxDepth: 3 };
    const overrideRoot: SkillRoot = { path: overrideRootPath, scope: "project", source: "override", maxDepth: 3 };
    const config = { roots: undefined, scriptTimeoutMs: 30_000, debug: false };
    const deps = { store: createSkillStore([nativeRoot, extensionRoot, overrideRoot]), advertisedRoots: [extensionRoot, overrideRoot], config };

    const available = await getAvailableSkillsTool(deps).execute("id", {}, undefined, undefined, {} as never);
    const listing = JSON.parse(textOf(available)) as { skills: Array<{ name: string; description: string; trigger?: string; path: string; skillFile: string }>; warnings: string[]; usage: string; pagination: { totalMatched: number; returned: number; truncated: boolean } };
    assert.deepEqual(listing.skills.map((skill) => skill.name), ["public-demo", "override-demo"]);
    assert.equal(listing.skills[0]?.description, "Security review checklist");
    assert.equal(listing.skills[0]?.trigger, "inspect source");
    assert.equal(listing.skills[0]?.path, extensionDir);
    assert.equal(listing.skills[0]?.skillFile, path.join(extensionDir, "SKILL.md"));
    assert.deepEqual(listing.pagination, { totalMatched: 2, returned: 2, truncated: false });
    assert.ok(listing.warnings.length === 0);
    assert.match(listing.usage, /read_skill_file/);

    const queried = JSON.parse(textOf(await getAvailableSkillsTool(deps).execute("id", { query: "SECURITY review", limit: 1 }, undefined, undefined, {} as never))) as typeof listing;
    assert.equal(queried.skills[0]?.name, "public-demo");
    assert.deepEqual(queried.pagination, { totalMatched: 1, returned: 1, truncated: false });
    const blank = JSON.parse(textOf(await getAvailableSkillsTool(deps).execute("id", { query: "   " }, undefined, undefined, {} as never))) as typeof listing;
    assert.deepEqual(blank.skills.map(({ name }) => name), ["public-demo", "override-demo"]);
    const unmatched = JSON.parse(textOf(await getAvailableSkillsTool(deps).execute("id", { query: "quantum spaceship" }, undefined, undefined, {} as never))) as typeof listing;
    assert.deepEqual(unmatched.skills, []);
    assert.deepEqual(unmatched.pagination, { totalMatched: 0, returned: 0, truncated: false });
    const limited = JSON.parse(textOf(await getAvailableSkillsTool(deps).execute("id", { limit: 1 }, undefined, undefined, {} as never))) as typeof listing;
    assert.deepEqual(limited.pagination, { totalMatched: 2, returned: 1, truncated: true });
    const schema = getAvailableSkillsTool(deps).parameters as unknown as { properties: { query: { type: string }; limit: { minimum: number; maximum: number } } };
    assert.equal(schema.properties.query.type, "string");
    assert.equal(schema.properties.limit.minimum, 1);
    assert.equal(schema.properties.limit.maximum, 100);

    const read = await readSkillFileTool(deps).execute("id", { skill: "native-demo", file: "reference.md" }, undefined, undefined, {} as never);
    assert.equal(textOf(read), "native reference");

    const run = await runSkillScriptTool(deps).execute("id", { skill: "native-demo", script: "helper.sh" }, undefined, undefined, { hasUI: false } as never);
    assert.match(textOf(run), /native-ran/);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});
