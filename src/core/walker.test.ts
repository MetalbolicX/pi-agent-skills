import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import { findSkillFiles, walkDir } from "./walker.js";

const temp = await mkdtemp(path.join(tmpdir(), "pi-skills-walk-"));
after(async () => rm(temp, { recursive: true, force: true }));

test("walk skips hidden/dependency directories, limits depth and isolates visitor errors", async () => {
  await mkdir(path.join(temp, "visible", "deep"), { recursive: true });
  await mkdir(path.join(temp, ".hidden"), { recursive: true });
  await mkdir(path.join(temp, "node_modules", "dep"), { recursive: true });
  await writeFile(path.join(temp, "visible", "deep", "file"), "x");
  const visited: string[] = [];
  await walkDir(temp, 1, (entry) => { if (entry.name === "visible") throw new Error("skip child"); visited.push(entry.name); });
  assert.ok(!visited.some((name) => name === ".hidden" || name === "node_modules" || name === "deep"));
});

test("finds root and nested SKILL.md up to depth three in sorted order", async () => {
  const root = path.join(temp, "skills");
  await mkdir(path.join(root, "z", "nested"), { recursive: true });
  await mkdir(path.join(root, "a"), { recursive: true });
  await writeFile(path.join(root, "SKILL.md"), "root");
  await writeFile(path.join(root, "z", "SKILL.md"), "z");
  await writeFile(path.join(root, "z", "nested", "SKILL.md"), "nested");
  assert.deepEqual((await findSkillFiles(root)).map((file) => path.relative(root, path.dirname(file))), ["", path.join("z", "nested"), "z"]);
});

test("does not recurse into symlinked directories", async () => {
  const root = path.join(temp, "symlink");
  await mkdir(path.join(root, "real"), { recursive: true });
  await writeFile(path.join(root, "real", "SKILL.md"), "skill");
  await symlink(path.join(root, "real"), path.join(root, "alias"), "dir");
  const files = await findSkillFiles(root);
  assert.deepEqual(files, [path.join(root, "real", "SKILL.md")]);
});

test("discovers a skill at the depth boundary but not beyond it", async () => {
  const root = path.join(temp, "depth-boundary");
  await mkdir(path.join(root, "boundary"), { recursive: true });
  await mkdir(path.join(root, "boundary", "beyond"), { recursive: true });
  await writeFile(path.join(root, "boundary", "SKILL.md"), "boundary");
  await writeFile(path.join(root, "boundary", "beyond", "SKILL.md"), "beyond");
  const files = await findSkillFiles(root, 0);
  assert.deepEqual(files, [path.join(root, "boundary", "SKILL.md")]);
});
