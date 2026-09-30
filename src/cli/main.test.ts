import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArgs, runCli, USAGE } from "./main.js";

function io() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    deps: { stdout: (line: string) => stdout.push(line), stderr: (line: string) => stderr.push(line), env: {} },
  };
}

test("dispatches every known subcommand", async () => {
  for (const command of ["update", "doctor"] as const) {
    const output = io();
    assert.equal(await runCli([command], output.deps), 1);
    assert.deepEqual(output.stderr, [`${command}: implemented in a later work unit`]);
  }
  const status = io();
  assert.equal(await runCli(["status"], status.deps), 0);
  assert.deepEqual(status.stdout, ["pi-skills status: probe lands in T4"]);
});

test("unknown flag, unknown command, and no args are usage errors", async () => {
  for (const args of [["status", "--bogus"], ["bogus"], []]) {
    const output = io();
    assert.equal(await runCli(args, output.deps), 2);
    assert.ok(output.stderr[0]?.startsWith("pi-skills: "));
    assert.equal(output.stderr[1], USAGE);
    assert.deepEqual(output.stdout, []);
  }
});

test("help prints usage to stdout and succeeds", async () => {
  const output = io();
  assert.equal(await runCli(["--help"], output.deps), 0);
  assert.deepEqual(output.stdout, [USAGE]);
  assert.deepEqual(output.stderr, []);
});

test("version requires a value under strict parseArgs", () => {
  assert.throws(() => parseCliArgs(["install", "-v"]));
  assert.throws(() => parseCliArgs(["install", "--version"]));
  assert.equal(parseCliArgs(["install", "-v", "1.2.3"]).options.version, "1.2.3");
});

test("global and command-specific flags parse", () => {
  const install = parseCliArgs(["install", "--dry-run", "--local", "-l", "--latest"]);
  assert.equal(install.options.dryRun, true);
  assert.equal(install.options.local, true);
  assert.equal(install.options.latest, true);
  const uninstall = parseCliArgs(["uninstall", "--purge", "--dry-run"]);
  assert.equal(uninstall.options.purge, true);
  assert.equal(uninstall.options.dryRun, true);
});
