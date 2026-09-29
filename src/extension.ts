import * as os from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fromEnv } from "./adapter/config.js";
import { getToolRoots } from "./adapter/roots.js";
import { createSkillStore } from "./core/store.js";
import { getAvailableSkillsTool, readSkillFileTool, runSkillScriptTool } from "./adapter/tools.js";

export default function (pi: ExtensionAPI): void {
  const config = fromEnv();
  const warnings: string[] = [];
  void (async () => {
    const roots = await getToolRoots(process.cwd(), os.homedir(), config.roots);
    const store = createSkillStore(roots.all, undefined, (warning) => warnings.push(warning));
    const toolDeps = { store, config, warnings, advertisedRoots: roots.advertised };
    pi.registerTool(getAvailableSkillsTool(toolDeps));
    pi.registerTool(readSkillFileTool(toolDeps));
    pi.registerTool(runSkillScriptTool(toolDeps));
  })();
}
