import * as fs from "node:fs/promises";
import * as path from "node:path";
import { walkDir } from "./walker.js";

const SCRIPT_SKIP_DIRS: ReadonlySet<string> = new Set(["__pycache__", ".venv", "venv", ".tox", ".nox"]);

export interface SkillScript {
  relativePath: string;
  absolutePath: string;
}

/** Discover runnable scripts; the returned registry is also the execution allowlist. */
export async function discoverScripts(skillPath: string, maxDepth = 10): Promise<SkillScript[]> {
  const scripts: SkillScript[] = [];
  await walkDir(skillPath, maxDepth, async (entry) => {
    if (!entry.isFile()) return;
    const absolutePath = path.join(entry.parentPath, entry.name);
    try {
      const stat = await fs.stat(absolutePath);
      let runnable = (stat.mode & 0o111) !== 0;
      if (!runnable) {
        const handle = await fs.open(absolutePath, "r");
        try {
          const buffer = Buffer.alloc(2);
          await handle.read(buffer, 0, 2, 0);
          runnable = buffer.toString() === "#!";
        } finally {
          await handle.close();
        }
      }
      if (runnable) scripts.push({ relativePath: path.relative(skillPath, absolutePath), absolutePath });
    } catch { /* Entries may disappear or become unreadable during discovery. */ }
  }, { skipDirs: SCRIPT_SKIP_DIRS });
  return scripts.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/** Check membership using the exact absolute path registered by discoverScripts. */
export function isRegisteredScript(registry: readonly SkillScript[], absolutePath: string): boolean {
  return registry.some((script) => script.absolutePath === absolutePath);
}
