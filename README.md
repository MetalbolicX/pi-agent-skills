# pi-agent-skills

A Pi extension that fills skill gaps, ported from `opencode-agent-skills-md` v2.0.1. It provides path-safe skill reads, confined script execution with risk approval, and cross-harness discovery across `.claude`, `.codex`, and `.opencode` user and project scopes, plus `~/.config/opencode/skills`.

## Tools

- `get_available_skills` — list skills advertised from supported non-native roots. Optional `query` ranks by task text, and optional integer `limit` (1–100) bounds results. For example, `get_available_skills({ query: "review a TypeScript change", limit: 5 })` returns matching summaries, skill-directory `path`, exact `skillFile`, static usage guidance, and `pagination` (`totalMatched`, `returned`, `truncated`). Blank queries preserve discovery order; unmatched queries return no suggestions. Ranking is deterministic and metadata-only: exact name first, then name tokens, trigger, and description, with codepoint name ordering for ties.
- `read_skill_file` — read a file within a skill; after selecting one, load it with `read_skill_file({ skill: "review-helper", file: "SKILL.md" })` before applying it. Resolve relative references within the returned skill directory. Traversal attempts are reported as `traversal-denied`, distinct from `not_found`. Tool guidance helps the agent adopt this discover-then-load flow but cannot guarantee skill selection or override user scope; scripts are never run automatically.
- `run_skill_script` — run scripts in the skill registry allowlist; risk-scanned scripts require `ctx.ui` approval and fail closed when UI is unavailable, and timeout kills the child process.

The tool store is the union of extension roots and Pi-native roots, so native skills can also be read and run. Only non-native roots are advertised in the injected `<available-skills>` system-prompt block and returned by `get_available_skills`.

## Advisory skill suggestions

For each turn, the extension injects a single `available-skills` system-prompt section: up to three deterministic advisory suggestions (discovery order, never prompt-ranked) followed by the full catalog. Suggestions are candidates to consider, never automatic selections; use `get_available_skills({ query })` for task-ranked results. The section content is byte-stable across renders — it never depends on the current prompt — so mid-run system-prompt re-renders (model switches through bridges such as pi-claude-bridge, resumed sessions) stay identical to the original capture. The host wraps the section in its own `<available-skills>` tags; the extension never emits them itself. Skills with `disable-model-invocation` frontmatter are excluded from the automatic catalog, suggestions, and `get_available_skills`, but remain resolvable with `read_skill_file`.

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

## pi-skills CLI

The package ships a `pi-skills` bin for the install lifecycle; run it with `npx pi-skills` without a global install.

| Command | Behavior |
|---|---|
| `pi-skills install [-v <ver>] [--latest] [--local]` | `-v` pins a version; `--latest` is the documented alias for the default unpinned spec; `--local` writes project scope. |
| `pi-skills uninstall [--purge] [--local]` | `--purge` clears the guarded npm-store copy and prints the `pi update --extensions` reconcile hint. |
| `pi-skills update` | Pinned entries only print a hint: `pi update` never moves a configured pin. Local installs track the working tree. |
| `pi-skills status` | Read-only probe of both scopes, including registry staleness. |
| `pi-skills doctor` | Runs health checks; exits 1 on structural issues. |

`PI_SKILLS_AGENT_DIR` overrides the agent directory for sandboxing and testing. `PI_SKILLS_DEBUG` enables extension debug logging (see Configuration).

Staleness compares only the numeric semver core; prerelease suffixes are stripped. For example, installed `0.2.0-beta.1` compares equal to `0.2.0`.

All mutations delegate to the `pi` CLI (`pi install`, `pi remove`, and `pi update`); `pi-skills` never writes `settings.json` itself.

## Configuration

- `PI_SKILLS_ROOTS` — colon-separated custom roots replacing the default roots.
- `PI_SKILLS_SCRIPT_TIMEOUT_MS` — script timeout in milliseconds (default: `30000`).
- `PI_SKILLS_DEBUG` — enable one-line debug logs for root discovery, tool registration, activation completion, and available-skills block rendering (`1`, `true`, `yes`, or `on`).

`PI_SKILLS_ROOTS` override roots are discovered, reachable through the tools, and advertised in `get_available_skills` and the injected prompt block. Pi-native roots remain tool-reachable but are never re-advertised.

## Security

Scripts must be executable or have a shebang to enter the registry allowlist. The risk scanner heuristically checks four categories: network egress, writes outside the skill, privilege escalation, and shell environment mutation. This is a best-effort approval prompt, not a sandbox or security boundary; scripts still run locally with the user's privileges after approval. Detection patterns intentionally diverge from upstream `opencode-agent-skills-md` v2.0.1. Risk approval is fail-closed when UI is unavailable or approval is denied. Arguments are passed through spawn argument arrays with single-escape handling; no shell is used to construct the command. Advertised skill fields are sanitized before prompt injection.

## Development

Requires Node.js `>=22.19.0` and pnpm. Available scripts:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`prepublishOnly` runs `pnpm build` before publishing. Package metadata targets `dist/extension.js` and includes the build output, this README, and the license. The package is MIT-licensed. Unreviewed follow-ups are documented in `odd/tasks/pi-agent-skills-extension.md`.
