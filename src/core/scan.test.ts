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

test("rejects compound-word keyword continuations", () => {
  for (const content of [
    "echo curl-approved",
    "echo su-do",
    "echo network-egress",
    "echo nc-flag",
    "echo cp-file /tmp/file",
    "echo mv-backup /tmp/file",
    "echo env-vars",
    "echo eval-result",
  ]) {
    assert.deepEqual(scanContent(content), [], content);
  }
});

test("matches privileged chmod modes without treating ordinary numbers as privilege", () => {
  for (const content of ["chmod 755 script.sh", "chmod 644 file.txt", "chmod 600 secret", "chmod -R 755 /opt/x", "date --date=20240101", "PORT=8080"]) {
    assert.deepEqual(category(content), [], content);
  }
  for (const content of ["chmod 4755 payload", "chmod 2755 x", "chmod 1777 /tmp/d", "chmod 6755 x", "chmod 7777 x", "chmod 777 x", "chmod -R 4755 /opt/x", "chmod -f 1777 /tmp/d", "chmod +s binary", "chmod u+s binary", "chmod g+s binary", "sudo rm -rf /"]) {
    assert.deepEqual(category(content), ["privilege-escalation"], content);
  }
});

test("matches keywords followed by spaces and flags without misclassifying numeric arguments", () => {
  assert.deepEqual(category("curl https://example.com"), ["network-egress"]);
  assert.deepEqual(category("wget http://x"), ["network-egress"]);
  assert.deepEqual(category("nc -zvp host 1234"), ["network-egress"]);
  assert.ok(!category("nc -zvp host 1234").includes("privilege-escalation"));
  assert.deepEqual(category("export PATH=/tmp:$PATH"), ["shell-env-mutation"]);
  assert.deepEqual(category('eval "$x"'), ["shell-env-mutation"]);
});
