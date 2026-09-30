# Feature: code-health-remediation

## Status

**IMPLEMENTATION COMPLETE — R1–R8 done.** Every work unit: worker gates green + independent gentle-ai-verify PASS. Native review: R8 candidate (README debug bullet) **approved, authority burned** (`review-ea0eac90f7d890a7`). Review-model note: this provider build reviews **uncommitted working-tree candidates** — committed ranges project to empty candidates, which is why R1–R7 reviews stopped pre-lineage (diagnosis corrected: not a provider defect). Sweep of R1–R7 would require a maintainer-approved unstaging flow; delivery (push/PR/merge/publish) remains a user decision.

## Source

- Code-health audit of `src/` (gentle-ai-explore scout + deep inline verification). Full report delivered in-session; key discoveries saved to Engram (obs 7174).
- Prior-ledger cross-references: `odd/tasks/pi-agent-skills-extension.md` open items JD-A-004/JD-B-001 (override advertising), JD-A-005 (activation promise), JD-B-004/R1-SCAN-KEYWORD-GAPS/R2-SCAN-PRIV-CONSTANTS (scan policy), R3-001 (store/path-safety advisories).
- Live host-contract verification: `ExtensionFactory = (pi) => void | Promise<void>` (pi-coding-agent `types.d.ts:1240`); loader awaits the factory (`loader.js:449`). Custom prompt sections supported (`system-prompt.d.ts:20-21`).

## Locked design decisions (user-approved)

| # | Decision | Value |
|---|----------|-------|
| 1 | Scope | Full remediation plan INCLUDING scan hardening — an intentional, user-approved divergence from upstream regex fidelity (reserves in old ledger closed by this decision) |
| 2 | PI_SKILLS_DEBUG | Implement real debug logging (not removal) |
| 3 | Delivery | Feature branch `feat/code-health-remediation`, one work-unit commit per task, Conventional Commits; push/PR remain user decisions |
| 4 | Native roots | Stay unadvertised (no duplicate advertising with Pi) — override roots get a distinct advertised source |

## Task plan

Each task = one work-unit commit on `feat/code-health-remediation`; tests and docs alongside behavior; commit hash recorded as evidence. TDD mode: disabled (per old ledger); ordinary gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

- [x] **R1 activation-promise** — `activate` returns the registration promise; default export and `createExtension` propagate it (loader contract verified). Remove polling sleeps from `extension.test.ts`/`integration.test.ts`; add regression: firing `before_agent_start` immediately after awaiting the factory renders the `<available-skills>` section (no sleeps). Acceptance: all gates green; no polling in tests.
- [x] **R2 override-advertising** — tag `PI_SKILLS_ROOTS` override roots `source: "override"`; add `"override"` to `ADVERTISED_SOURCES`; keep native roots unadvertised. Tests: override skills appear in block + `get_available_skills`; native roots still excluded. README: replace the known-gap paragraph.
- [x] **R3 debug-logging** — consume `AdapterConfig.debug`: one-line logs (root discovery, tool/hook registration, block render with skill count, activation complete), logger seam injectable for tests, silent when disabled. README config section updated.
- [x] **R4 dead-code** — delete `core/shell-args.ts` (+test), `config.fromEnv` (+test refs), `store.summaries()` + `SkillSummary` (prod-unused), unexport `ApprovalContext`/`Spawn` from `exec.ts`. Gates green.
- [x] **R5 dedupe** — single `findGitRoot` in `core/discovery.ts` (reused by `adapter/roots.ts`); one shared advertised-filter helper for `tools.ts` + `injection.ts`. Behavior-preserving.
- [x] **R6 store-generation** — generation counter in `store.ts` so `invalidate()` mid-scan cannot be resurrected by the in-flight commit; deterministic test via the smallest injectable seam (default behavior unchanged).
- [x] **R7 scan-hardening** — tighten patterns (upstream divergence, approved): setuid-mode-shaped `chmod` matching (no bare `[0-9]{4,}`), keyword-boundary fixes (e.g. `curl-approved` must not flag). Test matrix: negatives (`echo curl-approved`, `chmod 755`, bare years/ports) and positives (`chmod 4755`, `sudo`, `curl URL`, `export PATH`). README Security: "heuristic best-effort prompt, not a sandbox" + divergence note.
- [x] **R8 close-out** — full gates + `pnpm build`, README consistency pass, ledger completion, native reviews recorded.

