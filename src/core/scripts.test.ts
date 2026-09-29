import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import { discoverScripts, isRegisteredScript } from "./scripts.js";

const temp = await mkdtemp(path.join(tmpdir(), "pi-skills-scripts-"));
after(async () => rm(temp, { recursive: true, force: true }));

test("discovers executable, shebang, and nested files but excludes plain files and junk directories", async () => {
  const root = path.join(temp, "skill");
  await mkdir(path.join(root, "nested"), { recursive: true });
  await mkdir(path.join(root, ".venv"), { recursive: true });
  await mkdir(path.join(root, "venv"), { recursive: true });
  await mkdir(path.join(root, "__pycache__"), { recursive: true });
  await mkdir(path.join(root, ".tox"), { recursive: true });
  await mkdir(path.join(root, ".nox"), { recursive: true });
  const executable = path.join(root, "exec.sh");
  const shebang = path.join(root, "nested", "run");
  await writeFile(executable, "echo executable\n");
  await chmod(executable, 0o755);
  await writeFile(shebang, "#!/bin/sh\necho shebang\n");
  await writeFile(path.join(root, "plain.txt"), "not executable\n");
  for (const dir of [".venv", "venv", "__pycache__", ".tox", ".nox"]) await writeFile(path.join(root, dir, "ignored"), "#!/bin/sh\n");

  const registry = await discoverScripts(root);
  assert.deepEqual(registry.map((item) => item.relativePath), ["exec.sh", path.join("nested", "run")]);
  assert.equal(isRegisteredScript(registry, executable), true);
  assert.equal(isRegisteredScript(registry, path.join(root, "plain.txt")), false);
});
