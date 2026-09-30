import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import { filterAdvertisedSkills, getDefaultRoots, rankSkills, rootsFromList } from "./discovery.js";
import type { Skill, SkillRoot } from "./types.js";

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

test("filters skills by resolved advertised roots, including overrides but excluding native roots", () => {
  const root = (rootPath: string, source: SkillRoot["source"]): SkillRoot => ({ path: rootPath, scope: "project", source, maxDepth: 3 });
  const skill = (name: string, skillRoot: SkillRoot): Skill => ({
    name,
    description: `${name} description`,
    path: path.join(skillRoot.path, name, "SKILL.md"),
    skillDir: path.join(skillRoot.path, name),
    root: skillRoot,
    scope: skillRoot.scope,
    relativePath: name,
  });
  const base = path.join(temp, "filter-roots");
  const advertised = root(path.join(base, "claude"), ".claude");
  const override = root(path.join(base, "override"), "override");
  const native = root(path.join(base, "native"), "native");
  const matchingSkill = skill("advertised", root(`${base}${path.sep}nested${path.sep}..${path.sep}claude${path.sep}`, ".claude"));
  const overrideSkill = skill("override", override);
  const nativeSkill = skill("native", native);

  assert.deepEqual(
    filterAdvertisedSkills([matchingSkill, overrideSkill, nativeSkill], [advertised, override]).map(({ name }) => name),
    ["advertised", "override"],
  );
});

test("ranks case-insensitive exact names first and combines name, trigger, and description matches deterministically", () => {
  const root: SkillRoot = { path: "/skills", scope: "project", source: ".claude", maxDepth: 3 };
  const skill = (name: string, description: string, trigger?: string): Skill => ({ name, description, ...(trigger ? { trigger } : {}), path: `/skills/${name}/SKILL.md`, skillDir: `/skills/${name}`, root, scope: root.scope, relativePath: name });
  const exact = skill("Code-Review", "Unrelated");
  const trigger = skill("audit-helper", "Unrelated", "review code security");
  const description = skill("guide", "Review code quality");
  const tieB = skill("beta", "Review tasks");
  const tieA = skill("alpha", "Review tasks");
  const exactRanked = rankSkills([description, trigger, exact, tieB, tieA], "CODE-REVIEW");
  assert.equal(exactRanked[0], exact);
  assert.ok(exactRanked.length > 1);
  assert.deepEqual(rankSkills([description, trigger], "SECURITY"), [trigger]);
  assert.deepEqual(rankSkills([description, trigger], "quality"), [description]);
  assert.deepEqual(rankSkills([tieB, tieA], "review"), [tieA, tieB]);
  assert.deepEqual(rankSkills([tieA, tieB], "review"), [tieA, tieB]);
  assert.deepEqual(rankSkills([tieA, tieB], "the and to"), []);
  assert.deepEqual(rankSkills([tieA], "unmatched"), []);
});

test("uses cwd when no git root exists", async () => {
  const cwd = path.join(temp, "plain", "nested");
  await mkdir(cwd, { recursive: true });
  const config = await getDefaultRoots(cwd, temp);
  assert.equal(config.all[0]?.path, path.join(cwd, ".claude", "skills"));
});
