import path from "node:path";
import { homedir } from "node:os";
import { findMatchingEntries } from "./match.js";
import { PACKAGE_NAME } from "./constants.js";
import { runPi } from "./pi-runner.js";
import { loadSettings } from "./settings.js";

export interface FlowIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export interface InstallOptions {
  local?: boolean;
  dryRun?: boolean;
  version?: string;
  /** Documented alias for the unpinned install; T5 documents --latest in the README. */
  latest?: boolean;
  agentDir?: string;
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
  const agentDir = options.agentDir ?? process.env.PI_SKILLS_AGENT_DIR ?? path.join(homedir(), ".pi", "agent");
  const scope = options.local ? "project" : "personal";
  const settings = await loadSettings(scope, { agentDir, cwd: options.cwd, repoRoot: options.repoRoot });
  let matching: Awaited<ReturnType<typeof findMatchingEntries>>["entries"] = [];

  if (settings.parseError) {
    io.stderr(`pi-skills: could not read settings (${settings.path}): ${settings.parseError}; skipping dedupe check`);
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
