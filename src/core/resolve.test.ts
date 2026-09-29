import assert from "node:assert/strict";
import { test } from "node:test";
import { findClosestMatch, levenshtein, resolveSkillName } from "./resolve.js";

test("levenshtein computes edit distances", () => {
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("hello", "hello"), 0);
});

test("fuzzy matching is case-insensitive and thresholded", () => {
  assert.equal(findClosestMatch("TYPESCRIPT", ["typescript"]), "typescript");
  assert.equal(findClosestMatch("xyzzy", ["python", "rust"]), null);
});

test("uses source scoring tiers and accepts the inclusive 0.4 threshold", () => {
  assert.equal(findClosestMatch("foo", ["xfoo", "foobar"]), "foobar");
  assert.equal(findClosestMatch("abcde", ["xyzde"]), "xyzde");
});

test("resolution prioritizes exact then suffix then fuzzy", () => {
  const skills = new Map([[
    "typescript", { path: "/skills/typescript", relativePath: "typescript" },
  ], ["named", { path: "/skills/nested/alias", relativePath: "nested/alias" }]]);
  assert.equal(resolveSkillName("typescript", skills), "typescript");
  assert.equal(resolveSkillName("alias", skills), "named");
  assert.equal(resolveSkillName("typescrip", skills), "typescript");
});

test("ambiguous suffixes fail with candidate names", () => {
  const skills = new Map([[
    "one", { path: "/one/alias", relativePath: "one/alias" },
  ], ["two", { path: "/two/alias", relativePath: "two/alias" }]]);
  assert.throws(() => resolveSkillName("alias", skills), /Ambiguous skill name/);
});
