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

## Verification note — 2026-09-21 (same day as stage 1.3)

The sandbox has no Docker, so every prior stage flagged "not yet verified
against a live CockroachDB/Redis" as owed. Verified it for real today
without Docker: downloaded the official CockroachDB v24.1.5 linux-arm64
binary directly (works standalone, no install needed) and extracted a
working `redis-server` from Ubuntu's `.deb` packages by hand (no root
available in this sandbox, so `dpkg -x` per package + resolving shared-lib
dependencies one at a time, rather than `apt-get install`).

Against that real, running CockroachDB + Redis:
- `prisma migrate deploy` applied the stage 1.3 migration cleanly — the
  first real proof the hand-generated `migration.sql` is valid CockroachDB
  SQL, not just internally consistent per `prisma validate`.
- `prisma db seed` ran for real: 2 languages, 30 blocked domains, 9
  feature flags, 4 legal document stubs, and one real `admin` user row
  (email `syimykkalykov2@gmail.com`, i.e. the project owner's own account,
  used only inside this throwaway local instance).
- The built API (`dist/src/main.js`) started against the real DB/Redis and
  responded to real HTTP requests: `GET /health/ready` → 200,
  `GET /docs-json` → real OpenAPI doc listing the actual routes, and two
  identical `POST /api/v1/dev/echo` calls with the same `Idempotency-Key`
  returned byte-identical responses (same `receivedId`/`echoedAt`) — the
  idempotency replay working against real Redis, not the e2e test's
  `FakeRedis` stub. `redis-cli keys *` showed real `throttle:*` and
  `idempotency:*` keys, confirming the rate limiter and idempotency layer
  are both really talking to Redis.

This was a one-off local verification inside the sandbox, not a
deployment — the processes were stopped afterward and nothing is
reachable from outside the sandbox. No code changed; this note exists so
a future session doesn't have to re-derive that stages 1.1-1.3 are proven
end-to-end, only that the *deployment* environment (real `docker compose
up`, or prod infra) still needs its own separate verification.

## Stage 1.4 (auth backend) — 2026-09-21

