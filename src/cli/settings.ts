import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAgentDir, resolvePersonalSettingsPath, resolveProjectSettingsPath } from "./paths.js";

export type PackageEntry =
  | { kind: "string"; index: number; raw: string; source: string }
  | { kind: "object"; index: number; raw: Record<string, unknown>; source: string }
  | { kind: "malformed"; index: number; raw: unknown };

export interface Settings {
  path: string | undefined;
  exists: boolean;
  readError?: string;
  parseError?: string;
  shapeError?: string;
  packages: PackageEntry[];
}

export type SettingsScope = "personal" | "project";
export interface LoadSettingsOptions {
  agentDir?: string;
  cwd?: string;
  repoRoot?: string;
}

export async function loadSettings(scopeOrPath: SettingsScope | string, options: LoadSettingsOptions = {}): Promise<Settings> {
  const settingsPath = scopeOrPath === "personal"
    ? resolvePersonalSettingsPath(resolveAgentDir(options.agentDir))
    : scopeOrPath === "project"
      ? resolveProjectSettingsPath({ cwd: options.cwd ?? process.cwd(), repoRoot: options.repoRoot })
      : path.resolve(scopeOrPath);

  if (!settingsPath) return { path: undefined, exists: false, packages: [] };

  let text: string;
  try {
    text = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (isMissing(error)) return { path: settingsPath, exists: false, packages: [] };
    return { path: settingsPath, exists: true, readError: errorMessage(error), packages: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { path: settingsPath, exists: true, parseError: errorMessage(error), packages: [] };
  }
  const hasPackages = parsed !== null && typeof parsed === "object" && "packages" in parsed;
  const packages = hasPackages ? (parsed as { packages?: unknown }).packages : undefined;
  if (hasPackages && !Array.isArray(packages)) {
    return { path: settingsPath, exists: true, shapeError: '"packages" must be an array', packages: [] };
  }
  if (!Array.isArray(packages)) return { path: settingsPath, exists: true, packages: [] };

  return {
    path: settingsPath,
    exists: true,
    packages: packages.map((raw, index): PackageEntry => {
      if (typeof raw === "string") return { kind: "string", index, raw, source: raw };
      if (raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { source?: unknown }).source === "string") {
        return { kind: "object", index, raw: raw as Record<string, unknown>, source: (raw as { source: string }).source };
      }
      return { kind: "malformed", index, raw };
    }),
  };
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
