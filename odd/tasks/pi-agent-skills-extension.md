# Feature: pi-agent-skills Pi extension

## Status

Planning complete. Design decisions locked (below). T1–T2 done (see Evidence log); T3–T8 pending.

## Source

Port of `opencode-agent-skills-md` v2.0.1 at `~/Documents/opencode-agent-skills-md`.
Architecture digest saved to Engram (obs 7167) with file:line references.

## Locked design decisions (user-approved)

| # | Decision | Value |
|---|----------|-------|
| 1 | Location | New standalone repo `~/Documents/pi-agent-skills`; npm name `pi-agent-skills` verified available (404 on registry, 2026-07-27) |
| 2 | Discovery roots (configurable) | Project + user scope for `.claude/skills`, `.agents/skills`, `.codex/skills`, `.opencode/skills`; plus `~/.config/opencode/skills`. OpenCode plugin-cache/marketplace roots NOT included. `~/.codex/skills` layout unverified (no local Codex install) — verify before relying on it |
| 3 | Tool surface | All three: `get_available_skills`, `read_skill_file`, `run_skill_script` |
| 4 | No-UI risk gate | Fail-closed: risk-category hit without UI (`ctx.hasUI === false`) → deny with explanatory string |
| 5 | Dropped from port | Keyword-embeddings preflight (ReScript: Search/Match/Embeddings/Preference/SessionTracker), `oaskills` CLI (OpenCode config mutation), Superpowers bootstrap |
| 6 | Bug fixes over source | (a) Timeout must KILL the child process (source only races the promise — `src/tools/shared.ts:145-192`); (b) port `resolveSafeSkillFilePath`, not dead `isPathSafe`; (c) no double arg-escaping (source CLI bug) — single escape at the shell boundary |

## Toolchain (locked 2026-09-29, user-approved)

| Aspect | Decision | Notes |
|---|---|---|
| Runtime deps | `{}` (none) | Node built-ins only (fs/promises, child_process, path) |
| Tool schemas | Plain JSON Schema objects, cast to `TSchema` | No runtime `typebox` import (type-only). Pi 0.87.1 supplies `typebox` 1.3.27 and types `registerTool<TParams extends TSchema>` |
| Peer deps | `@earendil-works/pi-coding-agent: "*"`, `typebox: "*"` | Documented Pi-package contract (packages.md); type-only imports, never bundled |
| Distribution | **Transpile to JS with rolldown** | `src/extension.ts` → `dist/extension.js` (ESM, platform node); `pi.extensions: ["./dist/extension.js"]`; tests run from `src` via tsx — no build needed for tests; `prepublishOnly` runs build |
| TypeScript | `^7.0.2` | Mirrors source repo (validated with same harness) |
| Test harness | `node --test --import tsx`, colocated `*.test.ts` | Locked in plan |
| Lint | oxlint (`lint: "oxlint src"`) | Added on top of source parity; `.oxlintrc.json` copied verbatim from `~/Documents/pi-rules-md` (dropped its `src/render.golden/` ignore + vitest config refs; test-file overrides kept) |
| devDeps | `typescript ^7.0.2`, `tsx ^4.23.12`, `@types/node ^24`, `rolldown ^1.2.4`, `oxlint ^1`, `@earendil-works/pi-coding-agent 0.87.1` (types), `typebox ^1.3.27` (types/tests) | |
| Engines | `node >=22.19.0` | Matches Pi 0.87.1's own engines floor |
| Module system | ESM (`"type": "module"`) | Locked |
| Package manager | pnpm | Same as source repo |
| npm name / license | `pi-agent-skills` / MIT | Decision 1; MIT parity with source |
| pnpm build-script policy | `allowBuilds: false` for `@google/genai`, `esbuild`, `protobufjs` in `pnpm-workspace.yaml` | pnpm 11+ replaced `ignoredBuiltDependencies` (silently ignored) with explicit `allowBuilds` booleans; scripts unneeded — all gates pass without them |