Full backend implementation of docs/01_FOUNDATION_AUTH.md §10 + the
POST /users/me/* endpoints §10.5 lists alongside it: phone/email OTP
login, Apple/Google social login, JWT access tokens + rotating opaque
refresh tokens with reuse detection, sessions ("active devices"),
reauth, contact verification, consents, and the start of account
deletion. Built with `ecc:architect` and `ecc:code-architect` consulted
up front for the hard design calls (session model, reuse-detection
mechanism, build order), then implemented directly against those
recommendations — not merged with any other stage, no work done ahead
on stage 1.5+.

### New Prisma schema (additive to the stage 1.3 migration, not editing it)

- `Session.session_chain_id` (UUID, indexed): a stable id across refresh
  rotations. One chain = one login on one device; each row is one
  refresh-token generation within that chain. This is the JWT `sid`
  claim and the key for `GET/DELETE /auth/sessions` and the Redis
  revocation blacklist — revoking a whole chain (logout-all, reuse
  detected, account deletion) is one indexed `UPDATE ... WHERE
  session_chain_id = ?` instead of walking `replaced_by_session_id`
  history.
- `User.role` changed `UserRole` → `UserRole?` (nullable). Caught while
  designing `IdentityService.findOrCreateForOtp`: the spec's own
  onboarding flow (file 1 §11) chooses role AFTER first login, so a
  NOT NULL constraint on account creation was a real bug in the
  already-committed stage 1.3 schema, not a hypothetical. Fixed with a
  new migration rather than editing the applied one, per .cursorrules.
- Both changes are hand-written SQL (`ALTER TABLE ... ADD COLUMN`,
  `ALTER COLUMN ... DROP NOT NULL`) rather than `prisma migrate diff`
  output — the sandbox has no persistent DB for the diff tool's shadow
  database, same constraint noted for stage 1.3's migration.

### Judgment calls (spec silent or internally inconsistent — resolved, not invented)

- **Twilio Verify vs. local OTP hashing (real conflict, not a style
  choice):** §15 stage 1.4 names "Twilio Verify" as the SMS provider,
  but §10.6 requires storing the OTP as a local hash so LawBid's own
  attempt/lockout logic applies — Verify is a managed product that
  generates and checks the code itself and never hands the code back.
  Resolved by implementing against Twilio's plain Messages (SMS send)
  API instead: LawBid generates the code, hashes it, and Verify-style
  managed retry/lockout is fully replaced by `OtpService`'s own Lua
  script. This makes the SMS and email providers structurally identical
  (`send(identifier, code): Promise<void>`).
- **No auto-merge on social-login email match, ever** (`IdentityService`):
  §10.3 says "автослияние только при подтверждённом владении обоими
  идентификаторами" — read narrowly, that could justify merging when an
  IdP asserts a verified email. Rejected: an IdP's `email_verified`
  claim proves the IdP verified it at some point, not that the human
  presenting the token controls that inbox right now (forged/stale
  Google Workspace email, a relay address that changed hands). Any
  match against an existing verified email returns
  `409 ACCOUNT_EXISTS_USE_OTHER_METHOD` with a masked identifier +
  available methods; merging only ever happens through the
  already-authenticated `POST /auth/identifiers`.
- **Refresh-rotation retry vs. reuse (session.service.ts):** a client
  retrying `/auth/refresh` after a timeout that actually succeeded
  server-side looks identical, at the DB level, to a stolen-token
  replay (both hit an already-`rotated` row). Mitigated with a
  same-`device_id`, same-replacement-session grace window
  (`REFRESH_ROTATION_GRACE_SECONDS`, default 10s): treated as a benign
  reject (plain `AUTH_REFRESH_INVALID`), not a chain-wide revoke. A
  reuse attempt from a *different* device_id inside or outside the
  window still triggers full chain revocation. Verified by e2e tests
  for both branches.
- **`POST /auth/reauth` body:** the spec's summary table gives
  `{method: "otp", code}` with no identifier — but the server has no
  other way to know which of the user's possibly-several verified
  identifiers the client requested a code for. Added `identifier` to
  the DTO; the service additionally checks it belongs to and is
  verified for the CURRENT user before accepting the code.
  `method: "biometric"` from §10.1 is NOT implemented — a server can't
  verify an on-device Face ID/Touch ID assertion without platform key
  attestation (App Attest/Play Integrity), which is exactly what the
  `FEATURE_ATTESTATION` flag stubs but does not build this stage.
- **Reauth token transport:** the spec names the token but not how it's
  sent back on a subsequent sensitive request. Chose an `X-Reauth-Token`
  header (`ReauthGuard`), single-use (Redis `SET ... NX` on the token's
  `jti`), bound to the same user AND session chain that minted it.
- **`DELETE /users/me` scope, this stage only:** starts the 14-day grace
  period (`status → deletion_pending`, `deletion_requested_at` set,
  every session revoked immediately) and nothing else. The full §10.7
  pipeline (scrub PII, delete S3 docs, close cases, reject bids, cancel
  Stripe subscription, 5-year pseudonymized case-journal retention)
  needs tables from files 2-5 that don't exist yet, plus a scheduled job
  for the 14-day boundary — explicitly deferred, not silently dropped.
  Login-during-grace-period auto-cancellation (`"можно отменить входом"`)
  IS implemented, at both login sites (`AuthService.verifyOtp`,
  `SocialAuthService.login`).
- **Contact uniqueness checked at VERIFY, not REQUEST** (`ContactsService`):
  rejecting an already-claimed phone/email at request time would let an
  attacker enumerate registered contacts by trying to add them to a
  throwaway account. Checked only after the caller proves they received
  the code at that inbox/number.
- **`/auth/otp/request` returns `200`, not Nest's POST default `201`** —
  it triggers a side effect (send a code), it doesn't create a
  resource. Every other token-issuing POST (`verify`, `social`,
  `refresh`) legitimately creates a Session and keeps the `201` default.

### New env vars, error codes, files

- ~25 new env vars (`env.schema.ts`): JWT signing keys/TTLs
  (`JWT_KEYS` supports multiple `kid:secret` pairs for rotation), OTP
  secrets/tuning, SMS/email provider selection + credentials (required
  conditionally via `.superRefine`), auth-specific rate limits, social
  login audiences, `FEATURE_ATTESTATION`. `OTP_DEV_FIXED_CODE` (forces
  every code to `000000`) is boot-refused outside `NODE_ENV=development`
  **or `test`** — extended to `test` this stage (see Verification note)
  since e2e tests need a deterministic code and the mock providers never
  expose the real one anywhere, not even logs.
- ~18 new `ErrorCode` members. `TOKEN_EXPIRED` is load-bearing (§10.4:
  the mobile client's dio interceptor keys off that exact string to
  trigger silent refresh) — `JwtAuthGuard` is the one and only place
  that can throw it, and only for a genuinely expired token.
- `apps/api/src/modules/auth/`: services (`token`, `otp`, `rate-limit`,
  `identity`, `session`, `session-revocation`, `auth-event`), SMS/email
  provider interfaces + mock/real implementations, social verifiers
  (`GoogleTokenVerifier` via `google-auth-library`, `AppleTokenVerifier`
  via `jose`'s remote JWKS — Apple has no official Node SDK), guards
  (`JwtAuthGuard` global, `ReauthGuard` route-level), decorators
  (`@Public`, `@CurrentUser`, `@ReauthRequired`), DTOs, `AuthService`
  (OTP + refresh + sessions + reauth + identifiers orchestration),
  `SocialAuthService` (independent branch), `AuthController`,
  `AuthModule`.
- `apps/api/src/modules/users/`: `ContactsService`, `ConsentsService`,
  `AccountDeletionService`, `UsersController`, `UsersModule` (imports
  `AuthModule` for its exported `OtpService`/`IdentityService`/
  `SessionRevocationService`/`ReauthGuard`/`AuthEventService` rather
  than re-providing them).
- Unit tests: `token.service.spec.ts` (sign/verify round-trip, kid
  rotation, the expired-vs-invalid distinction §10.4 depends on),
  `identity.service.spec.ts` (the no-auto-merge policy, including that
  `user.create` is provably never called on a collision).
- `apps/api/test/auth.e2e-spec.ts`: the four required acceptance
  scenarios from §15 stage 1.4, run against real infra — see
  Verification note below.

### Bugs found and fixed during this stage's own verification (not hypothetical — each one failed a real build/lint/test/e2e run first)

- **`Mock*/Twilio*/Ses*` inside a `/** */` doc comment in `auth.module.ts`
  contained a literal `*/`, closing the comment early** — `tsc` failed
  with ~127 cascading syntax errors. Reworded.
- **`IdentityService` was built but never added to `AuthModule`'s
  `exports`** — `UsersModule`'s `ContactsService` (which needs it for
  the contact-uniqueness check) failed Nest's DI resolution at real
  boot (`UnknownDependenciesException`), caught by actually running
  `node dist/src/main.js`, not by `tsc`/`prisma validate` (neither
  checks DI wiring). Added to the exports list.
- **`@nestjs/jwt@12` and `jose` are ESM-only packages.** `nest build`
  and `prisma validate` both stayed green regardless (neither one loads
  the module graph at runtime), and a real `node dist/src/main.js` boot
  loads them fine (Node 22+ transparently supports `require(esm)`) — but
  Jest's own CJS module system does not by default, so every unit/e2e
  test importing anything through `AuthModule` failed with
  `ERR_REQUIRE_ESM` until `transformIgnorePatterns` was added to both
  `package.json`'s `jest` block and `test/jest-e2e.json`. Documented as
  a Jest-tooling-only issue, confirmed NOT a production runtime bug by
  directly booting the built app.
- **Stacking two `@ValidateIf` decorators on one property does not
  scope each to "the validator immediately below it"** the way it
  reads. `OtpRequestDto`/`OtpVerifyDto`/`ReauthDto`/`ContactRequestDto`/
  `ContactVerifyDto` all originally wrote `@ValidateIf(phone) @IsE164Phone()
  @ValidateIf(email) @IsEmail()` on the same `identifier`/`value` field,
  intending "validate as phone when channel=phone, as email when
  channel=email." class-validator's conditional metadata doesn't
  compose that way; a malformed phone number sailed straight through
  `ValidationPipe` with `forbidNonWhitelisted` still on — caught by the
  e2e suite's "rejects a malformed identifier with VALIDATION_ERROR"
  test, which got a `401` instead of the expected `400`. Fixed by
  replacing the pattern everywhere with a single custom validator
  (`IsIdentifierForChannel`/`IsPhoneOrEmailIdentifier` in
  `auth/dto/validators.ts`) that branches internally instead of relying
  on stacked conditionals — a fix with real, checked-in test coverage,
  not a guess.
- **`HealthController`/`DevEchoController` weren't marked `@Public()`.**
  Once `AuthModule` registers `JwtAuthGuard` as the global `APP_GUARD`,
  every route 401s without an explicit opt-out — including
  `GET /health/ready`, which a load balancer/k8s probe will never send a
  bearer token to. Caught by the pre-existing stage 1.2 `app.e2e-spec.ts`
  regressing from `200` to `401` on a totally unrelated route, which is
  exactly the kind of regression that test suite exists to catch.
  Both controllers marked `@Public()`.

### Known limitations, honestly stated

- `TwilioSmsProvider`/`SesEmailProvider` are implemented for real (not
  stubbed) but have never made a live call — no Twilio/AWS credentials
  exist in this sandbox. `MockSmsProvider`/`MockEmailProvider` are what
  every test in this stage actually exercises.
- No unit tests for `SessionService`'s reuse-detection/benign-retry
  branching or `OtpService`'s Lua-script lockout logic in isolation —
  both are Redis/Lua-atomicity-dependent enough that a mocked-Redis unit
  test would mostly test the mock, not the logic. Covered instead by
  the real-infra e2e suite (scenario 2 = lockout, scenario 3 = both
  reuse-detection branches), which is a stronger guarantee for exactly
  this code, not a lesser one — but it means there is no *unit*-level
  regression signal for these two files specifically.
- Consents endpoint records whatever the client sends; it does not
  itself enforce that `age_18`/`terms`/`privacy`/`disclaimer` were
  granted — that gate belongs to onboarding's guard logic (file 1 §11),
  not yet built.
- No admin "suspend a user" endpoint exists yet (nothing sets
  `status='suspended'` in this stage) — the suspended-account rejection
  path is real and e2e-tested by setting the status directly via
  Prisma, exactly the way a future admin endpoint would.

## Verification note — 2026-09-21 (same day as stage 1.4)

Same no-Docker sandbox constraint as stage 1.3's verification note, same
solution (hand-extracted CockroachDB v24.1.5 + Redis binaries), same
"processes die between tool calls" constraint (infra start, migrate,
build, and test run all happen inside one shell invocation). This time,
against that real CockroachDB + Redis:

- `prisma migrate deploy` applied all 3 migrations (stage 1.3's + both
  stage 1.4 migrations) cleanly to two real databases (`lawbid` and a
  separate `lawbid_test`).
- `npm run build`, `npm run lint`, `npm run test` (17 unit tests) all
  green.
- **`npm run test:e2e` — 14/14 tests green, across both suites, against
  real infra**: the pre-existing stage 1.2 plumbing suite
  (`app.e2e-spec.ts`, unmodified in intent, needed the `@Public()` fixes
  above to keep passing) and the new `auth.e2e-spec.ts` covering all
  four required acceptance scenarios from §15 stage 1.4 word for word:
  successful phone login (+ a structural check that email-shaped
  identifiers are accepted by validation, without requiring a live SMTP
  target); 5 wrong codes → lockout, and a fresh `/otp/request` provably
  does NOT reset the lock (the 6th attempt, even with the CORRECT code,
  stays `423 AUTH_OTP_LOCKED`); refresh-token reuse from a different
  device → `401 AUTH_REFRESH_REUSE_DETECTED` AND the newest,
  legitimately-rotated-to token from that same chain fails afterward
  too (plus a second test proving the grace-window benign-retry path
  does NOT trip reuse detection); suspended/deleted accounts rejected
  at verify with the right error code while `/otp/request` still
  returns an identical `200`, and a `deletion_pending` account is
  auto-cancelled by a successful login.
- Every full-login e2e scenario drives the flow through `channel=phone`
  (`MockSmsProvider` has zero I/O) rather than `email`
  (`MockEmailProvider` genuinely dials `SMTP_HOST:SMTP_PORT`, and this
  sandbox has no SMTP server) — documented in `auth.e2e-spec.ts`'s own
  file doc, not hidden. `AuthService`/`OtpService`/`SessionService` treat
  both channels identically; only the leaf provider differs.
- All four bugs listed above under "Bugs found and fixed" were caught
  by this exact verification pass, in this order, each one blocking the
  next command in the same script until fixed — none were found by
  inspection alone.

Services were stopped after the run; nothing from this verification is
reachable from outside the sandbox, and no code was committed until
this pass was fully green.

## Stage 1.5 (Flutter design system + skeleton) — 2026-09-22

Scope: file 01 §15 "Этап 1.5" + file 07 §11 "Этап D.1" and "Этап D.2"
(D.3 — the actual registration screens — is stage 1.7, not this stage).
Per the owner's explicit instruction this session, the design-system
architecture and the accessibility review of the fixed visual design
were done with subagents (`ecc:code-architect`, `ecc:a11y-architect`)
*before* any Dart code was written, not just architecture as in prior
stages — both reports are reflected in the decisions below.

This is the first Flutter code in the repo. `apps/mobile` had only a
placeholder README before this stage.

### What was built

- **Theme**: `AppColorTokens`/`AppTypographyTokens` as `ThemeExtension`s
  (file 07 §2-§3 token tables reproduced exactly, both themes),
  `AppTheme.light()`/`.dark()`, theme-mode persistence
  (`ThemeModeRepository` interface + `LocalThemeModeRepository` +
  Riverpod `ThemeModeController`) — deliberately swappable so stage 1.7
  can add server sync behind the same interface without touching call
  sites.
- **13 base widgets** (file 01 §15's list + file 07 §4's additions):
  `AppButton`, `AppIconButton`, `GavelStrikeButton`, `AppTextField`,
  `AppOtpField`, `AppChip`, `AppCard`, `AppAvatar`, `RoleCard`,
  `ScalesLogo`, `WatermarkScales`, `AppSkeleton`, `AppEmptyState`,
  `AppErrorState`, `LegalText`, `AppTopBar`, `AppBottomNav` — all
  token-driven, zero hardcoded hex/strings in widget code (see
  "Temporary string-keying layer" below for how strings are avoided
  before stage 1.6's real L10n exists).
- **`ScalesLogo`** (file 07 §5): `CustomPainter`, one widget for both the
  large-animated and small-static usages (`animated: bool` gates
  whether an `AnimationController`/`Ticker` is even created). Swing
  physics = the exact `angle(t)` formula in §5.2; pauses via
  `WidgetsBindingObserver` (app backgrounded) and `RouteAware` (screen
  not current — added `core/navigation/route_observer.dart`, a shared
  `RouteObserver` app.dart must register); never starts ticking at all
  under `MediaQuery.disableAnimations` (not just frozen — the
  controller itself doesn't run, checked in `didChangeDependencies` via
  a `_syncTicking()` gate, not `initState`, since `MediaQuery` isn't
  reliably available that early).
- **`GavelStrikeButton`** (file 07 §7): wraps `AppButton` (doesn't
  reimplement its chrome/press-scale), `Overlay`-based strike effect
  (pedestal + gavel + expanding ring, all per the exact geometry/timing
  in §7.2-§7.3), haptic pulse at the 52% "hit" keyframe, ~700ms
  action-fire delay, repeated taps mid-animation ignored,
  `RepaintBoundary`-isolated, `OverlayEntry` removal guarded by
  `.mounted` (an entry can outlive its Overlay if the whole route is
  popped mid-animation — checked, not assumed).
- **Navigation**: `StatefulShellRoute.indexedStack` with 4 branches
  (Лента/Поиск/Моё/Профиль) + `/create` as a root-navigator route (file
  07 §3.4: full-screen with a close ✕, not a 5th tab). `AppBottomNav`
  is role-**unaware** by design — role only changes tab icons/labels via
  `bottom_nav_config.dart`, never route topology; a stub
  `currentUserRoleProvider` (always `client`) stands in for real session
  state until stage 1.7. `authGuardRedirect` is wired into the router
  as a no-op stub with the real signature, so stage 1.7's actual
  guard logic is a one-function change, not a router restructure.
- **5 stub screens** (Лента, Поиск, Моё, Профиль, «+»/Создать), each
  showing `AppTopBar` + `AppEmptyState`; Профиль additionally hosts a
  `SegmentedButton` theme-mode switcher as this stage's concrete proof
  of the "переключение тем" acceptance criterion.
- **Fonts**: real Source Serif 4 and Inter **variable-font** `.ttf`
  files (with their `OFL.txt` licenses) downloaded from Google Fonts'
  official `google/fonts` GitHub repo and committed to
  `assets/fonts/` — not fabricated placeholder files. `pubspec.yaml`
  declares the same variable-font file 3× under different `weight:`
  values for Inter (400/500/600) and once for Source Serif 4 (600,
  the only weight file 07 uses), which is the standard technique for
  exposing a variable font's weight axis through Flutter's normal
  `FontWeight` API.
- **Golden + widget tests**: 4 base widgets × 2 themes (`AppButton`
  incl. loading state, `RoleCard` both role variants, `ScalesLogo`
  static pose, `AppBottomNav`) via `golden_toolkit`, plus non-golden
  widget tests for the two animated widgets covering exactly what file
  07 §9 requires: gavel skipped under `disableAnimations`, repeated
  taps during the strike ignored, clean dispose mid-animation for both
  `GavelStrikeButton` and `ScalesLogo`. A unit test covers
  `AppColorTokens.copyWith`/`.lerp`.

### Judgment calls (documented per standing instruction)

1. **`StatefulShellRoute.indexedStack`, not plain `ShellRoute`.** File
   01 §15 says "ShellRoute" literally; `ecc:code-architect` flagged that
   the plain variant loses per-tab Navigator/scroll state the moment
   files 2-6 nest real screens under each tab, and retrofitting later
   is expensive. Chose the modern variant now — same behavior for
   stage 1.5's stub screens, correct foundation for later stages.
2. **WCAG 2.2 non-text-contrast fix for the gold focus/selection
   border, added without changing the approved gold color.**
   `ecc:a11y-architect` computed the actual contrast ratios for every
   color pair in file 07 §2 and found one real failure: `#C9A24A` gold
   on white/light `surface` (the focused-field / focused-OTP-cell /
   selected-role-card border) measures **2.40:1**, below the WCAG 2.2
   SC 1.4.11 minimum of 3:1 for a UI state boundary (dark theme is
   unaffected — 7.51:1). File 07 explicitly says not to alter its
   approved colors/components without asking the owner
   ("ничего не «улучшать» и не менять по своему усмотрению" /
   "новый компонент — сначала вопрос владельцу"), so the gold value
   itself was **not** touched. Instead, `AppColorTokens.focusRingGlow`
   (a soft gold-tinted `BoxShadow`, `#40C9A24A`, transparent in dark
   theme where it's not needed) was added as a second, non-color visual
   cue on `AppTextField`/`AppOtpField` when focused, and on `RoleCard`
   when selected in light theme. **This is a real, load-bearing
   accessibility fix, not decoration — please tell me if you'd rather
   it be reverted or done differently; it's isolated to one named
   token so it's a one-line change either way.**
3. **Temporary string-keying layer (`core/l10n/`) ahead of stage 1.6.**
   File 07 §D.1's own acceptance line says stage 1.5 must have "нет
   hardcode-цветов и строк" (no hardcoded strings), but the real
   localization system (xlsx import, drift cache, live switch) is
   stage 1.6, not built yet. Added a minimal `Translator` interface +
   `StaticTranslator` (a hardcoded Russian `Map<String,String>`) behind
   a `translatorProvider`, so every stage-1.5 widget already calls
   `t('key')` instead of embedding literal strings, and stage 1.6 only
   has to swap the provider override — no call-site changes. The keys
   used (`nav.tab.*`, `empty.default.message`, etc.) are **not** in
   file 07 §8's translation table (which only covers the auth/
   onboarding screens built in stage 1.7) — file 01 §3 gives their
   Russian copy directly ("Лента | Поиск | + | Моё | Профиль"), so
   these are a necessary, spec-consistent addition, flagged here so
   stage 1.6 merges them into `translations_seed.xlsx` instead of
   re-deriving them from scratch.
