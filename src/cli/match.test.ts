import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findMatchingEntries, matchEntry } from "./match.js";
import type { PackageEntry, Settings } from "./settings.js";

async function withFixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-match-"));
  try { await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function entry(source: string, index = 0, kind: "string" | "object" = "string"): PackageEntry {
  return kind === "string" ? { kind, index, raw: source, source } : { kind, index, raw: { source, skills: ["x"] }, source };
}

async function matched(source: string, root = "/settings/settings.json"): Promise<Awaited<ReturnType<typeof matchEntry>>> {
  return matchEntry(entry(source), root);
}

test("matches exact npm names, optional versions, and scoped names only at the package boundary", async () => {
  for (const [source, version] of [["npm:pi-agent-skills", undefined], ["npm:pi-agent-skills@1.2.3", "1.2.3"], ["npm:@scope/pi-agent-skills", undefined], ["npm:@scope/pi-agent-skills@1.0.0", "1.0.0"]] as const) {
    const result = await matched(source);
    assert.equal(result?.kind, "npm");
    if (result?.kind === "npm") assert.equal(result.version, version);
  }
  for (const source of ["npm:@other/pi-agent-skills", "npm:@other/pi-agent-skills-extra", "npm:pi-agent-skills-something", "npm:pi-agent-skillsfoo", "pi-agent-skills"]) {
    assert.equal(await matched(source), undefined, source);
  }
});

test("matches git repository basename with refs and .git suffix, not prefixes", async () => {
  for (const source of ["git:github.com/x/pi-agent-skills", "git:github.com/x/pi-agent-skills.git", "git:github.com/x/pi-agent-skills@v1", "git:github.com/x/pi-agent-skills.git@v1"]) {
    assert.equal((await matched(source))?.kind, "git", source);
  }
  assert.equal(await matched("git:github.com/x/pi-agent-skills-something"), undefined);
  const plain = await matched("git:github.com/x/pi-agent-skills");
  const suffixed = await matched("git:github.com/x/pi-agent-skills.git");
  assert.equal(plain?.kind, "git");
  assert.equal(suffixed?.kind, "git");
  if (plain?.kind === "git" && suffixed?.kind === "git") assert.equal(plain.identity, suffixed.identity);
});

test("resolves local paths relative to settings, supports absolute paths, and checks package identity", async () => {
  await withFixture(async (root) => {
    const settings = path.join(root, "project", ".pi", "settings.json");
    const local = path.join(root, "project", "package");
    mkdirSync(path.dirname(settings), { recursive: true });
    mkdirSync(local);
    writeFileSync(path.join(local, "package.json"), JSON.stringify({ name: "pi-agent-skills" }));
    const relative = await matchEntry(entry("../package"), settings);
    const absolute = await matchEntry(entry(local), settings);
    const object = await matchEntry(entry("../package", 1, "object"), settings);
    assert.equal(relative?.kind, "local");
    assert.equal(absolute?.kind, "local");
    assert.equal(object?.kind, "local");
    assert.equal(relative?.identity, absolute?.identity);
    const other = path.join(root, "other");
    mkdirSync(other);
    writeFileSync(path.join(other, "package.json"), JSON.stringify({ name: "another-package" }));
    assert.equal((await matchEntry(entry(other), settings))?.kind, "unmatched-local");
    const unmatched = await matchEntry(entry(path.join(root, "unreadable")), settings);
    assert.equal(unmatched?.kind, "unmatched-local");
    if (unmatched?.kind === "unmatched-local") assert.ok(unmatched.cause);
  });
});

test("expands local tilde paths against the injectable home directory", async () => {
  await withFixture(async (root) => {
    const home = path.join(root, "home");
    const local = path.join(home, "package");
    mkdirSync(local, { recursive: true });
    writeFileSync(path.join(local, "package.json"), JSON.stringify({ name: "pi-agent-skills" }));
    const result = await matchEntry(entry("~/package"), path.join(root, "settings.json"), { homeDir: home });
    assert.equal(result?.kind, "local");
  });
});

test("groups duplicates by full installation identity only", async () => {
  await withFixture(async (root) => {
    const local = path.join(root, "local");
    mkdirSync(local);
    writeFileSync(path.join(local, "package.json"), JSON.stringify({ name: "pi-agent-skills" }));
    const settings: Settings = {
      path: path.join(root, "settings.json"), exists: true,
      packages: [entry("npm:pi-agent-skills", 0), entry("npm:pi-agent-skills@0.1.0", 1), entry("npm:pi-agent-skills@0.2.0", 2), entry("npm:@scope/pi-agent-skills", 3), entry(local, 4), entry("git:github.com/x/pi-agent-skills", 5)],
    };
    const result = await findMatchingEntries(settings);
    assert.equal(result.entries.length, 6);
    assert.equal(result.duplicates.size, 1);
    assert.equal(result.duplicates.get("npm:pi-agent-skills")?.length, 3);
    assert.equal(result.entries.filter((item) => item.kind === "local" || item.kind === "git").length, 2);
  });
});
