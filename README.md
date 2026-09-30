# pi-agent-skills

A Pi extension that fills skill gaps, ported from `opencode-agent-skills-md` v2.0.1. It provides path-safe skill reads, confined script execution with risk approval, and cross-harness discovery across `.claude`, `.codex`, and `.opencode` user and project scopes, plus `~/.config/opencode/skills`.

## Tools

- `get_available_skills` — list skills advertised from supported non-native roots.
- `read_skill_file` — read a file within a skill; traversal attempts are reported as `traversal-denied`, distinct from `not_found`.
- `run_skill_script` — run scripts in the skill registry allowlist; risk-scanned scripts require `ctx.ui` approval and fail closed when UI is unavailable, and timeout kills the child process.

The tool store is the union of extension roots and Pi-native roots, so native skills can also be read and run. Only non-native roots are advertised in the injected `<available-skills>` system-prompt block and returned by `get_available_skills`.

## Install

```sh
pi install ./pi-agent-skills
pi install npm:pi-agent-skills # after publishing
```

For a one-shot load without installing:

```sh
pi -e ./dist/extension.js
```

Use `/reload` in Pi to reload the extension after changes.

## Configuration

- `PI_SKILLS_ROOTS` — colon-separated custom roots replacing the default roots.
- `PI_SKILLS_SCRIPT_TIMEOUT_MS` — script timeout in milliseconds (default: `30000`).
- `PI_SKILLS_DEBUG` — enable one-line debug logs for root discovery, tool registration, and available-skills block rendering (`1`, `true`, `yes`, or `on`).

`PI_SKILLS_ROOTS` override roots are discovered, reachable through the tools, and advertised in `get_available_skills` and the injected prompt block. Pi-native roots remain tool-reachable but are never re-advertised.

## Security

Scripts must be executable or have a shebang to enter the registry allowlist. The risk scanner checks four categories: network egress, writes outside the skill, privilege escalation, and shell environment mutation. Risk approval is fail-closed when UI is unavailable or approval is denied. Arguments are passed through spawn argument arrays with single-escape handling; no shell is used to construct the command. Advertised skill fields are sanitized before prompt injection.

## Development

Requires Node.js `>=22.19.0` and pnpm. Available scripts:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`prepublishOnly` runs `pnpm build` before publishing. Package metadata targets `dist/extension.js` and includes the build output, this README, and the license. The package is MIT-licensed. Unreviewed follow-ups are documented in `odd/tasks/pi-agent-skills-extension.md`.
