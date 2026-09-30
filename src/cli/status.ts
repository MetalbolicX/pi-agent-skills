import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { findMatchingEntries, type MatchingEntry } from "./match.js";
import { resolveNpmStorePath } from "./paths.js";
import { fetchLatestVersion, isStale } from "./registry.js";
import { loadSettings, type SettingsScope } from "./settings.js";
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
  const agentDir = options.agentDir ?? options.env?.PI_SKILLS_AGENT_DIR ?? process.env.PI_SKILLS_AGENT_DIR ?? path.join(homedir(), ".pi", "agent");
  const scopes: Array<{ scope: SettingsScope; entries: MatchingEntry[] }> = [];
  for (const scope of ["personal", "project"] as const) {
    const settings = await loadSettings(scope, { agentDir, cwd: options.cwd, repoRoot: options.repoRoot });
    if (settings.parseError) {
      io.stderr(`pi-skills: could not read ${scope} settings (${settings.path}): ${settings.parseError}; skipping scope`);
      continue;
    }
    scopes.push({ scope, entries: (await findMatchingEntries(settings)).entries });
  }
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
    // Git checkout resolution is best-effort and deferred; report unknown for now.
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

async function readVersion(directory: string): Promise<string> {
  try {
    const metadata: unknown = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    return metadata && typeof metadata === "object" && typeof (metadata as { version?: unknown }).version === "string"
      ? (metadata as { version: string }).version : "unknown";
  } catch { return "unknown"; }
}
