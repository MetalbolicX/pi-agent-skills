import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { delimiter } from "node:path";
import test from "node:test";
import { install } from "./install.js";

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-install-"));
  try { await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function setupPi(root: string): { record: string; restore: () => void } {
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const executable = path.join(bin, "pi");
  writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$PI_TEST_RECORD"\nexit "${PI_TEST_EXIT:-0}"\n', { mode: 0o755 });
  chmodSync(executable, 0o755);
  const oldPath = process.env.PATH;
  const oldRecord = process.env.PI_TEST_RECORD;
  const oldExit = process.env.PI_TEST_EXIT;
  const record = path.join(root, "calls");
  process.env.PATH = `${bin}${delimiter}${oldPath ?? ""}`;
  process.env.PI_TEST_RECORD = record;
  delete process.env.PI_TEST_EXIT;
  return { record, restore: () => {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldRecord === undefined) delete process.env.PI_TEST_RECORD; else process.env.PI_TEST_RECORD = oldRecord;
    if (oldExit === undefined) delete process.env.PI_TEST_EXIT; else process.env.PI_TEST_EXIT = oldExit;
  } };
}

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) } };
}

function setSettings(agentDir: string, packages: unknown[]): void {
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages }));
}

test("dedupes pinned and unpinned entries before installing", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    setSettings(agentDir, ["npm:pi-agent-skills@0.1.0", "npm:pi-agent-skills", "npm:other"]);
    const fake = setupPi(root);
    const out = output();
    try {
      assert.equal(await install({ agentDir, io: out.io }), 0);
      assert.deepEqual(readFileSync(fake.record, "utf8").trim().split("\n"), [
        "remove npm:pi-agent-skills@0.1.0", "remove npm:pi-agent-skills", "install npm:pi-agent-skills",
      ]);
      assert.deepEqual(out.stdout, ["✓ Installed npm:pi-agent-skills (removed 2 stale entries)", "tip: Run pi-skills doctor"]);
    } finally { fake.restore(); }
  });
});

test("passes local scope through and treats latest as the unpinned alias", async () => {
  await fixture(async (root) => {
    const repo = path.join(root, "repo");
    const agentDir = path.join(root, "agent");
    mkdirSync(path.join(repo, ".pi"), { recursive: true });
    writeFileSync(path.join(repo, ".pi", "settings.json"), JSON.stringify({ packages: ["npm:pi-agent-skills"] }));
    const fake = setupPi(root);
    try {
      assert.equal(await install({ local: true, latest: true, cwd: repo, repoRoot: repo, agentDir, io: output().io }), 0);
      assert.deepEqual(readFileSync(fake.record, "utf8").trim().split("\n"), ["remove npm:pi-agent-skills --local", "install npm:pi-agent-skills --local"]);
    } finally { fake.restore(); }
  });
});

test("passes arbitrary version text through as the npm spec", async () => {
  await fixture(async (root) => {
    const fake = setupPi(root);
    try {
      assert.equal(await install({ agentDir: path.join(root, "agent"), version: "not semver", io: output().io }), 0);
      assert.equal(readFileSync(fake.record, "utf8").trim(), "install npm:pi-agent-skills@not semver");
    } finally { fake.restore(); }
  });
});

test("fresh install runs only install", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    setSettings(agentDir, ["npm:other"]);
    const fake = setupPi(root);
    try {
      assert.equal(await install({ agentDir, io: output().io }), 0);
      assert.equal(readFileSync(fake.record, "utf8").trim(), "install npm:pi-agent-skills");
    } finally { fake.restore(); }
  });
});

test("a failed dedupe remove stops before install and propagates its exit code", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    setSettings(agentDir, ["npm:pi-agent-skills"]);
    const fake = setupPi(root);
    const out = output();
    process.env.PI_TEST_EXIT = "3";
    try {
      assert.equal(await install({ agentDir, io: out.io }), 3);
      assert.equal(readFileSync(fake.record, "utf8").trim(), "remove npm:pi-agent-skills");
      assert.deepEqual(out.stderr, ["pi-skills: failed to remove npm:pi-agent-skills (exit 3)"]);
    } finally { fake.restore(); }
  });
});

test("unreadable settings warns once and proceeds with plain install", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    mkdirSync(path.join(agentDir, "settings.json"), { recursive: true });
    const fake = setupPi(root);
    const out = output();
    try {
      assert.equal(await install({ agentDir, io: out.io }), 0);
      assert.deepEqual(readFileSync(fake.record, "utf8").trim().split("\n"), ["install npm:pi-agent-skills"]);
      assert.equal(out.stderr.length, 1);
      assert.match(out.stderr[0] ?? "", /^pi-skills: could not read settings \(.+settings\.json\): .+; skipping dedupe check$/);
    } finally { fake.restore(); }
  });
});

test("dry-run prints ordered commands and never starts fake pi", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    setSettings(agentDir, ["npm:pi-agent-skills@1.0.0"]);
    const fake = setupPi(root);
    const lines: string[] = [];
    const oldLog = console.log;
    console.log = (line?: unknown) => lines.push(String(line));
    try {
      assert.equal(await install({ agentDir, dryRun: true, io: output().io }), 0);
      assert.deepEqual(lines, [
        "[dry-run] Would run: pi remove npm:pi-agent-skills@1.0.0",
        "[dry-run] Would run: pi install npm:pi-agent-skills",
      ]);
      assert.equal(outExists(fake.record), false);
    } finally { console.log = oldLog; fake.restore(); }
  });
});

function outExists(file: string): boolean {
  try { readFileSync(file); return true; } catch { return false; }
}
