import { findMatchingEntries } from "./match.js";
import { PACKAGE_NAME } from "./constants.js";
import { runPi } from "./pi-runner.js";
import { loadSettings } from "./settings.js";
import { resolveAgentDir } from "./paths.js";

export interface FlowIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export interface InstallOptions {
  local?: boolean;
  dryRun?: boolean;
  version?: string;
  /** Explicit alias for the unpinned latest install. */
  latest?: boolean;
  agentDir?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  repoRoot?: string;
  io?: FlowIo;
}

const defaultIo: FlowIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
};

export async function install(options: InstallOptions = {}): Promise<number> {
  const io = options.io ?? defaultIo;
  const agentDir = resolveAgentDir(options.agentDir, options.env);
  const scope = options.local ? "project" : "personal";
  const settings = await loadSettings(scope, { agentDir, cwd: options.cwd, repoRoot: options.repoRoot });
  let matching: Awaited<ReturnType<typeof findMatchingEntries>>["entries"] = [];

  const settingsIssue = settings.readError ?? settings.parseError ?? settings.shapeError;
  if (settingsIssue) {
    const kind = settings.readError ? "read" : settings.parseError ? "parse" : "validate";
    io.stderr(`pi-skills: could not ${kind} settings (${settings.path}): ${settingsIssue}; skipping dedupe check`);
  } else {
    matching = (await findMatchingEntries(settings)).entries;
  }

  const spec = options.version !== undefined ? `npm:${PACKAGE_NAME}@${options.version}` : `npm:${PACKAGE_NAME}`;
  let removed = 0;
  for (const entry of matching) {
    const argv = ["remove", entry.entry.source, ...(options.local ? ["--local"] : [])];
    const result = await runPi({ argv, dryRun: options.dryRun });
    if (!result.success) {
      io.stderr(`pi-skills: failed to remove ${entry.entry.source} (exit ${result.exitCode})`);
      return result.exitCode;
    }
    removed += 1;
  }

  const installResult = await runPi({ argv: ["install", spec, ...(options.local ? ["--local"] : [])], dryRun: options.dryRun });
  if (!installResult.success) {
    io.stderr(`pi-skills: failed to install ${spec} (exit ${installResult.exitCode})`);
    return installResult.exitCode;
  }
  io.stdout(`✓ Installed ${spec}${removed > 0 ? ` (removed ${removed} stale entries)` : ""}`);
  io.stdout("tip: Run pi-skills doctor");
  return 0;
}
