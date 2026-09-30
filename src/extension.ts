import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createDebugLogger, parseConfig } from "./adapter/config.js";
import { getToolRoots } from "./adapter/roots.js";
import { createSkillStore } from "./core/store.js";
import { getAvailableSkillsTool, readSkillFileTool, runSkillScriptTool } from "./adapter/tools.js";
import { registerInjection } from "./adapter/injection.js";

interface Deps {
  cwd: string;
  home: string;
  env: Record<string, string | undefined>;
  warn?: (line: string) => void;
}

function defaultDeps(): Deps {
  return { cwd: process.cwd(), home: os.homedir(), env: process.env };
}

function activate(pi: ExtensionAPI, deps: Deps): Promise<void> {
  const config = parseConfig(deps.env);
  const logger = createDebugLogger(config.debug, deps.warn);
  const warnings: string[] = [];
  return (async () => {
    const roots = await getToolRoots(deps.cwd, deps.home, config.roots);
    const resolvedRoots = roots.all.map((root) => path.resolve(root.path));
    logger(`discovered ${resolvedRoots.length} roots: ${resolvedRoots.join(", ")}`);
    const store = createSkillStore(roots.all, undefined, (warning) => warnings.push(warning));
    const toolDeps = { store, config, warnings, advertisedRoots: roots.advertised };
    pi.registerTool(getAvailableSkillsTool(toolDeps));
    pi.registerTool(readSkillFileTool(toolDeps));
    pi.registerTool(runSkillScriptTool(toolDeps));
    logger("registered tools: get_available_skills, read_skill_file, run_skill_script");
    registerInjection(pi, { store, advertisedRoots: roots.advertised, logger });
    logger("activation complete");
  })();
}

export default function (pi: ExtensionAPI): Promise<void> {
  return activate(pi, defaultDeps());
}

export function createExtension(deps?: Partial<Deps>): (pi: ExtensionAPI) => Promise<void> {
  return (pi: ExtensionAPI): Promise<void> => activate(pi, { ...defaultDeps(), ...deps });
}
