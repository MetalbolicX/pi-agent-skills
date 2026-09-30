# Feature: pi-skills CLI (install / uninstall / update)

## Status

**FEATURE COMPLETE AND MERGED — T1–T5 done (2026-09-30).** All native reviews approved (5 lineages; 3 bounded corrections total). DELIVERED: merged to main as `e90970e` by user instruction; automation feature merged FF on top of the same base (24e1213 + cd44136); branches deleted after merge; post-merge gates 113/113 + typecheck/lint/build PASS. Remaining user decisions: npm publish (name verified available; dist now built from committed source only) + the README CLI section / three small T5-advisory fixes as a follow-up commit on main.

## Source

Adaptation of upstream `oaskills` plugin-management CLI (`opencode-agent-skills-md` v2.0.1,
`~/Documents/opencode-agent-skills-md/src/cli/`). Upstream mechanics (scout report 2026-09-30):
hand-edits `$OPENCODE_CONFIG_DIR/opencode.json` (JSONC strip, drop old entries, append specifier,
3 rotating backups, atomic temp+rename), `update` delegates fetch to
`opencode plugin <name> --global --force`, staleness via GET
`registry.npmjs.org/<pkg>/latest` (3s timeout, fail-soft). No prompts; `--dry-run` everywhere;
exact-version pins or literal `latest`; exit codes 0/1/2.

## Locked design decisions (user-approved 2026-09-30)

| # | Decision | Value |
|---|----------|-------|
| 1 | Architecture | **Wrap the `pi` CLI.** All mutations go through `pi install` / `pi remove` / `pi update` child processes. Our code NEVER writes `settings.json`; reads it only (status/doctor/dedupe detection). No faithful port of upstream's config mutation — Pi owns settings semantics (identity, dedup, project trust, object-form filters). |
| 2 | Command surface | All five: `install`, `uninstall`, `update`, `status`, `doctor` |
| 3 | Bin name | `pi-skills` (npm bin → `dist/cli.mjs`) |
| 4 | Version pinning | Parity with upstream: `-v <ver>` exact pin (`npm:pi-agent-skills@<ver>`), `--latest` = unpinned default. No semver ranges, no lock file. |
| 5 | Exit codes | 0 ok · 1 failure (doctor: structural issues) · 2 usage error (strict parseArgs, unknown flag = 2) |
| 6 | Network | One endpoint only: `registry.npmjs.org/pi-agent-skills/latest`, 3s `AbortSignal.timeout`, fail-soft `null` → printed as `unknown`. Never blocks install/uninstall/update. |
| 7 | Runtime deps | None — Node built-ins (`node:child_process`, `node:fs/promises`, `node:path`, `node:os`, `node:process`, `node:util`). Same toolchain lock as the extension. |
| 8 | Arg parsing (user-added 2026-09-30) | CLI argument parsing **exclusively via `parseArgs` from `node:util`** (strict mode: unknown flag → usage error exit 2). No third-party CLI frameworks (commander/yargs/etc.). |
| 9 | Tests network-free | Registry fetch behind injectable fetch (lesson: R4-E2E-EGRESS-STALL); fake `pi` bin on PATH as argv recorder (T7 patterns). |

## Value-add over raw `pi` commands (why this exists)

