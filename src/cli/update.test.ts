import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { delimiter } from "node:path";
import test from "node:test";
import { update } from "./update.js";

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-update-"));
  try { await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function setSettings(file: string, entries: unknown[]): void {
  mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ packages: entries }));
}
function output() {
  const stdout: string[] = []; const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) } };
}
function fakePi(root: string) {
  const bin = path.join(root, "bin"); mkdirSync(bin);
  const executable = path.join(bin, "pi"); writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$PI_TEST_RECORD"\nexit "${PI_TEST_EXIT:-0}"\n', { mode: 0o755 }); chmodSync(executable, 0o755);
  const oldPath = process.env.PATH; const oldRecord = process.env.PI_TEST_RECORD; const oldExit = process.env.PI_TEST_EXIT; const record = path.join(root, "calls");
  process.env.PATH = `${bin}${delimiter}${oldPath ?? ""}`; process.env.PI_TEST_RECORD = record;
  return { record, restore: () => { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; if (oldRecord === undefined) delete process.env.PI_TEST_RECORD; else process.env.PI_TEST_RECORD = oldRecord; if (oldExit === undefined) delete process.env.PI_TEST_EXIT; else process.env.PI_TEST_EXIT = oldExit; } };
}
const latest: typeof fetch = async () => ({ ok: true, json: async () => ({ version: "2.0.0" }) } as Response);

test("updates unpinned personal and project entries with scope-specific argv; explains local entries", async () => fixture(async (root) => {
  const agentDir = path.join(root, "agent"); const repo = path.join(root, "repo");
  setSettings(path.join(agentDir, "settings.json"), ["npm:pi-agent-skills"]);
  setSettings(path.join(repo, ".pi", "settings.json"), ["npm:pi-agent-skills", "../local"]);
  mkdirSync(path.join(repo, "local")); writeFileSync(path.join(repo, "local", "package.json"), JSON.stringify({ name: "pi-agent-skills" }));
  const fake = fakePi(root); const out = output();
  try {
    assert.equal(await update({ agentDir, cwd: repo, repoRoot: repo, fetch: latest, io: out.io }), 0);
    assert.deepEqual(readFileSync(fake.record, "utf8").trim().split("\n"), ["update npm:pi-agent-skills", "update npm:pi-agent-skills --local"]);
    assert.ok(out.stdout.some((line) => line.includes("tracks the working tree; nothing to fetch")));
  } finally { fake.restore(); }
}));

test("pinned npm entries only print stale or unconfirmed hints; git sources update", async () => fixture(async (root) => {
  const agentDir = path.join(root, "agent");
  setSettings(path.join(agentDir, "settings.json"), ["npm:pi-agent-skills@1.0.0", "git:github.com/example/pi-agent-skills.git"]);
  const fake = fakePi(root); const out = output();
  try {
    assert.equal(await update({ agentDir, fetch: latest, io: out.io }), 0);
    assert.deepEqual(readFileSync(fake.record, "utf8").trim().split("\n"), ["update git:github.com/example/pi-agent-skills.git"]);
    assert.ok(out.stdout.some((line) => line.includes("run: pi-skills install -v 2.0.0")));
  } finally { fake.restore(); }
  setSettings(path.join(agentDir, "settings.json"), ["npm:pi-agent-skills@1.0.0"]);
  const pinned = output();
  assert.equal(await update({ agentDir, fetch: async () => ({ ok: false, json: async () => ({}) } as Response), io: pinned.io }), 0);
  assert.ok(pinned.stdout.some((line) => line.includes("registry unreachable — could not confirm a newer version")));
  const current = output();
  assert.equal(await update({ agentDir, fetch: async () => ({ ok: true, json: async () => ({ version: "1.0.0" }) } as Response), io: current.io }), 0);
  assert.ok(current.stdout.some((line) => line.includes("registry confirms the pin is current")));
}));

test("propagates pi update failure with a failure line and source-specific argv", async () => fixture(async (root) => {
  const agentDir = path.join(root, "agent");
  setSettings(path.join(agentDir, "settings.json"), ["git:github.com/example/pi-agent-skills"]);
  const fake = fakePi(root); const out = output();
  process.env.PI_TEST_EXIT = "7";
  try {
    assert.equal(await update({ agentDir, io: out.io }), 7);
    assert.deepEqual(readFileSync(fake.record, "utf8").trim(), "update git:github.com/example/pi-agent-skills");
    assert.deepEqual(out.stderr, ["pi-skills: failed to update git:github.com/example/pi-agent-skills (exit 7)"]);
  } finally { fake.restore(); }
}));

test("dry-run prints intended command without spawning pi", async () => fixture(async (root) => {
  const agentDir = path.join(root, "agent"); setSettings(path.join(agentDir, "settings.json"), ["npm:pi-agent-skills"]);
  const fake = fakePi(root); const out = output();
  try {
    assert.equal(await update({ agentDir, dryRun: true, fetch: latest, io: out.io }), 0);
    assert.deepEqual(out.stdout, ["[dry-run] Would run: pi update npm:pi-agent-skills"]);
    assert.equal(existsSync(fake.record), false);
  } finally { fake.restore(); }
}));