4. **`golden_toolkit`, not raw `matchesGoldenFile`.** Recommended by
   `ecc:code-architect`: `testGoldens`/`loadAppFonts()` embeds the real
   bundled Source Serif 4/Inter into the test binary (otherwise
   `flutter test` substitutes a placeholder font and the goldens
   wouldn't reflect the actually-approved typography). Tradeoff: golden
   rendering can drift slightly across OS/font-hinting — generate/
   verify goldens in one consistent environment (ideally CI), not ad
   hoc on your Mac each time.
5. **Attorney role card's fixed navy styling lives in one named,
   commented constant (`AppColorsFixed`), not folded into the themed
   token system**, because file 07 §2 makes it explicitly
   theme-invariant ("всегда тёмно-синяя ... в обеих темах") — forcing
   it through `ThemeExtension.lerp` would be wrong (it should never
   lerp toward a light-theme color). Documented inline as an approved,
   deliberate exception so a future "why is this the only hardcoded
   color" question has an answer at the point of use.

### Known limitations, honestly stated

- **This code has not been run.** The cloud sandbox this session
  operates in has no Flutter SDK and no way to install one (confirmed
  again this stage — see "Bootstrapping on your Mac" below); every
  file was hand-written against file 07's numeric spec and cross-
  checked with an automated brace-balance + import-resolution sweep
  (56 files, 0 issues), but that is not a substitute for
  `flutter analyze`/`flutter test` actually running. Please run them
  (see below) and tell me what fails — I'd rather fix real errors you
  hit than claim this is verified when it isn't.
- **`ScalesLogo`'s pan-swing math (rotation direction, bowl-curve arc
  direction) is the single piece of this stage authored purely from
  the coordinate spec without any way to render and eyeball it.**
  Flagged in the widget's own doc comment too. Everything else (colors,
  type, button/field/card layout, the gavel strike, navigation) is
  much lower-risk because it doesn't depend on getting a rotation
  sign or an arc-sweep direction right by pure reasoning.
