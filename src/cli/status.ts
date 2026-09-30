import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAgentDir, resolveNpmStorePath } from "./paths.js";
import { fetchLatestVersion, isStale } from "./registry.js";
import { loadScopedMatchingEntries } from "./scopes.js";
import type { FlowIo } from "./install.js";

export interface StatusOptions {
  agentDir?: string;
  cwd?: string;
  repoRoot?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  io?: FlowIo;
}

const defaultIo: FlowIo = { stdout: (line) => console.log(line), stderr: (line) => console.error(line) };

export async function status(options: StatusOptions = {}): Promise<number> {
  const io = options.io ?? defaultIo;
  const agentDir = resolveAgentDir(options.agentDir, options.env);
  const scopes = await loadScopedMatchingEntries({ ...options, agentDir, io });
  const entries = scopes.flatMap(({ scope, entries }) => entries.map((entry) => ({ scope, entry })));
  if (entries.length === 0) {
    io.stdout("not installed");
    return 0;
  }
  const hasNpm = entries.some(({ entry }) => entry.kind === "npm");
  const latest = hasNpm ? await fetchLatestVersion({ fetch: options.fetch, timeoutMs: options.timeoutMs }) : null;
  for (const { scope, entry } of entries) {
    let installed = "unknown";
    if (entry.kind === "npm") installed = await readVersion(resolveNpmStorePath(agentDir));
    else if (entry.kind === "local") installed = await readVersion(entry.identity.slice("local:".length));
    io.stdout(`${scope}: ${entry.entry.source} (${entry.kind}, installed ${installed})`);
    if (entry.kind === "npm" && installed !== "unknown" && latest && isStale(installed, latest)) {
      io.stdout(entry.version
        ? `stale: pin won't move on update — run pi-skills install -v ${latest}`
        : "stale: run pi-skills update");
    }
  }
  if (hasNpm) io.stdout(`latest: ${latest ?? "unknown"}`);
  return 0;
}

export async function readPackageVersion(directory: string): Promise<string> {
  try {
    const metadata: unknown = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    return metadata && typeof metadata === "object" && typeof (metadata as { version?: unknown }).version === "string"
      ? (metadata as { version: string }).version : "unknown";
  } catch { return "unknown"; }
}

const readVersion = readPackageVersion;
