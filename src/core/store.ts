import * as path from "node:path";
import type { DuplicateWarning, Skill, SkillRoot, SkillStore } from "./types.js";
import { parseSkillFile } from "./frontmatter.js";
import { findSkillFiles } from "./walker.js";
import { resolveSkillName } from "./resolve.js";

const DEFAULT_TTL_MS = 5_000;

export function createSkillStore(roots: readonly SkillRoot[], ttlMs = DEFAULT_TTL_MS, onWarning: (warning: string) => void = console.warn, onDuplicate?: DuplicateWarning): SkillStore {
  let skills: Map<string, Skill> | undefined;
  let expiresAt = 0;
  let inflight: Promise<Map<string, Skill>> | undefined;

  const scan = async (): Promise<Map<string, Skill>> => {
    const result = new Map<string, Skill>();
    for (const root of roots) {
      const files = await findSkillFiles(root.path, root.maxDepth);
      for (const filePath of files) {
        const relativePath = path.relative(root.path, path.dirname(filePath));
        const parsed = await parseSkillFile({ filePath, relativePath, root });
        const { warning, skill } = parsed;
        if (warning) onWarning(warning);
        if (!skill) continue;
        const existing = result.get(skill.name);
        if (existing) {
          if (onDuplicate) onDuplicate(existing, skill);
          else onWarning(`Skill name conflict: '${existing.name}' at ${existing.path} shadows duplicate at ${skill.path}`);
          continue;
        }
        result.set(skill.name, skill);
      }
    }
    return result;
  };

  const ensure = async (): Promise<Map<string, Skill>> => {
    if (skills && Date.now() < expiresAt) return skills;
    if (!inflight) {
      inflight = scan();
      try { skills = await inflight; expiresAt = Date.now() + ttlMs; }
      finally { inflight = undefined; }
    } else {
      return inflight;
    }
    return skills;
  };

  return {
    async all(): Promise<Skill[]> { return [...(await ensure()).values()]; },
    async resolve(name: string): Promise<Skill> {
      const found = await ensure();
      const key = resolveSkillName(name, found);
      const skill = key === null ? undefined : found.get(key);
      if (!skill) throw new Error(`Skill '${name}' not found`);
      return skill;
    },
    invalidate(): void { skills = undefined; expiresAt = 0; },
  };
}
