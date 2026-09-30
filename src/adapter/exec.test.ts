import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { createSkillStore } from "../core/store.js";
import type { SkillRoot } from "../core/types.js";
import { executeSkillScript } from "./exec.js";

async function fixture(script: string): Promise<{ base: string; store: ReturnType<typeof createSkillStore> }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "skills-exec-"));
  const dir = path.join(base, "demo");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "SKILL.md"), "---\nname: demo\ndescription: fixture\n---\n");
  await fs.writeFile(path.join(dir, "run.sh"), script, { mode: 0o755 });
  const root: SkillRoot = { path: base, scope: "project", source: "native", maxDepth: 3 };
  return { base, store: createSkillStore([root]) };
}
const config = { roots: undefined, scriptTimeoutMs: 150, debug: false };

test("exec denies unregistered scripts without spawning", async () => {
  const fixtureData = await fixture("#!/bin/sh\necho ok\n");
  try {
    let spawns = 0;
    const result = await executeSkillScript(fixtureData.store, config, "demo", "../bad.sh", [], { hasUI: false, ui: { confirm: async () => true } }, undefined, (() => { spawns += 1; throw new Error("unexpected"); }) as never);
    assert.equal(result.status, "denied");
    assert.equal(spawns, 0);
  } finally { await fs.rm(fixtureData.base, { recursive: true, force: true }); }
});

test("risk without UI and UI denial never spawn; approval executes", async () => {
  const fixtureData = await fixture("#!/bin/sh\necho curl-approved\nchmod 4755 payload || true\n");
  try {
    let spawns = 0;
    const recorder = (() => { spawns += 1; throw new Error("unexpected spawn"); }) as never;
    const noUi = await executeSkillScript(fixtureData.store, config, "demo", "run.sh", [], { hasUI: false, ui: { confirm: async () => true } }, undefined, recorder);
    assert.equal(noUi.status, "denied");
    assert.match(noUi.output, /privilege-escalation/);
    const denied = await executeSkillScript(fixtureData.store, config, "demo", "run.sh", [], { hasUI: true, ui: { confirm: async () => false } }, undefined, recorder);
    assert.equal(denied.status, "denied");
    assert.equal(spawns, 0);
    const approved = await executeSkillScript(fixtureData.store, config, "demo", "run.sh", ["literal arg"], { hasUI: true, ui: { confirm: async () => true } });
    assert.equal(approved.status, "completed");
    assert.match(approved.output, /curl-approved/);
  } finally { await fs.rm(fixtureData.base, { recursive: true, force: true }); }
});

test("exec kills timed out children", async () => {
  const fixtureData = await fixture("#!/bin/sh\nsleep 2\n");
  try {
    const result = await executeSkillScript(fixtureData.store, config, "demo", "run.sh", [], { hasUI: false, ui: { confirm: async () => true } });
    assert.equal(result.status, "timeout");
    assert.match(result.output, /timed out/i);
  } finally { await fs.rm(fixtureData.base, { recursive: true, force: true }); }
});