Verified against installed Pi 0.87.1 (2026-09-29): jiti loads TS locally (no build for dev),
`ExtensionAPI`/`ExtensionContext`/`ToolDefinition`/`SessionCompactEvent`/`SessionShutdownEvent`
exported from the package root, `ctx.hasUI` + `before_agent_start`/`systemPromptOptions`
present in `types.d.ts`, `typebox` is a Pi-supplied runtime package, native skill roots =
project/user skills dirs + `~/.agents/skills` + `.agents/skills` (docs/skills.md).

### Native vs extension roots

Pi natively indexes `.pi/skills`, `.agents/skills` (project, cwd→repo-root), `~/.pi/agent/skills`,
`~/.agents/skills`, plus settings `skills[]`. Consequences:

- **Tool store** scans the union (native + extension roots) so `read_skill_file`/`run_skill_script`
  work on natively-loaded skills too.
- **Injected `<available-skills>` block** and `get_available_skills` advertise ONLY extension
  roots not covered natively (`.claude`, `.codex`, `.opencode` scopes) — no duplicate advertising.
- Native roots listed in decision 2 (`.agents`) are therefore tool-reachable but never re-advertised.

## Architecture (port map)

| Source (opencode plugin) | Target (this repo) | Notes |
|---|---|---|
| `src/skill-ops/{list,read,run,types}.ts` | `src/skill-ops/` TS port, near-verbatim | already host-agnostic via deps port |
| `resolveSafeSkillFilePath` (`src/tools/read-skill-file.ts:31-58`) | `src/core/path-safety.ts` | abs → lexical normalize → realpath both → symlink-escape prefix check |
| Discovery: roots/walker/parse/dedup/store/resolve (`src/{skills,fs-walk,parse,skill-store,match}.ts`) | `src/core/{discovery,walker,frontmatter,store,resolve}.ts` | maxDepth 3, hidden/node_modules/.git skip, realpath cycle dedupe, first-wins + shadow warning, 5s TTL + in-flight dedup, exact→suffix→fuzzy ladder |
| Script registry + risk scanner + escaper (`src/scripts.ts`, `src/tools/shared.ts`) | `src/core/{scripts,scan,shell-args}.ts` | exec-bit or `#!`; categories network-egress / out-of-skill-write / privilege-escalation / shell-env-mutation; Bourne single-quote escaping |
| `tool()` factories | `pi.registerTool()` × 3, plain JSON Schema objects cast to `TSchema`, `content`+`details` results | throw = failed result; no runtime typebox import (toolchain 2026-09-29) |
| `context.ask` approval | `ctx.ui` dialog guarded by `ctx.hasUI`; else fail-closed denial | decision 4 |
| `$` shell execution | `child_process.spawn` + `AbortController` → kill on timeout/abort | decision 6a; cwd = skill dir; absolute command, no `..` |
| `<available-skills>` bootstrap (synthetic parts) | `before_agent_start` → `systemPromptOptions` section | non-native roots only, once per session |
| `session.compacted` → `store.invalidate()` | Pi session events (compaction/session lifecycle) | |
| Config: env only | env: `PI_SKILLS_ROOTS`, `PI_SKILLS_SCRIPT_TIMEOUT_MS` (default 30000), `PI_SKILLS_DEBUG` | defaults encode decision 2 |
| Tests: colocated `*.test.ts`, fixture workspace + HOME swap, ask/shell recorders | same patterns, `node --test --import tsx` | port traversal matrix + risk + denial-never-shells tests |

## Task plan

Each task = one work-unit commit on a feature branch (branch from `main`), tests and docs
alongside behavior, Conventional Commit message, commit hash recorded below as evidence.

- [x] **T1 Scaffold repo** — `package.json` (ESM, `pi-agent-skills`, peerDeps + devDeps + engines per
      Toolchain table), `rolldown.config.js` (`src/extension.ts` → `dist/extension.js`, ESM/node),
      `tsconfig` strict + `noUncheckedIndexedAccess` (TS 7), node:test + tsx harness, oxlint,
      `.gitignore`, README (real content), placeholder extension entry + smoke test.
      Acceptance: `pnpm test`, `tsc --noEmit`, `oxlint src`, `pnpm build` (emits `dist/extension.js`) all green in empty-state.
