import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import { parseFrontmatter, parseSkillFile } from "./frontmatter.js";
import type { DiscoveredSkillFile } from "./types.js";

const temp = await mkdtemp(path.join(tmpdir(), "pi-skills-parse-"));
after(async () => rm(temp, { recursive: true, force: true }));
const root = { path: temp, scope: "project" as const, source: ".claude" as const, maxDepth: 3 };

test("parses basic YAML scalars and optional trigger", () => {
  assert.deepEqual(parseFrontmatter('---\nname: demo\ndescription: "A demo"\ntrigger: run\n---\nbody'), { name: "demo", description: "A demo", trigger: "run" });
});

test("skips non-delimiter lines and continues parsing fields", () => {
  assert.deepEqual(parseFrontmatter("---\nname: demo\nthis is stray text\ndescription: Kept\n---\nbody"), { name: "demo", description: "Kept" });
});

test("returns warnings and skips malformed or undescribed files", async () => {
  const dir = path.join(temp, "malformed");
  await mkdir(dir);
  const filePath = path.join(dir, "SKILL.md");
  const file: DiscoveredSkillFile = { filePath, relativePath: "malformed", root };
  await writeFile(filePath, "no frontmatter");
  assert.match((await parseSkillFile(file)).warning ?? "", /Malformed/);
  await writeFile(filePath, "---\nname: demo\n---\nbody");
  assert.match((await parseSkillFile(file)).warning ?? "", /description/);
});

test("returns host-neutral skill record for valid file", async () => {
  const dir = path.join(temp, "valid");
  await mkdir(dir);
  const filePath = path.join(dir, "SKILL.md");
  await writeFile(filePath, "---\nname: valid-skill\ndescription: Good\n---\nbody");
  const result = await parseSkillFile({ filePath, relativePath: "valid", root });
  assert.equal(result.skill?.name, "valid-skill");
  assert.equal(result.skill?.skillDir, dir);
  assert.equal(result.skill?.scope, "project");
});
