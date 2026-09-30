import { homedir } from "node:os";
import path from "node:path";
import { findMatchingEntries, type MatchingEntry } from "./match.js";
import { fetchLatestVersion, isStale } from "./registry.js";
import { loadSettings, type SettingsScope } from "./settings.js";
import type { FlowIo } from "./install.js";
import { runPi } from "./pi-runner.js";

export interface UpdateOptions {
  dryRun?: boolean;
  agentDir?: string;
  cwd?: string;
  repoRoot?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  io?: FlowIo;
}

const defaultIo: FlowIo = { stdout: (line) => console.log(line), stderr: (line) => console.error(line) };

export async function update(options: UpdateOptions = {}): Promise<number> {
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
  const npmEntries = entries.filter(({ entry }) => entry.kind === "npm");
  const latest = npmEntries.length ? await fetchLatestVersion({ fetch: options.fetch, timeoutMs: options.timeoutMs }) : null;
  const seen = new Set<string>();
  let failedCode = 0;
  for (const { scope, entry } of entries) {
    const dedupeKey = `${scope}:${entry.identity}`;
    if (entry.kind === "npm" && seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (entry.kind === "local") {
      io.stdout(`local install ${entry.entry.source} tracks the working tree; nothing to fetch`);
      continue;
    }
    if (entry.kind === "npm" && entry.version) {
      if (latest && isStale(entry.version, latest)) {
        io.stdout(`pinned at ${entry.version}; pi update will not move the pin — run: pi-skills install -v ${latest}`);
      } else {
        io.stdout(`pinned at ${entry.version}; could not confirm a newer version — pi update would only reconcile the pin`);
      }
      continue;
    }
    const argv = entry.kind === "npm"
      ? ["update", "npm:pi-agent-skills", ...(scope === "project" ? ["--local"] : [])]
      : ["update", entry.entry.source];
    if (options.dryRun) {
      io.stdout(`[dry-run] Would run: pi ${argv.join(" ")}`);
      continue;
    }
    const result = await runPi({ argv });
    if (!result.success) {
      failedCode = result.exitCode;
      io.stderr(`pi-skills: failed to update ${entry.entry.source} (exit ${result.exitCode})`);
    } else {
      io.stdout(`✓ Updated ${entry.entry.source}`);
    }
  }
  if (entries.length === 0) io.stdout("not installed");
  return failedCode;
}
