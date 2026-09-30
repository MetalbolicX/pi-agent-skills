import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DEBUG, debug } from "./debug.js";
import { install } from "./install.js";
import { uninstall } from "./uninstall.js";
import { status } from "./status.js";
import { update } from "./update.js";

export const USAGE = `Usage: pi-skills <command> [options]

Commands:
  install    Install pi-agent-skills
  uninstall  Uninstall pi-agent-skills
  update     Update pi-agent-skills
  status     Show installed versions and registry status
  doctor     Check installation health

Global options:
  --dry-run       Show actions without running them
  --local, -l     Use project-local scope
  --help, -h      Show this help

Install options:
  --version, -v <ver>  Install an exact version
  --latest             Install the latest version

Uninstall options:
  --purge         Remove cached package files
`;

export type Command = "install" | "uninstall" | "update" | "status" | "doctor";

export interface CliOptions {
  dryRun: boolean;
  local: boolean;
  help: boolean;
  version?: string;
  latest: boolean;
  purge: boolean;
}

export interface ParsedCliArgs {
  command: Command;
  options: CliOptions;
}

const COMMANDS: readonly Command[] = ["install", "uninstall", "update", "status", "doctor"];
export function parseCliArgs(args: string[]): ParsedCliArgs {
  if (args.length === 0) throw new Error("No command provided");

  if (args[0] === "--help" || args[0] === "-h") {
    return {
      command: "status",
      options: { dryRun: false, local: false, help: true, latest: false, purge: false },
    };
  }

  const command = args[0] as Command;
  if (!COMMANDS.includes(command)) throw new Error(`Unknown command: ${args[0]}`);

  const options = {
    "dry-run": { type: "boolean" as const },
    local: { type: "boolean" as const, short: "l" },
    help: { type: "boolean" as const, short: "h" },
    ...(command === "install" ? {
      version: { type: "string" as const, short: "v" },
      latest: { type: "boolean" as const },
    } : {}),
    ...(command === "uninstall" ? { purge: { type: "boolean" as const } } : {}),
  };

  const parsed = parseArgs({ args: args.slice(1), options, strict: true, allowPositionals: false });
  return {
    command,
    options: {
      dryRun: parsed.values["dry-run"] ?? false,
      local: parsed.values.local ?? false,
      help: parsed.values.help ?? false,
      version: typeof parsed.values.version === "string" ? parsed.values.version : undefined,
      latest: typeof parsed.values.latest === "boolean" ? parsed.values.latest : false,
      purge: typeof parsed.values.purge === "boolean" ? parsed.values.purge : false,
    },
  };
}

export interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  env: Record<string, string | undefined>;
}

const defaultIo: CliIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  env: process.env,
};

export async function runCli(args: string[], io: CliIo = defaultIo): Promise<number> {
  let parsed: ParsedCliArgs;
  try {
    parsed = parseCliArgs(args);
  } catch (error) {
    io.stderr(`pi-skills: ${error instanceof Error ? error.message : String(error)}`);
    io.stderr(USAGE);
    return 2;
  }

  if (parsed.options.help) {
    io.stdout(USAGE);
    return 0;
  }

  if (DEBUG.test(io.env.PI_SKILLS_DEBUG?.trim() ?? "")) {
    debug(io.stderr, `command: ${parsed.command}`);
  }

  const agentDir = io.env.PI_SKILLS_AGENT_DIR;
  if (parsed.command === "status") {
    return status({ agentDir, env: io.env, io });
  }
  if (parsed.command === "update") {
    return update({ dryRun: parsed.options.dryRun, agentDir, env: io.env, io });
  }

  if (parsed.command === "install") {
    return install({
      dryRun: parsed.options.dryRun,
      local: parsed.options.local,
      version: parsed.options.version,
      latest: parsed.options.latest,
      agentDir,
      io,
    });
  }
  if (parsed.command === "uninstall") {
    return uninstall({
      dryRun: parsed.options.dryRun,
      local: parsed.options.local,
      purge: parsed.options.purge,
      agentDir,
      io,
    });
  }

  io.stderr(`${parsed.command}: implemented in a later work unit`);
  return 1;
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : undefined;
if (invoked && import.meta.url === pathToFileURL(invoked).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
