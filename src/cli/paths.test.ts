import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveNpmStorePath, resolvePersonalSettingsPath, resolveProjectSettingsPath } from "./paths.js";

function fixture(run: (root: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-paths-"));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("resolves personal settings and npm store from injected agent directory", () => {
  assert.equal(resolvePersonalSettingsPath("/fixture/agent"), "/fixture/agent/settings.json");
  assert.equal(resolveNpmStorePath("/fixture/agent"), "/fixture/agent/npm/node_modules/pi-agent-skills");
});

test("finds nearest project settings while respecting git repository root", () => {
  fixture((root) => {
    const repo = path.join(root, "repo");
    const nested = path.join(repo, "packages", "one");
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    mkdirSync(path.join(repo, ".pi"));
    mkdirSync(path.join(nested, ".pi"), { recursive: true });
    writeFileSync(path.join(repo, ".pi", "settings.json"), "{}");
    writeFileSync(path.join(nested, ".pi", "settings.json"), "{}");
    assert.equal(resolveProjectSettingsPath({ cwd: nested }), path.join(nested, ".pi", "settings.json"));
    assert.equal(resolveProjectSettingsPath({ cwd: path.join(repo, "packages") }), path.join(repo, ".pi", "settings.json"));
  });
});

test("does not walk above the repository root", () => {
  fixture((root) => {
    const parent = path.join(root, "parent");
    const repo = path.join(parent, "repo");
    mkdirSync(path.join(parent, ".pi"), { recursive: true });
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    writeFileSync(path.join(parent, ".pi", "settings.json"), "{}");
    assert.equal(resolveProjectSettingsPath({ cwd: repo }), undefined);
  });
});
