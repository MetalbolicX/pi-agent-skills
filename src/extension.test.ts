import assert from "node:assert/strict";
import test from "node:test";
import extension from "./extension.js";

test("default export is an extension factory", () => {
  assert.equal(typeof extension, "function");
});
