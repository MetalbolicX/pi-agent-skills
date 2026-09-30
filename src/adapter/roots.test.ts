import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { getToolRoots } from "./roots.js";

test("PI_SKILLS_ROOTS overrides are tagged, advertised, and survive native-root dedupe", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "skills-roots-override-"));
  try {
    const repo = path.join(base, "repo");
    const overridePath = path.join(repo, ".agents", "skills");
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });
    const roots = await getToolRoots(repo, path.join(base, "home"), [overridePath]);
    const matches = roots.all.filter((root) => root.path === overridePath);
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.source, "override");
    assert.ok(roots.advertised.some((root) => root.path === overridePath && root.source === "override"));
    assert.ok(!roots.advertised.some((root) => root.source === "native"));
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test("tool roots include extension and Pi-native roots using the git root", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "skills-roots-"));
  try {
    await fs.mkdir(path.join(base, "repo", "nested"), { recursive: true });
    await fs.mkdir(path.join(base, "repo", ".git"));
    const roots = await getToolRoots(path.join(base, "repo", "nested"), path.join(base, "home"));
    const paths = roots.all.map((root) => root.path);
    assert.ok(paths.includes(path.join(base, "repo", ".pi", "skills")));
    assert.ok(paths.includes(path.join(base, "repo", ".agents", "skills")));
    assert.ok(paths.includes(path.join(base, "repo", ".claude", "skills")));
    assert.ok(paths.includes(path.join(base, "home", ".pi", "agent", "skills")));
    assert.ok(roots.all.some((root) => root.source === "native" && root.path.endsWith(path.join(".pi", "skills"))));
    assert.ok(roots.all.some((root) => root.source === "native" && root.path.endsWith(path.join(".pi", "agent", "skills"))));
    assert.ok(!roots.advertised.some((root) => root.source === "native" || root.source === ".agents"));
    assert.ok(roots.advertised.some((root) => root.source === ".claude"));
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});
