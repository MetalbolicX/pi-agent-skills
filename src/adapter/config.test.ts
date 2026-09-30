import assert from "node:assert/strict";
import test from "node:test";
import { createDebugLogger, parseConfig } from "./config.js";

test("config uses safe defaults", () => assert.deepEqual(parseConfig({}), { roots: undefined, scriptTimeoutMs: 30000, debug: false }));
test("config parses overrides", () => assert.deepEqual(parseConfig({ PI_SKILLS_ROOTS: "/a:/b", PI_SKILLS_SCRIPT_TIMEOUT_MS: "125", PI_SKILLS_DEBUG: "true" }), { roots: ["/a", "/b"], scriptTimeoutMs: 125, debug: true }));
test("config falls back for invalid timeout and debug values", () => assert.deepEqual(parseConfig({ PI_SKILLS_SCRIPT_TIMEOUT_MS: "NaN", PI_SKILLS_DEBUG: "no" }), { roots: undefined, scriptTimeoutMs: 30000, debug: false }));

test("debug logger is silent when disabled", () => {
  const lines: string[] = [];
  createDebugLogger(false, (line) => lines.push(line))("activation complete");
  assert.deepEqual(lines, []);
});

test("debug logger prefixes enabled lines", () => {
  const lines: string[] = [];
  const log = createDebugLogger(true, (line) => lines.push(line));
  log("root discovery complete");
  log("activation complete");
  assert.deepEqual(lines, ["[pi-skills] root discovery complete", "[pi-skills] activation complete"]);
});
