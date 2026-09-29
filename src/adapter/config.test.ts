import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "./config.js";

test("config uses safe defaults", () => assert.deepEqual(parseConfig({}), { roots: undefined, scriptTimeoutMs: 30000, debug: false }));
test("config parses overrides", () => assert.deepEqual(parseConfig({ PI_SKILLS_ROOTS: "/a:/b", PI_SKILLS_SCRIPT_TIMEOUT_MS: "125", PI_SKILLS_DEBUG: "true" }), { roots: ["/a", "/b"], scriptTimeoutMs: 125, debug: true }));
test("config falls back for invalid timeout and debug values", () => assert.deepEqual(parseConfig({ PI_SKILLS_SCRIPT_TIMEOUT_MS: "NaN", PI_SKILLS_DEBUG: "no" }), { roots: undefined, scriptTimeoutMs: 30000, debug: false }));