1. **Dedupe-first install**: `pi install` does not dedupe (live evidence: `npm:gentle-engram` +
   `npm:gentle-engram@0.1.12` both in the user's `settings.json`). `pi-skills install` removes
   every existing `pi-agent-skills` entry first, then installs one.
2. **Staleness probe** (`status`/`doctor`): installed version vs registry latest without
   running the update.
3. **Single entry point**: lifecycle of this extension behind one discoverable command.

## Pi-side mechanics (verified 2026-09-30 against Pi 0.87.1)

- Personal settings `~/.pi/agent/settings.json`, project `.pi/settings.json` (`--local` writes
  there; project entries are trust-gated). `packages[]` holds string sources
  (`npm:pi-agent-skills`, `npm:pi-agent-skills@0.2.0`, `../../Documents/pi-agent-skills`,
  `git:github.com/x/pi-agent-skills@v1`) or object form `{ "source": ... }` with resource filters.
- Native commands: `pi install <source> [--local]`, `pi remove <source>` / `pi uninstall`
  alias, `pi update <source>` / `pi update --extensions`, `pi list`, `pi config`.
- npm sources materialize at `~/.pi/agent/npm/node_modules/<name>` (read its `package.json`
  for the installed version). Local paths load in place (no copy — version = working tree).
- Versioned npm specs are pinned; `pi update` does not move a configured pin.

## Architecture

```
src/cli/
  main.ts        argv parse via node:util parseArgs (strict), dispatch,
                 USAGE, exit codes                                      (~ upstream main.ts)
  pi-runner.ts   spawn `pi` (PATH), 30s SIGKILL, exit-code propagation,
                 --dry-run printer, ENOENT → friendly hint
  paths.ts       settings paths (personal/project), npm-store path,
                 own-package resolution (repo-run vs bin-run)
  settings.ts    READ-ONLY settings reader: packages[] extraction,
                 string + object forms, duplicate detection
  match.ts       entry matching for THIS package: npm exact name (pinned or not),
                 local path whose package.json name === pi-agent-skills,
                 git source containing pi-agent-skills
  install.ts     dedupe-first → pi install                              (~ upstream install.ts)
  uninstall.ts   pi remove each match; --purge store dir; no-op message  (~ upstream uninstall.ts)
  update.ts      pinned→hint install -v; unpinned→pi update; local→explain (~ upstream update.ts)
  registry.ts    npm latest fetch (injectable), homegrown semver compare,
                 prerelease-tolerant, fail-closed equal                 (~ upstream registry.ts)
  status.ts      Installed/Specifier/Scope/Version/Latest/stale hint    (~ upstream status.ts)
  doctor.ts      status + structural checks, exit 1 on issues           (~ upstream doctor.ts)
```

Divergences from upstream (adaptation, not port):
- **No config writing at all** (decision 1) → no JSONC handling, no backup rotation, no atomic
  write module. Upstream needed those; Pi's CLI does it correctly for us.
- **No `opencode plugin` spawn** → `pi update <source>` instead.
- **Purge target** = `~/.pi/agent/npm/node_modules/pi-agent-skills` (upstream: opencode cache dir).
- **Two scopes** (`--local` project vs personal) — upstream was global-only.
- **Local-path installs** are first-class (this repo's own dev mode): version read from the
  working tree, update explains there is nothing to fetch.

### Command contracts

| Command | Flow |
|---|---|
| `pi-skills install [-v <ver>] [--latest] [--local] [--dry-run]` | spec = `npm:pi-agent-skills[@ver]` → for each matching entry in target scope: `pi remove <entry> [--local]` → `pi install <spec> [--local]` → `✓ Installed` + removed-entries note + `tip: pi-skills doctor` |
| `pi-skills uninstall [--purge] [--local] [--dry-run]` | matches in target scope → `pi remove <each>` → `--purge`: rm -rf npm-store dir if present (path-guarded: exact name inside store) → none: `✓ Not installed` exit 0 |
| `pi-skills update [--dry-run]` | local install → explain + exit 0 · pinned + newer available → hint `pi-skills install -v <latest>` (update won't move pin) · else `pi update npm:pi-agent-skills` |
| `pi-skills status` | both scopes, read-only: entries, specifiers, installed version (store or tree), registry latest (fail-soft), stale hint |
| `pi-skills doctor` | status + structural checks: duplicate entries (exit 1), installed `dist/extension.js` present, bin present, node ≥ 22.19, settings JSON parseable; stale = warning line |

Shared: `--dry-run` prints each exact `pi …` command with `[dry-run]` prefix and runs nothing;
`PI_SKILLS_DEBUG=1` debug lines (parity with extension env config); no interactive prompts.

## Task plan

Each task = one work-unit commit on a feature branch (branch first when on `main`), tests and
docs alongside behavior, Conventional Commit message, hash recorded below.

- [x] **T1 Skeleton + pi-runner** — `package.json` bin entry, rolldown second entry
      (`src/cli/main.ts` → `dist/cli.mjs`), strict parseArgs + dispatch + USAGE, pi-runner
      (PATH spawn, 30s SIGKILL, exit propagation, dry-run printer, ENOENT hint), fake-pi
      PATH-recorder test harness.
      Acceptance: `pnpm test/typecheck/lint/build` green; `node dist/cli.mjs --help` works;
      `pi-skills status` placeholder prints.
- [x] **T2 Read-only settings + matching** — paths, settings reader (personal + project,
      string + object forms, malformed JSON fail-soft), entry matcher (npm/local/git), duplicate
      detection. HOME-swap fixtures.
- [x] **T3 install + uninstall** — dedupe-first install flow, uninstall with `--purge`,
      no-op paths, messages, dry-run. Fake-pi argv-sequence assertions (dedupe before install).
- [x] **T4 update + registry + status** — injectable registry fetch (3s timeout fail-soft),
      semver compare, status report (both scopes, stale hint), update flows (pinned hint /
      unpinned pi update / local explain). Network-free tests.
- [x] **T5 doctor + packaging** — doctor checks + exit codes, README CLI section, `npm pack`
      includes bin, full gates, live `pi-skills status` smoke against real settings.
      (README CLI section DEFERRED — see Open items; the parked automation diff owns README.md.)

Estimate: ~600–750 prod lines + ~600 test lines across 5 tasks.

## Open items / notes

- **npm publish still pending** (user decision, port T8): `pi-skills install/update` against
  `npm:` sources require the package on the registry. Until then the CLI runs from the repo
  (`pnpm exec` / `node dist/cli.mjs`) and handles the existing local-path install
  (`../../Documents/pi-agent-skills` is in the user's live settings).
- **Windows**: `spawn('pi')` needs the `.cmd` shim on win32 (or shell:true with escaping).
  POSIX-first parity (repo precedent: win32 fail-closed in scan.ts); guard documented.
- **Project trust**: our read-only peek at `.pi/settings.json` may show entries Pi itself
  won't load until trust is granted; doctor reports the distinction best-effort.
- **git-source installs**: version read from Pi's git checkout if locatable, else `unknown`.
- Upstream `--yes` flag was reserved-unused; not carried over (dead surface).

## Evidence log

| Task | Commit | Date | Checks |
|------|--------|------|--------|
| T1 Skeleton + pi-runner | `a2f8109` + correction `a8d25a7` | 2026-09-30 | worker (interaction: TDD resolution confirmed off, ODD default) + parent readback; gates 70/70 tests, typecheck/lint/build PASS; smoke `--help` 0 / status placeholder / bogus 2; parent tweak: parse-error line before USAGE (test updated, type-safe under noUncheckedIndexedAccess); commit a2f8109 staged by parent by explicit path (automation diff untouched, unstaged) |

| T2 Read-only settings + matching | `fea1f4e` | 2026-09-30 | worker 1 round (TDD off, ODD default); gates 80/80 tests, typecheck/lint/build PASS, smoke unchanged; OS-tmp fixtures per R2-7 advisory; shared debug module closes R2-3 (R1 advisory); parent readback (match.ts identity/boundary rules, settings fail-soft, debug refactor minimal) + explicit-path commit by parent; native review review-bb11e32df6ecaec7: tier high, 4 lenses, ZERO corrections — **APPROVED**, acknowledged, authority burned; 11 informational advisories recorded below |

| T3 install + uninstall | `3bc0717` | 2026-09-30 | worker 1 round (TDD off); gates 95/95 tests, typecheck/lint/build PASS, smoke green; **INCIDENT during development**: an early worker test run invoked the uninstall flow against the REAL personal settings and `pi` removed the local `../../Documents/pi-agent-skills` entry — parent restored the entry (JSON validated, `pi list` confirms extension loads again); lesson recorded: flow code with real-homedir defaults is live-fire, never execute outside tests without a sandboxed agentDir (T5 live smoke must inject one); T2 advisories folded: git identity strips .git (R3-GIT-IDENTITY), UnmatchedLocalEntry.cause (R4-MATCH-CAUSE), shared PACKAGE_NAME constant (R2-003), parenthesized walk guard (R2-001), tilde/repoRoot tests (R3-TILDE-COVERAGE/R3-REPOROOT-COVERAGE); native review review-43264e5c2fd4d49b: tier medium, single lens review-reliability, zero corrections — **APPROVED**, acknowledged, authority burned |

| T4 update + registry + status | `84be7b2` + correction `ade98d2` | 2026-09-30 | worker 1 round (TDD off); gates 105/105 tests (pre-stash), typecheck/lint/build PASS; PI_SKILLS_AGENT_DIR sandbox interlock added (incident-driven); T3 advisories folded (runCli dispatch tests, purge zero-entries reporting, --latest alias comment); parent readback (registry fail-soft + abort cleanup, semver fail-closed, update scope handling); commit by parent; native review review-36e74cbd07330b7a: tier high, 4 lenses → correction_required → correction plan 90/200 diff lines → corrected candidate ade98d2 (zero-match purge scoped to personal; dispatch tests hermetic) → targeted validation passed (original criteria + no regressions) → **APPROVED**, acknowledged, authority burned |

| T5 doctor + packaging | `6d75031` | 2026-09-30 | worker 1 round (TDD off); gates 113/113 tests, typecheck/lint/build PASS; advisory pipeline CLOSED: settings read/parse/shape discrimination (R4-SETTINGS-SHAPE/EXISTS, R2-002, R3-SETTINGS-READFAIL), shared resolveAgentDir + scopes.ts preamble (R2-agent-dir-fallback-variants, R2-preamble-duplication), registry VERSION_PATTERN gate with injection-payload tests (R1-registry-version-output-injection), update pin-message split + entry-source dispatch + failure-path test (R2-unconfirmed-message, R3-hardcoded-npm-target, R3-update-failure-unproved); parent: npm pack tarball exactly 5 files (LICENSE/README/dist/cli.mjs/dist/extension.js/package.json), SANDBOXED lifecycle smoke (PI_SKILLS_AGENT_DIR + fake-pi PATH: install dry-run/install/status/update/uninstall dry-run/uninstall — one real spawn recorded, dry-runs spawn nothing), READ-ONLY real smoke: `pi-skills status` → `personal: ../../Documents/pi-agent-skills (local, installed 0.1.0)` exit 0, settings unmutated; native review review-3ecc2e47acf1bcbb: tier high, 4 lenses, risk lens ZERO findings (format gate verified closing the injection path), zero corrections — **APPROVED**, acknowledged, authority burned. **README CLI section DEFERRED** (see Open items). |

### Follow-up commit (2026-09-30, post-publish): `2b2f61d` fix(cli): close T5 advisories and document the pi-skills CLI

Closes: README CLI section (deferred from T5), R4-SHAPE-VALIDATION-GAP (non-object settings root now shapeError), R3-doctor-pinned-keying (pinned staleness keyed on the pin; unreadable store + stale pin still warns), R3-update-project-scope-argv (project-scope git argv test). Native review review-68fad983d599489f: tier high, 4 lenses, ZERO corrections — APPROVED, acknowledged, authority burned. Gates 115/115. Merged to main (ff), branch deleted. Residual advisories from this review (informational, backlog): doctor stale-operand compound condition readability, root-shape test naming visibility, warning-string duplication in tests, README staleness-operand note, JSON-null root test gap. Note: published 0.1.0 predates this commit; ship 0.1.1 when convenient (`pnpm publish`, interactive OTP).
- **R4-DISPATCH-FALLTHROUGH / R2-doctor-tail-dispatch / R3 main.ts:149**: the runCli tail now calls doctor for any command the dispatch chain does not handle; parseCliArgs rejects unknown commands today, so the tail is dead code — but a future subcommand added to COMMANDS without a dispatch branch would silently run doctor and exit 0. T6+: explicit doctor case + tail that never succeeds silently.
- **R4-SHAPE-VALIDATION-GAP**: settings root that is a bare JSON array (non-object) parses as valid-empty — doctor certifies malformed settings healthy. Small settings.ts fix in the docs-commit window.
- **R3-doctor-pinned-keying**: pinned staleness keyed on store version while messages print the pin; unreadable installed + stale pin prints nothing. Small doctor.ts fix in the docs-commit window.
- **R3-update-project-scope-argv**: project-scope git/local update argv shape untested (behavior change from T4) — add a test in the docs-commit window.
- **R2-dup-settings-error-labels / R2-node-baseline-literal / R2-triple-version-pattern / R2-read-version-alias / R2-mixed-stale-sources / R2-double-array-guard**: naming/constant/alias polish (four triage copies with divergent shape label, 22.19.0 literal ×3+test, version validator defined twice, readPackageVersion alias, stale-source comment, adjacent array guards). Backlog polish.
- **R3 main.test.ts doctor dispatch hermeticity**: doctor dispatch assertions depend on ambient node version (≥22.19 machine ok) + cwd-resolved project settings — inject nodeVersion/cwd in a follow-up.

### T4 review advisories (informational — fold into T5)
- **R1-registry-version-output-injection**: fetched registry version reaches CLI output/suggested commands with no format gate (tampered response → terminal control sequences / metacharacters). T5: strict format gate at the registry boundary (e.g. ^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$ → else null).
- **R1/R4 zero-match purge scope**: FIXED in ade98d2 (project scope reports, personal scope purges guarded).
- **R2-agent-dir-fallback-variants / R2-status-update-preamble-duplication**: agentDir precedence in 4 files in 2 shapes; scope-loading preamble duplicated — extract shared helper in T5 (low churn, high clarity).
- **R2-update-unconfirmed-message**: one message covers both unreachable registry and confirmed-current pin — split in T5.
- **R2-fetch-timeout-scope**: timeoutMs bounds only the fetch race, not the body read; document or extend (comment at minimum).
- **R3-prerelease-stale**: prerelease install compares equal to its stable release (no stale flag) — accepted upstream-style prerelease-stripping divergence, document in T5 README notes or revisit.
- **R3-update-failure-unproved / R3-hardcoded-npm-target**: update failure path untested; npm target uses fixed literal while git/local use entry source — small T5 polish alongside the doctor work.
- **R2-test-asserts-host-home-state / R3-test-home-state-assert / R3-unsandboxed-dispatch-test**: FIXED in ade98d2 (hermetic dispatch tests; fixture assertion; sandbox interlock validated).

### T3 review advisories (folded: dispatch tests and purge semantics done in T4; --latest doc pending T5)
- **R3-dispatch-coverage**: install/uninstall dispatch through runCli untested (tests drive flows directly) — add a runCli-level sequence test in T4/T5.
- **R3-purge-silent-skip**: `uninstall --purge` with zero matching entries silently succeeds without reporting the store — reconsider purge semantics on the not-installed path in T4/T5 (report "nothing to purge" or purge anyway with explicit confirmation).
- **R3-latest-unused**: `--latest` is dead plumbing (unread); document it as the unpinned alias in the README (T5) or remove it.

### T2 review advisories (folded: all fixed in T3 except the settings semantics deferred to T4/T5)
- **settings.ts shape/exists semantics** (R4-SETTINGS-SHAPE, R4-SETTINGS-EXISTS, R2-002, R3-SETTINGS-READFAIL): non-array `packages` field reports as valid-empty with no diagnostic; non-ENOENT read failure sets `exists:false` + `parseError` (contradiction; field name misleading). Fix in T4/T5 doctor: report shape errors + distinguish readError from parseError.
- **match.ts diagnostics + identity** (R4-MATCH-CAUSE, R3-GIT-IDENTITY): bare catch loses cause (add cause field to unmatched-local); git identity keeps `.git` suffix (strip before grouping). Fix in T3 dedupe flow.
- **constants + naming** (R2-003, R2-004): `MATCHED_PACKAGE_NAME` vs `PACKAGE_NAME` duplicated (single source); test helper param misnamed root/settings-path with dead default.
- **coverage gaps** (R3-TILDE-COVERAGE, R3-REPOROOT-COVERAGE): tilde expansion + cwd fallback + explicit repoRoot branches unasserted — add tests in T3/T4 alongside their consumers.
- **paths.ts precedence** (R2-001): parenthesize the walk-stop guard.

### Process decisions (ODD ledger)

- **TDD mode**: disabled — ODD default, no project/session TDD config, user made no TDD choice (same source as port + skill-use-automation ledgers; strict TDD is bound to the SDD cycle). Ordinary checks: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` + smoke.
- **Worktree state note**: branch feat/pi-skills-cli cut from 23a5bab (main tip; feat/skill-use-automation has no commits). The unrelated reviewed skill-use-automation diff stays unstaged/untouched; commits stage explicit paths only. That feature's commit decision remains pending with the user, separate from this ledger.

## Native review (RDD) — T1 candidate

- **Candidate**: committed range 23a5bab5..a2f8109 (6 files, +409/−9... +400/−9); assess `unassessable` (untracked-declaration failure) → treated high per plan (writer self-verification + independent verifier + native review).
- **Facade blockers (provider bugs, documented)**: (1) plain inspect freezes the WORKSPACE projection — with the parked automation diff in-tree, committed-range START drifted (`candidate-target-projection-drift`); (2) even with a clean tree, facade START ignores its baseRef input and stops on `empty_candidate_base_ref_required` collect; (3) facade capture rejects native-rendered bindings (`belongs to a different session route`) — the recorded T4 multi-slot failure mode. **Resolution: user-approved native relay** (obs 7170 recipe): negotiated status WITH `--base-ref` + `--untracked-scope=exclude` renders `fresh_target_ready` → exact native START → consent relay (user GRANTED, high risk: process boundary in pi-runner.test.ts) → 4 lenses via materialize → generic read-only subagent → native capture-result → refuter batch → correction plan → targeted validation → acknowledge.
- **Lineage**: review-3e0989da2e9f8334, tier high (process_boundary/shell_process), 4 lenses (risk/resilience/readability/reliability), budget 200.
- **Outcome**: lens risk 0 findings; lens resilience 1 BLOCKER (deterministic: `dist/cli.mjs` ships with no shebang — the registered bin cannot exec on POSIX; our smoke used `node dist/cli.mjs`, bypassing exec) + 3 WARNINGs; lens readability 8 informational (incl. duplicated DEBUG regex, console-vs-CliIo, fixture-under-src-tree); lens reliability CRITICAL corroborating the shebang + symlink-guard WARNING. Refuter CORROBORATED the shebang claim → **correction_required**. Correction plan 5/200 diff lines: rolldown `banner: "#!/usr/bin/env node"` on the CLI bundle only (1 add) + `realpathSync` import (1 add) + entry-guard resolves argv[1] through bin symlinks (1 del + 2 add) — committed `a8d25a7`. Targeted validation: original criteria repaired + no regressions (**passed**), 2 advisory follow-ups (preserve-symlinks-main edge; realpathSync throw on unresolvable argv[1]). Gates after correction: 67/67 tests (delta = stashed automation tests), typecheck/lint/build green, dist/cli.mjs shebang verified, dist/extension.js shebang-free as intended, symlink-exec smoke: `--help` 0 / bogus 2. **APPROVED** → acknowledged → authority **burned** (consumed_revision b4e09d86...). Advisories (R2-1..R2-8, R4 warnings) recorded as informational follow-ups for T2-T5 design, never reopened.
- **Review window isolation**: skill-use-automation diff stashed during the review window; restored byte-for-byte after acknowledge (git diff sha256 c536faef... matched pre-stash digest). Stash dropped.
