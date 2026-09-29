import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { WalkOptions, WalkVisitor } from "./types.js";

const ALWAYS_SKIP = new Set(["node_modules", ".git"]);

export async function walkDir(baseDir: string, maxDepth: number, visitor: WalkVisitor, options: WalkOptions = {}): Promise<void> {
  const visited = new Set<string>();
  await walk(baseDir, 0, maxDepth, visitor, options.skipDirs, visited);
}

async function walk(dir: string, depth: number, maxDepth: number, visitor: WalkVisitor, skipDirs: ReadonlySet<string> | undefined, visited: Set<string>): Promise<void> {
  let real: string;
  try { real = await fs.realpath(dir); } catch { return; }
  if (visited.has(real) || depth > maxDepth) return;
  visited.add(real);
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ALWAYS_SKIP.has(entry.name) || skipDirs?.has(entry.name)) continue;
    try { await visitor(entry, depth); } catch { continue; }
    if (entry.isDirectory()) {
      await walk(path.join(dir, entry.name), depth + 1, maxDepth, visitor, skipDirs, visited);
    }
  }
}

export async function findSkillFiles(root: string, maxDepth = 3): Promise<string[]> {
  const files: string[] = [];
  try {
    const stat = await fs.stat(path.join(root, "SKILL.md"));
    if (stat.isFile()) files.push(path.join(root, "SKILL.md"));
  } catch { /* Missing root-level skill is expected. */ }
  await walkDir(root, maxDepth, async (entry) => {
    const full = path.join(entry.parentPath, entry.name);
    try {
      if (entry.isDirectory()) {
        const marker = path.join(full, "SKILL.md");
        if ((await fs.stat(marker)).isFile()) files.push(marker);
      }
    } catch { /* Not a skill directory or entry disappeared. */ }
  });
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}
