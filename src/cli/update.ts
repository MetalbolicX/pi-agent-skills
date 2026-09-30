import { resolveAgentDir } from "./paths.js";
import { fetchLatestVersion, isStale } from "./registry.js";
import { loadScopedMatchingEntries } from "./scopes.js";
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
  const agentDir = resolveAgentDir(options.agentDir, options.env);
  const scopes = await loadScopedMatchingEntries({ ...options, agentDir, io });
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
      } else if (latest) {
        io.stdout(`pinned at ${entry.version}; registry confirms the pin is current`);
      } else {
        io.stdout(`pinned at ${entry.version}; registry unreachable — could not confirm a newer version`);
      }
      continue;
    }
    const argv = ["update", entry.entry.source, ...(scope === "project" ? ["--local"] : [])];
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
