import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Skill, SkillRoot, SkillStore } from "../core/types.js";

// Skill fields come from attacker-editable SKILL.md files; they must never break out of the
// <available-skills> block or forge new top-level entries in the rendered system prompt.
function sanitizeSkillField(value: string): string {
  return value
    // Collapse CR/LF and other control characters to spaces so no field can start a new line.
    .replace(/[\p{Cc}]/gu, " ")
    // Neutralize the closing tag (case-insensitive, whitespace-tolerant: a control char collapsed
    // to a space, or literal whitespace, before the closing angle bracket must not revive the tag)
    // so the block cannot be terminated early by any spelling of it.
    .replace(/<\/?\s*available-skills\s*>/gi, "<\\/available-skills>")
    // After the newline collapse, strip a leading hyphen bullet so the rendered entry line stays a single `- name` item.
    .replace(/^(?:\s*-\s*)+/, "");
}

export function renderAvailableSkillsBlock(summaries: readonly Pick<Skill, "name" | "description" | "path">[]): string {
  if (summaries.length === 0) return "";
  const entries = summaries.map(({ name, description, path: skillPath }) =>
    `- ${sanitizeSkillField(name)}\n  Description: ${sanitizeSkillField(description)}\n  Path: ${sanitizeSkillField(skillPath)}`,
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
