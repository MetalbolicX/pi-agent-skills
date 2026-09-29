import type { Dirent } from "node:fs";

export type SkillScope = "project" | "user";

export interface SkillRoot {
  path: string;
  scope: SkillScope;
  source: ".claude" | ".agents" | ".codex" | ".opencode" | "opencode-config" | "native";
  maxDepth: number;
}

export interface RootsConfig {
  /** Every extension discovery root, in priority order. */
  all: SkillRoot[];
  /** Roots not already indexed natively by Pi; safe to advertise. */
  advertised: SkillRoot[];
}

export interface Skill {
  name: string;
  description: string;
  path: string;
  skillDir: string;
  root: SkillRoot;
  scope: SkillScope;
  relativePath: string;
  trigger?: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  trigger?: string;
}

export interface DiscoveredSkillFile {
  filePath: string;
  relativePath: string;
  root: SkillRoot;
}

export interface WalkOptions {
  skipDirs?: ReadonlySet<string>;
}

export type WalkVisitor = (entry: Dirent, currentDepth: number) => void | Promise<void>;

export type DuplicateWarning = (existing: Skill, duplicate: Skill) => void;

export interface SkillStore {
  all(): Promise<Skill[]>;
  summaries(): Promise<SkillSummary[]>;
  resolve(name: string): Promise<Skill>;
  invalidate(): void;
}