## Native review ledger (RDD on)

Per work-unit commit: inspect → start → collect → acknowledge. Recorded per task below.

| Task | Commit | Review | Evidence |
|------|--------|--------|----------|
| R1 | `9a9526d` | blocked pre-lineage (see Status — root cause: provider reviews working-tree only; committed ranges → empty candidate). Retried on fresh candidate, identical; deferred per maintainer decision. | Worker: 48/48 tests, typecheck/lint/build clean. Independent gentle-ai-verify: PASS on all 6 checks (diff scope, promise propagation, sleeps removed, no-wait regression, loader contract preserved, gates re-run). |
| R2 | `7801232` | blocked pre-lineage, identical signature on fresh candidate — confirmed deterministic; deferred (see Status root cause). | Worker: 49/49 tests, gates clean. Independent gentle-ai-verify: 6/6 PASS (diff scope, "override" union+advertised, native literals untouched, non-vacuous both-side assertions incl. dedupe-collision case, README honest, gates re-run). |
| R3 | `08d7b6f` | skipped per adjusted plan (deterministic provider block on R1/R2 candidates; one sweep attempt scheduled at R8) | Worker: 53/53 tests, gates clean. Independent gentle-ai-verify: 7/7 PASS (diff scope, R1 promise invariant, silent-when-disabled, 5 one-line log sites with no SKILL.md content logged, non-vacuous sink tests, gates re-run). Nuance deferred to R8: README bullet omits the 4th log line (activation complete). |
| R4 | `ea5f33c` | skipped per adjusted plan (sweep at R8) | Worker: 52/52 tests, gates clean (worker could not delete files; parent staged the two deletions inline, writer did the rest). Independent gentle-ai-verify: 6/6 PASS (exact scope, zero remaining refs, internal types preserved, TTL coverage reshaped, pure-removal diff, gates re-run). |
| R5 | `9718318` | skipped per adjusted plan (sweep at R8) | Worker: 53/53 tests, gates clean; fallback-semantics equivalence verified before merge. Independent gentle-ai-verify: 6/6 PASS (scope, single walk, shared filter at both call sites, R2 invariants intact, structurally non-vacuous resolve-matching test, gates re-run). |
| R6 | `01e4c27` | skipped per adjusted plan (sweep at R8) | Worker: 54/54 tests, gates clean. Independent gentle-ai-verify: 6/6 PASS (scope, guard logic + termination proof, normal path unchanged, deterministic microtask-driven race test — scan count 2, stale absent, fresh cached, gates re-run). Closes old-ledger advisory R3-001 (store.ts). |
| R7 | `ecfe066` | skipped per adjusted plan (sweep at R8) | Worker + one refinement round (parent self-review caught flag-tolerant chmod gap; writer added `-R/-f` forms + cases). Final gates 57/57. Independent gentle-ai-verify: 6/6 PASS (scope, regex set identical to claim, full matrix as real assertions incl. nc-dual-category case, fixtures network-free with traced approval trigger, README heuristic wording, gates re-run). Closes old-ledger items R1-SCAN-KEYWORD-GAPS, R2-SCAN-PRIV-CONSTANTS, JD-B-004-adjacent wording, R4-E2E-EGRESS-STALL. Redirect-write/split-keyword/non-shell-payload evasion debt remains open by design. |
| R8 | this commit | **approved — authority burned** (`review-ea0eac90f7d890a7`, tier low, `non_executable_only`, auto-closed; acknowledged via provider-issued continuation). The approved candidate is the README PI_SKILLS_DEBUG bullet fix reviewed uncommitted. | Full gates re-run at close: 57/57 tests, typecheck, lint, build — ALL GREEN. README consistency nuance (4th debug log line) fixed in the reviewed line. |
