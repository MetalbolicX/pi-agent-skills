import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { DiscoveredSkillFile, Skill } from "./types.js";

export interface ParseResult { skill: Skill | null; warning?: string }

function scalar(input: string): unknown {
  const value = input.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (value.startsWith("[") && value.endsWith("]")) return value.slice(1, -1).split(",").map((item) => scalar(item));
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parseFrontmatter(text: string): Record<string, unknown> | null {
  const match = text.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match?.[1]) return null;
  const result: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 1) continue;
    result[trimmed.slice(0, colon).trim()] = scalar(trimmed.slice(colon + 1));
  }
  return result;
}

export async function parseSkillFile(file: DiscoveredSkillFile): Promise<ParseResult> {
  let content: string;
  try { content = await fs.readFile(file.filePath, "utf8"); }
  catch (error) { return { skill: null, warning: `Cannot read ${file.filePath}: ${String(error)}` }; }
  const data = parseFrontmatter(content);
  if (!data) return { skill: null, warning: `Malformed frontmatter in ${file.filePath}` };
  if (typeof data.name !== "string" || !/^[a-z0-9][\w-]*$/.test(data.name)) return { skill: null, warning: `Invalid skill name in ${file.filePath}` };
  if (typeof data.description !== "string" || data.description.length === 0) return { skill: null, warning: `Missing or invalid description in ${file.filePath}` };
  const skillDir = path.dirname(file.filePath);
  const skill: Skill = {
    name: data.name,
    description: data.description,
    path: skillDir,
    skillDir,
    root: file.root,
    scope: file.root.scope,
    relativePath: file.relativePath,
  };
  if (typeof data.trigger === "string") skill.trigger = data.trigger;
  return { skill };
}
