import assert from "node:assert/strict";
import test from "node:test";
import { compareSemver, fetchLatestVersion, isStale, REGISTRY_LATEST_URL } from "./registry.js";

const response = (body: unknown, ok = true): Response => ({ ok, json: async () => body } as Response);

test("fetchLatestVersion returns the registry version and handles failures fail-soft", async () => {
  assert.equal(await fetchLatestVersion({ fetch: async (url) => { assert.equal(url, REGISTRY_LATEST_URL); return response({ version: "1.2.3" }); } }), "1.2.3");
  assert.equal(await fetchLatestVersion({ fetch: async () => response({ version: "1.2.3-beta.1" }) }), "1.2.3-beta.1");
  for (const version of ["1.2.3\u001b[31m", "1.2.3\nforged", "1.2.3;echo pwned", "1.2.3+build.1"]) {
    assert.equal(await fetchLatestVersion({ fetch: async () => response({ version }) }), null);
  }
  assert.equal(await fetchLatestVersion({ fetch: async () => { throw new Error("offline"); } }), null);
  assert.equal(await fetchLatestVersion({ fetch: async () => response({}, false) }), null);
  assert.equal(await fetchLatestVersion({ fetch: async () => ({ ok: true, json: async () => { throw new Error("bad JSON"); } } as unknown as Response) }), null);
  assert.equal(await fetchLatestVersion({ fetch: async () => response({}) }), null);
  assert.equal(await fetchLatestVersion({ timeoutMs: 20, fetch: async () => new Promise(() => {}) }), null);
});

test("semver comparison is numeric and fail-closed", () => {
  assert.equal(compareSemver("1.2.3", "1.10.0"), -1);
  assert.equal(compareSemver("1.2.3-beta.1", "1.2.3"), 0);
  assert.equal(compareSemver("bad", "1.0.0"), 0);
  assert.equal(isStale("bad", "2.0.0"), false);
  assert.equal(isStale("1.0.0", "bad"), false);
  assert.equal(isStale("1.2.3", "1.10.0"), true);
});
