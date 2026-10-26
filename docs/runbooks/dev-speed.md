# Dev speed: fast local commands and the heavy-job queue

Developer tooling only. CI keeps running the full, uncached commands
(`npx tsc --noEmit`, `npm run lint`, `npm run test:cov`, `generate.sh`,
`db:erd` + `git diff`), so nothing here weakens a check.

## 1. One heavy job at a time, first come first served

```sh
scripts/dev/heavy.sh -- npm run typecheck --workspace apps/api
scripts/dev/heavy.sh --max-wait 1800 -- npx jest src/sharding   # give up after 30 min
scripts/dev/heavy.sh status                                      # who runs, who waits
scripts/dev/heavy.sh clean                                       # drop dead tickets/lock
```

- Take a ticket in `/tmp/lawbid-heavy.queue/`; the oldest ticket runs next.
- The running job holds the directory `/tmp/lawbid-heavy.lock` (the same one
  the old `until mkdir ...` one-liner uses, so old and new callers exclude
  each other). Old one-liners cannot queue, so they can still jump ahead:
  switch to `heavy.sh`.
- A crashed or killed worker never blocks: a ticket or lock whose process is
  gone is deleted by the next waiter. An old-style lock (no pid file) is
  treated as stale after `HEAVY_STALE_MIN` (default 120) minutes.
- The exit code of your command is passed through. Ctrl-C releases the slot.
- Heavy = jest suites, tsc, eslint over the whole API, docker, builds,
  `git commit` with hooks (the hook is light now, but a full lint is not).

## 2. Fast variants (use these while working)

| Instead of | Use | Why it is faster |
| --- | --- | --- |
| `npx tsc --noEmit` (api) | `npm run typecheck --workspace apps/api` | incremental, cache in gitignored `apps/api/.cache/tsc` (does not die when `nest build` wipes `dist/`) |
| `npm run lint` (api) | `npm run lint:fast --workspace apps/api` | `--cache` (content based) in `apps/api/.cache/eslint`, no `--fix`; re-lints only changed files. Caveat: a type change in file A does not re-lint its dependants; CI still lints everything |
| `npm test` (api) | `npm run test:related --workspace apps/api -- <changed files>` | only specs that import those files |
| `npm test` (api) | `npm run test:changed --workspace apps/api` | only specs related to uncommitted changes |
| `npm test` (api) | `npm run test:fast --workspace apps/api` | same full run, 50% of the cores: less RAM pressure on a 16 GB Mac, same speed |
| `sh packages/api-contract/generate.sh` | `npm run contract:fast` | skipped (0.2 s) when `apps/api/src` etc. are byte-identical to the last successful run; `FORCE=1` runs it anyway |
| `npm run db:erd --workspace apps/api` | `npm run db:erd:fast --workspace apps/api` | skipped when `schema.prisma` is unchanged |
| `npx prisma generate` | `npm run prisma:generate:fast` | skipped when schema and lockfile are unchanged and the client exists |
| admin `npm run typecheck` | `npm run typecheck:fast --workspace apps/admin` | skips `openapi-typescript` when `openapi.json` is unchanged |

Run `contract:fast` (and `db:erd:fast`) before pushing a DTO/route or schema
change exactly as you ran the full commands before: the output is identical,
CI checks it.

The skip stamps live in `.cache/dev/skip/` (gitignored). Delete `.cache/` to
reset everything.

## 3. Things we measured and did NOT change

- ts-jest `isolatedModules`: `apps/api/tsconfig.json` already sets
  `isolatedModules: true`, which ts-jest honours (transpile only). No gain.
- `@swc/jest`: not adopted. Transpiling is not the bottleneck any more, and it
  would add a native dependency and Nest decorator-metadata risk.
- `nest build` keeps `deleteOutDir`, so `openapi:export` always rebuilds; the
  hash skip above is what avoids it.

## 4. Known flake

Jest workers sometimes die with `SIGSEGV` (a V8 garbage-collector crash on
Node 24.x, seen in cold and warm runs, default and low worker counts). It is
not a test failure: re-run the failed spec file alone.
