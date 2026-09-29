# pi-agent-skills

A Pi extension that fills skill gaps with three tools: `get_available_skills`, `read_skill_file`, and `run_skill_script`. It discovers skills in cross-harness `.claude/skills`, `.codex/skills`, and `.opencode/skills` folders. Pi continues to load its native skills through its built-in mechanism.

## Status

Scaffold complete (T1 of T8). The tools and discovery behavior will be implemented in subsequent tasks; this package is not yet feature-complete.

## Development

Requires Node.js >=22.19.0 and pnpm.

- `pnpm install` — install development dependencies
- `pnpm test` — run tests
- `pnpm typecheck` — type-check source
- `pnpm lint` — lint source
- `pnpm build` — build `dist/extension.js`

Full usage and installation documentation will be added in T8.
