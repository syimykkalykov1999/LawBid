# Старт в проекте LawBid (для нового человека или нового Claude)

## Резюме для владельца (по-русски)

Это «входной билет» в проект: как запустить всё у себя на компьютере, что где
лежит, по каким правилам мы пишем код и как заходит работа в основную ветку.
Новому человеку или новому Claude достаточно прочитать этот файл и дальше идти
по ссылкам. Правила здесь не новые: они собраны из того, что уже проверяют
автоматические проверки (CI) и существующие документы. Если правило есть здесь, а
проверки нет, это договорённость, и она записана в `.cursorrules` или
`docs/HANDOFF.md`.

---

Method: structure follows common onboarding-doc practice (one entry file, runnable
setup, repo map, rules that tooling enforces, links to decisions and runbooks);
the decisions index uses [MADR](https://adr.github.io/madr/) (see [adr/README.md](adr/README.md)),
the diagrams use the [C4 model](https://c4model.com/diagrams)
([architecture/C4.md](architecture/C4.md)). Facts below were taken from the repo on
2026-10-25 (CI workflows, scripts, lint configs, existing docs). Where code and doc
disagree, the code wins; fix the doc in the same PR.

The repo is **public**: never commit secrets, keys, account ids, personal data, phone
numbers or real user data. Secrets scan (gitleaks) runs on every PR.

## 1. What the product is

US legal-services marketplace: clients post cases, verified attorneys bid, negotiate,
the client accepts one bid. Attorneys pay a monthly subscription after verification to
unlock client contact info and messaging. Also chat, channels, feed, calls, video.
Scale target: 5M+ users, 500k DAU, 5k RPS design target ([README.md](../README.md)).
Ground truth for behaviour and schema: `docs/01` to `docs/07` (`.cursorrules` says which
file wins per area: DB schema is 02, case and bid logic 04, visuals 07).

## 2. Repo map

| Path | What lives there |
|---|---|
| `apps/api` | NestJS backend. `src/modules/<name>` one folder per feature (controller, service, DTO); `src/sharding` DB routing; `src/jobs` BullMQ cron and processors; `src/config` env schema and provider selection; `src/common` shared (settings, ops, resilience, errors); `prisma/` schema and migrations; `test/` e2e suites; `scripts/` CI helpers |
| `apps/admin` | Next.js admin panel (talks to `/admin/*` through a cookie proxy) |
| `apps/mobile` | Flutter app (iOS, Android, web). Feature-first: `lib/features/<name>/{data,domain,presentation}`, design system in `lib/core/design_system` |
| `packages/api-contract` | **Generated**: `openapi.json` and the Dart client. Never edit by hand |
| `infra` | Terraform: `modules/*`, `envs/{prod,staging,loadtest}`, `pgbouncer`, `postgres`, `observability` (Grafana) |
| `loadtest` | k6 scenarios for the staged AWS load test |
| `scripts` | `deploy/` (used by workflows), `ops/` (self-check, restore drill, R2 verify), `ci/` (audit gates), `dev/`, `seo/`, i18n and legal-translation tools |
| `.github/workflows` | CI and operations; table in `.github/workflows/README.md` |
| `docs` | specs 01-07; `architecture/` (designs and research), `adr/` (decisions), `runbooks/` (operations), `db/ERD.md` (generated), `changelog.d/` and `CHANGELOG.md`, `HANDOFF.md` |

Where decisions are: [adr/README.md](adr/README.md). Pictures: [architecture/C4.md](architecture/C4.md).
Vendors and exits: [runbooks/VENDORS.md](runbooks/VENDORS.md).

## 3. Run everything locally

Prerequisites: Node 22 (CI uses 22), npm, Docker, Flutter (stable) for the app.

```sh
git clone <repo> && cd LawBid
npm ci                      # root workspace: apps/api, apps/admin, packages/*
npm run prepare             # installs the husky pre-commit hook (npm ci skips scripts)
docker compose up -d        # PostgreSQL 16, Redis 7, MinIO (local S3), Mailhog, TURN
```

API (`apps/api`):

```sh
cp apps/api/.env.example apps/api/.env
# .env.example points at the Docker Postgres from docker-compose.yml
# (localhost:5432, user root, dev-only password lawbid).
cd apps/api && npx prisma generate && npx prisma migrate deploy
npm run seed:demo --workspace apps/api      # demo world with users, cases, content
npm run start:dev --workspace apps/api      # http://localhost:3000, watch mode
```

Notes:

- In dev, SMS and e-mail use the mock providers (`SMS_PROVIDER`/`EMAIL_PROVIDER=auto`); codes
  appear in the API log and Mailhog (<http://localhost:8025>). In staging/production a mock is
  refused at boot ([ADR-0014](adr/0014-no-silent-mock-in-prod.md)).
- Jobs: `JOBS_ENABLED=true` makes the API also run queues and cron. Production runs a separate
  worker (`node dist/src/worker.js`).
- Demo videos: `DEV_FAKE_BUNNY=true` uses `apps/api/tools/fake-bunny.mjs`.
- Admin credentials for a fresh database: `npm run admin:set-credentials --workspace apps/api`
  (after `nest build`).
- Run the API with logs to a file and `grep WARN` to find real errors on a test phone.

Admin panel: `cp apps/admin/.env.example apps/admin/.env.local && npm run dev --workspace apps/admin`
(port 3001).

Mobile ([apps/mobile/README.md](../apps/mobile/README.md)):

```sh
cd apps/mobile
cp config/dev.example.json config/dev.json          # once per flavor
flutter pub get && dart run build_runner build --delete-conflicting-outputs
flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=config/dev.json
```

Flavors: `dev`, `staging`, `prod` (three apps side by side). A plain `flutter run` builds dev.
Real devices: `adb` for Android; `flutter build ios --release --flavor dev` plus
`xcrun devicectl device install app` for iPhone. Delete `apps/mobile/build` when disk space is low.

Tests:

```sh
npm run test --workspace apps/api              # unit (jest)
npm run test:e2e:sharded --workspace apps/api  # e2e, real Postgres + Redis, shards of ~35 suites
npm run test:e2e:two-db --workspace apps/api   # e2e on two databases (shard-ready)
npm run test --workspace apps/admin            # vitest
cd apps/mobile && flutter analyze && flutter test
```

Parallel e2e runs (several worktrees) must not collide: set `E2E_ISOLATION=<short-tag>` and
`E2E_REDIS_DB=<free number>` (see `apps/api/test/support/e2e-env.ts`). e2e creates its own
`<db>_e2e_*` databases.

## 4. Coding rules used in this repo

Core list is `.cursorrules` (Russian, mandatory). The ones that matter most, grouped by who enforces them:

### Enforced by CI (a PR cannot merge red)

- **Lint is clean and `--fix` changes nothing:** `npm run lint` runs ESLint with `--fix`; CI then
  fails if committed files changed. Run lint before you commit. A husky hook (`lint-staged`) lints staged API files.
- **Typecheck** `tsc --noEmit`; strict TypeScript; no `any`, no `@ts-ignore` without a reason.
- **Unit and e2e tests** on real PostgreSQL 16, Redis 7, MinIO, Mailhog; e2e also on two databases.
- **API contract regeneration:** after changing any controller, DTO or response, run
  `sh packages/api-contract/generate.sh` (needs dev DB and Redis) and commit `openapi.json` plus the
  Dart client. CI regenerates and fails on any difference ("contract drift"). `oasdiff` also fails the
  PR on breaking API changes against `main` (documented exceptions in `packages/api-contract/oasdiff-err-ignore.txt`).
  Admin types: `npm run generate --workspace apps/admin`.
- **ERD regeneration:** after changing `schema.prisma`, run `npm run db:erd --workspace apps/api` and
  commit `docs/db/ERD.md`; CI fails if it differs.
- **Migration rules** ([ADR-0013](adr/0013-expand-contract-rolling-deploy.md)):
  - Never edit an applied migration; add a new one. No autoincrement/serial: UUIDs only.
  - `schema.prisma` and migrations must not drift (`prisma migrate diff`).
  - Expand/contract only: `node apps/api/scripts/check-migrations.mjs` rejects drop/rename of a table
    or column, type change, or NOT NULL without DEFAULT. A real contract step needs a line
    `-- migration-safety: contract <why>` in the file and a release in between.
  - Migrations must apply on the previous release's database (`migrate-from-previous.mjs`).
  - Raw-SQL-only features (partial/GIN indexes, CHECKs, triggers, roles) live in migration SQL.
  - New sharded tables: add the model to the shard manifest (see below) and regenerate the trigger migration with `scripts/generate-shard-trigger-migration.ts`.
- **Translations complete in every language:** `node scripts/i18n-audit.mjs --ci`; add keys with `scripts/i18n-add.mjs`; Flutter has no literal user strings (`t('key')`), only theme tokens for colors (`tool/ci/hardcoded_check.py`, baseline files `hardcoded_*.allow`; new findings fail).
- **Dependency audit:** `npm audit` at high severity blocks; exceptions need id, reason and expiry in `.github/npm-audit-allowlist.json`; same for Dart in `pub-audit-allowlist.json`.
- **Supply chain:** every GitHub Action pinned to a full commit SHA; top-level `permissions:` in every workflow; `npm ci` with `ignore-scripts`; `min-release-age=7` in `.npmrc`.
- **Secret scan** (gitleaks), CodeQL, container scan.

### Enforced by architecture tests (run in unit tests)

- **Module boundaries** (`src/architecture/module-boundaries.spec.ts`): a module imports another
  module only through root files of that folder (`b.module.ts`, `b.service.ts`, ...), never its
  sub-folders; fan-out may not grow. Existing violations are in `module-boundaries.baseline.json`
  and can only shrink; regenerate it with `npm run arch:baseline --workspace apps/api` (never edit it by hand; `-- --approve` accepts an intended new dependency).
- **Shard manifest** (`src/sharding/shard-manifest.ts`): every Prisma model belongs to exactly one family
  (`global`, `case`, `user`, `content`) and sharded ones declare how the shard is found
  (`owner(field)` or `parent(field, Model)`). A new model without a family fails
  `shard-manifest.spec.ts`. No new relation `include` across families
  (`cross-family-include.spec.ts`; existing exceptions in `cross-family-include.allowlist.json`):
  use `UserDirectory` / `attachUsers` instead of `include: { user }`. Cross-family writes go
  through the outbox. Background jobs carry the shard (`...shardCarry()` in the job data).
  Two-database status and worklist: `apps/api/test/two-db-suites.json`.
- **SQL safety** (`sql-safety.spec.ts`): raw SQL is scanned; use parameters, never string-built SQL.

### Convention (reviewer enforces)

- Backend layering: controller, service, repository (Prisma), DTO; logic only in the service.
  Validation by class-validator with whitelist. Errors only from the `ErrorCode` enum. Responses use the
  envelope from `docs/01` section 7.
- Create-resource and money POSTs take an `Idempotency-Key`. Cursor pagination only; no offset.
- Multi-write transactions through `withTxRetry()`, short. Case changes only via `CaseStateMachine`,
  bids via `BidStateMachine`, journal only via `CaseJournalService.append()` in the same transaction.
  Notifications only via `NotificationsService.emit()`. Subscription checks via `SubscriptionAccessService.isActive()`.
  Object access via policies (deny by default). Client contact data is never given to an attorney before
  bid acceptance and an active subscription.
- Money is integer cents; dates UTC ISO-8601. No hard deletes of cases, bids, journals, payments, users (soft delete).
- Logging only with pino, no personal data in logs, no `console.log`.
- No secrets in code: env or Secrets Manager. Integration keys are pasted in the admin (Integrations).
- Every TODO links to a stage or doc. Every endpoint is documented in OpenAPI.
- **Settings over deploys:** switches are app settings (`apps/api/src/common/app-settings/app-settings.defaults.ts`,
  admin Settings) or feature flags; prefer a switch with a safe default over a code branch.
  Provider choice is in `src/config/provider-selection.ts`.
- **The app's look is frozen:** do not change layout, buttons, colors or screens unless the owner asks, and then minimally.
- **Scaling principle:** cheapest start, grow and shrink automatically, ceilings in the admin, split/upgrade paths ready as switches.
- Conventional Commits (`feat(api): ...`, `fix(web): ...`, `docs: ...`, `ops: ...`). User-visible stage notes go in `docs/CHANGELOG.md` or a fragment in `docs/changelog.d/`.

### Heavy-job etiquette

Shared machine, shared CI, shared bill.

- At most 2 heavy workers (builds, full e2e, Flutter builds, load runs) at the same time; use a git worktree per task.
- Give each parallel e2e run its own `E2E_ISOLATION` and `E2E_REDIS_DB`.
- Do not start AWS load tests casually: `load-test.yml` is manual only, shows a cost estimate, needs the
  `load-test` environment approval, tears the stack down, and a watchdog kills stacks older than 4 hours
  ([runbooks/LOAD_TEST.md](runbooks/LOAD_TEST.md)). Run the local step first.
- Keep disk space above 15 GB; delete build outputs (`apps/mobile/build`, caches via `scripts/dev/clean-caches.sh`).
- In production, "Pause heavy jobs" in Admin, System, Health relieves the database without stopping the app.
- Never leave AWS resources running after a test; the cleanup and inventory workflows exist (`aws-cleanup.yml`, `aws-inventory.yml`).

## 5. Pull requests and merging

1. Branch from `main`: `claude/<topic>` (agents) or `feat/...`. One topic per PR, docs-only PRs stay docs-only.
2. Before pushing: lint, typecheck, relevant tests; regenerate the contract and ERD if you touched the API or schema; update docs, add or update an ADR when you change an architectural decision.
3. Never use `--no-verify`. Never force-push `main`.
4. Commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` when Claude wrote it; PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
5. Open the PR against `syimykkalykov1999/LawBid` (there are two remotes; use `gh ... -R`). CI: `api-ci`, `admin-ci`, `mobile-ci` (path-filtered), secret scan, CodeQL.
6. Merge only when CI is green. Working agents self-merge their green PRs; a PR flagged "do not merge" waits for the owner. The held branch `claude/mine-menus-polish` is not merged without the owner's OK.
7. **Deploy:** a merge to `main` touching api/admin/packages starts the Deploy workflow, which builds images, then waits at the GitHub `production` environment for the **owner's approval**. Cancel stale queued Deploy runs before approving (stale runs block the queue). Rollback: Actions, "Rollback production". Details: [runbooks/DEPLOY_SAFETY.md](runbooks/DEPLOY_SAFETY.md), [runbooks/DEPLOY_PROD.md](runbooks/DEPLOY_PROD.md).
8. **Production Terraform apply is done only by the owner** (presses Run on a saved plan you prepared); Claude does not apply to prod or change IAM. Run `terraform plan` in `infra/envs/prod`; the nightly drift check opens an issue on drift.

## 6. Where the runbooks are

- Index and alarm map: [runbooks/README.md](runbooks/README.md); owner's plain guide: [runbooks/OWNER.md](runbooks/OWNER.md).
- Incidents: [runbooks/INCIDENT.md](runbooks/INCIDENT.md). Vendors and exits: [runbooks/VENDORS.md](runbooks/VENDORS.md).
- Deploy and rollback: `DEPLOY_SAFETY.md`, `DEPLOY_PROD.md`, first launch `PROD_LAUNCH.md`, new account `HANDOFF_NEW_ACCOUNT.md`.
- Data: `backups.md`, `restore-drill.md`, `DB_POOLER.md`, `db-autoscale.md`, `redis-autoscale.md`.
- Paging and SLO: `paging.md`, `slo.md`. Money: `treasury.md`, `STRIPE_TAX.md`, `payments-failed.md`.
- Calls and media: `TURN.md`, `DNS_TO_CLOUDFLARE.md`, `LIVEKIT.md`, `IOS_CHAT_NOTIFICATIONS.md`.
- Load testing: `LOAD_TEST.md`. Cost: `cost.md`, `docs/COST_PROTECTION.md`.
- Current state and queue: [HANDOFF.md](HANDOFF.md) (read fully before starting), [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

## 7. First day checklist

- [ ] Read `.cursorrules`, [HANDOFF.md](HANDOFF.md), this file, [architecture/C4.md](architecture/C4.md), [adr/README.md](adr/README.md).
- [ ] Docker stack up, API running, `seed:demo` done, admin login works.
- [ ] `npm run lint` and one e2e suite pass locally.
- [ ] Know the three rules that surprise people: app look is frozen; the owner applies prod Terraform and approves deploys; the repo is public.
