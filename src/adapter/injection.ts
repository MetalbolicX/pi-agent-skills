import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Skill, SkillRoot, SkillStore } from "../core/types.js";

export function renderAvailableSkillsBlock(summaries: readonly Pick<Skill, "name" | "description" | "path">[]): string {
  if (summaries.length === 0) return "";
  const entries = summaries.map(({ name, description, path: skillPath }) =>
    `- ${name}\n  Description: ${description}\n  Path: ${skillPath}`,
  ).join("\n");
  return `<available-skills>\n${entries}\n\nThese skills come from folders Pi does not index natively (.claude/.codex/.opencode user and project scopes, and ~/.config/opencode/skills). Use get_available_skills to list them, read_skill_file to read their files, and run_skill_script to run their registered scripts.\n</available-skills>`;
}

export function registerInjection(pi: ExtensionAPI, deps: { store: SkillStore; advertisedRoots: readonly SkillRoot[] }): void {
  pi.on("before_agent_start", async (event) => {
    const advertisedPaths = new Set(deps.advertisedRoots.map((root) => path.resolve(root.path)));
    const skills = (await deps.store.all()).filter((skill) => advertisedPaths.has(path.resolve(skill.root.path)));
    const block = renderAvailableSkillsBlock(skills);
    if (block) event.systemPromptOptions.sections["available-skills"] = block;
    else delete event.systemPromptOptions.sections["available-skills"];
  });
  pi.on("session_compact", () => deps.store.invalidate());
}
