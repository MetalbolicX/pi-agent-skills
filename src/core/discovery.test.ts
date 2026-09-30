import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import { getDefaultRoots, rootsFromList } from "./discovery.js";
import type { SkillRoot } from "./types.js";

const temp = await mkdtemp(path.join(tmpdir(), "pi-skills-roots-"));
after(async () => rm(temp, { recursive: true, force: true }));

test("computes project roots from git root and user roots from home", async () => {
  const repo = path.join(temp, "repo");
  const cwd = path.join(repo, "nested", "work");
  const home = path.join(temp, "home");
  await mkdir(path.join(repo, ".git"), { recursive: true });
  const config = await getDefaultRoots(cwd, home);
  assert.equal(config.all.length, 9);
  assert.equal(config.all[0]?.path, path.join(repo, ".claude", "skills"));
  assert.equal(config.all[4]?.path, path.join(home, ".claude", "skills"));
  assert.equal(config.all[8]?.path, path.join(home, ".config", "opencode", "skills"));
  assert.ok(!config.advertised.some((root) => root.source === ".agents"));
  assert.equal(config.advertised.length, 7);
});

test("advertises only extension roots when composing a mixed root list", () => {
  const root = (source: SkillRoot["source"]): SkillRoot => ({ path: `/${source}/skills`, scope: "project", source, maxDepth: 3 });
  const config = rootsFromList([root("native"), root(".agents"), root(".claude"), root(".codex"), root(".opencode"), root("opencode-config"), root("override")]);
  assert.deepEqual(config.advertised.map((item) => item.source), [".claude", ".codex", ".opencode", "opencode-config", "override"]);
  assert.equal(config.all.length, 7);
});

test("uses cwd when no git root exists", async () => {
  const cwd = path.join(temp, "plain", "nested");
  await mkdir(cwd, { recursive: true });
  const config = await getDefaultRoots(cwd, temp);
  assert.equal(config.all[0]?.path, path.join(cwd, ".claude", "skills"));
});
