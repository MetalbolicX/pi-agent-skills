import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RootsConfig, Skill, SkillRoot } from "./types.js";

const DEPTH = 3;
const extensionSources = [".claude", ".agents", ".codex", ".opencode"] as const;
const ADVERTISED_SOURCES = new Set<SkillRoot["source"]>([".claude", ".codex", ".opencode", "opencode-config", "override"]);
const isAdvertisedRoot = (root: SkillRoot): boolean => ADVERTISED_SOURCES.has(root.source);

export async function findGitRoot(cwd: string): Promise<string> {
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

export function filterAdvertisedSkills(skills: readonly Skill[], advertisedRoots: readonly SkillRoot[]): Skill[] {
  const advertisedPaths = new Set(advertisedRoots.map((root) => path.resolve(root.path)));
  return skills.filter((skill) => advertisedPaths.has(path.resolve(skill.root.path)));
}

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "do", "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "use", "when", "with"]);

function words(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function compareCodepoint(a: string, b: string): number {
  const left = Array.from(a, (char) => char.codePointAt(0)!);
  const right = Array.from(b, (char) => char.codePointAt(0)!);
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function skillScore(skill: Skill, query: string): [number, number, number] {
  const queryWords = [...new Set(words(query).filter((word) => !STOP_WORDS.has(word)))];
  const nameWords = words(skill.name);
  const triggerWords = words(skill.trigger ?? "");
  const descriptionWords = words(skill.description);
  let nameMatches = 0;
  let triggerMatches = 0;
  let descriptionMatches = 0;
  for (const word of queryWords) {
    const matches = (tokens: string[]) => tokens.some((token) => token === word || (word.length >= 4 && token.startsWith(word)));
    if (matches(nameWords)) nameMatches++;
    else if (matches(triggerWords)) triggerMatches++;
    else if (matches(descriptionWords)) descriptionMatches++;
  }
  return [nameMatches, triggerMatches, descriptionMatches];
}

/** Deterministically ranks metadata matches without interpreting metadata as instructions. */
export function rankSkills(skills: readonly Skill[], query: string): Skill[] {
  const normalizedQuery = query.trim().toLowerCase();
  const ranked = skills.flatMap((skill) => {
    const exactName = skill.name.toLowerCase() === normalizedQuery;
    const score = skillScore(skill, query);
    return exactName || score.some((matches) => matches > 0) ? [{ skill, exactName, score }] : [];
  });
  ranked.sort((a, b) => Number(b.exactName) - Number(a.exactName) || b.score[0] - a.score[0] || b.score[1] - a.score[1] || b.score[2] - a.score[2] || compareCodepoint(a.skill.name, b.skill.name));
  return ranked.map(({ skill }) => skill);
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
