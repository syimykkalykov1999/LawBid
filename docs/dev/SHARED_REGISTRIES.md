# Общие реестры — только через скрипты (shared registries: scripts only)

Why: on 2026-10-27 twelve parallel PRs all hand-edited the same few lists and
numbers, so every merge conflicted. Now each list has a script that writes it
in one canonical order; two PRs that add different rows merge cleanly, and a
conflict on one line is solved by re-running the script, not by thinking.

Rule (WORKER_BUILD_RULES «параллельные волны без конфликтов»): do not edit
these files by hand. Run the command as the LAST step before the commit
(pre-commit does the sorting and the contract for you).

| Shared file | How it is kept | Command (from repo root) |
|---|---|---|
| `apps/api/src/architecture/module-boundaries.baseline.json` | generated from the import graph | `npm run arch:baseline --workspace apps/api` |
| `apps/api/test/two-db-suites.json` | sorted | `npm run lists:sort --workspace apps/api` |
| `apps/api/src/redis/redis-cluster-scan.allowlist.json` | sorted | same |
| `apps/api/src/sharding/cross-family-include.allowlist.json` | sorted | same |
| `apps/api/src/architecture/admin-heavy-queries.baseline.json` | sorted | same |
| `docs/dev/SWITCH_INVENTORY.md` (rows) | sorted by key | same |
| `packages/api-contract/openapi.json` + Dart client | generated | `npm run contract:fast` (pre-commit runs it when a `*.dto.ts` / `*.controller.ts` is staged) |

## Module boundaries baseline

`module-boundaries.baseline.json` is an APPROVED SET, not a log:

- `deep` = known deep imports into another module's sub-folders. Only
  shrinks. `npm run arch:baseline` drops the ones you fixed; a NEW deep import
  is never written silently: the script prints `+ new deep import: ...` and
  exits 1 (the unit test fails the same way). Fix the import, or, if it is
  intended and a reviewer accepts it, run `npm run arch:baseline -- --approve`
  and commit the diff.
- `fanOut` = per module, how many other modules it imports (a ceiling). It
  follows the code down by itself; going up needs `--approve` too.
- The test compares the file with the generated form byte for byte (sorted,
  one canonical JSON), so a hand edit that "looks right" still fails.
- After a merge conflict in this file: take either side, run
  `npm run arch:baseline -- --approve`, read `git diff` (only the modules your
  merge touched should change).

## Lists (`lists:sort`)

`npm run lists:sort` rewrites the lists above into plain code-unit order
(`--check` only reports). Add a row anywhere; the pre-commit hook and the unit
test `registries-sorted.spec.ts` keep the order. Adding a new hand-kept list?
Register it in `apps/api/scripts/sort-lists.mjs` (it has a fixture test).

## Counts and stubs in guard specs

No literal totals: `jobs.runner.spec` compares with `CRON_SCHEDULES.length`,
`shard-manifest.spec` checks that the families add up to all Prisma models,
`staff-jobs.spec` finds "stub" jobs from code (a handler that returns
`STAFF_JOB_STUB`) and checks that every `CRON_JOBS.staff*` has a handler file,
a processor `case` and a module provider. A forgotten registration still
fails; a correct new one needs no edit to these specs.

## Contract

Pre-commit (`lint-staged.config.mjs`): when a `*.dto.ts` or `*.controller.ts`
is staged, it runs `npm run contract:fast` after ESLint and stages
`packages/api-contract/openapi.json` and `packages/api-contract/dart/lib`.
It needs Postgres + Redis + Dart (same as `generate.sh`). Only when your Mac
has no infra up: `SKIP_CONTRACT_HOOK=1 git commit ...` (never `--no-verify`);
CI's contract drift check still fails a stale contract.
