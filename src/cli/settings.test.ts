import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadSettings } from "./settings.js";

async function withFixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-settings-"));
  try { await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("reads strings, object entries with resource filters, and malformed package elements", async () => {
  await withFixture(async (root) => {
    const settingsPath = path.join(root, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ packages: ["npm:pi-agent-skills", { source: "npm:other", extensions: ["x"], skills: ["y"], prompts: ["z"], themes: ["t"] }, 42, null, { version: 1 }] }));
    const result = await loadSettings(settingsPath);
    assert.equal(result.exists, true);
    assert.equal(result.parseError, undefined);
    assert.deepEqual(result.packages.map((entry) => entry.kind), ["string", "object", "malformed", "malformed", "malformed"]);
    assert.equal(result.packages[1]?.kind === "object" && result.packages[1].source, "npm:other");
    assert.equal(result.packages[2]?.kind === "malformed" && result.packages[2].index, 2);
  });
});

test("malformed JSON is reported fail-soft and missing files are absent", async () => {
  await withFixture(async (root) => {
    const malformed = path.join(root, "broken.json");
    writeFileSync(malformed, "{ nope");
    const broken = await loadSettings(malformed);
    assert.equal(broken.exists, true);
    assert.ok(broken.parseError);
    assert.deepEqual(broken.packages, []);
    const missing = await loadSettings(path.join(root, "missing.json"));
    assert.equal(missing.exists, false);
    assert.deepEqual(missing.packages, []);
  });
});

test("loads personal and nearest project scope", async () => {
  await withFixture(async (root) => {
    const agentDir = path.join(root, "agent");
    mkdirSync(agentDir);
    writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages: ["npm:pi-agent-skills"] }));
    const personal = await loadSettings("personal", { agentDir });
    assert.equal(personal.path, path.join(agentDir, "settings.json"));
    const repo = path.join(root, "repo");
    const cwd = path.join(repo, "nested");
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    mkdirSync(path.join(repo, ".pi"));
    mkdirSync(cwd);
    writeFileSync(path.join(repo, ".pi", "settings.json"), JSON.stringify({ packages: [] }));
    const project = await loadSettings("project", { cwd });
    assert.equal(project.path, path.join(repo, ".pi", "settings.json"));
  });
});
