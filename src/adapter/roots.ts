import * as path from "node:path";
import { findGitRoot, getDefaultRoots, rootsFromList } from "../core/discovery.js";
import type { RootsConfig, SkillRoot } from "../core/types.js";

export async function getToolRoots(cwd: string, home: string, override?: readonly string[]): Promise<RootsConfig> {
  const defaults = await getDefaultRoots(cwd, home);
  if (override?.length) {
    defaults.all = override.map((root): SkillRoot => ({ path: path.resolve(root), scope: "project", source: "override", maxDepth: 3 }));
  }
  const projectRoot = await findGitRoot(cwd);
  const native: SkillRoot[] = [
    { path: path.join(projectRoot, ".pi", "skills"), scope: "project", source: "native", maxDepth: 3 },
    { path: path.join(projectRoot, ".agents", "skills"), scope: "project", source: "native", maxDepth: 3 },
    { path: path.join(home, ".pi", "agent", "skills"), scope: "user", source: "native", maxDepth: 3 },
    { path: path.join(home, ".agents", "skills"), scope: "user", source: "native", maxDepth: 3 },
  ];
  const seen = new Set<string>();
  const all = [...defaults.all, ...native].filter((root) => {
    const key = path.resolve(root.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return rootsFromList(all);
}
