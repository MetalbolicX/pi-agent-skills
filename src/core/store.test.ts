import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import { createSkillStore } from "./store.js";
import type { SkillRoot } from "./types.js";

const temp = await mkdtemp(path.join(tmpdir(), "pi-skills-store-"));
after(async () => rm(temp, { recursive: true, force: true }));
const root: SkillRoot = { path: path.join(temp, "root"), scope: "project", source: ".claude", maxDepth: 3 };
async function writeSkill(dir: string, name: string, description: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nbody`);
}

test("discovers skills and first root wins with duplicate warning", async () => {
  const other: SkillRoot = { ...root, path: path.join(temp, "other"), scope: "user" };
  await writeSkill(root.path, "shared", "project");
  await writeSkill(other.path, "shared", "user");
  const warnings: string[] = [];
  const store = createSkillStore([root, other], 5_000, (warning) => warnings.push(warning));
  assert.equal((await store.resolve("shared")).description, "project");
  assert.equal(warnings.length, 1);
});

test("caches within TTL, deduplicates concurrent requests, and invalidate rescans", async () => {
  await writeSkill(root.path, "alpha", "before");
  const store = createSkillStore([root], 5_000);
  const [one, two] = await Promise.all([store.all(), store.all()]);
  assert.deepEqual(one, two);
  await writeSkill(root.path, "beta", "new");
  assert.equal((await store.all()).some((skill) => skill.name === "beta"), false);
  store.invalidate();
  assert.equal((await store.all()).some((skill) => skill.name === "beta"), true);
});

test("expired TTL causes a fresh scan and summaries include trigger only when present", async () => {
  const expiringRoot: SkillRoot = { ...root, path: path.join(temp, "expiry") };
  await writeSkill(expiringRoot.path, "gamma", "old");
  const store = createSkillStore([expiringRoot], 1);
  await store.all();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await writeSkill(path.join(expiringRoot.path, "new"), "delta", "new");
  assert.ok((await store.all()).some((skill) => skill.name === "delta"));
  assert.equal((await store.summaries()).find((item) => item.name === "gamma")?.trigger, undefined);
});
