import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { delimiter } from "node:path";
import test from "node:test";
import { uninstall } from "./uninstall.js";

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-uninstall-"));
  try { await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function setupPi(root: string): { record: string; restore: () => void } {
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const executable = path.join(bin, "pi");
  writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$PI_TEST_RECORD"\nif [ "$1" = "remove" ] && [ "$2" = "npm:pi-agent-skills@bad" ]; then exit 4; fi\nexit 0\n', { mode: 0o755 });
  chmodSync(executable, 0o755);
  const oldPath = process.env.PATH;
  const oldRecord = process.env.PI_TEST_RECORD;
  const record = path.join(root, "calls");
  process.env.PATH = `${bin}${delimiter}${oldPath ?? ""}`;
  process.env.PI_TEST_RECORD = record;
  return { record, restore: () => {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldRecord === undefined) delete process.env.PI_TEST_RECORD; else process.env.PI_TEST_RECORD = oldRecord;
  } };
}

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) } };
}

function personalSettings(agentDir: string, packages: unknown[]): void {
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages }));
}

test("removes npm, git, and confirmed local entries in settings order", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    const local = path.join(root, "local");
    mkdirSync(local);
    writeFileSync(path.join(local, "package.json"), JSON.stringify({ name: "pi-agent-skills" }));
    personalSettings(agentDir, ["npm:pi-agent-skills@1.0.0", "git:github.com/example/pi-agent-skills.git", local]);
    const fake = setupPi(root);
    const out = output();
    try {
      assert.equal(await uninstall({ agentDir, io: out.io }), 0);
      assert.deepEqual(readFileSync(fake.record, "utf8").trim().split("\n"), [
        "remove npm:pi-agent-skills@1.0.0", "remove git:github.com/example/pi-agent-skills.git", `remove ${local}`,
      ]);
      assert.deepEqual(out.stdout, ["✓ Uninstalled 3 entries"]);
    } finally { fake.restore(); }
  });
});

test("unrecognized local entries warn but are not removed", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    personalSettings(agentDir, ["./missing-package"]);
    const fake = setupPi(root);
    const out = output();
    try {
      assert.equal(await uninstall({ agentDir, io: out.io }), 0);
      assert.deepEqual(out.stdout, ["✓ Not installed"]);
      assert.equal(out.stderr.length, 1);
      assert.match(out.stderr[0] ?? "", /^pi-skills: not removing unrecognized local entry \.\/missing-package \(/);
      assert.equal(existsSync(fake.record), false);
    } finally { fake.restore(); }
  });
});

test("continues after a removal failure and reports partial failure", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    personalSettings(agentDir, ["npm:pi-agent-skills@bad", "npm:pi-agent-skills"]);
    const fake = setupPi(root);
    const out = output();
    try {
      assert.equal(await uninstall({ agentDir, io: out.io }), 1);
      assert.deepEqual(readFileSync(fake.record, "utf8").trim().split("\n"), ["remove npm:pi-agent-skills@bad", "remove npm:pi-agent-skills"]);
      assert.deepEqual(out.stderr, ["pi-skills: failed to remove npm:pi-agent-skills@bad (exit 4)"]);
      assert.deepEqual(out.stdout, ["✓ Uninstalled 1 entries"]);
    } finally { fake.restore(); }
  });
});

test("purge removes the guarded package store and prints reconciliation hint", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    personalSettings(agentDir, ["npm:pi-agent-skills"]);
    const store = path.join(agentDir, "npm", "node_modules", "pi-agent-skills");
    mkdirSync(store, { recursive: true });
    writeFileSync(path.join(store, "package.json"), "{}");
    const fake = setupPi(root);
    const out = output();
    try {
      assert.equal(await uninstall({ agentDir, purge: true, io: out.io }), 0);
      assert.equal(existsSync(store), false);
      assert.deepEqual(out.stdout, ["✓ Uninstalled 1 entries", `✓ Purged ${store}`, "run pi update --extensions to reconcile the package store"]);
    } finally { fake.restore(); }
  });
});

test("purge refuses a store symlink whose real target is outside node_modules", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    personalSettings(agentDir, ["npm:pi-agent-skills"]);
    const nodeModules = path.join(agentDir, "npm", "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    const outside = path.join(root, "outside", "pi-agent-skills");
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, path.join(nodeModules, "pi-agent-skills"), "dir");
    const fake = setupPi(root);
    const out = output();
    try {
      assert.equal(await uninstall({ agentDir, purge: true, io: out.io }), 0);
      assert.equal(existsSync(outside), true);
      assert.deepEqual(out.stderr, [`pi-skills: refusing to purge unsafe package store path ${path.join(nodeModules, "pi-agent-skills")}`]);
    } finally { fake.restore(); }
  });
});

test("dry-run prints removals and guarded purge without spawning or deleting", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    personalSettings(agentDir, ["npm:pi-agent-skills"]);
    const store = path.join(agentDir, "npm", "node_modules", "pi-agent-skills");
    mkdirSync(store, { recursive: true });
    const fake = setupPi(root);
    const out = output();
    const lines: string[] = [];
    const oldLog = console.log;
    console.log = (line?: unknown) => lines.push(String(line));
    try {
      assert.equal(await uninstall({ agentDir, purge: true, dryRun: true, io: out.io }), 0);
      assert.deepEqual(lines, ["[dry-run] Would run: pi remove npm:pi-agent-skills"]);
      assert.deepEqual(out.stdout, ["✓ Uninstalled 1 entries", `[dry-run] Would purge ${store}`]);
      assert.equal(existsSync(store), true);
      assert.equal(existsSync(fake.record), false);
    } finally { console.log = oldLog; fake.restore(); }
  });
});

test("purge with no matches removes an existing guarded store and reports it", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent"); personalSettings(agentDir, []);
    const store = path.join(agentDir, "npm", "node_modules", "pi-agent-skills"); mkdirSync(store, { recursive: true });
    const out = output();
    assert.equal(await uninstall({ agentDir, purge: true, io: out.io }), 0);
    assert.equal(existsSync(store), false);
    assert.deepEqual(out.stdout, ["✓ Not installed", `✓ Purged ${store}`, "run pi update --extensions to reconcile the package store"]);
  });
});

test("purge with no matches reports when there is nothing to purge", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent"); personalSettings(agentDir, []);
    const out = output();
    assert.equal(await uninstall({ agentDir, purge: true, io: out.io }), 0);
    assert.deepEqual(out.stdout, ["✓ Not installed", "nothing to purge"]);
  });
});

test("project-scope zero-match purge leaves the personal store untouched", async () => {
  await fixture(async (root) => {
    const agentDir = path.join(root, "agent");
    personalSettings(agentDir, []);
    const projectSettings = path.join(root, ".pi", "settings.json");
    mkdirSync(path.dirname(projectSettings), { recursive: true });
    writeFileSync(projectSettings, JSON.stringify({ packages: [] }));
    const store = path.join(agentDir, "npm", "node_modules", "pi-agent-skills");
    mkdirSync(store, { recursive: true });
    writeFileSync(path.join(store, "package.json"), "{}");
    const out = output();

    assert.equal(await uninstall({ agentDir, local: true, purge: true, cwd: root, repoRoot: root, io: out.io }), 0);
    assert.equal(existsSync(store), true);
    assert.deepEqual(out.stdout, ["✓ Not installed", "pi-skills: nothing to purge in project scope"]);
  });
});
