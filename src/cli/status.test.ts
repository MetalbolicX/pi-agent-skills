import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { status } from "./status.js";

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-status-"));
  try { await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function settings(file: string, entries: unknown[]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ packages: entries }));
}
function output() {
  const stdout: string[] = []; const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line) } };
}
const fetchLatest: typeof fetch = async () => ({ ok: true, json: async () => ({ version: "2.0.0" }) } as Response);

test("reports both scopes, installed versions, latest and pinned/unpinned stale hints", async () => fixture(async (root) => {
  const agentDir = path.join(root, "agent"); const repo = path.join(root, "repo");
  settings(path.join(agentDir, "settings.json"), ["npm:pi-agent-skills", "npm:pi-agent-skills@1.0.0"]);
  settings(path.join(repo, ".pi", "settings.json"), ["../local"]);
  mkdirSync(path.join(agentDir, "npm", "node_modules", "pi-agent-skills"), { recursive: true });
  writeFileSync(path.join(agentDir, "npm", "node_modules", "pi-agent-skills", "package.json"), JSON.stringify({ version: "1.0.0" }));
  mkdirSync(path.join(repo, "local"));
  writeFileSync(path.join(repo, "local", "package.json"), JSON.stringify({ name: "pi-agent-skills", version: "3.1.0" }));
  const out = output();
  assert.equal(await status({ agentDir, cwd: repo, repoRoot: repo, fetch: fetchLatest, io: out.io }), 0);
  assert.ok(out.stdout.includes("personal: npm:pi-agent-skills (npm, installed 1.0.0)"));
  assert.ok(out.stdout.includes("project: ../local (local, installed 3.1.0)"));
  assert.ok(out.stdout.includes("stale: run pi-skills update"));
  assert.ok(out.stdout.includes("stale: pin won't move on update — run pi-skills install -v 2.0.0"));
  assert.ok(out.stdout.includes("latest: 2.0.0"));
}));

test("missing store and registry failure report unknown; no entries and malformed scope are fail-soft", async () => fixture(async (root) => {
  const agentDir = path.join(root, "agent");
  settings(path.join(agentDir, "settings.json"), ["npm:pi-agent-skills"]);
  const brokenRepo = path.join(root, "repo"); mkdirSync(path.join(brokenRepo, ".pi"), { recursive: true });
  writeFileSync(path.join(brokenRepo, ".pi", "settings.json"), "{");
  const out = output();
  assert.equal(await status({ agentDir, cwd: brokenRepo, repoRoot: brokenRepo, fetch: async () => { throw new Error("offline"); }, io: out.io }), 0);
  assert.ok(out.stdout.includes("personal: npm:pi-agent-skills (npm, installed unknown)"));
  assert.ok(out.stdout.includes("latest: unknown"));
  assert.equal(out.stderr.length, 1);
  assert.match(out.stderr[0] ?? "", /could not parse project settings/);
  const empty = output();
  assert.equal(await status({ agentDir: path.join(root, "empty"), cwd: path.join(root, "empty-repo"), repoRoot: path.join(root, "empty-repo"), io: empty.io }), 0);
  assert.deepEqual(empty.stdout, ["not installed"]);
}));
