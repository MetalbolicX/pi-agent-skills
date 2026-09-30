import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RootsConfig, SkillRoot } from "./types.js";

const DEPTH = 3;
const extensionSources = [".claude", ".agents", ".codex", ".opencode"] as const;
const ADVERTISED_SOURCES = new Set<SkillRoot["source"]>([".claude", ".codex", ".opencode", "opencode-config", "override"]);
const isAdvertisedRoot = (root: SkillRoot): boolean => ADVERTISED_SOURCES.has(root.source);

async function findGitRoot(cwd: string): Promise<string> {
  let current = path.resolve(cwd);
  while (true) {
    try {
      await fs.access(path.join(current, ".git"));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(cwd);
      current = parent;
    }
  }
}

export async function getDefaultRoots(cwd: string, home: string): Promise<RootsConfig> {
  const projectDir = await findGitRoot(cwd);
  const all: SkillRoot[] = [];
  for (const source of extensionSources) {
    all.push({ path: path.join(projectDir, source, "skills"), scope: "project", source, maxDepth: DEPTH });
  }
  for (const source of extensionSources) {
    all.push({ path: path.join(home, source, "skills"), scope: "user", source, maxDepth: DEPTH });
  }
  all.push({ path: path.join(home, ".config", "opencode", "skills"), scope: "user", source: "opencode-config", maxDepth: DEPTH });
  return {
    all,
    advertised: all.filter(isAdvertisedRoot),
  };
}

export function rootsFromList(roots: readonly SkillRoot[]): RootsConfig {
  // Custom override roots are advertised; genuinely native roots are tool-reachable but not re-advertised.
  return { all: [...roots], advertised: roots.filter(isAdvertisedRoot) };
}
