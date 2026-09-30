import { access } from "node:fs/promises";
import path from "node:path";
import { findMatchingEntries } from "./match.js";
import { resolveAgentDir, resolveNpmStorePath } from "./paths.js";
import { compareSemver, fetchLatestVersion, isStale } from "./registry.js";
import { readPackageVersion } from "./status.js";
import { loadSettings, type SettingsScope } from "./settings.js";
import type { FlowIo } from "./install.js";

export interface DoctorOptions {
  io?: FlowIo;
  agentDir?: string;
  env?: Record<string, string | undefined>;
  nodeVersion?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  cwd?: string;
  repoRoot?: string;
}

const defaultIo: FlowIo = { stdout: (line) => console.log(line), stderr: (line) => console.error(line) };

export async function doctor(options: DoctorOptions = {}): Promise<number> {
  const io = options.io ?? defaultIo;
  const agentDir = resolveAgentDir(options.agentDir, options.env);
  io.stdout("pi-skills doctor");
  let structuralIssues = 0;
  const scopeResults: Array<{ scope: SettingsScope; entries: Awaited<ReturnType<typeof findMatchingEntries>>["entries"] }> = [];
  for (const scope of ["personal", "project"] as const) {
    const settings = await loadSettings(scope, { agentDir, cwd: options.cwd, repoRoot: options.repoRoot });
    const issue = settings.readError ?? settings.parseError ?? settings.shapeError;
    if (issue) {
      const kind = settings.readError ? "read" : settings.parseError ? "parse" : "shape";
      io.stdout(`✗ ${scope} settings: ${kind} error (${settings.path}): ${issue}`);
      structuralIssues += 1;
      continue;
    }
    if (!settings.exists) {
      io.stdout(`— ${scope} settings: not found`);
      io.stdout(`— ${scope} pi-agent-skills entries: none (not installed)`);
      continue;
    }
    io.stdout(`✓ ${scope} settings: readable`);
    const matches = await findMatchingEntries(settings);
    scopeResults.push({ scope, entries: matches.entries });
    const kinds = matches.entries.length ? [...new Set(matches.entries.map(({ kind }) => kind))].join(", ") : "none";
    io.stdout(`✓ ${scope} pi-agent-skills entries: ${kinds}`);
    if (matches.duplicates.size > 0) {
      for (const [identity, duplicates] of matches.duplicates) {
        io.stdout(`✗ ${scope} duplicate entries (${identity}): ${duplicates.map(({ entry }) => entry.source).join(", ")}`);
        structuralIssues += 1;
      }
    }
  }

  const entries = scopeResults.flatMap(({ scope, entries }) => entries.map((entry) => ({ scope, entry })));
  const npmEntries = entries.filter(({ entry }) => entry.kind === "npm");
  const npmStore = resolveNpmStorePath(agentDir);
  if (npmEntries.length > 0) {
    const extensionPresent = await fileExists(path.join(npmStore, "dist", "extension.js"));
    const cliPresent = await fileExists(path.join(npmStore, "dist", "cli.mjs"));
    const version = await readPackageVersion(npmStore);
    if (extensionPresent && cliPresent) io.stdout(`✓ npm install: dist files present (version ${version})`);
    else {
      io.stdout(`✗ npm install: missing ${[!extensionPresent && "dist/extension.js", !cliPresent && "dist/cli.mjs"].filter(Boolean).join(" and ")}`);
      structuralIssues += 1;
    }
  }
  for (const { scope, entry } of entries.filter(({ entry }) => entry.kind === "local")) {
    const directory = entry.identity.slice("local:".length);
    const extensionPresent = await fileExists(path.join(directory, "dist", "extension.js"));
    const cliPresent = await fileExists(path.join(directory, "dist", "cli.mjs"));
    const version = await readPackageVersion(directory);
    io.stdout(`${extensionPresent && cliPresent ? "✓" : "—"} ${scope} local install: version ${version}; dist ${extensionPresent && cliPresent ? "present" : "missing (build expected in development)"}${extensionPresent && cliPresent ? "" : " [warning]"}`);
  }

  const nodeVersion = options.nodeVersion ?? process.versions.node;
  if (compareSemver(nodeVersion, "22.19.0") >= 0 && validSemver(nodeVersion)) io.stdout(`✓ node version: ${nodeVersion} (>= 22.19.0)`);
  else { io.stdout(`✗ node version: ${nodeVersion} (requires >= 22.19.0)`); structuralIssues += 1; }

  if (npmEntries.length > 0) {
    const latest = await fetchLatestVersion({ fetch: options.fetch, timeoutMs: options.timeoutMs });
    io.stdout(`— registry latest: ${latest ?? "unknown"}`);
    const installed = await readPackageVersion(npmStore);
    for (const { entry } of npmEntries) {
      if (latest && (entry.version ? isStale(entry.version, latest) : installed !== "unknown" && isStale(installed, latest))) {
        io.stdout(entry.version
          ? `warning: pinned at ${entry.version}; registry confirms ${latest} is newer — run pi-skills install -v ${latest}`
          : "stale: run pi-skills update");
      } else if (entry.version && latest && !isStale(entry.version, latest)) {
        io.stdout(`warning: pinned at ${entry.version}; registry confirms the pin is current`);
      } else if (entry.version && !latest) {
        io.stdout(`warning: pinned at ${entry.version}; registry unreachable — could not confirm a newer version`);
      }
    }
  }
  io.stdout(`summary: ${structuralIssues === 0 ? "healthy" : `${structuralIssues} structural issue${structuralIssues === 1 ? "" : "s"}`}`);
  return structuralIssues === 0 ? 0 : 1;
}

async function fileExists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

function validSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}