- [x] **T2 Core: discovery** — roots config (defaults per decision 2), walker, frontmatter
      parse/validate, first-wins dedup + shadow warning, TTL store + in-flight dedup, resolve
      ladder. Port `fs-walk/parse/skill-store/match` unit tests.
- [ ] **T3 Core: path safety** — `resolveSafeSkillFilePath` port + traversal matrix
      (`../`, backslash, absolute, null byte, symlink escape; traversal vs not_found distinction).
- [ ] **T4 Core: scripts + risk** — exec-bit/shebang registry, risk scanner (4 categories),
      arg escaper. Port category matrix + escaping tests.
- [ ] **T5 Pi adapter: tools** — three `registerTool`s; spawn shell w/ AbortSignal kill; timeout;
      cwd/absolute-command invariants; risk approval via `ctx.ui` (fail-closed without UI);
      env config parsing.
- [ ] **T6 Pi adapter: injection** — `before_agent_start` `<available-skills>` block
      (non-native roots only), once-per-session idempotency, session-event store invalidation.
- [ ] **T7 Integration tests** — fixture workspace + HOME swap, real `sh` execution, fake-UI
      ask-recorder (denial → shell never called), symlink-escape e2e.
- [ ] **T8 Packaging & install** — `prepublishOnly` build gate, `files: ["dist", …]`,
      `pi.extensions: ["./dist/extension.js"]`, install (`pi install ./` or npm pack),
      `/reload` smoke test in live Pi, README usage docs.

## Open items (not blockers)

- **R3-001 follow-up (advisory, non-blocking)**: native review flagged `src/core/store.ts:35-39` (`ensure` — TTL/in-flight caching) as reliability WARNING / informational. No correction opened; review stands approved. Revisit cache/failed-scan semantics when touching the store (T5 wiring).

- Verify Codex skills layout (`~/.codex/skills`?) once Codex CLI is present; roots are config-driven.
- npm publish + package distribution: user decision after T8.
- Review workload: tasks are scoped small; T5/T7 are the largest.

## Evidence log

| Task | Commit | Date | Checks |
|------|--------|------|--------|
| T1 Scaffold | `53fa3fd` | 2026-09-29 | worker: all 5 gates green; verify: clean-room `pnpm install` exit 0 (after `allowBuilds` fix), test 1/1, typecheck/lint clean, rolldown build emits ESM `dist/extension.js`; 11 structural checks PASS (independent gentle-ai-verify) |
| T2 Discovery core | `34475cd` | 2026-09-29 | worker ×2 (impl + 4 source-fidelity alignments); verify PASS ×2 — 20/20 tests, gates green, port fidelity vs source confirmed; native review (RDD): assess unassessable → started at base 53fa3fd; tier medium, lens review-reliability; **approved**, acknowledged, authority burned; advisory R3-001 (store.ts:35-39, informational) |

## Process decisions (ODD ledger)

- **TDD mode**: disabled. Source: ODD default — no project/session TDD config exists and the user made no TDD choice (strict TDD is bound to the SDD cycle in this harness). Ordinary checks: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Forwarded to every implementation delegation.
- **RDD ledger**: T1 — no assess run (process debt; scaffold-only candidate, placeholder entry). T2 — assess `unassessable` (native schema failure, no diagnostic) → treated high → native review started at base `53fa3fd` (committed range) → tier medium, lens review-reliability → **approved** → acknowledged, authority burned. Last reviewed boundary: `34475cd`.
- **Delivery ledger**: forecast ≈ 2,400 authored lines total (T1–T8, generated files excluded). Running count: T1 ≈ 150 + T2 = 508 → **≈ 658** (crossed the ~400 budget at T2). Strategy `ask-on-risk` (default): chain-strategy question asked at T2 close — outcome recorded here once answered.
