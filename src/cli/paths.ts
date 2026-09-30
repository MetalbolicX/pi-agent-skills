import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { PACKAGE_NAME } from "./constants.js";

export function resolvePersonalSettingsPath(agentDir: string = path.join(homedir(), ".pi", "agent")): string {
  return path.join(agentDir, "settings.json");
}

export interface ProjectPathOptions {
  cwd: string;
  repoRoot?: string;
  exists?: (path: string) => boolean;
}

/** Find the nearest project settings file without walking above the git root. */
export function resolveProjectSettingsPath({ cwd, repoRoot, exists = existsSync }: ProjectPathOptions): string | undefined {
  const start = path.resolve(cwd);
  const root = repoRoot ? path.resolve(repoRoot) : findGitRoot(start, exists);
  if (!root) return undefined;
  const resolvedRoot = path.resolve(root);
  if (start !== resolvedRoot && !start.startsWith(`${resolvedRoot}${path.sep}`)) return undefined;

  let current = start;
  while (true) {
    const settings = path.join(current, ".pi", "settings.json");
    if (exists(settings)) return settings;
    if (current === resolvedRoot) return undefined;
    const parent = path.dirname(current);
    if (parent === current || (!parent.startsWith(`${resolvedRoot}${path.sep}`) && parent !== resolvedRoot)) return undefined;
    current = parent;
  }
}

export function resolveNpmStorePath(agentDir: string = path.join(homedir(), ".pi", "agent")): string {
  return path.join(agentDir, "npm", "node_modules", PACKAGE_NAME);
}

function findGitRoot(start: string, exists: (path: string) => boolean): string | undefined {
  let current = start;
  while (true) {
    const marker = path.join(current, ".git");
    if (exists(marker)) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

