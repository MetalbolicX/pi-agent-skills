import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseCliArgs, runCli, USAGE, type CliIo } from "./main.js";

function io(env: Record<string, string | undefined> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const deps: CliIo = { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line), env };
  return { stdout, stderr, deps };
}

test("dispatches every known subcommand in an isolated environment", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-cli-dispatch-"));
  const previousPath = process.env.PATH;
  const previousAgentDir = process.env.PI_SKILLS_AGENT_DIR;
  const previousCwd = process.cwd();
  try {
    const agentDir = path.join(root, "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages: [] }));
    mkdirSync(path.join(root, ".git"));
    mkdirSync(path.join(root, ".pi"));
    writeFileSync(path.join(root, ".pi", "settings.json"), JSON.stringify({ packages: [] }));
    const bin = path.join(root, "bin"); mkdirSync(bin);
    process.env.PI_SKILLS_AGENT_DIR = agentDir;
    process.env.PATH = bin;
    process.chdir(root);
    const env = { PI_SKILLS_AGENT_DIR: agentDir };

    const update = io(env);
    assert.equal(await runCli(["update"], update.deps), 0);
    assert.deepEqual(update.stdout, ["not installed"]);
    const doctor = io(env);
    assert.equal(await runCli(["doctor"], doctor.deps), 0);
    assert.ok(doctor.stdout.includes("pi-skills doctor"));
    assert.ok(doctor.stdout.includes("summary: healthy"));
    const status = io(env);
    assert.equal(await runCli(["status"], status.deps), 0);
    assert.deepEqual(status.stdout, ["not installed"]);
  } finally {
    process.chdir(previousCwd);
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    if (previousAgentDir === undefined) delete process.env.PI_SKILLS_AGENT_DIR; else process.env.PI_SKILLS_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  }
});

test("runCli install and uninstall honor the agent-dir sandbox and dispatch argv", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-skills-cli-dispatch-"));
  const previousPath = process.env.PATH;
  const previousAgentDir = process.env.PI_SKILLS_AGENT_DIR;
  const previousRecord = process.env.PI_TEST_RECORD;
  const previousExit = process.env.PI_TEST_EXIT;
  const previousCwd = process.cwd();
  try {
    const agentDir = path.join(root, "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages: ["npm:pi-agent-skills@1.0.0"] }));
    mkdirSync(path.join(root, ".git"));
    mkdirSync(path.join(root, ".pi"));
    writeFileSync(path.join(root, ".pi", "settings.json"), JSON.stringify({ packages: [] }));
    const bin = path.join(root, "bin"); mkdirSync(bin);
    const fakePi = path.join(bin, "pi");
    writeFileSync(fakePi, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$PI_TEST_RECORD"\nexit "${PI_TEST_EXIT:-0}"\n', { mode: 0o755 });
    chmodSync(fakePi, 0o755);
    const record = path.join(root, "calls");
    process.env.PATH = bin;
    process.env.PI_SKILLS_AGENT_DIR = agentDir;
    process.env.PI_TEST_RECORD = record;
    process.chdir(root);
    const env = { PI_SKILLS_AGENT_DIR: agentDir };
    assert.equal(await runCli(["install"], io(env).deps), 0);
    process.env.PI_TEST_EXIT = "7";
    const uninstallResult = io(env);
    assert.equal(await runCli(["uninstall"], uninstallResult.deps), 1);
    assert.deepEqual(uninstallResult.stderr, ["pi-skills: failed to remove npm:pi-agent-skills@1.0.0 (exit 7)"]);
    assert.deepEqual(readFileSync(record, "utf8").trim().split("\n"), [
      "remove npm:pi-agent-skills@1.0.0", "install npm:pi-agent-skills", "remove npm:pi-agent-skills@1.0.0",
    ]);
    assert.equal(existsSync(path.join(agentDir, "settings.json")), true);
  } finally {
    process.chdir(previousCwd);
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    if (previousAgentDir === undefined) delete process.env.PI_SKILLS_AGENT_DIR; else process.env.PI_SKILLS_AGENT_DIR = previousAgentDir;
    if (previousRecord === undefined) delete process.env.PI_TEST_RECORD; else process.env.PI_TEST_RECORD = previousRecord;
    if (previousExit === undefined) delete process.env.PI_TEST_EXIT; else process.env.PI_TEST_EXIT = previousExit;
    rmSync(root, { recursive: true, force: true });
  }
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
