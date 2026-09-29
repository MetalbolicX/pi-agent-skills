import assert from "node:assert/strict";
import { test } from "node:test";
import type { RootsConfig, Skill } from "./types.js";

test("core records retain host-neutral root and skill metadata", () => {
  const roots: RootsConfig = { all: [], advertised: [] };
  const skill: Skill = {
    name: "demo", description: "Demo skill", path: "/skills/demo", skillDir: "/skills/demo",
    root: { path: "/skills", scope: "user", source: ".claude", maxDepth: 3 },
    scope: "user", relativePath: "demo",
  };
  assert.equal(roots.all.length, 0);
  assert.equal(skill.scope, "user");
});
