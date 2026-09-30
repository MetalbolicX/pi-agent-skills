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
    await fs.writeFile(path.join(extensionDir, "SKILL.md"), "---\nname: public-demo\ndescription: extension fixture\n---\nhello");
    await fs.writeFile(path.join(overrideDir, "SKILL.md"), "---\nname: override-demo\ndescription: override fixture\n---\nhello");

    const nativeRoot: SkillRoot = { path: nativeRootPath, scope: "project", source: ".agents", maxDepth: 3 };
    const extensionRoot: SkillRoot = { path: extensionRootPath, scope: "project", source: ".claude", maxDepth: 3 };
    const overrideRoot: SkillRoot = { path: overrideRootPath, scope: "project", source: "override", maxDepth: 3 };
    const config = { roots: undefined, scriptTimeoutMs: 30_000, debug: false };
    const deps = { store: createSkillStore([nativeRoot, extensionRoot, overrideRoot]), advertisedRoots: [extensionRoot, overrideRoot], config };

    const available = await getAvailableSkillsTool(deps).execute("id", {}, undefined, undefined, {} as never);
    const listing = JSON.parse(textOf(available)) as { skills: Array<{ name: string }> };
    assert.deepEqual(listing.skills.map((skill) => skill.name), ["public-demo", "override-demo"]);

    const read = await readSkillFileTool(deps).execute("id", { skill: "native-demo", file: "reference.md" }, undefined, undefined, {} as never);
    assert.equal(textOf(read), "native reference");

    const run = await runSkillScriptTool(deps).execute("id", { skill: "native-demo", script: "helper.sh" }, undefined, undefined, { hasUI: false } as never);
    assert.match(textOf(run), /native-ran/);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});
