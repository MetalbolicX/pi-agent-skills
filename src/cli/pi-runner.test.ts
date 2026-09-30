import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { delimiter } from "node:path";
import test from "node:test";
import { runPi } from "./pi-runner.js";

async function withFakePi(script: string, run: (directory: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(import.meta.dirname, ".pi-runner-"));
  try {
    const piPath = path.join(directory, "pi");
    writeFileSync(piPath, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    chmodSync(piPath, 0o755);
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function withPath(directory: string): void {
  process.env.PATH = `${directory}${delimiter}${process.env.PATH ?? ""}`;
}

test("passes argv through to pi and reports success", async () => {
  await withFakePi('printf "%s\\n" "$@" > "$PI_TEST_RECORD"; exit 0', async (directory) => {
    const record = path.join(directory, "argv");
    const oldPath = process.env.PATH;
    const oldRecord = process.env.PI_TEST_RECORD;
    process.env.PI_TEST_RECORD = record;
    withPath(directory);
    try {
      const result = await runPi({ argv: ["install", "npm:sample", "--local"], capture: true });
      assert.equal(result.exitCode, 0);
      assert.equal(result.success, true);
      const recorded = await readFile(record, "utf8");
      assert.deepEqual(recorded.trim().split("\n"), ["install", "npm:sample", "--local"]);
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      if (oldRecord === undefined) delete process.env.PI_TEST_RECORD;
      else process.env.PI_TEST_RECORD = oldRecord;
    }
  });
});

test("propagates a nonzero child exit code", async () => {
  await withFakePi("exit 7", async (directory) => {
    const oldPath = process.env.PATH;
    withPath(directory);
    try {
      const result = await runPi({ argv: ["status"], capture: true });
      assert.equal(result.exitCode, 7);
      assert.equal(result.success, false);
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }
  });
});

test("kills a child that exceeds its injectable timeout", async () => {
  await withFakePi("exec sleep 5", async (directory) => {
    const oldPath = process.env.PATH;
    withPath(directory);
    try {
      const result = await runPi({ argv: [], timeoutMs: 200, capture: true });
      assert.equal(result.success, false);
      assert.equal(result.error, "pi CLI timed out after 200ms");
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }
  });
});

test("reports a friendly error when pi is missing from PATH", async () => {
  const oldPath = process.env.PATH;
  const oldError = console.error;
  const errors: string[] = [];
  process.env.PATH = "";
  console.error = (line?: unknown) => errors.push(String(line));
  try {
    const result = await runPi({ argv: ["status"], capture: true });
    assert.equal(result.success, false);
    assert.equal(result.error, "pi CLI not found on PATH");
    assert.deepEqual(errors, ["pi CLI not found on PATH"]);
  } finally {
    console.error = oldError;
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
  }
});

test("dry-run prints the command and does not spawn pi", async () => {
  await withFakePi('touch "$PI_TEST_RECORD"', async (directory) => {
    const record = path.join(directory, "spawned");
    const oldPath = process.env.PATH;
    const oldRecord = process.env.PI_TEST_RECORD;
    const oldLog = console.log;
    const lines: string[] = [];
    process.env.PI_TEST_RECORD = record;
    withPath(directory);
    console.log = (line?: unknown) => lines.push(String(line));
    try {
      const result = await runPi({ argv: ["install", "npm:sample"], dryRun: true });
      assert.equal(result.success, true);
      assert.deepEqual(lines, ["[dry-run] Would run: pi install npm:sample"]);
      await assert.rejects(access(record));
    } finally {
      console.log = oldLog;
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      if (oldRecord === undefined) delete process.env.PI_TEST_RECORD;
      else process.env.PI_TEST_RECORD = oldRecord;
    }
  });
});
