import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeShellArg } from "./shell-args.js";

test("quotes shell arguments with the Bourne single-quote form", () => {
  const cases: Array<[string, string]> = [
    ["plain", "'plain'"],
    ["two words", "'two words'"],
    ["it's", "'it'\\''s'"],
    ['double"quote', '\'double"quote\''],
    ["line\nbreak", "'line\nbreak'"],
    ["$HOME", "'$HOME'"],
    ["`command`", "'`command`'"],
    ["a\\b", "'a\\b'"],
    ["", "''"],
    ["雪", "'雪'"],
  ];
  for (const [input, expected] of cases) assert.equal(escapeShellArg(input), expected, JSON.stringify(input));
});
