import { findMatchingEntries, type MatchingEntry } from "./match.js";
import { resolveAgentDir } from "./paths.js";
import { loadSettings, type Settings, type SettingsScope } from "./settings.js";
import type { FlowIo } from "./install.js";

export interface ScopedMatchingEntries {
  scope: SettingsScope;
  settings: Settings;
  entries: MatchingEntry[];
}

export async function loadScopedMatchingEntries(options: {
  agentDir?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  repoRoot?: string;
  io: FlowIo;
}): Promise<ScopedMatchingEntries[]> {
  const agentDir = resolveAgentDir(options.agentDir, options.env);
  const scopes: ScopedMatchingEntries[] = [];
  for (const scope of ["personal", "project"] as const) {
    const settings = await loadSettings(scope, { agentDir, cwd: options.cwd, repoRoot: options.repoRoot });
    const issue = settings.readError ?? settings.parseError ?? settings.shapeError;
    if (issue) {
      const kind = settings.readError ? "read" : settings.parseError ? "parse" : "shape";
      options.io.stderr(`pi-skills: could not ${kind === "shape" ? "validate" : kind} ${scope} settings (${settings.path}): ${issue}; skipping scope`);
      continue;
    }
    scopes.push({ scope, settings, entries: (await findMatchingEntries(settings)).entries });
  }
  return scopes;
}