- **No `android/`/`ios/` platform folders yet** — `flutter create` was
  never run (can't run the `flutter` binary in this sandbox at all, not
  even to scaffold). `flutter test`/`flutter analyze` don't need them;
  actually running the app on your Android device (promised for stage
  1.7) does. See "Bootstrapping on your Mac" below.
- **`*.g.dart` files (Riverpod codegen) do not exist yet** — they're
  build artifacts (gitignored), generated by `dart run build_runner
  build`, which needs the Dart SDK. This is normal for any
  riverpod_generator project, not a gap specific to this stage.
- **Golden baseline `.png` files do not exist yet** — first
  `flutter test` run needs `--update-goldens` to create them; they then
  get committed and every subsequent run compares against them.
- The WCAG gold-border fix (judgment call #2 above) is a real,
  intentional design change beyond file 07's literal pixels, even
  though it doesn't touch the approved gold color value itself —
  flagged prominently in case the owner wants to review it specifically.

### Bootstrapping on your Mac (needed before anything above can be verified)

```bash
cd apps/mobile
flutter create --org com.lawbid --project-name lawbid --platforms=android,ios .
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test --update-goldens   # first run only, to create golden baselines
flutter test                    # subsequent runs
```

`flutter create .` on a directory that already has `lib/`/`pubspec.yaml`
only fills in what's missing (platform folders) — it does not overwrite
the Dart source written this stage. Please run this and tell me what
`flutter analyze`/`flutter test` actually report; I'll fix whatever's
real rather than guessing.

## Stage 1.7 (auth/onboarding screens) — 2026-09-22

**Scope of this entry, stated up front (per the owner's standing "always
check you're going strictly by ТЗ" instruction):** file 01 §15's full
stage-1.7 scope is `AuthRepository` + dio interceptors (auth/refresh/
idempotency/retry) + secure token storage + `SessionState` +
`AppRouterGuard` + Apple/Google native SDKs + SMS autofill + biometric
reauth + consents/18+ + "Активные устройства" + account deletion + "Скачать
мои данные". **None of that is built in this entry.** What IS built: the 4
screens file 07 §6/D.3 actually specifies (welcome, phone, otp, role) as
real, wired-up Flutter UI, working end-to-end against a stub backend, per
the owner's explicit instruction this session ("Начинай писать реальные
экраны этапа 1.7"). The rest of file 01 §15's stage-1.7 list is a
separate, not-yet-started pass — see "Known limitations" below for exactly
what that means in practice (e.g. the 10-item manual acceptance checklist
in file 01 §15 is NOT satisfiable yet; only items 2 and 4 are even
partially exercisable with what exists now).

Consulted `ecc:code-architect` (routing/state/repository architecture) and
`ecc:a11y-architect` (screen-level accessibility) before writing any
screen code, per the owner's instruction to run design/architecture
decisions past the subagents first.

### What was built

**New `features/auth` module** (`apps/mobile/lib/features/auth/`):
- `domain/onboarding_step.dart`, `domain/onboarding_flow_state.dart`
  (freezed), `domain/otp_verify_result.dart` (freezed union: success/
  invalid/expired/networkError, not a bare `bool`).
- `data/auth_repository.dart` (interface) + `data/stub_auth_repository.dart`
  (accepts any 6-digit code except the reserved `000000`, simulated 500ms
  latency, no real network call) + `data/onboarding_local_store.dart`
  (persists ONLY `{step, phoneNumber}` — never the OTP code — for
  resume-after-kill).
- `application/auth_providers.dart` + `application/onboarding_flow.dart`
  (`@riverpod` notifier driving all 4 screens from one shared state —
  screens genuinely share data: the phone number typed on screen 2 shows
  on screen 3).
- `auth_routes.dart`: 4 flat `GoRoute`s (`/welcome`, `/auth/phone`,
  `/auth/otp`, `/onboarding/role`) appended beside (not nested inside) the
  `StatefulShellRoute` — onboarding isn't a shell tab. `context.push()` for
  forward nav between the 4 screens (preserves back-stack state);
  `context.go()` only for the final role→shell transition.
- `presentation/screens/{welcome,phone,otp,role}_screen.dart` — built to
  file 07 §6.1-§6.4's exact numeric layout (offsets, gaps, font tokens),
  reusing stage-1.5 components (`ScalesLogo`, `GavelStrikeButton`,
  `AppButton`, `AppTextField`, `AppOtpField`, `RoleCard`, `LegalText`,
  `WatermarkScales`).

**Design-system additions/changes** (`core/design_system/`):
- `widgets/display/brand_glyphs.dart`: `EmailGlyph`/`AppleGlyph`/
  `GoogleGlyph`/`ChevronGlyph` — hand-drawn `CustomPainter`s (same pattern
  as `ScalesLogo`/`WatermarkScales`/the gavel), geometry transcribed
  point-for-point from the owner-approved welcome-screen preview artifact's
  SVG paths, so these render pixel-true to what was already reviewed.
- `widgets/buttons/app_back_button.dart`: `AppBackButton` (22px chevron in
  a 44×44 tap target, file 07 §6.2/§9).
- `widgets/buttons/gavel_strike_icon_button.dart`: `GavelStrikeIconButton`
  — file 07 §7.4 lists the welcome screen's 3 social-login icon buttons
  among the gavel-strike buttons (re-read closely: "«Продолжить с
  телефоном» **(и три иконки соцвхода на приветствии)**"), which stage
  1.5's `GavelStrikeButton` (wraps `AppButton` only) can't drive. Shares
  `GavelStrikeButton`'s private overlay/painter via a `part`/`part of`
  split rather than duplicating ~120 lines — see that file's top comment.
  `AppIconButton` gained an optional `onTapDown` pass-through hook
  (additive, mirrors `AppButton`'s existing one) so the wrapper can learn
  the tap position.
- `widgets/inputs/app_otp_field.dart` **restructured**: was 6 independent
  `TextField`s; now backed by ONE real (invisible) `TextField` owning
  focus/keyboard/`AutofillHints.oneTimeCode`, with the 6 boxes as a purely
  presentational `IgnorePointer` overlay. Per `ecc:a11y-architect`: 6
  separate fields both read badly to a screen reader (walked as 6 unrelated
  fields instead of one "код подтверждения" field) and don't reliably
  receive SMS-autofill (which needs one real target). Public API
  (`onCompleted`/`onChanged`/`errorText`/`autofocus`) unchanged.
- `theme/theme_mode_providers.dart`: `sharedPreferencesProvider`/
  `localKvStoreProvider` moved out to a new `core/persistence/
  persistence_providers.dart` — local-storage bootstrap isn't a
  design-system concern, `theme_mode_providers.dart` was just its first
  (stage-1.5) consumer; `OnboardingLocalStore` is the second, and neither
  should import through the theme folder to reach it. `main.dart`'s import
  updated accordingly; no provider name changed.

**Routing/guard** (`core/navigation/`):
- `app_router.dart`: `initialLocation` changed from `/feed` to `/welcome`
  (there was no auth flow to default away from before this stage);
  `authRoutes()` appended; `redirect` now closes over `ref` and calls
  `authGuardRedirect(context, state, ref)`.
- `guards/auth_guard.dart`: no longer a no-op. Resumes in-progress
  onboarding (file 01 §15 acceptance item 4) by redirecting to the saved
  step whenever the current route doesn't match it. Doc comment states
  plainly what this guard still can't do (see Known limitations).

**Localization**: `core/l10n/static_translator.dart` gained the full
`auth.*`/`onboarding.*`/`brand.*` key set from file 07 §8 (ru column,
copied verbatim) plus a small necessary addition (`common.back`,
`auth.phone.fieldLabel`, `auth.phone.error.invalid`) — same "necessary,
spec-consistent, not in file 07 §8's table" category as stage 1.5's
`nav.*`/`empty.*`/`error.*` keys. This is a direct, documented consequence
of building stage 1.7 before stage 1.6 (see judgment call #1 below).

**Tests**: `test/features/auth/golden/auth_screens_golden_test.dart` — 4
screens × 2 themes (8 goldens), per file 07 §9's "4 экрана × 2 темы"
requirement. The 3 additional state-variant goldens file 07 §9 also asks
for (field error / button loading / selected role card) are **not**
included — see Known limitations.

### Judgment calls (owner asked to flag these rather than silently decide)

1. **Building stage 1.7's screens before stage 1.6's real localization
   exists.** The owner's instruction this session was explicit and
   unambiguous ("Начинай писать реальные экраны этапа 1.7... продолжай с
   сабагентами"), so this proceeds rather than stalling to ask — but the
   consequence is real: the `auth.*` strings now live in `StaticTranslator`
   (a hardcoded Russian map), not the real xlsx-backed L10n layer. File 01
   §15 stage-1.7's own acceptance item 7 ("Переключение языка и темы
   сохраняется") can't be exercised for language yet — there's no second
   language to switch to. When stage 1.6 lands, these keys move into
   `translations_seed.xlsx` and (per the `Translator` interface's whole
   design point) no call site changes.
2. **Scope is "screens" — exactly file 07 §6/D.3's 4 screens — not file 01
   §15's full stage-1.7 list.** Explained at the top of this entry.
   `StubAuthRepository` stands in for the real backend; swapping it is a
   provider-override change (`authRepositoryProvider`), not a call-site
   change, by design — same pattern as `themeModeRepositoryProvider`.
3. **`GavelStrikeIconButton` as a `part`/`part of` sibling of
   `GavelStrikeButton`, not a merged shared base class.** The two
   `_State` classes are near-mirrors (one wraps `AppButton`, one wraps
   `AppIconButton`). Extracting a real shared animation-controller base
   would be the more elegant long-term answer, but doing that refactor to
   the already-committed, already-golden-tested `GavelStrikeButton` in the
   same pass as new screens felt like unnecessary risk to working code —
   flagged so a future pass can revisit if the drift between the two state
   classes ever becomes a real maintenance problem.
4. **Google's brand glyph rendered monochrome (`colors.text`), not
   Google's real multi-color "G".** File 07 §4's generic `AppIconButton`
   definition ("20px icon в цвете `text`") doesn't carve out an exception
   for Google the way file 07 §2 explicitly does for the Attorney card's
   navy. Google's own brand guidelines actually call for the full-color
   mark on a "Sign in with Google" button — flagging this specific tension
   for the owner rather than silently picking one reading. Easy to add a
   `AppColorsFixed`-style exception later if wanted (same pattern as the
   Attorney navy).
5. **US-only phone number field, no country picker.** File 07 §6.2 shows a
   static "US +1" chip in the reference preview and doesn't spec a country
   selector; the product is explicitly US-market. `_CountryChip` is a
   non-interactive display element for now.
6. **60-second OTP resend cooldown.** Not specified anywhere in file 07 §6.3
   — a conventional SMS-OTP default, not derived from spec text.
7. **`initialLocation` changed from `/feed` to `/welcome`.** Necessary now
   that an auth flow exists to default into — see Known limitations for
   what this does NOT yet solve (returning-user cold starts).

### Known limitations, honestly stated

- **This code has not been run**, same sandbox constraint as every prior
  stage — no Flutter/Dart SDK reachable here at all. Verified with the
  same automated sweep as stage 1.5 (brace/paren/bracket balance +
  relative-import resolution + `part`/`part of` pairing) across all 27
  touched files, 0 issues found beyond the 5 build-runner-generated files
  that are expected to be absent (`*.g.dart`/`*.freezed.dart` — see
  Bootstrapping below). That sweep cannot catch type errors, so please
  run `flutter analyze`/`flutter test` and tell me what's real.
- **No `prefer_const_constructors` pass.** `very_good_analysis` (the lint
  base) will very likely flag a number of missed `const` on literal
  widgets across the new screen files — I did not attempt to hand-verify
  const-correctness for ~17 files without being able to run `dart fix
  --apply`/`flutter analyze` to confirm each one is actually safe. Running
  `dart fix --apply` after `flutter analyze` should clear most of these
  mechanically.
- **`currentUserRoleProvider` is still hardcoded to `UserRole.client`.**
  `RoleScreen` calls `OnboardingFlow.selectRole()`, which is stored in
  `OnboardingFlowState.selectedRole`, but nothing wires that into the
  app's actual role/session state yet — that needs `SessionState`, which
  is part of the not-yet-started full auth pass. Concretely: today, an
  Attorney who finishes onboarding still sees the Client-flavored bottom
  nav on `/feed`.
- **No persisted "is logged in" signal at all.** `OnboardingLocalStore`
  only tracks in-progress onboarding and is cleared on completion — there
  is no token/session persisted anywhere yet. A real returning user who
  finished onboarding yesterday will see `/welcome` again on the next cold
  start, not `/feed`, until secure token storage + `SessionState` exist.
  Stated plainly in `auth_guard.dart`'s own doc comment too.
- **Consents/18+ screen not built.** File 07 §6.5 lists it in the logical
  flow order ("код → согласия и 18+ → выбор роли") but file 07 itself
  explicitly excludes it from D.3's scope ("Экраны, не показанные в
  макете (согласия, ...) выполняются... в этом же стиле" — i.e., later).
  Current flow goes straight from a verified OTP to role selection.
- **3 of file 07 §9's required golden-test states are missing** (field
  error, button loading, selected role card) — they need interaction
  sequences (`tester.tap`/`tester.enterText`) timed against the stub's
  simulated network delay, which I had no way to actually run and iterate
  on here. Flagged in the test file itself.
- **Apple/Google buttons and the Terms/Privacy legal links show a "not
  built yet" snackbar** rather than doing anything — matches what the
  owner-approved preview artifact already showed for those three buttons,
  and legal-document pages are file 06 territory, not yet built.
- **No manual on-device check has happened** (can't — no Flutter SDK here).
  The file 07 §11 D.3 acceptance checklist (pixel comparison against the
  mockup, gavel strike on all 4 buttons, checkmark position, 16px title gap)
  needs your eyes on your Mac.

### Bootstrapping on your Mac

Same commands as stage 1.5 — `build_runner` now also generates this
stage's freezed unions/state class and the `OnboardingFlow` notifier:

```bash
cd apps/mobile
flutter pub get
dart run build_runner build --delete-conflicting-outputs
dart fix --apply          # mechanical lint fixes (see const-constructors note above)
flutter analyze
flutter test --update-goldens   # first run only
flutter test
```

Please run this and tell me what `flutter analyze`/`flutter test` actually
report — same as every prior stage, I'd rather fix real errors than claim
this is verified when it isn't.

## Toolchain bootstrap + dependency migration — 2026-09-22 (post stage 1.7)

First time the Flutter app was actually built/analyzed rather than
hand-verified. Two separate pieces of work happened in this session:
getting a real Flutter/Xcode/Android toolchain onto your Mac (previously
nothing was installed), and then fixing a real, non-trivial dependency
crisis that blocked `build_runner` once codegen was actually attempted.

### Toolchain installed on your Mac

Flutter 3.47.5 (stable), Xcode 27.0 (license accepted, first-launch
components installed), CocoaPods 1.17.0, Android Studio + Android SDK
(cmdline-tools + licenses accepted), iOS 27.0 Simulator runtime. `flutter
doctor -v` is green except Chrome (irrelevant — no web target). Docker,
Node, git were already present.

### The dependency crisis and why versions moved

`dart run build_runner build` failed on the very first real attempt with
an `analyzer_plugin` / `Element` -> `Element2` mismatch. Root cause,
confirmed via pub.dev's API: `analyzer` did an internal API migration
(`Element` -> `Element2`) partway through its 7.x line without a major
version bump, which broke `analyzer_plugin` (pinned by `custom_lint_core`
at `^0.12.0`), which is pulled in transitively by every 2.x version of
`riverpod_generator` (2.0.0 through 2.6.5, all of them - confirmed by
checking each release's own pinned deps) via
`riverpod_generator -> riverpod_analyzer_utils -> custom_lint_core`. This
is unrelated to our own code; it's a permanent break in that specific
dependency chain against any analyzer version the current Dart SDK
accepts. Three different `dependency_overrides` pin attempts (forcing
various `analyzer`/`analyzer_plugin`/`custom_lint_core` combinations) all
failed for related reasons (missing SDK `_macros` package below analyzer
7.3.0; the same Element2 break re-appearing one layer up in
`riverpod_analyzer_utils` itself, which was also never updated for it).

**Decision**: stop patching around Riverpod 2.x and move the whole
codegen stack to its current major versions, which dropped
`analyzer_plugin`/`custom_lint_core` out of the graph entirely -
confirmed in `pubspec.lock`, neither package appears anymore.

| package | before | after |
|---|---|---|
| `flutter_riverpod` | `^2.6.1` | `^3.4.3` |
| `riverpod_annotation` | `^2.6.1` | `^4.0.7` |
| `riverpod_generator` (dev) | `^2.6.3` | `^4.0.9` |
| `freezed_annotation` | `^2.4.4` | `^3.1.0` |
| `freezed` (dev) | `^2.5.7` | `^4.0.2` |
| `json_annotation` | `^4.9.0` | `^4.12.0` |
| `json_serializable` (dev) | `^6.9.0` | `^6.14.1` |
| `build_runner` (dev) | `^2.4.13` | `^2.16.1` |

This is a real breaking API migration for the whole app's state-management
layer (Riverpod 2->3), not just a version bump, and it changed freezed's
own union syntax (see below). `custom_lint`/`riverpod_lint` (IDE-only lint
tooling, not used by app code/build/tests) were removed rather than
migrated to their 3.x line, to keep this fix scoped to "unblock the
build" - re-adding them (now trivially compatible with Riverpod 3.x, no
version conflict) is a separate, optional decision, not done here.

### Freezed 2.x -> 4.x syntax migration (real compile errors, now fixed)

Freezed 4.x requires an explicit class modifier on any `@freezed` class
that didn't need one under 2.x - the old bare `class X with _$X` compiles
but silently drops union support:

- `OtpVerifyResult` (multi-variant union: success/invalid/expired/
  networkError) -> `sealed class`.
- `OnboardingFlowState` (single-variant state class) -> `abstract class`.

Bigger, easy-to-miss gotcha found only by reading the generated
`.freezed.dart` output: freezed 4.x generates `when`/`map`/`maybeWhen`/etc.
as an **extension** (`extension OtpVerifyResultPatterns on
OtpVerifyResult`) instead of an instance method on the old `_$X` mixin.
Extension methods require the *declaring file* to be imported wherever
they're called - not just the type, which can otherwise reach a file
purely through return-type inference (as `OtpVerifyResult` did here, via
`AuthRepository.verifyOtp()`). `onboarding_flow.dart` called `.when()` on
an `OtpVerifyResult` without ever importing `otp_verify_result.dart`
directly, which compiled fine under freezed 2.x's instance-method
`when()` but is a hard error under 4.x. Fixed by adding the direct import.
Worth remembering for any future freezed union: **always import the
union's own file at every call site that uses `.when()`/`.map()`**, don't
rely on transitive type visibility.

### Other real compile errors fixed (Flutter SDK imports)

`flutter create` regenerated `android/`/`ios/` around the existing `lib/`
non-destructively (verified via `git diff` - only `analysis_options.yaml`
picked up `build/**`/`android/**`/`ios/**` in its `exclude:` list,
benign). Its stock `test/widget_test.dart` referenced a template `MyApp`
class that doesn't exist in this app and was deleted (our actual tests
are the golden tests under `test/features/auth/golden/` and
`test/design_system/golden/`).

Three files used Flutter SDK symbols without importing the library that
declares them - likely always latent, surfaced only once real analysis
ran:

- `gavel_strike_button.dart` - `HapticFeedback` needs
  `package:flutter/services.dart`.
- `app_text_field.dart` - `TextInputFormatter` needs the same.
- `app_router.dart` - `GlobalKey`/`NavigatorState` need
  `package:flutter/widgets.dart`.

### Lint cleanup (warnings, not errors)

Fixed the handful of real `warning`-level items from the first
`flutter analyze` run: an unused `onboarding_local_store.dart` import in
`onboarding_flow.dart` (already reachable via `auth_providers.dart`), an
unused `flutter_test` import in 5 golden-test files (redundant -
`golden_toolkit` re-exports it), and 2 `unnecessary_import`s
(`app_router.dart`'s `flutter_riverpod` - already re-exported by
`riverpod_annotation`; `profile_screen.dart`'s `theme_mode_providers.dart`
- already re-exported by `design_system.dart`).

**Not touched**: the remaining ~380 `info`-level items (line length >80,
`always_use_package_imports`, required-before-optional param ordering,
`prefer_int_literals`, etc.) are pre-existing `very_good_analysis` style
debt across files from stages 1.5/1.7, not caused by this session's
migration and not blocking the build. Left for a dedicated lint pass
rather than burning a large diff here; `dart fix --apply` will
mechanically clear a meaningful chunk of them. One `deprecated_member_use`
(`SemanticsService.announce` -> `sendAnnouncement`) and 2
`unawaited_futures` were also left as-is - deliberately, since I have no
way to check the exact new API signature or test the change against a
live analyzer from this sandbox, and getting an a11y-relevant announce
call wrong is worse than leaving a working deprecated call in place.

### Version-consistency audit (why this shouldn't drift again)

Checked `pubspec.lock` against `pubspec.yaml` end to end: every dependency
has an explicit `^` constraint (nothing left on an unbounded/`any`
version that could silently jump a major version on a future `pub get`),
`analyzer_plugin`/`custom_lint_core` are confirmed absent from the
resolved graph, and the Dart SDK constraint (`>=3.5.0 <4.0.0`) is
satisfied by the Flutter 3.47.5 toolchain now installed. **`pubspec.lock`
itself had never been committed** (present on disk, untracked in git) -
for an app (not a package) this is the actual mechanism that pins exact
resolved versions for every future `pub get`/CI run/teammate, so it's
committed as part of this change. Going forward, the version-safety rule
for this repo is: commit `pubspec.lock` on every dependency change, don't
hand-edit it, and re-run `flutter pub get` (which updates it
deterministically) rather than deleting it.

### What I still could not do

Same structural limitation as every prior stage: this sandbox
(`device_bash`) is a separate Linux ARM64 VM with no Flutter/Dart/Xcode -
confirmed again this session (`which flutter dart` -> nothing). Everything
above was verified by reading the actual generated `.freezed.dart` output
and `pubspec.lock`, and by re-deriving each error from first principles
(freezed's own generated extension code, Flutter SDK library exports),
not by running `flutter analyze` myself. **I did not run `flutter
analyze`/`flutter test`/`flutter run` after this second round of fixes.**
Please run:

```bash
cd apps/mobile
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
```

and tell me what's real. If `flutter analyze` comes back at 0 errors,
next step is `flutter run` (simulator or device) - the actual first run
of this app in the project's history.

## Verification note — 2026-09-22 (real flutter analyze/build_runner/test output, first time ever)

User ran the actual commands on their Mac and pasted real output for the
first time this whole project. Confirms the previous entry's fixes worked:
`dart run build_runner build` succeeded, and the re-run `flutter analyze`
came back with 416 issues and **zero `error` lines** — every remaining
item is `warning`/`info` (pre-existing style debt). The 6 real compile
errors from the entry above are gone.

`flutter test` then surfaced two categories of failure, neither of which
`flutter analyze` catches:

1. **Golden image comparisons fail with "non-existent file"** for every
   golden test (`app_button_*`, `role_card_*`, `app_bottom_nav_*`,
   `scales_logo_*`). This is expected, not a bug — no `goldens/*.png`
   baseline images have ever been generated (this is the first time these
   tests have run). Fixed by `flutter test --update-goldens` once, per
   the Bootstrapping commands below; not something to "fix" in code.
2. **Two real bugs**, fixed here:
   - `RoleCard` (`role_card.dart`) overflowed its `Column` by 7px
     (client) / 25px (attorney) inside the golden test's `surfaceSize`.
     File 07 §4 doesn't specify a fixed card height — `RoleCard` is
     correctly content-sized — so the bug was the golden test's guessed
     `surfaceSize: Size(320, 130)`, picked before it could ever be
     rendered against real font metrics. Bumped to `Size(320, 180)` in
     `role_card_golden_test.dart` (both client/attorney, both themes).
   - `AppButton`'s loading golden test hit `pumpAndSettle timed out`.
     Root cause: the loading state renders an indeterminate
     `CircularProgressIndicator`, which animates forever, and
     `screenMatchesGolden` calls `tester.pumpAndSettle()` internally by
     default — which can never settle against an infinite animation.
     Fixed with golden_toolkit's `customPump` parameter (pump one fixed
     100ms frame instead of settling) on the loading variant only; the
     default-state test is untouched since it has no animation to settle.

Both fixes are test-file-only — no application widget code changed.
`RoleCard`'s actual layout behavior (content-sized, not fixed-height) is
correct per spec and was left alone.

Not verified from here (same sandbox limitation as ever): please run
`flutter test --update-goldens` once, then `flutter test` again to
confirm 0 failures, then `flutter run` — analyze is clean, so the app
should now actually launch. You don't need to paste the full output back;
a one-line "passed" / "app launched" (or just the error line, if any) is
enough.


## Welcome-screen golden fix — 2026-09-22 (3rd real flutter test bug found)

`welcome screen - light` / `welcome screen - dark` were the last 2 failing
goldens (`pumpAndSettle timed out`), same signature as the earlier AppButton
loading fix. Root cause, confirmed by reading source (not guessed): the
welcome screen renders `ScalesLogo(size: 236, animated: true, ...)`
(file 07 §6.1/§5.2), and `ScalesLogo`'s `_ScalesLogoState.initState()`
creates `AnimationController(vsync: this, duration: const Duration(days: 1))`
then `.repeat()`s it once running (`_syncTicking()`), i.e. it never
naturally settles. `screenMatchesGolden`'s default internal
`pumpAndSettle()` therefore hangs against it, identical to the
`CircularProgressIndicator` case fixed earlier for `AppButton`.

Fix: in `test/features/auth/golden/auth_screens_golden_test.dart`, only the
`welcome` screen case now passes
`customPump: (tester) => tester.pump(const Duration(milliseconds: 100))` to
`screenMatchesGolden`; the other 3 screens (phone/otp/role, no infinite
animation) keep the default settle-based pump. No application widget code
was touched — test-file-only fix, same pattern/confidence level noted for
the AppButton fix above.

Next step for the user: run `flutter test --update-goldens` once more (the
welcome goldens were never captured before, since the test hung before
reaching the screenshot), then `flutter test` should be fully green.


## Welcome-screen design tweak — 2026-09-22 (owner request, seen after first real run)

Now that the app actually runs on-device (Android emulator, first time this
project's history), the owner asked for 2 visual tweaks to the welcome
screen after seeing it live: (1) put the scales-of-justice logo BELOW the
title text instead of above it, (2) enlarge the logo since the space
between the title and the phone button looked empty on a real screen —
stretch it, don't reposition it.

Consulted a design-reasoning subagent (read `docs/07_DESIGN_SYSTEM.md` §5/
§6.1 + the current widget code) before touching anything, since the file
carried an explicit prior "don't touch this screen" note from the owner —
this is a new, explicit override of that note from the same owner, given
after seeing the screen run for real.

Change in `welcome_screen.dart`: reordered to title → SizedBox(35) →
ScalesLogo → SizedBox(16) → button (was ScalesLogo → SizedBox(35) → title
→ ...); `ScalesLogo.size` raised 236 → 300 — the design doc's own stated
ceiling for this logo (§5.1: width ≤ 300), which fits horizontally with
16px+ margin at the narrowest common phone width (360pt). No other spacing
values changed — the existing 35px/16px gaps were reused between the
swapped elements. Estimated total content height (~540px) still clears
safe-area height on both a 390×844 (iPhone 13/14) and a tighter 360×800
Android screen without needing to scroll.

Updated the file-level doc comment (previously said "do not touch this
screen") to describe the new approved layout instead.

Known follow-up: this invalidates the (never-yet-generated) welcome-screen
goldens; the user needs to run `flutter test --update-goldens` again before
the golden suite is green, then those 2 new PNGs should get committed.


## Welcome-screen design correction — 2026-09-22 (owner correction of the previous tweak)

Owner corrected the previous change (logo size 236->300): they did NOT want
the whole logo enlarged, only the scale's stand/base stretched downward,
keeping the topper/beam/pans at normal proportions. Also asked for the
legal fine print to be pinned to the very bottom of the screen (not just
following the content), and a bit more breathing room between the logo and
the phone button.

Changes:
- `scales_logo.dart`: `ScalesLogo`/`_ScalesPainter` gained a new
  `standExtension` param (design-space units, same coordinate space as
  everything else the painter draws, default 0 - every other call site
  is pixel-identical). Only the stand line and the 2 base lines move; the
  topper circle, beam, and both pans are untouched.
- `welcome_screen.dart`: logo `size` reverted to 236 (the 300 from the
  prior commit is gone), `standExtension: 50` added. Logo-to-button gap
  16->28. Legal text is now pinned to the bottom via the standard Flutter
  "scrollable column with a pinned footer" idiom: `LayoutBuilder` +
  `ConstrainedBox(minHeight: viewport height)` + `IntrinsicHeight` +
  `Spacer()` right before the legal text - absorbs leftover vertical space
  on tall screens, still scrolls normally (no overflow) on short ones.

Known follow-up: this invalidates the just-generated (uncommitted) welcome
golden PNGs again - need another `flutter test --update-goldens` pass
before committing them.

### Scope check against file 01 for the owner's other 3 requests (same message)

The owner also asked, in the same message, for (1) the English copy to
"actually be English" - checked: it is NOT. `static_translator.dart` is
explicitly a stage-1.5-only, Russian-only stopgap (its own doc comment says
so) with zero English strings anywhere and no language-switching mechanism
at all; file 01 §1 requires English as the DEFAULT language, and the real
L10n layer (backend i18n module + Flutter L10n with live language
switching) is its own separate stage, Этап 1.6, not yet built. This isn't a
one-string fix - flagging it rather than hacking a single English literal
into a table whose own doc comment says English belongs in stage 1.6's
`translations_seed.xlsx`. (2) A language switcher on the welcome screen -
file 01 §10.2 screen B DOES explicitly call for "Переключатель языка
(мелкая ссылка)" on this exact screen, so this is a real, spec-confirmed
gap from stage 1.7 - genuinely missed, worth adding, but meaningfully
blocked on (1): there's currently nothing to switch TO. (3) A theme
switcher - file 01 only specs this inside the Settings screen (§3,
line 87) and as a general stage-1.7 acceptance-checklist item (#7), not on
the welcome screen specifically; Settings doesn't exist yet (only a
profile_screen.dart stub). (4) Working Apple/Google/Email buttons - these
need stage 1.4's backend (OTP/Apple-Google token validation) plus native
SDK configuration (Apple Developer + Google Cloud OAuth credentials the
owner must provide/configure) - out of reach of a UI polish pass. Per this
project's standing rule (never merge/skip ТЗ stages without direction),
raised these 4 as an explicit scope question back to the owner rather than
silently building partial/fake versions of stage-1.4/1.6 work under a
"quick fix" banner.


## Bilingual RU/EN toggle + theme toggle on welcome screen — 2026-09-22 (owner request, scope-checked against file 01)

Follow-up to the earlier scope question (same day, this conversation): owner
chose "leave social-login buttons as-is" (they need stage 1.4 backend +
Apple/Google native SDK config, correctly out of reach of a UI pass), and
"add a working RU/EN language button on welcome now, real i18n system still
waits for stage 1.6", plus a theme toggle button on welcome too (owner's own
placement choice — file 01 doesn't spec a theme control on this screen,
only in Settings, which doesn't exist yet).

New files (`lib/core/l10n/`):
- `app_language.dart` — `enum AppLanguage { ru, en }`.
- `language_repository.dart` / `local_language_repository.dart` — same
  interface-behind-a-local-implementation shape as
  `ThemeModeRepository`/`LocalThemeModeRepository`, persisted via the same
  `LocalKvStore`. Defaults to `AppLanguage.en` when nothing is persisted yet
  (file 01 §1: English is the default interface language).
- `language_providers.dart` — `LanguageController` (`@riverpod`, same
  build()/set-and-persist shape as `ThemeModeController`).

Changed:
- `static_translator.dart` — split into `StaticTranslatorRu` (unchanged RU
  copy) and `StaticTranslatorEn` (new). Every existing key got an English
  counterpart, not just the auth/onboarding ones — otherwise flipping to
  English would have hit the `assert(value != null, ...)` on any stub
  screen (nav/feed/search/etc.) that only ever had Russian.
- `l10n_providers.dart` — `translatorProvider` now watches
  `languageControllerProvider` and returns the matching translator.
- `welcome_screen.dart` — added a fixed header row above the scrollable
  content: a theme toggle `AppChip` (sun/moon icon, top-left, cycles
  light<->dark) and a language toggle `AppChip` (globe icon + current
  language code, top-right, cycles ru<->en). Neither is in file 07 §10.2's
  spec for this screen (which asks only for a small language-switcher
  link, no theme control) — explicit owner override of screen 07's spec,
  given verbally in this conversation.

Caught and fixed before committing: a mid-edit connection drop to the
owner's Mac left the file with an unbalanced paren/bracket count (2 parens,
1 bracket short) — the new outer `Column`/`Expanded` wrapper around the
existing scrollable content was opened but its closing tail hadn't been
updated to match. Caught by an automated brace/paren/bracket balance check
before ever asking the owner to run `flutter analyze`, not by a build
failure on their machine.

**Requires `dart run build_runner build --delete-conflicting-outputs`**
before this builds — `language_providers.dart` uses `@riverpod` codegen
(`part 'language_providers.g.dart'`) and that generated file doesn't exist
yet; same step already familiar from the earlier Riverpod/Freezed
migration this session.

Known follow-up: switching the app's runtime default to English (per file
01 §1) will make the just-generated welcome-screen goldens (light/dark,
captured in Russian) mismatch on the next `flutter test` run — expected,
not a regression; another `--update-goldens` pass is needed once this
builds.

### Welcome screen: icon-only toggles, centered buttons, light-theme logo color (owner follow-up, 2026-09-22)

Voice-message follow-up from the owner after seeing the header row on
device. Three changes, `welcome_screen.dart`:

- Theme/language toggle: replaced the two `AppChip`s (icon + text label)
  with `AppIconButton` (already used for the email/Apple/Google buttons —
  44x44, `surface` fill, bordered), icon-only, no visible text. The
  a11y label moves to `AppIconButton.semanticLabel` instead of visible
  text, so screen readers are unaffected.
- Phone/social-button block: was a fixed gap below the logo; now sits
  between two `Spacer()`s (logo → Spacer → buttons → Spacer → legal text),
  centering it in whatever vertical room is left, on both themes — same
  `LayoutBuilder`/`ConstrainedBox`/`IntrinsicHeight` pinning setup as
  before, just two flex gaps instead of one.
- Light theme only: `ScalesLogo.strokeColor` is now overridden to
  `colors.accent` (`#0A1A3F`, the same navy used for the phone button's
  fill) instead of the default `goldStroke` — the owner found the default
  read as too close to black against the white background. Dark theme is
  untouched (`strokeColor: null`, falls back to its own `goldStroke`,
  which the owner said was fine as-is).

Not yet done: `flutter test --update-goldens` for the welcome screen
(light/dark) — the layout changed again, so the two golden PNGs left
uncommitted from the previous pass are still stale and need another
capture once the owner confirms this builds and looks right on-device.
