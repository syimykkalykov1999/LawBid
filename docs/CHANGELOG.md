# Changelog

All notable changes to this project are documented here, per
.cursorrules (each stage ends with a CHANGELOG update + commit on
branch cursor/stage-X-Y-description).

## Stage 0 — 2026-09-21
- Created `.cursorrules` at repo root (verbatim per docs/06_PRODUCTION.md §12).
- Copied the 7 spec files into `docs/`.
- Scaffolded monorepo skeleton: apps/mobile, apps/api, apps/admin,
  packages/api-contract, infra/, .github/workflows/.
- Initialized git repository.
- Not yet done: actual code scaffolding for Stage 1.1 (NestJS bootstrap,
  Flutter bootstrap) — blocked on network egress for the build sandbox
  (npm install / Flutter SDK install unavailable). Awaiting user
  confirmation on network access or on proceeding code-only.

## Stage 1.1 (partial: backend done, mobile blocked) — 2026-09-21

Backend (`apps/api`) — done and verified:
- `nest new` scaffold (NestJS 11, strict TS), tsconfig hardened to full `strict`
  + `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`.
- ESLint + Prettier (from Nest CLI default config), root-level husky
  pre-commit running lint-staged on `apps/api/**/*.ts`.
- Swagger mounted at `/docs` (and `/docs-json`), global prefix `api/v1`
  excluding `/health/*` and `/docs*`.
- `HealthController` with `/health/live` and `/health/ready` — intentionally
  no real indicators yet (Prisma/Redis checks are stage 1.2, once
  PrismaModule/RedisModule exist; adding them now would be scope creep
  across stages per `.cursorrules`).
- **Verified live**: `npm run build` and `npm run lint` clean; ran
  `node dist/main.js` and confirmed `GET /health/live` and
  `GET /health/ready` both return `200 {"status":"ok",...}` — this matches
  the stage 1.1 acceptance criterion in docs/01_FOUNDATION_AUTH.md §15
  exactly (`GET /health/ready` = 200).
- `docker-compose.yml` at repo root: CockroachDB (single-node, insecure,
  dev only), Redis, MinIO (S3-compatible), Mailhog. **Not verified locally**
  — Docker isn't available in the build sandbox; needs `docker compose up`
  run on a machine with Docker installed.
- Root `package.json` with npm workspaces (`apps/api`, `apps/admin`,
  `packages/*`) — the spec doesn't mandate a specific monorepo tool, npm
  workspaces chosen as the simplest option with no extra install.
- Known issue (not fixed): `npm audit` reports 6 high-severity advisories,
  all transitive via `multer` inside `@nestjs/platform-express@11`; the fix
  requires bumping to Nest 12 (breaking, out of scope for stage 1.1) —
  revisit when the project intentionally upgrades to Nest 12.

Mobile (`apps/mobile`) — blocked, not started:
- The build sandbox's CPU architecture is ARM64 (aarch64); Flutter's
  official stable Linux SDK is distributed as x86_64 only (confirmed via
  Flutter's release manifest — no arm64 Linux archive exists). `flutter`/
  `dart` cannot run in this sandbox. Needs either running stage 1.1 mobile
  commands on the user's own machine, or another environment with an
  x86_64 (or macOS) Flutter toolchain.

Next: stage 1.2 (backend core — ConfigModule, PrismaModule + withTxRetry,
RedisModule, pino, global ValidationPipe/ExceptionFilter/ResponseInterceptor,
request-id middleware, Redis-backed throttler, idempotency interceptor,
ErrorCode enum + OpenAPI generation) per docs/01_FOUNDATION_AUTH.md §15.

## Stage 1.2 (backend core) — 2026-09-21

Per docs/01_FOUNDATION_AUTH.md §15 stage 1.2. All items done and verified
live (not just written) — `npm run build`, `npm run lint`, `npm run test`
(7 unit tests), and `npm run test:e2e` (4 e2e tests) all pass.

- `ConfigModule`: env validated with zod (`src/config/env.schema.ts`);
  boots fail fast on invalid env per docs/06_PRODUCTION.md §6.2. Pinned
  `@nestjs/config` to `4.0.4` (latest, `12.0.0`, is ESM-only and breaks
  Jest's CJS transform under Node 22 — revisit when Jest/Node supports it
  natively, or when the project moves to native ESM).
- `PrismaModule` + `PrismaService` + `withTxRetry()` (src/prisma/): retries
  a transaction on CockroachDB's SERIALIZABLE conflict (SQLSTATE 40001),
  bounded attempts + jittered backoff. Unit-tested (4 cases: first-try
  success, retry-then-succeed, exhausts retries, non-serialization errors
  don't retry). `prisma/schema.prisma` intentionally has zero models this
  stage — stage 1.3 adds the auth models; this caused the generated
  client's `$connect`/`$transaction` typings to degrade to `any` (narrowly
  eslint-disabled with a comment, should resolve once models exist).
  Pinned `prisma`+`@prisma/client` to `6.19.3`: the `prisma` npm package's
  `latest` tag currently points to an `8.0.0-rc.*` release candidate,
  which also pulled in a large unrelated devDependency tree (a bundled
  MySQL driver, an HTTP server framework, an AI-agent skill scaffolder)
  and 15+ audit findings — 6.x is the last stable line without that noise.
- `RedisModule` (`src/redis/`): global `ioredis` client from `REDIS_URL`.
- Global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform),
  `AllExceptionsFilter` → `{error:{code,message,details,requestId}}`,
  `ResponseInterceptor` → `{data,meta:{nextCursor}}`, both per
  docs/01_FOUNDATION_AUTH.md §7. `RequestIdMiddleware` generates/echoes
  `X-Request-Id`. `ErrorCode` enum (`src/common/errors/`) as the single
  source of error codes, to be mirrored into `packages/api-contract` once
  that package exists.
