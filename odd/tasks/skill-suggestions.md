# Feature: Task-aware skill suggestions (advisory)

Source plan: chat plan "Plan: Add task-aware skill suggestions" (refined 2026-10-01).
Baseline: `f61888a` (main), branch `feat/skill-suggestions`.
Compatibility gate: PASSED against host Pi 1.0.0 — `BeforeAgentStartEvent.prompt: string`, mutable `systemPromptOptions.sections` cloned per run and diffed per run; section key `skill-suggestions` matches `^[a-z][a-z0-9_-]*$`; host wraps section content in `<skill-suggestions>` tags automatically, so the renderer emits raw content and the sanitizer must neutralize that tag in skill fields.

## Scope

- Reuse existing `rankSkills` (name > trigger > description) with `event.prompt`.
- Render top-3 advisory candidates into a separate `skill-suggestions` section; delete it on no match.
- Full `available-skills` catalog stays unchanged (selection guidance, not token savings).
- Prerequisite: parse `disable-model-invocation` and exclude flagged skills from automatic catalog + suggestions; explicit `read_skill_file` resolution preserved; `get_available_skills` behavior unchanged (documented gap).
- No embeddings, no auto-loading/execution, no new tools/dependencies.

## Allowed edit surfaces

- src/core/types.ts
- src/core/frontmatter.ts
- src/core/frontmatter.test.ts
- src/adapter/injection.ts
- src/adapter/injection.test.ts
- README.md

Out of scope: tools.ts, store, discovery ranking weights, package.json, dist/.

## Tasks

- [x] WU1 — Honor hidden-skill metadata (test-first): RED tests in frontmatter.test.ts (true/false/absent/malformed) + injection.test.ts (hidden skill absent from catalog, present in explicit resolution); GREEN: types + parse + filter in injection paths. Checks: pnpm typecheck, focused test file.
- [x] WU2 — Advisory skill-suggestions section (test-first): RED tests in injection.test.ts (matching prompt → ≤3 entries ranked, advisory copy, sanitized, no own wrapper tags; no-match/stopword prompt → section deleted even if previously seeded; catalog block byte-identical with/without suggestions). GREEN: sanitizer extension + renderSuggestionsBlock + handler wiring. Checks: typecheck + focused tests.
- [x] WU3 — Lifecycle + docs: regression test for prompt→unrelated prompt section cleanup; README behavior note (advisory, hidden-skill filtering, known get_available_skills gap). Full checks: pnpm typecheck, lint, test, build. (Regression test codified existing WU2 behavior — no RED applicable; honest evidence recorded.)
- [x] WU4 — Close the documented gap: hidden skills excluded from get_available_skills listing/query results too; read_skill_file resolution preserved; README gap note updated. Test-first. Commit `128f5e9` (RED observed: listing included hidden skill → GREEN 2/2 new, full suite 125/125).

Each WU closes with a Conventional Commit on this branch recording commit hash below.

## Commit evidence

- WU1: `bc41c77`
- WU2: `5726abd`
- WU3: `48cd1c2`
- WU4: `128f5e9`

## Route

Delegated writer (gentle-ai-worker) per work unit; parent verifies and commits.
