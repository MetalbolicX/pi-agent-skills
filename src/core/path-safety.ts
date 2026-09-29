import * as fs from "node:fs/promises";
import * as path from "node:path";

export type SafePathErrorCode = "traversal" | "not_found";

export type SafePathResult =
  | { ok: true; path: string }
  | { ok: false; reason: SafePathErrorCode };

/** Resolve a filename while ensuring its real path remains inside the skill root. */
export async function resolveSafeSkillFilePath(
  skillPath: string,
  filename: string,
): Promise<SafePathResult> {
  if (path.isAbsolute(filename)) return { ok: false, reason: "traversal" };

  const normalizedRoot = path.resolve(skillPath);
  const resolved = path.normalize(path.join(normalizedRoot, filename));
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    return { ok: false, reason: "traversal" };
  }

  let baseReal: string;
  try {
    baseReal = await fs.realpath(normalizedRoot);
  } catch {
    return { ok: false, reason: "not_found" };
  }

  let resolvedReal: string;
  try {
    resolvedReal = await fs.realpath(resolved);
  } catch {
    return { ok: false, reason: "not_found" };
  }

  return resolvedReal === baseReal || resolvedReal.startsWith(baseReal + path.sep)
    ? { ok: true, path: resolvedReal }
    : { ok: false, reason: "traversal" };
}
