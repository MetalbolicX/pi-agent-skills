import { existsSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { findMatchingEntries } from "./match.js";
import { resolveNpmStorePath } from "./paths.js";
import { runPi } from "./pi-runner.js";
import { loadSettings } from "./settings.js";
import type { FlowIo } from "./install.js";

export interface UninstallOptions {
  local?: boolean;
  dryRun?: boolean;
  purge?: boolean;
  agentDir?: string;
  cwd?: string;
  repoRoot?: string;
  io?: FlowIo;
}

const defaultIo: FlowIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
};

export async function uninstall(options: UninstallOptions = {}): Promise<number> {
  const io = options.io ?? defaultIo;
  const agentDir = options.agentDir ?? process.env.PI_SKILLS_AGENT_DIR ?? path.join(homedir(), ".pi", "agent");
  const settings = await loadSettings(options.local ? "project" : "personal", { agentDir, cwd: options.cwd, repoRoot: options.repoRoot });
  if (settings.parseError) {
    io.stderr(`pi-skills: could not read settings (${settings.path}): ${settings.parseError}`);
    return 1;
  }
  const matches = await findMatchingEntries(settings);
  for (const entry of matches.unmatchedLocal) {
    const cause = entry.cause ? ` (${entry.cause})` : "";
    io.stderr(`pi-skills: not removing unrecognized local entry ${entry.entry.source}${cause}`);
  }
  if (matches.entries.length === 0) {
    io.stdout("✓ Not installed");
    if (options.purge) purgeStore(agentDir, options.dryRun ?? false, io);
    return 0;
  }

  let removed = 0;
  let failed = false;
  for (const entry of matches.entries) {
    const result = await runPi({
      argv: ["remove", entry.entry.source, ...(options.local ? ["--local"] : [])],
      dryRun: options.dryRun,
    });
    if (result.success) removed += 1;
    else {
      failed = true;
      io.stderr(`pi-skills: failed to remove ${entry.entry.source} (exit ${result.exitCode})`);
    }
  }
  if (removed > 0) io.stdout(`✓ Uninstalled ${removed} entries`);

  if (options.purge && removed > 0) purgeStore(agentDir, options.dryRun ?? false, io);
  return failed ? 1 : 0;
}

function purgeStore(agentDir: string, dryRun: boolean, io: FlowIo): void {
  const storePath = resolveNpmStorePath(agentDir);
  if (!existsSync(storePath)) {
    io.stdout("nothing to purge");
    return;
  }
  if (!isGuardedStorePath(storePath, agentDir)) {
    io.stderr(`pi-skills: refusing to purge unsafe package store path ${storePath}`);
    return;
  }
  if (dryRun) io.stdout(`[dry-run] Would purge ${storePath}`);
  else {
    rmSync(storePath, { recursive: true, force: true });
    io.stdout(`✓ Purged ${storePath}`);
    io.stdout("run pi update --extensions to reconcile the package store");
  }
}

function isGuardedStorePath(targetPath: string, agentDir: string): boolean {
  try {
    const storeRoot = realpathSync(path.join(agentDir, "npm"));
    const nodeModulesPath = realpathSync(path.join(storeRoot, "node_modules"));
    const targetRealPath = realpathSync(targetPath);
    return isStrictlyInside(nodeModulesPath, storeRoot)
      && isStrictlyInside(targetRealPath, nodeModulesPath)
      && path.basename(targetRealPath) === "pi-agent-skills";
  } catch {
    return false;
  }
}

function isStrictlyInside(candidate: string, parent: string): boolean {
  return candidate !== parent && candidate.startsWith(`${parent}${path.sep}`);
}
