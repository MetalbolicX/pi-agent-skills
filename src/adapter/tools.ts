import * as fs from "node:fs/promises";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { filterAdvertisedSkills } from "../core/discovery.js";
import { resolveSafeSkillFilePath } from "../core/path-safety.js";
import type { SkillRoot, SkillStore } from "../core/types.js";
import type { AdapterConfig } from "./config.js";
import { executeSkillScript } from "./exec.js";

export interface ToolDeps {
  store: SkillStore;
  advertisedRoots: readonly SkillRoot[];
  config: AdapterConfig;
  warnings?: string[];
}

function result(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], details: undefined, ...(isError ? { isError: true } : {}) };
}

const skillParams = { type: "object", properties: {}, required: [], additionalProperties: false } as TSchema;
const fileParams = { type: "object", properties: { skill: { type: "string", description: "Skill name" }, file: { type: "string", description: "Relative file path inside the skill" } }, required: ["skill", "file"], additionalProperties: false } as TSchema;
const scriptParams = { type: "object", properties: { skill: { type: "string" }, script: { type: "string", description: "Registered script path relative to the skill" }, args: { type: "array", items: { type: "string" } } }, required: ["skill", "script"], additionalProperties: false } as TSchema;

type Params = Record<string, unknown>;

export function getAvailableSkillsTool(deps: ToolDeps): ToolDefinition<typeof skillParams> {
  return {
    name: "get_available_skills", label: "Available skills",
    description: "List discovered skills and their summaries. Use this first when identifying a skill that can help with the user's task.",
    parameters: skillParams,
    async execute() {
      const skills = filterAdvertisedSkills(await deps.store.all(), deps.advertisedRoots)
        .map(({ name, description, trigger }) => ({ name, description, ...(trigger === undefined ? {} : { trigger }) }));
      const warnings = deps.warnings ?? [];
      return result(JSON.stringify({ skills, warnings }, null, 2));
    },
  };
}

export function readSkillFileTool(deps: ToolDeps): ToolDefinition<typeof fileParams> {
  return {
    name: "read_skill_file", label: "Read skill file",
    description: "Read a file belonging to a discovered skill, such as its SKILL.md or supporting reference. Use after selecting a skill; paths must stay inside that skill.",
    parameters: fileParams,
    async execute(_id, params: Params) {
      const skill = await deps.store.resolve(String(params.skill));
      const safe = await resolveSafeSkillFilePath(skill.skillDir, String(params.file));
      if (!safe.ok) return result(safe.reason === "traversal" ? "Denied: the requested path escapes the skill directory." : "File not found in the skill directory.", true);
      try { return result(await fs.readFile(safe.path, "utf8")); }
      catch { return result("File not found in the skill directory.", true); }
    },
  };
}

export function runSkillScriptTool(deps: ToolDeps): ToolDefinition<typeof scriptParams> {
  return {
    name: "run_skill_script", label: "Run skill script",
    description: "Run an executable script registered inside a discovered skill. Use only when the skill's instructions call for a helper script; arguments are passed literally without shell interpretation.",
    parameters: scriptParams,
    async execute(_id, params: Params, signal: AbortSignal | undefined, _update: unknown, ctx: ExtensionContext) {
      const args = Array.isArray(params.args) ? params.args.map(String) : [];
      const output = await executeSkillScript(deps.store, deps.config, String(params.skill), String(params.script), args, ctx, signal);
      return result(output.output, output.status !== "completed");
    },
  };
}