- Redis-backed rate limiting (`src/throttler/`): `@nestjs/throttler` with a
  hand-written `RedisThrottlerStorageService` (fixed-window INCR+EXPIRE) —
  no actively-maintained Redis storage package for the current
  `@nestjs/throttler` major was available, so this is ~50 lines instead of
  a dependency. Unit-tested (3 cases: counts hits, blocks over limit,
  isolates keys).
- `IdempotencyInterceptor` (`src/idempotency/`): opt-in per-route (not
  global), replays a cached `{status, body}` for a repeated
  `Idempotency-Key` within 24h. Per .cursorrules, enforcement of "key
  required" belongs to the routes that need it (stage 1.4+); this stage
  only proves the replay mechanism works.
- Dev-only `POST /dev/echo` (`src/modules/dev/`, registered only when
  `NODE_ENV=development`): no business meaning, exists solely to exercise
  the above against a real HTTP request for this stage's own acceptance
  test, since no real feature endpoint exists yet. Remove once a real
  mutating endpoint (stage 1.4's auth routes) can serve the same test
  purpose.
- e2e test (`test/app.e2e-spec.ts`) stubs `PrismaService` and the Redis
  client (`test/support/fake-redis.ts`, a ~50-line in-memory stand-in) —
  docker-compose isn't runnable in the build sandbox (no Docker), so this
  stage's tests intentionally don't depend on it. **Not yet verified
  against real CockroachDB/Redis via `docker compose up`** — do that
  before trusting this in an environment where infra behavior actually
  matters (retry-under-real-contention, real TTL expiry timing, etc.).
- Known/accepted: `npm audit` still reports 5 high-severity findings, all
  transitively via `multer` in `@nestjs/platform-express@11` (same issue
  noted in stage 1.1 — fix requires Nest 12, out of scope here).

Next: stage 1.3 (Prisma models for auth — users, user_identifiers,
sessions, auth_events, user_consents, legal_documents, onboarding_state,
feature_flags, i18n_* — migrations + seed) per docs/01_FOUNDATION_AUTH.md §15.

## Stage 1.3 (DB schema for auth) — 2026-09-21

Per docs/01_FOUNDATION_AUTH.md §15 stage 1.3. `prisma validate`,
`prisma generate`, `npm run lint`, `npm run test`, `npm run test:e2e`,
`npm run build` all pass. **Not yet verified against a live CockroachDB**
(same sandbox limitation as stages 1.1/1.2 — no Docker) — see below.

- `apps/api/prisma/schema.prisma`: added the 6 enums (`user_role`,
  `user_status`, `theme_pref`, `identifier_type`, `consent_type`,
  `legal_doc_type`) and 13 models needed for stages 1.4-1.7, per
  docs/02_DATABASE.md §4.A/§4.B: `User`, `UserIdentifier`, `Session`,
  `AuthEvent`, `LegalDocument`, `UserConsent`, `OnboardingState`,
  `BlockedEmailDomain`, `FeatureFlag`, `I18nLanguage`, `I18nKey`,
  `I18nTranslation`, `I18nBundleVersion`. `BlockedEmailDomain` was added
  even though file 01's stage-1.3 model list doesn't name it explicitly,
  because file 01 itself scopes this stage to "what's necessary for stages
  1.4-1.7", and stage 1.4's `POST /users/me/contacts/request` needs it
  for the disposable/relay-domain check (§10.5, §11 step 3A). Everything
  else in file 02 (profiles, cases, bids, feed, chats, subscriptions,
  moderation) is intentionally not modeled yet.
- Judgment calls made where file 02 §4 doesn't spell out every column
  (documented as comments in schema.prisma, repeated here for visibility):
  - `users.avatar_file_id` is a bare `Uuid` column with no Prisma relation
    — the `files` table is out of scope this stage, so the FK is deferred
    to whichever stage adds file uploads.
  - `sessions.replaced_by_session_id` is a bare `Uuid` column (rotation
    chain pointer), not an enforced self-referential FK — kept simple
    since the spec doesn't require DB-level enforcement here.
  - Partial indexes (`users(email)`/`users(phone_e164)` WHERE NOT NULL,
    `sessions(user_id)` WHERE `revoked_at IS NULL`) and hash-sharded
    indexes on `auth_events(created_at)` are **not yet created** — file 02
    §5 explicitly assigns those to stage 2.6 ("raw SQL"), not this stage.
    Plain (non-partial) indexes are in place as a stand-in for query
    performance until then. Same for the `lawbid_app`/`lawbid_retention`
    DB role grants that make `auth_events`/`user_consents` append-only at
    the DB level (§6.2/6.3) — not created yet, deferred to stage 2.6.
  - Timestamp columns (`created_at`/`updated_at`) follow file 02's own
    pattern: included by default per §1.3's general rule, except where a
    table's own column list in §4.A/§4.B explicitly overrides it —
    `feature_flags`/`i18n_translations`/`i18n_bundle_versions` get only
    `updated_at` (matches their explicit listing), `auth_events`/
    `user_consents` get only `created_at` (append-only, §6.2), and
    `blocked_email_domains`/`i18n_languages` get neither (treated as
    reference/seed tables, same minimal shape as `states`/`practice_areas`
    in §3.1/3.2, which also have no timestamp columns).
- Migration: `apps/api/prisma/migrations/20260921223144_stage_1_3_auth_schema/`,
  generated with `prisma migrate diff --from-empty --to-schema-datamodel
  --script` (no live CockroachDB to run `prisma migrate dev` against, same
  as prior stages). The SQL itself was reviewed (enums, tables, FKs with
  `ON DELETE RESTRICT` matching docs/02_DATABASE.md §1.4's rule for
  legally-significant data) but **has not been applied to a real
  database** — that verification (`docker compose up` + `prisma migrate
  deploy`) is still owed before this is trusted in an environment where
  DB behavior matters.
- Seed script: `apps/api/prisma/seed.ts`, wired via `package.json`'s
  `prisma.seed`. Idempotent (`upsert`), ordered per docs/02_DATABASE.md
  §7.2 filtered to this stage's tables (`i18n_languages` → 
  `blocked_email_domains` → `feature_flags` → `legal_documents` → admin):
  - `i18n_languages`: `en` (default, active), `ru` (active), per §3.3.
  - `blocked_email_domains`: `privaterelay.appleid.com` (`apple_relay`) +
    a **starter** disposable-domain list (`prisma/seed/disposable_domains.txt`,
    ~30 well-known domains, hand-curated). This is explicitly NOT the full
    open list §3.3 describes ("обновляется джобой раз в месяц") — that
    full list + its monthly refresh job is a real follow-up, not invented
    here, and the file's own header says so.
  - `feature_flags`: the exact 9 starter flags + values from file 01 §15
    stage 1.8 (`video_posts=false`, `profile_promotion=false`,
    `stripe_identity=false`, `persona_verification=false`,
    `auto_bar_check=false`, `phone_login=true`, `email_login=true`,
    `apple_login=true`, `google_login=true`) — seeded now because stage
    1.3's own acceptance line requires flag rows to exist, even though the
    flags module itself (Redis cache, `/config/bootstrap`) is stage 1.8.
  - `legal_documents`: 4 stub docs (`terms`/`privacy`/`disclaimer`/
    `client_contact_sharing`, locale `en`, version `1.0`) with clearly
    labeled placeholder text — real legal copy must come from the product
    owner/lawyer per §3.3's own note, not written here.
  - Admin: reads `SEED_ADMIN_EMAIL` from the environment per §3.3; skips
    with a warning (doesn't fail) if unset, so the seed stays safe to run
    without it in dev/CI.
  - **Not yet run against a live DB** — same reason as the migration
    above.
- Confirms stage 1.2's own prediction: now that real models exist, `npm run lint`'s auto-fix removed the two now-unnecessary `eslint-disable-next-line @typescript-eslint/no-unsafe-call` comments in `src/prisma/prisma.service.ts` and `src/prisma/tx-retry.util.ts` — the generated Prisma Client's `$connect`/`$disconnect`/`$transaction` types are no longer degraded to `any`.
- Known/accepted, out of scope for this stage (unchanged from prior
  stages): `npm audit` findings via `multer`/Nest 12; a pre-existing
  `tsc --noEmit` strict-null warning in
  `src/throttler/redis-throttler-storage.service.spec.ts` (2 occurrences)
  that predates this stage and isn't touched by it — `npm run test`/
  `npm run lint` both pass regardless since neither runs raw `tsc
  --noEmit` across spec files with this exact diagnostic surfaced.

Next: stage 1.4 (auth backend — OTP mock provider, email OTP, Apple/Google
token validation, JWT issuance, refresh rotation, sessions, reauth,
logout, rate limits, auth_events) per docs/01_FOUNDATION_AUTH.md §15 —
per the user's pacing request, this is tomorrow's work, not today's.
