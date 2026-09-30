import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { PackageEntry, Settings } from "./settings.js";

export const MATCHED_PACKAGE_NAME = "pi-agent-skills";

export interface MatchingEntry {
  entry: PackageEntry;
  kind: "npm" | "git" | "local";
  identity: string;
  version?: string;
}

export interface UnmatchedLocalEntry {
  entry: PackageEntry;
  kind: "unmatched-local";
  resolvedPath: string;
}

export interface MatchResult {
  entries: MatchingEntry[];
  unmatchedLocal: UnmatchedLocalEntry[];
  duplicates: Map<string, MatchingEntry[]>;
}

export async function matchEntry(entry: PackageEntry, settingsPath: string | undefined): Promise<MatchingEntry | UnmatchedLocalEntry | undefined> {
  const { kind: entryKind } = entry;
  if (entryKind === "malformed") return undefined;
  const { source } = entry;
  const npm = parseNpmSource(source);
  if (npm) return { entry, kind: "npm", identity: `npm:${npm.name}`, version: npm.version };
  const git = parseGitSource(source);
  if (git) return { entry, kind: "git", identity: `git:${git}`, };
  if (!isLocalSource(source)) return undefined;

  const base = settingsPath ? path.dirname(settingsPath) : process.cwd();
  const expanded = source.startsWith("~") ? path.join(homedir(), source.slice(1).replace(/^[/\\]/, "")) : source;
  const resolvedPath = path.resolve(path.isAbsolute(expanded) ? expanded : path.join(base, expanded));
  try {
    const packagePath = path.join(resolvedPath, "package.json");
    const [contents, canonicalPath] = await Promise.all([readFile(packagePath, "utf8"), realpath(resolvedPath)]);
    const metadata: unknown = JSON.parse(contents);
    if (!metadata || typeof metadata !== "object") return { entry, kind: "unmatched-local", resolvedPath };
    const { name } = metadata as { name?: unknown };
    if (name !== MATCHED_PACKAGE_NAME) {
      return { entry, kind: "unmatched-local", resolvedPath };
    }
    return { entry, kind: "local", identity: `local:${canonicalPath}` };
  } catch {
    return { entry, kind: "unmatched-local", resolvedPath };
  }
}

export async function findMatchingEntries(settings: Settings): Promise<MatchResult> {
  const found = await Promise.all(settings.packages.map((entry) => matchEntry(entry, settings.path)));
  const entries = found.filter((entry): entry is MatchingEntry => entry !== undefined && entry.kind !== "unmatched-local");
  const unmatchedLocal = found.filter((entry): entry is UnmatchedLocalEntry => entry?.kind === "unmatched-local");
  const groups = new Map<string, MatchingEntry[]>();
  for (const entry of entries) groups.set(entry.identity, [...(groups.get(entry.identity) ?? []), entry]);
  const duplicates = new Map([...groups].filter(([, group]) => group.length > 1));
  return { entries, unmatchedLocal, duplicates };
}

function parseNpmSource(source: string): { name: string; version?: string } | undefined {
  if (!source.startsWith("npm:")) return undefined;
  const spec = source.slice(4);
  let name: string;
  if (spec.startsWith("@")) {
    const slash = spec.indexOf("/");
    if (slash < 0) return undefined;
    name = `${spec.slice(0, slash)}/${spec.slice(slash + 1).split("@")[0]}`;
  } else {
    name = spec.split("@")[0] ?? "";
  }
  if (name !== MATCHED_PACKAGE_NAME && name !== `@scope/${MATCHED_PACKAGE_NAME}`) return undefined;
  const boundary = spec.slice(name.length);
  if (boundary !== "" && !boundary.startsWith("@")) return undefined;
  const version = boundary.startsWith("@") ? spec.slice(spec.lastIndexOf("@") + 1) : undefined;
  if (version === "") return undefined;
  return { name, version };
}

function parseGitSource(source: string): string | undefined {
  if (!source.startsWith("git:")) return undefined;
  const repoUrl = source.slice(4).replace(/@[^/@]*$/, "");
  const normalized = repoUrl.replace(/\.git$/i, "");
  const basename = normalized.split(/[\\/]/).at(-1);
  return basename === MATCHED_PACKAGE_NAME ? repoUrl : undefined;
}

function isLocalSource(source: string): boolean {
  return source.startsWith("./") || source.startsWith("../") || source.startsWith("/") || source.startsWith("~");
}
