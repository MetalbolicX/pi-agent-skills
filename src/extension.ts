import * as os from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseConfig } from "./adapter/config.js";
import { getToolRoots } from "./adapter/roots.js";
import { createSkillStore } from "./core/store.js";
import { getAvailableSkillsTool, readSkillFileTool, runSkillScriptTool } from "./adapter/tools.js";
import { registerInjection } from "./adapter/injection.js";

interface Deps {
  cwd: string;
  home: string;
  env: Record<string, string | undefined>;
}

function defaultDeps(): Deps {
  return { cwd: process.cwd(), home: os.homedir(), env: process.env };
}

function activate(pi: ExtensionAPI, deps: Deps): Promise<void> {
  const config = parseConfig(deps.env);
  const warnings: string[] = [];
  return (async () => {
    const roots = await getToolRoots(deps.cwd, deps.home, config.roots);
    const store = createSkillStore(roots.all, undefined, (warning) => warnings.push(warning));
    const toolDeps = { store, config, warnings, advertisedRoots: roots.advertised };
    pi.registerTool(getAvailableSkillsTool(toolDeps));
    pi.registerTool(readSkillFileTool(toolDeps));
    pi.registerTool(runSkillScriptTool(toolDeps));
    registerInjection(pi, { store, advertisedRoots: roots.advertised });
  })();
}

export default function (pi: ExtensionAPI): Promise<void> {
  return activate(pi, defaultDeps());
}

export function createExtension(deps?: Partial<Deps>): (pi: ExtensionAPI) => Promise<void> {
  return (pi: ExtensionAPI): Promise<void> => activate(pi, { ...defaultDeps(), ...deps });
}
