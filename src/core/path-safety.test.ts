import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, test } from "node:test";
import { resolveSafeSkillFilePath } from "./path-safety.js";

const fixtures: string[] = [];
async function fixture(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-path-safety-"));
  fixtures.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

test("denies lexical traversal chains", async () => {
  const root = await fixture();
  assert.deepEqual(await resolveSafeSkillFilePath(root, "../outside"), { ok: false, reason: "traversal" });
  assert.deepEqual(await resolveSafeSkillFilePath(root, "../../../../etc/passwd"), { ok: false, reason: "traversal" });
});

test("treats backslashes as filename characters on POSIX", async (t) => {
  if (process.platform !== "linux" && process.platform !== "darwin") return t.skip("POSIX-only assertion");
  const root = await fixture();
  const filename = "..\\..\\outside";
  await fs.writeFile(path.join(root, filename), "inside");
  const result = await resolveSafeSkillFilePath(root, filename);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.path, path.join(root, filename));
});

test("rejects absolute paths and reports missing in-root paths distinctly", async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, "file"), "ok");
  assert.deepEqual(await resolveSafeSkillFilePath(root, path.join(root, "file")), { ok: false, reason: "traversal" });
  assert.deepEqual(await resolveSafeSkillFilePath(root, "missing"), { ok: false, reason: "not_found" });
});

test("classifies embedded null bytes as not found", async () => {
  const root = await fixture();
  assert.deepEqual(await resolveSafeSkillFilePath(root, "file\0evil"), { ok: false, reason: "not_found" });
});

test("permits in-root symlinks and denies symlinks resolving outside", async () => {
  const parent = await fixture();
  const root = path.join(parent, "skill");
  await fs.mkdir(root);
  const outside = path.join(parent, "outside");
  await fs.writeFile(path.join(root, "inside"), "ok");
  await fs.writeFile(outside, "no");
  await fs.symlink("inside", path.join(root, "inside-link"));
  await fs.symlink(outside, path.join(root, "outside-link"));
  const allowed = await resolveSafeSkillFilePath(root, "inside-link");
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.equal(allowed.path, path.join(root, "inside"));
  assert.deepEqual(await resolveSafeSkillFilePath(root, "outside-link"), { ok: false, reason: "traversal" });
});

test("normalizes nested dot and parent segments", async () => {
  const root = await fixture();
  const target = path.join(root, "a", "c");
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(target, "file"), "ok");
  const result = await resolveSafeSkillFilePath(root, "a/./b/../c/file");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.path, path.join(target, "file"));
});
