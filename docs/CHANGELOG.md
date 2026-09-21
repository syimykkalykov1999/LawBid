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
