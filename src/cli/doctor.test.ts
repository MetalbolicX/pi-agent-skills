import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { doctor } from "./doctor.js";

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-doctor-"));
  try { await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}
function setup(root: string, packages: unknown[] = ["npm:pi-agent-skills"]): { agentDir: string; repo: string; store: string } {
  const agentDir = path.join(root, "agent");
  const repo = path.join(root, "repo");
  mkdirSync(path.join(repo, ".git"), { recursive: true });
  writeJson(path.join(agentDir, "settings.json"), { packages });
  const store = path.join(agentDir, "npm", "node_modules", "pi-agent-skills");
  writeJson(path.join(store, "package.json"), { name: "pi-agent-skills", version: "1.0.0" });
  writeJson(path.join(store, "dist", "extension.js"), {});
  writeJson(path.join(store, "dist", "cli.mjs"), {});
  return { agentDir, repo, store };
}
function capture() {
  const stdout: string[] = []; const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) } };
}
const current: typeof fetch = async () => ({ ok: true, json: async () => ({ version: "1.0.0" }) } as Response);

test("healthy npm install passes, shows absent project scope, and does one fail-soft registry probe", async () => fixture(async (root) => {
  const { agentDir, repo } = setup(root); const out = capture(); let fetches = 0;
  assert.equal(await doctor({ agentDir, cwd: repo, fetch: async (...args) => { fetches += 1; return current(...args); }, io: out.io }), 0);
  assert.equal(fetches, 1);
  assert.ok(out.stdout.includes("✓ npm install: dist files present (version 1.0.0)"));
  assert.ok(out.stdout.includes("— project settings: not found"));
  assert.ok(out.stdout.some((line) => line.startsWith("✓ node version:")));
  assert.ok(out.stdout.includes("summary: healthy"));
}));

test("missing npm dist files and duplicate identities are structural failures", async () => fixture(async (root) => {
  const { agentDir, repo, store } = setup(root, ["npm:pi-agent-skills", "npm:pi-agent-skills@1.0.0"]);
  rmSync(path.join(store, "dist", "cli.mjs"));
  const out = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, fetch: current, io: out.io }), 1);
  assert.ok(out.stdout.some((line) => line.startsWith("✗ npm install: missing dist/cli.mjs")));
  assert.ok(out.stdout.some((line) => line.includes("✗ personal duplicate entries (npm:pi-agent-skills)")));
}));

test("malformed JSON and packages shape errors are structural failures", async () => fixture(async (root) => {
  const { agentDir, repo } = setup(root, []);
  writeFileSync(path.join(agentDir, "settings.json"), "{");
  const malformed = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, io: malformed.io }), 1);
  assert.ok(malformed.stdout.some((line) => line.startsWith("✗ personal settings: parse error")));
  writeJson(path.join(agentDir, "settings.json"), { packages: {} });
  const shaped = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, io: shaped.io }), 1);
  assert.ok(shaped.stdout.some((line) => line.startsWith("✗ personal settings: shape error")));
}));

test("node version threshold is injectable and stale registry results only warn", async () => fixture(async (root) => {
  const { agentDir, repo } = setup(root);
  const oldNode = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, nodeVersion: "22.18.9", fetch: current, io: oldNode.io }), 1);
  assert.ok(oldNode.stdout.some((line) => line.startsWith("✗ node version:")));
  const newer = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, nodeVersion: "22.19.0", fetch: async () => ({ ok: true, json: async () => ({ version: "2.0.0" }) } as Response), io: newer.io }), 0);
  assert.ok(newer.stdout.some((line) => line.startsWith("✓ node version: 22.19.0")));
  assert.ok(newer.stdout.includes("stale: run pi-skills update"));
}));

test("pinned staleness follows the pin, while unpinned staleness follows the installed version", async () => fixture(async (root) => {
  const { agentDir, repo, store } = setup(root, ["npm:pi-agent-skills@0.1.0"]);
  writeJson(path.join(store, "package.json"), { name: "pi-agent-skills", version: "0.1.0" });
  const pinned = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, fetch: async () => ({ ok: true, json: async () => ({ version: "0.2.0" }) } as Response), io: pinned.io }), 0);
  assert.ok(pinned.stdout.some((line) => line === "warning: pinned at 0.1.0; registry confirms 0.2.0 is newer — run pi-skills install -v 0.2.0"));

  writeJson(path.join(agentDir, "settings.json"), { packages: ["npm:pi-agent-skills"] });
  writeJson(path.join(store, "package.json"), { name: "pi-agent-skills", version: "0.3.0" });
  const drifted = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, fetch: async () => ({ ok: true, json: async () => ({ version: "0.2.0" }) } as Response), io: drifted.io }), 0);
  assert.equal(drifted.stdout.some((line) => line.startsWith("stale:")), false);
}));

test("unreadable installed version still reports a stale pin", async () => fixture(async (root) => {
  const { agentDir, repo, store } = setup(root, ["npm:pi-agent-skills@0.1.0"]);
  rmSync(path.join(store, "package.json"));
  const out = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, fetch: async () => ({ ok: true, json: async () => ({ version: "0.2.0" }) } as Response), io: out.io }), 0);
  assert.ok(out.stdout.some((line) => line === "warning: pinned at 0.1.0; registry confirms 0.2.0 is newer — run pi-skills install -v 0.2.0"));
}));

test("pinned entries report confirmed-current and unreachable variants without failing", async () => fixture(async (root) => {
  const { agentDir, repo } = setup(root, ["npm:pi-agent-skills@1.0.0"]);
  const currentOutput = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, fetch: current, io: currentOutput.io }), 0);
  assert.ok(currentOutput.stdout.some((line) => line.includes("pinned at 1.0.0; registry confirms the pin is current")));
  const unknownOutput = capture();
  assert.equal(await doctor({ agentDir, cwd: repo, fetch: async () => { throw new Error("offline"); }, io: unknownOutput.io }), 0);
  assert.ok(unknownOutput.stdout.some((line) => line.includes("pinned at 1.0.0; registry unreachable")));
}));
