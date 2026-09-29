import assert from "node:assert/strict";
import { test } from "node:test";
import { scanContent, type RiskCategory } from "./scan.js";

const category = (content: string): RiskCategory[] => scanContent(content).map((hit) => hit.category);

test("detects each source-defined risk category independently", () => {
  assert.deepEqual(category("curl https://example.test"), ["network-egress"]);
  assert.deepEqual(category("cp file /tmp/file"), ["out-of-skill-write"]);
  assert.deepEqual(category("sudo command"), ["privilege-escalation"]);
  assert.deepEqual(category("export PATH=/tmp"), ["shell-env-mutation"]);
});

test("returns no hits for benign content and all matching categories for mixed content", () => {
  assert.deepEqual(scanContent("#!/bin/sh\necho hello\nvalue=1"), []);
  const hits = scanContent("curl https://example.test\ncp a /tmp/b\nsudo chmod 4755 app\nexport PATH=/tmp");
  assert.deepEqual(new Set(hits.map((hit) => hit.category)), new Set(["network-egress", "out-of-skill-write", "privilege-escalation", "shell-env-mutation"]));
  assert.equal(hits.length, 4);
  assert.ok(hits.every((hit) => hit.evidence.length > 0));
});
