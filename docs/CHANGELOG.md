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

### Light-theme pan text: gold → white (owner follow-up, 2026-09-22)

`app_colors.dart`: `AppColorsLight.panText` changed from `#E3C877` (gold)
to `#FFFFFF` (white) — the "Law"/"Bid" word drawn on each scale pan now
reads white against the navy `panFill`, light theme only. Dark theme's
`panText` (`#0A1A3F` navy-on-gold) is untouched. Only consumer is
`scales_logo.dart`'s `_drawPan`, so no other call sites affected.

Affects goldens: `scales_logo_static.png` and any light-theme screen
golden that shows the logo (welcome, phone/otp/role screens) will now
mismatch on `flutter test` until the next `--update-goldens` pass —
rolled into the same pending golden-refresh noted in the previous entry.

### Language picker: search + list instead of a direct ru<->en toggle (owner follow-up, 2026-09-22)

Owner's globe icon feedback: tapping it shouldn't instantly flip
ru<->en — it should open a search field with a language list below,
"most popular first," sized to grow as more languages are added over
time rather than the current hardcoded 2.

- `core/l10n/language_catalog.dart` (new): `LanguageCatalogEntry` (code,
  native name, English name, optional `AppLanguage`) + `kLanguageCatalog`,
  18 entries ordered: the 2 working languages first (`en`, `ru`), then 16
  roadmap placeholders ordered by relevance to a US legal-services
  marketplace (roughly the most common languages spoken at home in the
  US per Census ACS data — file 01 §1's target market — not raw global
  speaker counts). Only `en`/`ru` carry a non-null `AppLanguage`; the
  rest are search/browsable but not selectable yet.
- `core/l10n/widgets/language_picker_sheet.dart` (new): `LanguagePickerSheet`,
  a modal bottom sheet — drag handle, title, `AppTextField` search
  (filters by native name / English name / code), then the filtered list.
  Enabled rows are tappable (sets the language, pops); roadmap rows render
  at 45% opacity with a "coming soon" trailing badge instead of the
  country-code badge. Current language shows a gold check instead of its
  badge.
- `welcome_screen.dart`: globe `AppIconButton.onPressed` now calls
  `LanguagePickerSheet.show(context)` instead of toggling
  `languageControllerProvider` directly; the now-unused `language` local
  and its imports (`app_language.dart`, `language_providers.dart`) were
  dropped from this file (the picker sheet owns that read/write now).
- `static_translator.dart`: added `lang.picker.title`,
  `lang.picker.search.hint`, `lang.picker.empty`, `lang.picker.comingSoon`
  (both languages); `lang.toggle.label` reworded from the bare code
  (`RU`/`EN`) to a real action description (`Выбрать язык`/`Choose
  language`) since it's now the sheet's a11y label, not visible chip text.

Not yet wired: stage 1.6's real i18n layer is what will actually turn
the 16 placeholder languages into working ones — this only builds the
picker UI and the data shape it reads from, per the owner's explicit
"add them gradually over time" framing.

### Dark theme: brighter phone button + pan fill, white (owner follow-up, 2026-09-22)

Owner disliked the gold phone-button/pan color in dark theme, asked for
something brighter, settled on white. Scoped narrowly rather than
repainting `AppColorTokens.accent` (which also drives the bottom nav's
selection color and the phone/role/otp/error-retry primary buttons the
owner did not mention):

- New token pair `AppColorTokens.ctaBright`/`onCtaBright`. Light theme:
  equals `accent`/`onAccent` (no visible change — this was never a light-
  theme complaint). Dark theme: white / near-black (`#FFFFFF` / `#0B0B0D`).
- New `AppButtonVariant.ctaBright` (`app_button.dart`) using that pair.
  `welcome_screen.dart`'s phone `GavelStrikeButton` now passes
  `variant: isDark ? AppButtonVariant.ctaBright : AppButtonVariant.primary`
  — every other `AppButton`/`GavelStrikeButton` call site is untouched.
- `AppColorsDark.panFill` (the scale pans' fill, i.e. the "чаша" the owner
  named) changed from gold (`#C9A24A`) to white (`#FFFFFF`). `panText`
  (navy) already reads fine on white, left unchanged. Light theme's
  `panFill` untouched (already navy from an earlier pass this session).

Affects goldens: any dark-theme golden showing the welcome screen's phone
button or the scales logo will mismatch until the next
`--update-goldens` pass, rolled into the same pending refresh as the
earlier color/layout changes this session.

### Settings screen split out of the Profile tab (owner follow-up, 2026-09-22)

Owner correction: the theme switcher was sitting directly on the Profile
tab stub (a bare `SegmentedButton`, stage-1.5 placeholder) — not how
Instagram/TikTok do it, and not what file 01 §3.6 actually specifies
either ("Настройки (гамбургер): Аккаунт, Безопасность, Язык, Тема,
Подписка, История кейсов, Уведомления, Помощь, Правовая информация,
Выйти, Удалить аккаунт").

- New `SettingsScreen` (`features/profile/presentation/screens/
  settings_screen.dart`), route `/profile/settings`, pushed on the root
  navigator (same reasoning as `/create`: full-screen, not a shell tab).
  Lists every §3.6 row. Only Тема and Язык are wired to real controllers
  (Тема: a 3-way System/Light/Dark bottom sheet, file 01 §8.1's exact set
  — the Profile stub's old `SegmentedButton` only ever exposed 2 of the
  3 via icon-toggle logic elsewhere; this restores all 3. Язык: reuses
  `LanguagePickerSheet` from the welcome-screen work). Every other row
  (Аккаунт, Безопасность, Подписка, История кейсов, Уведомления, Помощь,
  Правовая информация, Выйти, Удалить аккаунт) shows the same "not built
  yet" affordance already used elsewhere — those genuinely belong to
  file 3 (Подписка), file 4 (История кейсов), file 5 (deeper notification
  categories), or Этап 1.7's still-missing Flutter auth-networking layer
  (Аккаунт/Безопасность/Выйти/Удалить аккаунт — see this session's
  stage-1 completion audit, same date, for what's actually missing there).
- `ProfileScreen` is back to a pure stage-1.5 stub: title + a gear icon
  (`Icons.settings_outlined`) that pushes `/profile/settings`. No more
  theme control lives directly on the tab.
- `AppRoutes.profileSettings` added; wired in `app_router.dart`.
- `static_translator.dart`: added the `settings.*` key family (both
  languages).

### Stage-1 completion audit (2026-09-22)

Owner asked for a serious, honest stock-take before any move to file 2 —
delegated to a subagent (read-only, no code changes) to check docs/
01_FOUNDATION_AUTH.md §15/§16 against the actual repo rather than
guessing from memory. Summary (full findings kept in this session's
transcript, not restated in full here to keep this entry short):

- ✅ done: Этап 1.1 (monorepo skeleton), 1.2 (backend core), 1.3 (auth DB
  schema — all 13 models + migrations + seed), 1.4 (auth backend — OTP/
  Apple/Google/JWT/sessions/reauth, e2e-tested), 1.5 (Flutter design
  system + shell + goldens).
- 🟡 partial: 1.6 (backend i18n module: **not started** — no
  `modules/i18n` anywhere in apps/api; Flutter side is the documented
  `StaticTranslator` stopgap only, no `drift` dependency at all). 1.7
  (screens exist, but **zero** networking wiring — no `dio`,
  `flutter_secure_storage`, `local_auth`, `sign_in_with_apple`, or
  `google_sign_in` in pubspec.yaml; `AuthRepository` is a stub; no
  `SessionState`; no active-devices or account-deletion screens on the
  Flutter side despite the backend endpoints existing).
- ❌ not started: Этап 1.8 (feature flags module, `GET /config/bootstrap`).
- §16 DoD: no CI workflow file exists at all (`.github/workflows` is a
  placeholder README); Dart client isn't generated from Swagger. Rest
  (no secrets, no bare TODOs, CHANGELOG itself) check out.

**Conclusion: file 1 is NOT done.** The backend core/auth and the Flutter
design system are genuinely solid, but the two halves aren't wired
together yet (no real network calls from the app), backend i18n and
feature flags haven't been started, and there's no CI. File 2 is not on
the table until these close.

### Flutter auth networking: real dio-backed `AuthRepository` wired to the live backend (2026-09-22)

Closed the gap the stage-1 completion audit flagged (previous entry,
same date): the auth screens existed but made zero real network calls.
This pass wires `apps/mobile`'s onboarding flow to the already-live
`apps/api` `/auth/*` endpoints (docs/01_FOUNDATION_AUTH.md §10.4/§10.5),
scoped to otp/request, otp/verify, refresh, and logout — Apple/Google
native SDK wiring, biometric reauth, and the active-devices/
account-deletion screens are later phases, deliberately out of scope
here.

New (`core/network/`): `api_error.dart` (`ApiException` — parses the
backend's `{error:{code,message,details,requestId}}` envelope; a
synthetic `NETWORK_ERROR` code covers timeouts/non-JSON responses),
`headers_interceptor.dart` (`X-Platform`/`X-App-Version`/
`Accept-Language`/`X-Device-Id`; the device id is a locally-generated
UUID persisted via the existing `LocalKvStore` — not secret, no secure
storage needed), `auth_interceptor.dart` (attaches
`Authorization: Bearer <token>` unless `extra['skipAuth']`; on
`TOKEN_EXPIRED` — and ONLY that code, per `ErrorCode.TOKEN_EXPIRED`'s
doc comment in apps/api warning against looping on `UNAUTHORIZED`/
`AUTH_SESSION_REVOKED` — refreshes once via `SessionController` and
retries the original request), `dio_client.dart` (`dioProvider`; base
URL defaults to `http://10.0.2.2:3000/api/v1`, the Android emulator's
host-loopback alias, overridable via `--dart-define=API_BASE_URL=...`).

New (`core/session/`): `session_state.dart` (freezed `SessionState` —
access token + decoded JWT claims `sub/role/sid/verified/
subscriptionStatus` + expiry; deliberately does NOT hold the refresh
token), `token_secure_store.dart` (`flutter_secure_storage` wrapper,
refresh-token only), `refresh_coordinator.dart` (single-flight
`/auth/refresh` — concurrent `TOKEN_EXPIRED` hits all await the same
call instead of racing separate refreshes, which the backend's rotation
would otherwise treat as reuse and revoke; this is file 01 §15's manual
QA item "параллельные запросы не ломаются"), `session_providers.dart`
(`@Riverpod(keepAlive: true) class SessionController` — `build()`
returns `SessionState?`; `bootstrap()` exchanges a stored refresh token
for a session before the first frame and never throws; `applyTokens()`
base64url-decodes the JWT payload for claims, no verification library
added since the backend already verified the signature; `clear()`).

New (`features/auth/data/`): `auth_dtos.dart` (hand-written
request/response classes — `packages/api-contract` is still an empty
stub, README only, no generator wired), `auth_api_client.dart`
(`AuthApiClient` — one method per endpoint, throws `ApiException`),
`real_auth_repository.dart` (`RealAuthRepository implements
AuthRepository` — phone channel hardcoded since onboarding is phone-only
today; on verify success calls `SessionController.applyTokens`; maps
`AUTH_OTP_INVALID/EXPIRED/LOCKED` and `AUTH_OTP_REQUEST_LIMIT`/
`RATE_LIMITED` to the union's new variants).

Modified: `otp_verify_result.dart` — `success` gained `{required bool
isNewUser}`, added `locked()`/`rateLimited(int retryAfterSeconds)`.
`auth_repository.dart` — interface gained `logout()`.
`auth_providers.dart` — `authRepositoryProvider` now defaults to
`RealAuthRepository` (built from `dioProvider`); `StubAuthRepository`
stays in the codebase for `test/features/auth/golden/
auth_screens_golden_test.dart` (unaffected — it never reads
`authRepositoryProvider` since it only renders screens statically, no
interaction). `onboarding_flow.dart` — `verifyOtp` branches on
`isNewUser`: false skips straight to `completeOnboarding()` (existing
user), true proceeds to the role step exactly as before.
`otp_screen.dart` — `_handleCompleted` now reads `state.step` after
`verifyOtp` instead of assuming success always means "go to role".
`auth_guard.dart` — added real session gating (no session + not
mid-onboarding → `/welcome`; session present + sitting on an auth route
→ `/feed`) alongside the existing onboarding-resume check, which still
takes priority. `main.dart` — builds a `ProviderContainer` and awaits
`SessionController.bootstrap()` before `runApp`, via
`UncontrolledProviderScope`, so the router's first redirect decision
sees real session data. `pubspec.yaml` — added `dio: ^5.9.0` and
`flutter_secure_storage: ^9.2.4`.

**Not verified — no way to in this environment**: this pass was done
via a remote shell bridge to the Mac with no `flutter`/`dart` binary
reachable, so nothing here has been compiled, analyzed, or run.
Required before trusting this:
- `dart run build_runner build` — `otp_verify_result.dart` and
  `session_state.dart` (freezed) and `session_providers.dart`/
  `onboarding_flow.dart` (riverpod codegen) all need their generated
  parts regenerated; the checked-in `otp_verify_result.freezed.dart` is
  now stale against the new union shape.
- A real run against the live backend (`docker compose up` +
  `apps/api`) on an emulator/device: the otp → verify → session →
  guard-redirect path, the refresh-on-`TOKEN_EXPIRED` retry, and the
  concurrent-refresh single-flight behavior are all unverified beyond
  manual code review.
- Every file touched was checked for balanced parens/braces/brackets and
  for relative imports resolving to real files, but that's a mechanical
  check, not a substitute for `flutter analyze`.

### Flutter auth networking, Phase 3: Apple/Google native sign-in wired to `POST /auth/social` (2026-09-22)

Continues directly after the Phase 1+2 dio/session/OTP networking pass
(previous entry, same date, commit 152e193): welcome screen's Apple/Google
buttons were UI-only, wired to a "not built yet" snackbar, explicitly left
that way pending this work. The backend (`POST /auth/social`) was already
fully implemented — controller, DTO, Apple JWKS verifier, Google verifier,
same `AuthTokensResult` envelope as otp/verify — so this pass is Flutter-only.

New (`features/auth/data/social_auth_native_client.dart`):
`SocialAuthNativeClient` interface + `SocialCredential` (provider-agnostic
result: provider/idToken/nonce/firstName?/lastName?) + `PlatformSocialAuth
NativeClient`, the real implementation over `sign_in_with_apple` +
`google_sign_in`. `SocialAuthCancelledException` normalizes both packages'
own cancellation exception types into one the repository can branch on.

New (`features/auth/domain/social_login_result.dart`): freezed union
mirroring `otp_verify_result.dart`'s style — `success(isNewUser)`,
`cancelled()`, `invalidToken()`, `providerDisabled()`,
`accountExists(maskedIdentifier, availableMethods)`, `suspended()`,
`deleted()`, `networkError()`. `.freezed.dart` NOT regenerated here (no
`dart` binary reachable from this bridge) — `dart run build_runner build`
is required before this compiles.

Modified: `auth_dtos.dart` (added `SocialLoginPayload`, mirrors the
backend's `SocialLoginDto` 1:1). `auth_api_client.dart` (added
`socialLogin()`, same `_skipAuth`/`_unwrap`/`DioException`-catch pattern as
`verifyOtp`). `auth_repository.dart` (interface gained
`signInWithApple()`/`signInWithGoogle()`; STILL OUT OF SCOPE note narrowed
to biometric reauth + active-devices/account-deletion only). `real_auth_
repository.dart` (`_signInWithSocial` — catches
`SocialAuthCancelledException` from the native client, then on success
calls `SessionController.applyTokens` same as `verifyOtp`; on `ApiException`
switches `e.code` over 6 new `ApiErrorCodes` constants; `AUTH_PROVIDER_
DISABLED` and `AUTH_SOCIAL_PROVIDER_UNAVAILABLE` both map to the one
`providerDisabled()` UI variant since the user-facing message is the same
either way). `stub_auth_repository.dart` (matching stub methods, always
succeed as a new user, so golden/widget tests overriding
`authRepositoryProvider` keep compiling — none exercise the social buttons
today). `auth_providers.dart` (new `socialAuthNativeClientProvider` ->
`PlatformSocialAuthNativeClient`, wired into `RealAuthRepository`'s 4th
constructor arg; reuses the existing `deviceInfoProvider`).
`onboarding_flow.dart` (`signInWithApple()`/`signInWithGoogle()` — same
isNewUser -> role-step / else -> `completeOnboarding()` branch as
`verifyOtp`; unlike `verifyOtp`, `cancelled()` sets no `errorMessage` since
a dismissed native sheet isn't a failure). `welcome_screen.dart` (Apple/
Google `GavelStrikeIconButton`s now call the new flow methods and mirror
`otp_screen.dart`'s `_handleCompleted` navigation — read `state.step` after
the call and push the role screen or go to the feed; Email's button is
UNCHANGED, still `showNotBuiltYet`, since there's no "email SDK" to wire).
`api_error.dart` (6 new `ApiErrorCodes` constants, copied verbatim from
apps/api's `ErrorCode` enum: `AUTH_SOCIAL_TOKEN_INVALID`,
`AUTH_SOCIAL_PROVIDER_UNAVAILABLE`, `AUTH_PROVIDER_DISABLED`,
`ACCOUNT_EXISTS_USE_OTHER_METHOD`, `ACCOUNT_SUSPENDED`,
`ACCOUNT_DELETED`). `static_translator.dart` (6 new `auth.social.error.*`
RU/EN keys; `accountExists`'s message interpolates `{identifier}`/
`{methods}` from the 409's `details`). `pubspec.yaml` (added
`sign_in_with_apple: ^6.1.4`, `google_sign_in: ^7.2.0`, `crypto: ^3.0.6`).

**Google nonce — flagged as unverified, read before trusting this in
production.** The backend's Google verifier checks
`idToken.payload.nonce == nonce` (raw, no hashing), so the exact same raw
nonce this app generates has to land verbatim in the Google-issued ID
token's `nonce` claim. `google_sign_in`'s nonce support
(flutter/packages#9267, closing flutter/flutter#85439) puts the `nonce`
parameter on `GoogleSignIn.initialize(...)`, NOT on `authenticate()` — this
pass re-calls `initialize(nonce: ...)` immediately before every
`authenticate()` call to get a fresh nonce per attempt, but:
1. The package's own docs (7.1.1 changelog) say `initialize()` must be
   called **exactly once** per app run — re-calling it per sign-in attempt
   may not behave as intended and needs a real-device check.
2. At the time this was researched, the PR's iOS platform-channel side
   still carried its own upstream TODO about depending on a
   `GoogleSignIn-iOS` SDK version bump before the nonce actually reaches
   the native call — so on iOS specifically, the nonce may not land in the
   ID token even though the Dart API accepts it without error.

A `TODO(nonce-verify)` comment sits directly on `signInWithGoogle()` in
`social_auth_native_client.dart` with this same detail. If real Google
logins come back `AUTH_SOCIAL_TOKEN_INVALID`, decode the returned
`idToken`'s JWT payload and confirm its `nonce` claim actually equals the
raw nonce this method generated — that is the first thing to check. Apple's
nonce handling has no equivalent risk: `getAppleIDCredential(nonce: ...)`
embeds whatever string it's given directly into the identityToken, which
is why this pass hashes on the way IN (`sha256(rawNonce)` to Apple) and
sends the raw nonce to the backend, matching the backend's
`sha256(rawNonce_hex) == idToken.payload.nonce` check exactly.

**Native config — placeholders that need the owner's real Apple/Google
console credentials before this ships:**
- `apps/mobile/ios/Runner/Runner.entitlements` (new file):
  `com.apple.developer.applesignin = [Default]`. This is NOT yet wired
  into the Xcode project — `Runner.xcodeproj/project.pbxproj` has no
  `CODE_SIGN_ENTITLEMENTS` build setting for any configuration today, and
  this pass deliberately did not add one by hand: `.pbxproj` is a fragile,
  easy-to-corrupt format and wiring a new entitlements file into it
  correctly needs a working Xcode to verify. **Action needed**: open the
  project in Xcode, select the Runner target -> Signing & Capabilities ->
  "+ Capability" -> "Sign in with Apple". Xcode will link this file (or
  generate an equivalent one and this file can be deleted) and set
  `CODE_SIGN_ENTITLEMENTS` correctly for all 3 build configurations
  itself.
- `apps/mobile/ios/Runner/Info.plist`: added a `CFBundleURLTypes` entry
  with `CFBundleURLSchemes` = `TODO-FILL-FROM-GOOGLE-CLOUD-CONSOLE` —
  replace with the real REVERSED_CLIENT_ID from this iOS app's OAuth
  client in Google Cloud Console before Google sign-in can work on iOS.
- `social_auth_native_client.dart`'s `signInWithGoogle()`: no
  `clientId`/`serverClientId` is passed to `GoogleSignIn.instance
  .initialize()` at all yet — left out rather than guessed. iOS needs one
  of those (or a `GIDClientID` Info.plist key) for `initialize()` to
  succeed; if the backend's Google verifier checks the ID token's audience
  against a web OAuth client (typical for a server-side verifier),
  Android needs `serverClientId` too.
- Android: per the research behind this pass's blueprint, `google_sign_in`
  7.x's Credential-Manager-based implementation needs no
  `google-services.json` or Gradle plugin for this — `AndroidManifest.xml`
  was read and needs no changes. Not independently re-verified from this
  bridge.
- No real Apple Team ID, Google OAuth client ID, or SHA-1 fingerprint was
  fabricated anywhere — every placeholder above is an obvious
  `TODO-FILL-FROM-GOOGLE-CLOUD-CONSOLE` token, not a plausible-looking fake
  value.

**Not verified — no way to in this environment** (same bridge limitation
as the Phase 1+2 entry above): no `flutter`/`dart`/Xcode/`adb` reachable,
so nothing here has been compiled, analyzed, or run.
- `flutter pub get` (new dependencies) and `dart run build_runner build`
  (`social_login_result.freezed.dart` doesn't exist yet) are both
  required before this compiles.
- The Google nonce risk above, the iOS entitlements wiring, and the actual
  `sign_in_with_apple`/`google_sign_in` API surface (verified against
  pub.dev documentation and the flutter/packages PR that added nonce
  support, not against a running build) all need a real device pass.
- Every file touched was checked for balanced parens/braces/brackets
  (and, for the two `.plist` files, well-formed XML) and for every new
  relative import resolving to a real file — mechanical checks, not a
  substitute for `flutter analyze`.

### Flutter auth networking, Phase 4 (final phase): biometric reauth infra, active-devices screen, account deletion (2026-09-23)

Continues directly after Phase 3 Apple/Google social login (previous
entry, commit 2bbeba5), itself continuing Phase 1+2 (commit 152e193).
This closes out the "STILL OUT OF SCOPE" note `auth_repository.dart`
carried since Phase 3: biometric reauth and the active-devices/
account-deletion screens.

**Research first, against the actual backend source, not the docs table.**
Read `apps/api/src/modules/auth/{auth.controller.ts,auth.service.ts,dto/
reauth.dto.ts,guards/reauth.guard.ts}` and `apps/api/src/modules/users/
{controllers/users.controller.ts,services/account-deletion.service.ts}`
before writing any Flutter code. Findings that shaped the implementation:

- `POST /auth/reauth`'s `ReauthDto.method` is typed `IsIn(['otp'])` —
  **biometric is not a valid value server-side, on purpose.** That DTO's
  own doc comment says why: the server can't verify an on-device Face
  ID/Touch ID assertion without platform key attestation (App Attest/Play
  Integrity), which is a separate, currently-stubbed seam. So a biometric
  capability in this app can be a genuine local device-owner check, but it
  can never by itself mint a `reauthToken` — only a correct OTP code can.
  This directly shaped the design below: biometric is real infrastructure
  with a real call site, but it augments the OTP reauth step, it doesn't
  replace it.
- `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST
  /auth/logout-all`, and `POST /auth/reauth` are all fully implemented
  (`AuthController`/`AuthService`) — `AuthService.listSessions` returns
  `{sessionId, deviceId, deviceName, platform, appVersion, lastUsedAt,
  createdAt, isCurrent}`, `endSession` 404s (not 403) on a session that
  isn't the caller's own (anti-enumeration, same spirit as OTP), and
  `reauth` returns `{reauthToken}` after checking `identifier` is a
  verified contact on the CURRENT user specifically.
- `DELETE /users/me` is also fully implemented
  (`UsersController.deleteAccount` -> `AccountDeletionService
  .requestDeletion`), gated by `@UseGuards(ReauthGuard) @ReauthRequired()`.
  `ReauthGuard` reads the token from an `X-Reauth-Token` header, checks it
  matches the caller's own `sub`+`sid`, and marks its `jti` spent in Redis
  on first use (single-use, `REAUTH_TOKEN_TTL_SECONDS` — 5 minutes per the
  docs table). On success the server sets `status = 'deletion_pending'`
  and **revokes every session for the account immediately, including the
  caller's own** — this is the opposite of most "soft delete" flows and
  meant the Flutter side had to treat a successful delete call as an
  implicit local logout, not a call it can chain anything else after.
  Login-during-grace-period cancellation already exists too
  (`AuthService.verifyOtp` flips `deletion_pending` back to `active`) — no
  separate "cancel deletion" endpoint was needed or invented.
- **No `GET /users/me` (or any other profile-read) endpoint exists yet.**
  Flutter has never fetched or stored the user's own phone/email anywhere
  past the moment it's typed into the phone screen during onboarding
  (`SessionState`, decoded from the JWT, only carries `sub`/`role`/`sid`/
  `verified`/`subscriptionStatus` — no contact info). This is a real gap:
  the delete-account reauth step needs an `identifier` to request/verify
  an OTP for, and there is no way to look up "the current user's own
  verified phone number" from the client today. Engineering judgment,
  documented on `AuthRepository.reauthWithOtp`'s doc comment: the
  delete-account flow's reauth-phone step asks the person to type their
  phone number themselves, same as the very first login screen. This is a
  real UX cost this phase did not have the scope to fix (that's a
  `GET /users/me`/profile-fetch feature, not built anywhere yet) — flagged
  explicitly rather than silently working around it.

**New — `core/session/biometric_auth_service.dart`**: `BiometricAuthService`
wraps `local_auth`'s `LocalAuthentication` — `isAvailable()` (hardware +
enrolled check) and `authenticate({reason})`, both collapsing every
failure mode to `false`/no-throw. Its doc comment is explicit about the
"what this does and doesn't prove to the server" point above. Wired into
one real call site: the delete-account flow's reauth-phone step shows a
"Use Face ID / Touch ID" button when available; tapping it runs the
biometric check as a local trust signal (a SnackBar reports the outcome)
but the phone+OTP form underneath is always still required — there is no
other reauth-gated action anywhere in the app yet for this to gate on its
own (§10.1's "История кейсов" reauth gate is explicitly file-4 scope, not
built).

**New — `features/auth/domain/{reauth_result.dart,
account_deletion_result.dart}`**: freezed unions mirroring `otp_verify_
result.dart`'s/`social_login_result.dart`'s style. `ReauthResult`:
`success(reauthToken)`, `invalid()` (covers both a wrong/expired code AND
an identifier that isn't a verified contact on this account — same
anti-enumeration collapsing the backend itself does), `rateLimited
(retryAfterSeconds)`, `networkError()`. `AccountDeletionResult`:
`success()`, `reauthRequired()`, `reauthInvalid()`, `networkError()`.
`.freezed.dart` parts NOT generated (no `dart` binary on this bridge, same
as every prior phase) — `dart run build_runner build` required.

**New — `features/profile/domain/{delete_account_step.dart,
delete_account_flow_state.dart}`** and **`features/profile/application/
{active_devices_controller.dart, delete_account_controller.dart}`**:
`ActiveDevicesController` is a `@riverpod` `AsyncNotifier<List<
DeviceSession>>` (`build()` calls `listSessions()`; `revoke(id)`/
`refresh()` both `invalidateSelf()` + `await future`) — the first
`AsyncNotifier` in this codebase (no prior list-fetch precedent to copy;
every earlier `@riverpod` class here, e.g. `SessionController`/
`OnboardingFlow`, is a plain sync `Notifier`), called out explicitly since
it's new shape for this codebase, not an established pattern being
repeated. `DeleteAccountController` is a plain `Notifier` driving
`DeleteAccountFlowState` (`step`, `biometricAvailable`, `phoneNumber`,
`reauthToken`, `confirmPhraseInput`, `isSubmitting`, `errorMessage`)
through `DeleteAccountStep.{warning, reauthPhone, reauthCode,
confirmPhrase, submitting, done}` — same one-notifier-per-flow shape as
`OnboardingFlow`, and its `.when(...)` branches over `ReauthResult`/
`AccountDeletionResult` follow `OnboardingFlow.verifyOtp`'s exact
branching style rather than Dart 3 pattern-matching (matching the
established convention in this codebase, not a style choice made fresh
here). `.g.dart` parts NOT generated, same bridge limitation.

**New — `features/profile/presentation/screens/{active_devices_screen.dart,
delete_account_screen.dart}`**:

- `ActiveDevicesScreen` (`/profile/settings/devices`): loading (3
  `AppSkeleton` rows) / error (`AppErrorState` + retry) / empty
  (`AppEmptyState`) / data states over `ActiveDevicesController`. Each row
  shows a platform icon, device name (falls back to a translated "Unknown
  device" when the server sent `null`), last-active timestamp (or "no
  activity recorded" when `null`), an `AppChip` "This device" badge on
  `isCurrent`, and a revoke `IconButton` behind an `AlertDialog`
  confirmation (a stronger warning copy when revoking the current
  session). A bottom "Sign out of all devices" `AppButton` calls `POST
  /auth/logout-all`, also behind a confirm dialog. Revoking/logging out
  the CURRENT session clears local `SessionController` state and routes to
  `/welcome` — the two places this phase needed that logout-and-redirect
  behavior, which nothing in the codebase had built yet (Settings'
  "Выйти" row is still `showNotBuiltYet`, untouched, out of this phase's
  scope).
- `DeleteAccountScreen` (`/profile/settings/delete-account`): one screen,
  an internal step switch over `DeleteAccountFlowState.step` (see that
  file's doc comment for why one screen rather than 3-4 routes — no step
  here is independently deep-linkable or meaningfully resumable across an
  app restart the way onboarding's screens are, so the safe default on any
  interruption is "start over at the warning", which a single screen gives
  for free). Warning step states the 14-day grace period and that signing
  back in cancels it (§10.7, verified against `AccountDeletionService`'s
  actual behavior above, not just the docs prose). Reauth-phone step
  offers the biometric speed-bump described above, then a phone number
  field reusing the same `+1`/10-digit convention as `PhoneScreen` (US-only
  onboarding, unchanged assumption). Reauth-code step reuses `AppOtpField`
  with the exact `_currentCode`-as-a-State-field pattern `OtpScreen`
  already established (a `build()`-local variable would reset on every
  rebuild — this phase copied that fix rather than reintroducing the bug).
  Confirm-phrase step requires typing the (localized) word DELETE/УДАЛИТЬ
  exactly before a red `ElevatedButton` (no danger variant exists on
  `AppButton` yet, so this uses a directly-styled `ElevatedButton` with
  `colors.danger`, matching how the destructive Settings rows already use
  `colors.danger` for text) calls `DELETE /users/me`. Done step shows the
  grace-period message and a button that routes to `/welcome` (local
  session state is already cleared by `RealAuthRepository.deleteAccount`
  by this point, not here). A `reauthRequired`/`reauthInvalid` response at
  the final submit (the 5-minute reauth token expired between
  confirm-phrase and submit) sends the person back to the reauth-phone
  step with an "expired, try again" message rather than dead-ending.

Modified: `pubspec.yaml` (`local_auth: ^2.3.0`). `ios/Runner/Info.plist`
(`NSFaceIDUsageDescription` — required or `local_auth` silently refuses
Face ID on iOS). `android/app/src/main/AndroidManifest.xml`
(`android.permission.USE_BIOMETRIC`).
`android/app/src/main/kotlin/com/lawbid/lawbid/MainActivity.kt`
(`FlutterActivity` -> `FlutterFragmentActivity` — `local_auth`'s Android
`BiometricPrompt` path needs a `FragmentActivity` host or it throws at
runtime the first time `authenticate()` is called).
`android/app/build.gradle.kts` (`minSdk = maxOf(flutter.minSdkVersion,
23)` — `local_auth`'s `BiometricPrompt` needs API 23+; `maxOf` only raises
the floor, never lowers whatever Flutter's own default already is).
`auth_dtos.dart` (added `ReauthPayload`, `ReauthTokenResult`,
`DeviceSession`). `auth_api_client.dart` (added `logoutAll()`,
`listSessions()`, `endSession(id)`, `reauth()`, `deleteAccount
({reauthToken})` — the last sends `X-Reauth-Token` via `Options(headers:
...)`, same `_skipAuth`/`_unwrap`/`DioException`-catch shape as every
other method here). `auth_repository.dart` (interface gained
`logoutAll()`, `listSessions()`, `revokeSession(id)`,
`reauthWithOtp({identifier, code})`, `deleteAccount({reauthToken})`; the
"STILL OUT OF SCOPE" note is gone — replaced with a note explaining why
biometric reauth is a local capability, never a repository method).
`real_auth_repository.dart` (implements all 5 new methods; `deleteAccount`
calls `_session.clear()` on success per the "server already revoked every
session" finding above; `reauthWithOtp`/`deleteAccount` both switch
`ApiException.code` over the new `ApiErrorCodes` constants). `stub_auth_
repository.dart` (matching stub methods so golden/widget tests overriding
`authRepositoryProvider` keep compiling; `listSessions()` returns one
fake "This device" row). `auth_providers.dart` (new
`biometricAuthServiceProvider`). `api_error.dart` (3 new `ApiErrorCodes`
constants: `reauthRequired`, `reauthInvalid`, `notFound`, copied verbatim
from apps/api's `ErrorCode` enum). `app_routes.dart` (`activeDevices` =
`/profile/settings/devices`, `deleteAccount` =
`/profile/settings/delete-account`, same root-navigator-push reasoning as
`profileSettings`). `app_router.dart` (2 new `GoRoute`s, same shape as the
existing `profileSettings` route). `settings_screen.dart` (Безопасность ->
`context.push(AppRoutes.activeDevices)`, Удалить аккаунт ->
`context.push(AppRoutes.deleteAccount)`; Аккаунт/Выйти/Подписка/История
кейсов/Уведомления/Помощь/Правовая информация rows unchanged, still
`showNotBuiltYet`). `static_translator.dart` (`common.cancel`/
`common.confirm`, ~20 `devices.*` keys, ~20 `deleteAccount.*` keys, RU+EN,
following the `settings.*`/`auth.social.*` key-naming convention).

**What's fully backend-wired end-to-end vs. not, stated plainly:**
- **Active devices screen: fully wired.** `GET /auth/sessions`, `DELETE
  /auth/sessions/:id`, `POST /auth/logout-all` are all real backend calls
  against endpoints confirmed to exist and behave as coded, by reading
  their actual NestJS source.
- **Account deletion: fully wired**, including its reauth gate. `POST
  /auth/otp/request` (reused, not new) -> `POST /auth/reauth` -> `DELETE
  /users/me` with `X-Reauth-Token` is a real, complete call chain against
  a real, fully-implemented backend flow (`AccountDeletionService` exists
  and does exactly what §10.7 describes for this stage — see the research
  section above for exactly what it does and does not do this early:
  no anonymization pipeline yet, that needs files 2-5's tables and a
  scheduled job, explicitly out of `AccountDeletionService`'s own scope
  per its doc comment, not something this Flutter pass could wire around).
  The one real UX gap: the reauth step can't prefill the account's phone
  number (no `GET /users/me` — see above), so the person has to type it.
- **Biometric reauth: infrastructure only, by design, matching this
  phase's own instructions.** `BiometricAuthService` is real, has a real
  call site (the delete-account reauth-phone step's speed-bump button),
  and is exercised on every run through that screen — but it cannot, and
  does not, replace the OTP reauth step, because the backend's own
  `ReauthDto` doesn't accept a biometric method yet (see research section
  above — this is the backend's own documented, deliberate limitation,
  not something this pass chose not to build). No other reauth-gated
  action exists anywhere in this app yet (§10.1's case-history gate is
  file-4 scope) for biometric to attach to beyond that one call site.

**Endpoints searched for and NOT found in the backend** (stated
explicitly, not glossed over): no `GET /users/me` or other profile-read
endpoint anywhere in `apps/api/src/modules/users/` — confirmed by reading
`users.controller.ts` in full (only `contacts/request`, `contacts/verify`,
`consents`, and `DELETE` exist). No separate "cancel account deletion"
endpoint — confirmed not needed, cancellation already happens as a side
effect of `AuthService.verifyOtp` on next login.

**Not verified — no way to in this environment** (same bridge limitation
as every prior phase's entry): no `flutter`/`dart`/Xcode/`adb` reachable.
- `flutter pub get` (new `local_auth` dependency) and `dart run
  build_runner build` (4 new/changed `.freezed.dart` parts: `reauth_
  result.dart`, `account_deletion_result.dart`, `delete_account_flow_
  state.dart`; 2 new `.g.dart` parts: `active_devices_controller.dart`,
  `delete_account_controller.dart`) are both required before this
  compiles.
- `local_auth`'s actual API surface (`LocalAuthentication`,
  `AuthenticationOptions`, `isDeviceSupported`/`canCheckBiometrics`/
  `getAvailableBiometrics`) was verified against pub.dev documentation,
  not a running build or a real device — same caveat Phase 3's Google
  nonce section carries for `google_sign_in`.
- `ActiveDevicesController`'s use of `AsyncNotifier`/`ref.invalidateSelf()`
  + `await future` is the first use of that Riverpod shape in this
  codebase (flagged above) — verified against Riverpod's own
  documentation for `riverpod_generator`/`riverpod_annotation` ^4.x, not
  against a real build.
- The Android `FlutterFragmentActivity` swap and `minSdk` bump are the
  documented fix for `local_auth`'s known Android requirement, not
  independently confirmed against this project's actual Gradle resolution
  (no Gradle reachable from this bridge either).
- Every file touched was checked for balanced parens/braces/brackets (and
  the two native config files — `Info.plist`, `AndroidManifest.xml` — for
  well-formed XML), and every new relative import was checked to resolve
  to a real file that exists at that path — mechanical checks, not a
  substitute for `flutter analyze`.
## Stage 1.6 (backend i18n module) — 2026-09-23

Backend half only of docs/01_FOUNDATION_AUTH.md §15 "Этап 1.6" ("Бэкенд:
модуль i18n (импорт/экспорт xlsx/csv, dry-run, bundle с ETag, версии)").
The Flutter half (§9.4's `L10n` layer replacing `StaticTranslatorRu/En`,
drift cache, live language switching) is a separate, not-yet-started
task — `static_translator.dart` is untouched here except as a read-only
source for seed data (see below).

### Research first, against §9 in full, not just the stage-15 bullet

§9.3 turned out to be fully explicit about the backend shape — not a case
needing a "reasonable default" judgment call: exact table names
(`i18n_languages`, `i18n_keys`, `i18n_translations`, all already modeled
in `apps/api/prisma/schema.prisma` since stage 1.3 — no new migration
needed this stage), exact endpoints (`GET /i18n/languages`, `GET
/i18n/bundle/:lang?since=version` with ETag/304, `POST /admin/i18n/import`
with `dry-run`/`apply` modes, `GET /admin/i18n/export`), and an explicit
validation list ("дубликаты ключей, пустые значения для en, несовпадение
плейсхолдеров, неизвестные языки"). So this is **DB-backed via Prisma,
not static JSON files** — the static-JSON fallback the task brief
floated as a default was for a case where the spec stays quiet on
storage; §9.3 does not.

### What was built

- `apps/api/src/modules/i18n/` — new NestJS module, controller/service/
  DTO/guard shape copied from `auth`/`users` (thin controllers, logic in
  services, class-validator DTOs, `ApiException`-style errors via the
  existing `AllExceptionsFilter`).
  - `controllers/i18n.controller.ts` — public (`@Public()`) `GET
    /i18n/languages` and `GET /i18n/bundle/:lang`. The bundle route is
    the one place in this codebase that bypasses the global
    `ResponseInterceptor`'s `{data:...}` envelope on purpose (`@Res()`
    without `passthrough`, Nest's documented raw-response pattern) — it's
    the only way to send a spec-correct empty-body **304** for a matching
    `ETag`. `since=<version>` is a separate delta-poll path that always
    returns 200 with a (possibly empty) JSON body; ETag/304 only applies
    to the plain conditional GET (no `since`).
  - `controllers/i18n-admin.controller.ts` — `POST /admin/i18n/import`
    (multipart `file` field, `?mode=dry-run|apply`, defaults to
    `dry-run` — an import call never writes unless explicitly told to)
    and `GET /admin/i18n/export` (streams an .xlsx). Gated by a new
    `AdminGuard` (route-level, checks `req.user.role === 'admin'` off the
    JWT claims already set by the global `JwtAuthGuard`) — deliberately
    NOT a general `@Roles()`/RBAC system: there's exactly one role gate
    needed anywhere in the backend so far, and a real admin module with
    broader RBAC is file 6 ("админка") scope. Revisit if a second
    admin-gated feature shows up before then.
  - `services/i18n-languages.service.ts` — `GET /i18n/languages` +
    the shared "is this language known and active" check (throws the new
    `I18N_LANGUAGE_NOT_FOUND` error code otherwise). i18n_languages is
    the single source of truth for supported locales — deliberately
    **not** a hardcoded enum/constant, because the whole point of the
    import flow (and this stage's own acceptance criterion) is that
    uploading a file with a new language column adds that language
    without a redeploy.
  - `services/i18n-bundle.service.ts` — version lookup (Redis-cached,
    5-minute safety-net TTL, actively invalidated by
    `I18nImportService` right after an apply-mode commit) and the
    full/delta translation query.
  - `services/i18n-import.service.ts` — parses the upload, runs every
    §9.3-listed validation, diffs against current DB state (new keys /
    changed (key,lang) pairs / unchanged count), and — apply mode, zero
    validation errors only — writes: auto-creates any language column
    not yet in `i18n_languages` (native-name lookup table in
    `language-names.ts`, starter set of ~20 common ISO 639-1 codes,
    falls back to the uppercased code for anything else), upserts
    `i18n_keys`/`i18n_translations` for changed pairs only (an unchanged
    value in the file is left untouched, not rewritten), bumps
    `i18n_bundle_versions` by +1 per **affected** language only (a
    language with no actual changes in this import keeps its version),
    all inside one `withTxRetry` transaction per `.cursorrules`.
  - `services/i18n-export.service.ts` — builds an .xlsx from current DB
    state in the same column shape §9.2 specifies, so an exported file
    re-imports as a zero-change dry-run.
  - `xlsx/i18n-workbook.util.ts` — the actual parsing/validation/
    building logic, as plain, dependency-injection-free functions (no
    Prisma/Nest imports) so they're directly unit-testable. Sniffs
    xlsx-vs-CSV by content (ZIP magic bytes), not filename/mimetype.
    CSV parsing is a small hand-written RFC 4180 parser (quoted fields,
    embedded commas/newlines, `""` escaping, BOM stripping) — no
    external CSV dependency needed.
  - `error-code.enum.ts` — two new codes, `I18N_LANGUAGE_NOT_FOUND` and
    `I18N_IMPORT_INVALID`, following the existing naming convention
    exactly (checked there is no `LOCALE_NOT_SUPPORTED`-style code
    already in use to collide with).
  - Registered in `app.module.ts` in the same slot as `UsersModule`.

### xlsx library: exceljs, not the more common `xlsx` (SheetJS) package — a security call, not a style preference

Tried `xlsx@0.18.5` (the npm-registry package) first, since it's the most
commonly reached-for name. `npm audit` flagged it with **two HIGH
severity, "No fix available" advisories tied to the package itself**:
prototype pollution (GHSA-4r6h-8v6p-xvw6) and a ReDoS
(GHSA-5pgg-2g8v-p4x9) — SheetJS stopped shipping security fixes to the
npm registry itself (they publish patched builds from their own CDN
instead, outside this project's normal dependency flow). That's a real
risk sitting directly on the admin file-upload parsing path, so it was
uninstalled again and `exceljs@4.4.0` used instead — actively
maintained, no unfixed advisory tied to itself (`npm audit` shows only a
moderate, fixable-but-breaking `uuid` transitive advisory, left alone
rather than forcing a breaking exceljs downgrade for a moderate,
non-crypto-use issue). §9.2/§9.3 name the **file format** ("xlsx"), not
a specific library, so this is within the letter of the spec.

For the record, confirmed by diffing `package-lock.json` against the
prior commit: the `multer` HIGH-severity advisories `npm audit` also
shows are **pre-existing** (multer already came in transitively via
`@nestjs/platform-express`, which this stage did not touch or add) —
not introduced by this work.

New deps in `apps/api/package.json`: `exceljs@^4.4.0` (dependency),
`@types/multer@^2.0.0` (devDependency — multer itself was already
present transitively; only its types were missing).

### `translations_seed.xlsx` + seed script

`apps/api/prisma/seed/translations_seed.xlsx` (en+ru, 116 keys) is new,
built from `apps/mobile/lib/core/l10n/static_translator.dart`'s current
`StaticTranslatorRu`/`StaticTranslatorEn` maps (parsed out of the Dart
source, not retyped by hand — verified both classes have the exact same
116 keys and zero `{placeholder}` mismatches between the two languages
before writing the file). `prisma/seed.ts` gained `seedI18nTranslations()`,
which loads that file through the **same** `parseTranslationsFile`/
`buildParsedWorkbook` functions the real import endpoint uses (not a
second, looser parser), then diffs against DB state the same way
`I18nImportService.apply` does, so re-running the seed script is a true
no-op once already applied (doesn't bump `i18n_bundle_versions` on every
re-run). Confirmed by actually running `parseTranslationsFile` +
`buildParsedWorkbook` against the committed file via `ts-node`: 116 rows,
`languageCodes: ['en','ru']`, **0 validation errors** — the file the
import endpoint's own validation would accept.

### Explicitly out of scope, and why

- **Server error-message localization** (translating `AllExceptionsFilter`'s
  `message` field by request `Accept-Language`) — not built. Nothing in
  §9.3's endpoint list or §15's stage-1.6 bullet asks for it; §7 already
  says the client localizes by `code`, not `message`
  ("Клиент показывает локализованный текст по code, а не по message").
  A real Accept-Language-aware server-message layer would be new scope
  the spec doesn't ask this stage to build (.cursorrules: "ничего не
  добавляй заодно").
- **CLDR pluralization** (`.one/.few/.many/.other` key-suffix rules,
  §9.2) — the import validator does not enforce plural-suffix structure.
  §9.3's own "Импорт валидирует" list names exactly four checks (dup
  keys, required en, placeholder parity, unknown languages) and
  pluralization isn't one of them; actually rendering plural forms is a
  client-side (§9.4) concern regardless.
- **Import-time key-naming-format validation** (§9.2: "только lowercase
  и точки") — deliberately not enforced. The real, already-shipped key
  set in `static_translator.dart` (e.g. `deleteAccount.reauth.biometric
  .button`) already uses camelCase segments, not pure lowercase — adding
  a stricter validator than the actual established convention would
  reject the very seed file this stage was asked to build. Also not one
  of §9.3's four explicitly-named import validations.
- **CI lint for string literals in Flutter's `presentation/`** (§9.4) —
  Dart/Flutter-side tooling, not backend.
- **Full admin RBAC** — see AdminGuard's doc comment above; single
  role check now, file 6 scope for anything broader.

### Verification

- **Real `npx tsc --noEmit` run** (node/npm confirmed reachable from
  this bridge, `v22.23.2`/`10.9.8`) against the whole `apps/api`
  project: zero errors in every file this stage touched. The only two
  remaining `tsc` errors (`redis-throttler-storage.service.spec.ts`,
  `'last' is possibly 'undefined'`) are pre-existing — confirmed by
  `git stash`-ing every tracked change from this stage and re-running
  `tsc` against clean `HEAD`, where the same two errors appear
  unchanged (then `git stash pop`, working tree confirmed restored
  intact — `git status` after showed the same 6 modified + 4 untracked
  paths as before the stash).
- **Real `npx eslint` run** (project's own flat config, not a generic
  lint) against every new/changed file: zero errors after fixing what
  it caught (missing prettier formatting, one genuinely-unnecessary
  type assertion, and an `@typescript-eslint/unbound-method` false
  positive that went away once a test fixture's fake Prisma client was
  restructured from a class to a plain factory function, matching
  `identity.service.spec.ts`'s existing convention).
- **Real `npx jest` run**, not a manual walkthrough: 29 new unit tests
  (pure-function tests for the CSV/xlsx parser and every §9.3 validation
  rule; fake-Prisma/fake-Redis tests for `I18nBundleService`'s
  cache-aside version logic and `I18nImportService`'s diff/apply/
  version-bump logic, same fake-object style as `identity.service.spec
  .ts` — a plain factory function, not a `TestingModule`, no DB/Redis
  needed to actually run these). Full suite: **46/46 passing**, no
  regressions in the 17 pre-existing tests.
- **Not verified — no way to in this environment**: no docker-compose
  services confirmed running (skipped starting them, per this session's
  own instructions, rather than guess at a possibly-live DB), so nothing
  that needs a real CockroachDB/Redis was run: `prisma migrate deploy`
  wasn't re-run (not needed — no schema change this stage), `npm run
  --workspace apps/api prisma db seed` was not run against a real DB,
  and no NestJS instance was ever actually booted, so the two `@Res()`
  raw-response routes (bundle ETag/304, xlsx export headers), the real
  multer file-upload path, and the full request → guard → controller →
  service → Prisma chain are unverified beyond `tsc`/`eslint`/unit
  tests and manual reading. Next real verification step: boot the API
  against `docker compose up`'s Postgres-compatible CockroachDB + Redis,
  `prisma migrate deploy && npm run --workspace apps/api prisma db
  seed`, then curl `GET /api/v1/i18n/languages`, `GET /api/v1/i18n/
  bundle/en`, and (as an admin JWT) `POST /api/v1/admin/i18n/import
  ?mode=dry-run` with a modified `translations_seed.xlsx` that adds an
  `es` column, confirming the stage's own acceptance criterion end to
  end.
- Every touched/created file was balance-checked (parens/braces/
  brackets) and every new relative import verified to resolve to a real
  file on disk, mechanically (not a substitute for the `tsc`/`eslint`/
  `jest` runs above, which are the real verification here).

## Stage 1.6 (Flutter L10n layer) — 2026-09-23

Flutter half of docs/01_FOUNDATION_AUTH.md §15 "Этап 1.6" / §9.4: the
real, backend-driven `L10n` layer that replaces `StaticTranslatorRu`/`En`
(stage-1.5/1.7 stopgap) as `translatorProvider`'s implementation, wired
against the backend module the previous entry ("Stage 1.6 (backend i18n
module)") just built (`GET /i18n/languages`, `GET
/i18n/bundle/:lang?since=version`). Written entirely through the
`mcp__remote-devices__device_bash` bridge to the owner's Mac — no
dart/flutter binary is reachable from this environment, so nothing here
was compiled, analyzed, or run. See "Not verified" below before treating
any of this as working code.

### What was built

- `apps/mobile/lib/core/l10n/l10n_database.dart` — new Drift database
  (`L10nDatabase`, tables `L10nTranslations` (lang, entryKey, value) and
  `L10nBundleMeta` (lang, version)). `loadLanguage()` is the fast,
  synchronous-enough-for-boot local read; `applyBundle()` upserts a
  full-or-delta bundle response in one batch; `seedIfEmpty()` writes the
  compiled-in seed map for a language ONLY if that language has never
  been synced (version 0, no rows) — a real synced bundle can never be
  clobbered by a stale seed.
- `apps/mobile/lib/core/l10n/i18n_api_client.dart` — new `I18nApiClient`
  (`GET /i18n/languages` → `List<I18nLanguageDto>`, `GET
  /i18n/bundle/:lang?since=` → `I18nBundleResult {lang, version,
  translations}`), same `skipAuth`/`ApiException.fromDioException`
  pattern as `AuthApiClient` — both `/i18n/*` routes are `@Public()`
  server-side, confirmed by reading `i18n.controller.ts` directly
  (`67ad...`/`66579bc`), not assumed.
- `apps/mobile/lib/core/l10n/l10n_repository.dart` — new `L10nRepository`,
  a plain (non-Riverpod) class gluing the two together: `loadCached`
  (local-only), `seedIfEmpty`, and `refresh` (best-effort — ANY failure,
  offline or otherwise, is swallowed and reported as `null`, never
  rethrown).
- `apps/mobile/lib/core/l10n/l10n_translator.dart` — new `L10nTranslator
  implements Translator`, the SAME public shape as `StaticTranslatorRu/En`
  (`t(key, [params])`, synchronous). Layered fallback: (1) the Drift-
  backed cache for the current language, (2) `StaticTranslatorRu/En`'s
  compiled-in map for that language (exposed via a new public
  `seedEntries` getter added to `_MapTranslator` in
  `static_translator.dart` — the only change to that file besides doc
  comments; its two classes and all ~116 keys are otherwise untouched, per
  the task brief), (3) the raw key string (already `_MapTranslator.t`'s
  own last-resort behavior).
- `apps/mobile/lib/core/l10n/l10n_providers.dart` (rewritten, same file):
  `l10nDatabaseProvider`, `i18nApiClientProvider`, `l10nRepositoryProvider`,
  and the new `L10nCacheController` (`@Riverpod(keepAlive: true)`,
  codegen — matches `SessionController`'s style), which owns the
  in-memory `Map<String, String>` cache `translatorProvider` reads. Two
  entry points, both called from `main.dart` (see below):
  `bootstrap()` (local-only, no network) and `refreshInBackground()`
  (best-effort network). `build()` itself does no I/O — it only
  registers `ref.listen` on `languageControllerProvider` so a language
  switch later (via `LanguagePickerSheet`) re-triggers the same
  load-then-refresh for the new language, without flashing back to
  `const {}` first (which `ref.watch` would have caused — see that file's
  doc comment for why `ref.listen` was chosen deliberately over
  `ref.watch` here).
  `translatorProvider` itself keeps its exact pre-existing shape
  (`Provider<Translator>`) and is still what every screen calls via
  `ref.watch(translatorProvider).t('key')` — UNCHANGED, confirmed by
  grep across all 17 files that reference it; none needed touching.
- `apps/mobile/lib/core/l10n/language_catalog_provider.dart` — new
  `languageCatalogProvider` (`@riverpod`, `Future<List
  <LanguageCatalogEntry>>`), merging live `GET /i18n/languages` into the
  compiled-in `kLanguageCatalog`: a code already in the hardcoded catalog
  keeps its curated order/`englishName`/`appLanguage`, only refreshing
  `nativeName` from the backend; a code the backend has that the
  hardcoded catalog doesn't gets appended (backend `sort` order) as a new
  row — the "picker grows without an app update" behavior the owner
  asked for (2026-09-22 voice follow-up, per `language_catalog.dart`'s
  existing doc comment). Falls back to `kLanguageCatalog` unchanged on
  any failure.
- `apps/mobile/lib/core/l10n/widgets/language_picker_sheet.dart` — now
  reads `ref.watch(languageCatalogProvider).valueOrNull ??
  kLanguageCatalog` instead of the static constant directly; the fallback
  covers both "still loading" and "failed", so the sheet never shows a
  spinner or an empty list.
- `apps/mobile/lib/main.dart` — added two calls around the existing
  `SessionController.bootstrap()` await: `await
  container.read(l10nCacheControllerProvider.notifier).bootstrap()`
  BEFORE `runApp` (local Drift read only), and `unawaited(...
  .refreshInBackground())` AFTER `runApp` (the network half) — matches
  §9.4's boot sequence ("читает кэш из drift → показывает UI → в фоне
  запрашивает bundle?since= → обновляет") and the task's explicit
  "don't block startup on network, only on the local Drift read"
  instruction.
- `apps/mobile/pubspec.yaml` — added `drift` + `drift_flutter`
  (dependencies) and `drift_dev` (dev, codegen) — this app had no local-db
  package at all before this pass (`shared_preferences` only), so this is
  a fresh addition, not building on existing drift infra. Versions
  (`^2.23.0`/`^0.2.4`/`^2.23.0`) are reasonable-as-of-training-data
  picks, NOT verified against `pub.dev`'s actual current resolvable set —
  see "Not verified" below.

### Fallback-layering design (the exact behavior, end to end)

1. **Cached Drift bundle** for the currently-selected language — last
   value synced from `GET /i18n/bundle/:lang?since=`, kept in memory as a
   plain `Map<String, String>` (`L10nCacheController.state`) so
   `Translator.t()` stays synchronous.
2. **Compiled-in seed map** — `StaticTranslatorRu`/`StaticTranslatorEn`'s
   existing ~116-key tables (via the new `seedEntries` getter), used both
   to pre-populate Drift on a brand-new install (`seedIfEmpty`, so the
   FIRST paint of a zero-network install already has correct strings, not
   blank ones) and as `L10nTranslator`'s live per-key fallback for
   anything the cached bundle is missing (e.g. a key the client added
   that the backend bundle hasn't caught up to yet).
3. **Raw key string** — `_MapTranslator.t()`'s own existing last-resort
   behavior (unchanged), reached only if a key is in neither the cache
   nor the seed map.
A real bundle sync (`applyBundle`) always overwrites the seed at the
per-key level going forward — `seedIfEmpty` only ever fires once, before
the first successful sync, and never re-fires afterward (guarded by
`existingVersion > 0`), so the seed can't go stale-but-still-served once
real data exists.

### Design calls made because the spec (and the task brief) were silent

- **`since=` delta-poll over ETag/304 conditional-GET for the background
  refresh.** The task brief described client-side 304 handling; reading
  the actual backend controller (`i18n.controller.ts`) showed the 304
  path only fires for a plain conditional GET with `If-None-Match` AND no
  `since` — which this client never sends. §9.4 explicitly names
  `bundle?since=` as the sync mechanism, and that path is always a normal
  200 (never 304), so there's no empty-body branch to handle on the
  client at all. Implemented the simpler, spec-named mechanism instead of
  force-fitting ETag handling nothing calls for.
- **Language SELECTION stays local-only; only translation CONTENT is now
  backend-driven.** `AppLanguage` is still just `{ru, en}`, and
  `LanguageRepository`/`LocalLanguageRepository` (SharedPreferences) are
  untouched — the backend pass added no endpoint for storing a user's
  language preference, and §9.3/§9.4 don't ask for one either. The
  language PICKER's LIST is backend-driven (`languageCatalogProvider`);
  which entries are actually *selectable* is still gated by `AppLanguage`
  having a case for that code, which is unchanged at `{ru, en}` this
  pass — giving a third language real selectability needs an
  `AppLanguage` case + a compiled seed for it, which is future work, not
  something this stage's spec asked for.
- **`entryKey` instead of `key` as the Drift column name** for the
  translation-key column, to keep it unambiguous against Drift/Dart's own
  `key` vocabulary (`MapEntry.key`, Flutter `Key`) in generated code and
  call sites — a naming choice, not a schema requirement from §9.3 (which
  only names server-side tables).
- **No cross-language fallback beyond `en`'s own compiled seed.** The
  task text's literal fallback chain ("cached DB → compiled seed → raw
  key") was implemented exactly as given, per-language — e.g. a `ru` user
  never silently reads cached *English* DB rows for a key `ru`'s own
  cache/seed is missing. The backend's own doc line ("Отсутствующий
  перевод → fallback на en") describes server-side bundle-assembly
  behavior that `i18n-bundle.service.ts` doesn't actually implement yet
  (its `getTranslations` only ever queries rows for the requested `lang`,
  confirmed by reading it) — not a client-side contract this pass needed
  to independently invent on top of the task's own explicit 3-layer
  spec.

### Not verified — no dart/flutter binary reachable in this environment

- **`flutter pub get`** for the new `drift`/`drift_flutter`/`drift_dev`
  dependencies — not run. Their version constraints may not resolve
  cleanly against this pubspec's existing `flutter_riverpod: ^3.4.3`/
  `riverpod_annotation: ^4.0.7`/Dart SDK `>=3.5.0` pins; first real step
  for whoever picks this up.
- **`dart run build_runner build`** — not run, for two separate codegen
  needs this pass added: `l10n_database.g.dart` (drift_dev, the
  `_$L10nDatabase` base class `L10nDatabase` extends) and
  `l10n_providers.g.dart`/`language_catalog_provider.g.dart`
  (riverpod_generator, `_$L10nCacheController` and the generated
  `languageCatalogProvider`). None of these generated files exist yet —
  expected, `*.g.dart` is gitignored repo-wide
  (`apps/mobile/.gitignore:21`), same as every other generated file
  already in this package (e.g. `language_providers.g.dart`, itself not
  committed either).
- **No `flutter analyze`/`flutter test`/manual run** — so beyond careful
  reading, none of this is confirmed to actually compile: not the new
  Drift table/query API usage (`l10n_database.dart`), not the Riverpod
  `ref.listen`-inside-`build()` pattern (`l10n_providers.dart`), not the
  `drift_flutter` `driftDatabase()` connection-opener call, none of it.
  Every touched/created file WAS mechanically balance-checked
  (parens/braces/brackets) and every new relative import verified to
  resolve to a real file on disk — the same mechanical check the backend
  entry above used, explicitly not a substitute for a real compile.
- **Backend contract assumed stable since `66579bc`, not re-verified
  live** — no NestJS instance was booted (same "not verified" the backend
  entry above already flagged), so this pass's `I18nBundleResult`/
  `I18nLanguageDto` parsing was checked against the controller/DTO
  SOURCE CODE only (`i18n.controller.ts`, `bundle-query.dto.ts`,
  `apps/api/prisma/schema.prisma`'s `model I18nLanguage`), never against
  an actual HTTP response.

## Stage 1.8 (feature flags + `/config/bootstrap`) — 2026-09-23

### Research first, against §15's "Этап 1.8" bullet and everything it touches

Read `docs/01_FOUNDATION_AUTH.md` in full again (not just the stage-1.8
bullet) for every mention of "feature flag"/"флаг"/"bootstrap": §7 ("426
Upgrade Required с кодом APP_UPDATE_REQUIRED... настраивается в
админке"), §10.2 "A. Splash" ("загрузка feature flags и переводов"), and
§15's own bullet ("Модуль флагов (БД + Redis кэш), эндпоинт GET
/config/bootstrap (флаги, min-версия, активные языки, версия переводов,
юридические документы)... Стартовые флаги: video_posts=false,
profile_promotion=false, stripe_identity=false,
persona_verification=false, auto_bar_check=false, phone_login=true,
email_login=true, apple_login=true, google_login=true").

Checked `apps/api/prisma/schema.prisma` before assuming anything needed
creating: `FeatureFlag`/`feature_flags` already existed (stage 1.3),
already seeded with the exact 9 starter flags above
(`prisma/seed.ts::seedFeatureFlags`, itself already commented "stage 1.8
work" for the module). `app_config` did NOT exist — schema.prisma's own
4.B comment said so explicitly ("app_config is stage 1.8"),
`docs/02_DATABASE.md` §4.B gave its exact shape (`key text PK, value
jsonb, updated_at`, 4 named keys), and `seed.ts`'s own header comment
already listed `app_config` in its `§7.2` seed ordering — this stage
adds the model, a migration, and the seed function.

Read `apps/api/src/modules/i18n/` (commit `66579bc`, this session) as
the structural template: controller→service→DTO split, `@Public()` +
Redis-cache-aside pattern (`I18nBundleService`), `ErrorCode` additions
(already found `APP_UPDATE_REQUIRED` pre-declared in the enum, commented
"stage 1.8" — not something this pass added), `app.module.ts`
registration, and the plain-factory-function Jest test style (no
`TestingModule`, fake Prisma/Redis objects), reused verbatim rather than
inventing a new shape.

Read `apps/mobile/lib/features/auth/data/`, `core/network/`, and
`main.dart`: zero existing bootstrap/config-fetch infra Flutter-side.
`main.dart`'s established pattern — `SessionController.bootstrap()` and
`L10nCacheController.bootstrap()`/`refreshInBackground()`, the second one
non-blocking and fired right after `runApp` — is exactly what
`FeatureFlagsController` follows.

Grepped the whole Flutter app for candidate flag-gating points:
`welcome_screen.dart`'s 4 login buttons (phone, email, Apple, Google —
`§10.1`'s exact list) map 1:1 onto the 4 login-method starter flags. No
other `showNotBuiltYet`/stub UI in the app plausibly maps to any of the
5 remaining flags (`video_posts`, `profile_promotion`,
`stripe_identity`, `persona_verification`, `auto_bar_check` — none of
those features exist as UI yet, in this file's scope or otherwise), so
nothing else was wired.

### What was built — backend

New module `apps/api/src/modules/feature-flags/` (named `feature-flags`,
not `config` — `ConfigModule` already exists as the env-config wrapper
around `@nestjs/config`; reusing that name would collide):

- `services/feature-flags.service.ts` — `feature_flags` table as a flat
  `{key: enabled}` map, Redis cache-aside (30s TTL), same shape as
  `I18nBundleService.getCurrentVersion`. Deliberately does NOT apply
  `rollout_percent` (schema column exists, read but unused) — §15 only
  asks for a global on/off for this stage, and `/config/bootstrap` is
  `@Public()` with no user identity to key a percentage rollout on
  anyway.
- `services/app-config.service.ts` — same cache-aside shape for the new
  `app_config` table, plus `getMinAppVersion(platform)` for the version
  guard below.
- `services/bootstrap.service.ts` — aggregates the 5 pieces §15 names:
  `flags`, `app_config`, `languages` (active `i18n_languages` rows, same
  query `I18nLanguagesService.listActive` uses), `translations_version`
  (`{lang: version}` from `i18n_bundle_versions`), `legal_documents`
  (current-version rows only, trimmed to the fields a client actually
  needs — no `id`/`is_current`/timestamps beyond `published_at`).
- `controllers/bootstrap.controller.ts` — `GET /config/bootstrap`,
  `@Public()` + a new `@SkipVersionCheck()` (see guard below).
- `guards/app-version.guard.ts` (`AppVersionGuard`) + its
  `@SkipVersionCheck()` decorator — a second global `APP_GUARD`
  (registered in `FeatureFlagsModule`, imported in `app.module.ts`
  between `ThrottlerModule` and `AuthModule` so guard order is
  Throttler → AppVersion → Jwt) implementing §7's "Минимальная
  поддерживаемая версия... проверяется сервером (426 Upgrade Required с
  кодом APP_UPDATE_REQUIRED)". Fail-OPEN, not fail-closed like
  `JwtAuthGuard`: missing `X-App-Version`/`X-Platform` headers, an
  unrecognized platform, unparseable versions, or no `app_config` row
  all let the request through — this check exists for compatibility, not
  security, and every real sender (`HeadersInterceptor` on the Flutter
  side) always sends both headers, so "can't tell" only ever happens for
  non-Flutter callers (Swagger, curl, this repo's own e2e tests) that
  must keep working unaffected. `@SkipVersionCheck()` applied to
  `/config/bootstrap` itself (must stay reachable by the very client it
  would otherwise block — that response IS what tells a stale client
  it's stale) and both `/health/*` routes (probes never send version
  headers; the guard's own missing-header fallback already covers this,
  but the decorator makes the opt-out explicit and consistent with every
  other route in `health.controller.ts`).
- `apps/api/src/common/utils/semver.util.ts` — minimal dotted-version
  `compareVersions`/`isVersionBelow` (no pre-release precedence rules;
  the client only ever sends a plain `major.minor.patch`). Returns
  `null`/`false` rather than throwing on unparseable input, matching the
  guard's fail-open design.
- `prisma/schema.prisma` — new `AppConfig` model (`app_config` table,
  generic `key -> Json value` rather than 4 dedicated columns, matching
  `docs/02_DATABASE.md` §4.B's own shape and letting future keys be
  added without a migration), plus a hand-written migration
  (`20260923010000_stage_1_8_app_config/migration.sql` — no live
  CockroachDB reachable from this bridge to run `prisma migrate dev`,
  so this was written by hand, `JSONB`/`STRING`/`TIMESTAMPTZ` types
  copied verbatim from the existing stage-1.3 migration's `meta`/`data`
  Json columns for consistency; `npx prisma validate` and `npx prisma
  generate` both ran clean against it — see Verification).
- `prisma/seed.ts` — new `seedAppConfig()`, seeding all 4
  `min_app_version_*`/`soft_update_version_*` keys to `"0.1.0"` (the
  app's current version, `HeadersInterceptor.appVersion` on the Flutter
  side) so a freshly-seeded dev/CI database never force-updates the
  client that just built against it; wired into `main()` between
  `seedFeatureFlags()` and `seedLegalDocuments()`, matching
  `docs/02_DATABASE.md` §7.2's ordering. `seedFeatureFlags()` itself was
  NOT changed — all 9 starter flags already existed from stage 1.3.

### What was built — Flutter

New `apps/mobile/lib/core/feature_flags/`:

- `default_feature_flags.dart` — the compiled-in fallback map, copied
  verbatim from `seed.ts`'s starter values (login-method flags default
  `true`, unfinished-feature flags default `false` — see its own doc
  comment for why an all-`false` fallback would be the wrong failure
  mode here).
- `feature_flags_api_client.dart` — `/config/bootstrap` Dio client, same
  `skipAuth`/`ApiException.fromDioException` pattern as
  `I18nApiClient`/`AuthApiClient`. Parses only `flags` and `app_config`
  out of the response — `languages`/`translations_version` are redundant
  with what `L10nCacheController` already fetches from the dedicated
  `/i18n/*` endpoints, and `legal_documents` has no consumer yet (the
  welcome screen's Terms/Privacy links are still the pre-existing "not
  built yet" stub); parsing fields nothing reads yet would be exactly
  the kind of speculative surface `.cursorrules` warns against.
- `feature_flags_state.dart` — `FeatureFlagsState` (flags map + app_config
  map) with `isEnabled(key)`.
- `semver.dart` — Dart-side mirror of the backend's `semver.util.ts`
  (same dotted-integer comparison, same suffix-stripping, same
  can't-parse-means-not-below behavior) — used only for the client-side
  half of the update-required check.
- `feature_flags_providers.dart` — `FeatureFlagsController` (Riverpod
  codegen, `keepAlive: true`, same shape as `L10nCacheController`/
  `SessionController`): `build()` returns `defaultFeatureFlags`
  synchronously (no local cache/Drift table — see its doc comment for
  why that default already IS a safe, always-available "cache" without
  needing an on-disk layer), and `refreshInBackground()` fetches
  `/config/bootstrap` and merges the result over the defaults,
  swallowing any failure. Also `isAppUpdateRequiredProvider` — compares
  this device's own `HeadersInterceptor.appVersion` against
  `app_config['min_app_version_{platform}']`.
- `main.dart` — one more `unawaited(...refreshInBackground())` call
  after `runApp`, alongside the existing L10n one — non-blocking, same
  as L10n's background refresh; first paint never waits on it.
- `app.dart` — `_UpdateRequiredGate`, a `builder`-level wrapper around
  the routed app that shows a full-screen, non-dismissible (`PopScope
  (canPop: false)`) screen whenever `isAppUpdateRequiredProvider` is
  true, using 3 new translation keys (`app.update.title/message/button`,
  added to both `StaticTranslatorRu`/`StaticTranslatorEn` in
  `static_translator.dart` — not added to `translations_seed.xlsx`,
  same as how the pre-existing `auth.welcome.notBuiltYet` key already
  works without a bundle entry, via the seed-fallback layer
  `L10nTranslator` already implements).
- `welcome_screen.dart` — the 4 login buttons (`§10.1`'s phone/email/
  Apple/Google) now each check their matching starter flag
  (`phone_login`/`email_login`/`apple_login`/`google_login`) via
  `ref.watch(featureFlagsControllerProvider)`; a disabled method's
  button is omitted from layout entirely (not shown-but-disabled — §15
  doesn't call for a "coming soon" affordance here, and the 3 icon
  buttons already share one `Row` via `Expanded`, so omitting one just
  lets the others share the space instead of leaving a gap).
- `core/network/api_error.dart` — added `ApiErrorCodes.appUpdateRequired`
  for parity with the backend enum, even though nothing calls it yet
  (see the explicit scope note below).

### Design calls made because the spec was silent

- **`/config/bootstrap`'s exact field names**: kept every field's own
  Prisma-model casing (snake_case — `app_config`, `translations_version`,
  `legal_documents`), matching `I18nController.listLanguages`'s existing
  precedent (`ResponseInterceptor` doesn't transform casing; Flutter's
  `I18nLanguageDto.fromJson` already reads `name_native`/`is_active`
  this way), rather than inventing a camelCase contract for this one
  endpoint.
- **Flat `{key: value}` maps for both `flags` and `app_config`**, not
  arrays of `{key, value}` objects — §15 says "флаги" with no shape
  specified; a flat map is what `isEnabled(key)` wants directly on both
  ends, and it's what `FeatureFlag`/`AppConfig`'s own `key`-as-PK schema
  already implies.
- **A global server-side `AppVersionGuard`, not just a client-side
  self-check**: §7 explicitly says the minimum version "проверяется
  сервером", and the `APP_UPDATE_REQUIRED` `ErrorCode` was already
  pre-declared (stage 1.2) with a comment naming stage 1.8 — building
  only the bootstrap-reported version numbers without any server-side
  enforcement would leave that spec line and that enum comment
  unfulfilled. Scoped deliberately narrow (fail-open on any ambiguity,
  two explicit `@SkipVersionCheck()` opt-outs) specifically so it
  couldn't regress any existing endpoint or test — confirmed it didn't
  (see Verification: full 69/69 suite still green).
- **Flutter's force-update gate is Splash/cold-start only, not wired
  into the live 426 error path**: `AuthInterceptor`
  (`core/network/auth_interceptor.dart`) was deliberately left
  untouched — reacting to a live `APP_UPDATE_REQUIRED` on some other
  in-flight request (as opposed to the dedicated bootstrap comparison)
  would mean importing `core/feature_flags` from `core/network`, which
  imports back from `core/network` (`dioProvider`) — a working but messy
  circular import for a code path §15's acceptance criterion doesn't
  actually require (it only asks for behavior "при
  APP_UPDATE_REQUIRED", which the Splash-time self-comparison already
  satisfies). Noted as a real gap, not silently dropped — see
  `_UpdateRequiredGate`'s doc comment in `app.dart`.
- **No Drift/on-disk cache for flags**, unlike L10n's bundle cache: the
  compiled-in `defaultFeatureFlags` default already equals what a
  freshly-seeded backend returns, so it degrades gracefully with zero
  persistence layer — adding one would be complexity `docs/
  01_FOUNDATION_AUTH.md` §15 never asks for (only §9.4's L10n system
  explicitly calls for a Drift cache).
- **`app_config` seeded to the app's current version (`"0.1.0"`)**, not
  to some higher/lower placeholder — an admin (once file 6's admin panel
  exists) raises it when an actual minimum is decided; seeding it any
  other way would either force-update every fresh dev/CI install or
  silently defeat the guard's own tests' assumptions.

### Explicitly out of scope, and why

- No admin UI for toggling flags/app_config (file 6 — "админка").
- No per-user/per-cohort rollout (`rollout_percent` column exists,
  unused — §15's stage-1.8 acceptance criterion is a global on/off).
- No `url_launcher`/store-listing wiring for the force-update screen's
  "Update" button — same "not built yet" affordance the welcome screen
  already uses elsewhere; no new Flutter dependency added for one
  button that has nowhere real to send the user yet.
- AuthInterceptor doesn't react to a live 426 — see design-calls note
  above.

### Verification

- **Real `npx tsc --noEmit` run** against the whole `apps/api` project
  (node `v22.23.2`/npm `10.9.8`, confirmed reachable): zero errors in
  every file this stage touched. The only 2 remaining `tsc` errors
  (`redis-throttler-storage.service.spec.ts`, `'last' is possibly
  'undefined'`) are the same pre-existing ones the stage-1.6 backend
  entry above already found and attributed to `HEAD`, not this stage.
- **Real `npx eslint` run** against every new/changed file (project's
  own flat config): zero errors after fixing what it caught (prettier
  formatting, and 3 `@typescript-eslint/unbound-method` false positives
  in `app-version.guard.spec.ts` — fixed the same way the stage-1.6
  entry's own fix did: extract the mock function into a local `const`
  before the `as unknown as AppConfigService` cast, instead of asserting
  on `appConfig.someMethod` directly). A second pass, `npx eslint
  "src/**/*.ts" "prisma/**/*.ts"` against the ENTIRE backend, also came
  back clean.
- **Real `npx jest` run**: 23 new unit tests (`FeatureFlagsService`/
  `AppConfigService` cache-aside logic, `BootstrapService` aggregation,
  `AppVersionGuard`'s fail-open branches + the 426 it throws,
  `semver.util`'s comparison table) — same fake-Prisma/fake-Redis/
  fake-Reflector factory-function style as `i18n-bundle.service.spec
  .ts`, no `TestingModule`, no DB/Redis needed. Full suite: **69/69
  passing**, no regressions in the pre-existing 46.
- **Real `nest build`** (`npx nest build`) — compiled the whole app
  including the new module and its `APP_GUARD` registration with zero
  errors; the stage-1.6 entry above didn't have this checkpoint
  available, added here as extra confidence that the DI graph itself
  (not just individual files' types) is sound.
- **Not verified — no way to in this environment**: no docker-compose
  services confirmed running, so nothing needing a real CockroachDB/
  Redis was run — `prisma migrate deploy` wasn't applied against a live
  database (the hand-written migration SQL was checked against `prisma
  validate`/`prisma generate` only, both of which need the schema file
  but not a DB connection), `npm run --workspace apps/api prisma db
  seed` was not run for real, and the NestJS app was never actually
  booted (`nest build` compiles, it doesn't run) — so the real
  `GET /config/bootstrap` response shape, the `AppVersionGuard`'s actual
  426 response against a live request, and the full request → guard →
  controller → service → Prisma/Redis chain are unverified beyond
  `tsc`/`eslint`/`jest`/`nest build` and manual reading. Next real
  verification step: boot the API against `docker compose up`'s
  CockroachDB + Redis, `prisma migrate deploy && npm run --workspace
  apps/api prisma db seed`, then curl `GET /api/v1/config/bootstrap`
  and confirm its shape, flip a flag directly in the DB (or via
  `UPDATE feature_flags`) and confirm a second bootstrap call within
  30s still serves the OLD value (cache TTL) and the value after that
  is the NEW one, and send a request with `X-App-Version: 0.0.1` /
  `X-Platform: ios` against a min version raised above it to confirm the
  426/`APP_UPDATE_REQUIRED` path.
- **Flutter side is entirely unverified** — no `dart`/`flutter` binary
  reachable from this bridge (confirmed with `which dart flutter`,
  neither present). No `flutter pub get`, no `dart run build_runner
  build` (so `feature_flags_providers.g.dart` does not exist yet —
  expected, `*.g.dart` is gitignored repo-wide, same as every other
  generated file already in this package, e.g.
  `session_providers.g.dart`), no `flutter analyze`/`flutter test`/
  manual run. Every touched/created Flutter file WAS mechanically
  balance-checked (parens/braces/brackets — all matched) and every new
  relative import mechanically verified to resolve to a real file on
  disk (all did) — the same mechanical check prior Flutter-only stages
  in this changelog used, explicitly not a substitute for a real
  compile.
- Every touched/created backend AND Flutter file was balance-checked and
  every new relative import verified to resolve to a real file,
  mechanically, in addition to the real `tsc`/`eslint`/`jest`/`nest
  build` runs above for the backend half.

## CI pipeline (file 01 §16 DoD, final remaining item) — 2026-09-23

Added the CI that docs/CHANGELOG.md's own stage-1-completion audit (above,
"§16 DoD: no CI workflow file exists at all") flagged as the last open
item of file 1's Definition of Done. `.github/workflows` held only a
placeholder README before this; it now has three real workflows.

### What was built

- **`.github/workflows/api-ci.yml`** — on every PR/push to `main`/`master`
  touching `apps/api/**` (or root `package(-lock).json`/`docker-compose
  .yml`): starts CockroachDB v24.1.5 + Redis 7 + Mailhog service
  containers (versions/images matching `docker-compose.yml`), `npm ci`,
  `prisma generate` / `prisma validate` / `prisma migrate deploy` against
  the clean CockroachDB, `npm run lint` (the repo's own `eslint --fix`
  script, followed by a `git diff --exit-code` check so a needed fix
  fails the build instead of silently passing), `tsc --noEmit`,
  `npm run test:cov` (uploads the coverage report as a build artifact —
  no threshold gate added; file 01 states no coverage number, and the
  ≥80% figure in docs/06_PRODUCTION.md §9.1 is file-6 test-policy scope),
  `npm run test:e2e` against the real service containers, and an
  advisory (`continue-on-error`) `npm audit --audit-level=high`.
- **`.github/workflows/mobile-ci.yml`** — on every PR/push touching
  `apps/mobile/**`: an `analyze-and-test` job (`flutter pub get`,
  `dart run build_runner build --delete-conflicting-outputs` for the
  freezed/riverpod/json_serializable/drift codegen the repo gitignores,
  `flutter analyze`, two advisory grep-based checks for hardcoded string
  literals and hardcoded colors, `flutter test` covering unit/widget/
  golden tests), then `build-android` and `build-ios` jobs (each gated on
  `analyze-and-test` passing first) doing an unsigned debug build-check
  only (`flutter build apk --debug`, `flutter build ios --debug
  --no-codesign`) — no signing, no store upload, per §16 DoD's "сборка
  Android и iOS" line, not the fuller Fastlane release pipeline that's
  docs/06_PRODUCTION.md §7.4 (file 6) scope.
- **`.github/workflows/secret-scan.yml`** — `gitleaks`, repo-wide (not
  path-filtered), on every PR/push to `main`/`master`. Directly covers
  §16 DoD's "Ни один секрет не лежит в репозитории" line. Diff-only on
  PRs, full scan on push, via the action's own default behavior.
- Replaced the `.github/workflows/README.md` placeholder with a real
  description of the three workflows and the judgment calls below.

### Design calls the spec left silent (all flagged in-file too)

- **Database is CockroachDB, not Postgres.** Earlier framing of this work
  assumed Postgres+Redis service containers; the repo's actual
  `docker-compose.yml` and every `DATABASE_URL` in the repo use
  CockroachDB v24.1.5. `api-ci.yml` starts CockroachDB, not Postgres.
  GitHub Actions' `services:` block cannot override a service image's
  command, and CockroachDB's image needs one (`start-single-node
  --insecure`), so it's started via a manual `docker run` + health-poll
  step instead of `services:`; Redis and Mailhog use real `services:`
  entries since their default commands need no args. MinIO was left out
  entirely — no file-upload/S3 code exists yet (`schema.prisma`'s own
  comments mark the `files` table out of stage-1.3 scope), so there's
  nothing for it to back.
- **Hardcoded-string and hardcoded-color checks are advisory, not
  blocking.** Stage 1.6 in §15 calls for a "CI-проверка на строковые
  литералы в presentation/", and docs/06_PRODUCTION.md §7.2.3 reiterates
  both checks (strings + colors) as required PR checks — real, not
  invented, requirements. But a real grep against the current `lib/` tree
  found pre-existing violations neither in this task's scope to fix:
  `phone_screen.dart`'s `Text('US +1', ...)`, `role_card.dart`'s
  `Text('PRO', ...)`, and `delete_account_screen.dart`'s two
  `Colors.white` uses. Making either check blocking today would fail CI
  on day one over unrelated pre-existing code, not over anything this
  change introduced. Both run as `continue-on-error: true` with a
  `::warning::` annotation instead, clearly marked in-file as needing to
  be tightened to blocking once those are cleared.
- **`npm audit --audit-level=high` is advisory, not blocking**, for the
  same reason: it currently exits 1 with 9 pre-existing high-severity
  transitive vulnerabilities (`multer` via `@nestjs/platform-express`,
  `uuid` via `exceljs`), fixable only via `npm audit fix --force` —  a
  real breaking-change dependency-upgrade decision (major bumps of
  `@nestjs/platform-express` and `exceljs`) that doesn't belong inside a
  CI-pipeline task done sight-unseen of what those upgrades break.
- **`analyze-and-test` in `mobile-ci.yml` runs on `macos-latest`, not
  `ubuntu-latest`.** This repo's golden tests render real embedded fonts
  via `golden_toolkit`'s `loadAppFonts()` (`test/flutter_test_config
  .dart`), not a placeholder font, and the goldens were generated on a
  macOS dev machine — cross-OS font rasterization differences are a
  known source of false-positive golden failures. The spec doesn't say
  which OS CI should use; matching the OS the goldens were generated on
  was judged lower-risk than the cheaper `ubuntu-latest`, at the cost of
  slower/more expensive macOS runners for that job (`build-android`
  still uses `ubuntu-latest`). Golden tests themselves were NOT made
  non-blocking — if they still fail on a real PR with no visual
  regression, the fix is regenerating them on macOS via `flutter test
  --update-goldens`, not loosening this job.
- **Flutter/Dart pinned to `channel: stable`, not an exact version.**
  `pubspec.yaml` only declares a floor (`sdk: ">=3.5.0 <4.0.0"`); no
  `.fvmrc` or equivalent pins an exact one. Its own comments describe a
  Riverpod 2→3 / Freezed 2→4 migration done specifically to work with a
  newer analyzer than Flutter's 3.5.0-era release shipped, so pinning to
  that historical floor would likely fail `build_runner`. `stable`
  always satisfies the floor; pinning an exact version for full
  reproducibility is flagged in-file as follow-up work once the team
  settles on one.
- **No coverage-percentage gate added.** File 01 §16 doesn't state a
  number; the ≥80% figure only appears in docs/06_PRODUCTION.md §9.1
  (file 6's test policy). Coverage is generated and uploaded as a build
  artifact for visibility, not gated.
- **No Docker-image build step.** docs/06_PRODUCTION.md §7.2 item 5
  calls for one (file 6 scope), but no `Dockerfile` exists anywhere in
  the repo yet — nothing to build. Left out rather than inventing one.
- **No OpenAPI-diff / Dart-client-regeneration check.** Also
  docs/06_PRODUCTION.md §7.2 item 2, file 6 scope, and no Dart-client
  generator is wired into the repo yet (§16 DoD's "Dart-client сгенерирован
  из него" is a manual checklist item at this stage, not an automated
  one). Left out for the same reason.

### Incidental fix (required to make the CI this task adds actually pass)

- `apps/api/src/throttler/redis-throttler-storage.service.spec.ts`: `let
  last;` was implicitly possibly-`undefined` under strict mode, causing
  `tsc --noEmit error TS18048` on both post-loop uses. This is the exact
  pre-existing error the stage-1.6/1.8 entries above already found and
  explicitly attributed to `HEAD`, not their own changes — confirmed
  still present, unrelated to this task, but it would have made the new
  `api-ci.yml` typecheck step red from its very first run. Fixed with a
  typed `Awaited<ReturnType<typeof storage.increment>> | undefined`
  declaration and two non-null assertions justified by the loop always
  running 4 iterations before either use. No other line changed.

### Verification

- **Real, in this bridge** (node `v22.23.2`/npm `10.9.8`, confirmed
  reachable): `npx tsc --noEmit` in `apps/api` — 0 errors (after the fix
  above; was 2 before it). `npx eslint "{src,apps,libs,test}/**/*.ts"
  --fix` (the repo's own `lint` script) — 0 errors, and `git status`
  confirmed it touched nothing beyond the intentional fix above. `npx
  jest` — 12 suites / 69 tests, all passing. `npm audit --audit-level=high
  --workspace apps/api` — confirmed it currently exits 1 (9 high, 2
  moderate), which is exactly why that CI step is advisory, not the
  workflow's own bug. These are the same commands/flags `api-ci.yml`
  runs, run directly rather than through the workflow.
- **Not verified, no way to in this bridge**: the `prisma migrate
  deploy`/e2e-test steps (no reachable Postgres/CockroachDB/Redis from
  this bridge — confirmed, matches every prior entry's same limitation),
  every mobile-ci.yml step (no `flutter`/`dart` binary reachable from
  this bridge — confirmed with `which`), and — the part no local bridge
  can ever verify — that the YAML actually schedules, that the
  `services:`/manual-`docker run` CockroachDB setup behaves as designed
  on a real GitHub-hosted runner, that `subosito/flutter-action@v2`
  resolves a real `stable` Flutter satisfying the pubspec floor, and
  that `gitleaks-action@v2` runs cleanly against this repo's actual git
  history. **All three workflow files were syntax-validated with
  Python's `yaml.safe_load` (all three parse) and every file path /
  npm-script name they reference was checked against the real repo
  (`apps/api/package.json`, `apps/mobile/pubspec.yaml`,
  `docker-compose.yml`) rather than assumed** — but none of them have
  actually been triggered by a real PR or push. The true test is the
  first real PR/push against `main`/`master` after this commit; expect
  to iterate on at least the CockroachDB startup step and the Flutter
  `stable`-channel resolution the first time they run for real.


## Gavel-strike tap animation disabled by default — 2026-09-23

User feedback: the judge's-gavel tap animation (file 07 §7, `GavelStrikeButton`/`GavelStrikeIconButton`, used on the welcome screen's email/Apple/Google buttons, phone/OTP/role screens' primary CTA) felt unnecessary on every tap.

Change: flipped both widgets' `strike` parameter default from `true` to `false`. No call site in the app currently passes an explicit `strike:` argument, so this one-line-per-file change silences the animation everywhere it was wired up, without touching any of the 5 screen files that use these buttons. The overlay/painter/haptic machinery (`_GavelStrikeOverlay`, `_GavelStrikePainter`, `AppMotion.gavelStrike*` tokens) was left in place, not deleted — it's still available per-call-site via `strike: true` if a future screen wants the effect back.

Buttons still behave as normal `AppButton`/`AppIconButton` presses (tap, press-scale, haptic-on-tap where `AppButton` already had it) — only the gavel overlay animation is gone.

## Fix: phone-OTP "failed to send code" on real device/simulator — 2026-09-23

User report from real-device testing: app looks and navigates correctly, but tapping "continue" after entering a phone number fails with a generic network error, blocking the OTP flow specifically (everything else in the app degrades silently thanks to the offline-first designs from earlier stages, so this was the only place the underlying network problem became visible).

Two stacked causes, both about talking to a `localhost`-only dev backend from a device that isn't `localhost`:
1. `apps/mobile/lib/core/network/dio_client.dart`'s `API_BASE_URL` default is `http://10.0.2.2:3000/api/v1` — `10.0.2.2` is the Android emulator's own special alias for "the host machine"; it means nothing on iOS (simulator or real device) or on Android/iOS hardware sitting on the same Wi-Fi as the Mac. Fix is NOT a code change (there's no single default that's correct for Android emulator, iOS simulator, and a real device at once) — it's a `--dart-define=API_BASE_URL=...` override at `flutter run` time, documented back to the user.
2. `apps/mobile/ios/Runner/Info.plist` had no App Transport Security exception. iOS blocks plain `http://` requests by default; since the local dev backend has no TLS certificate, every request from the iOS app would have been silently rejected at the OS level regardless of the base URL being correct. Added `NSAppTransportSecurity` / `NSAllowsArbitraryLoads` for local dev, clearly commented as dev-only and to be removed once the backend is served over `https://`.

## Stage 2.1 (enums + states + practice_areas) — 2026-09-27

Per docs/02_DATABASE.md §8 "Этап 2.1" (phase A order in docs/06 §14:
1.3 → 2.1 → 2.2 → 1.4; 2.1 had been skipped while stages 1.4–1.8 went
ahead, so it is done now).

- `schema.prisma`: all remaining §2 enums (38 new, 44 total in the DB),
  `State` (`states`, code `char(2)` PK) and `PracticeArea`
  (`practice_areas`, self-referencing `parent_id`, UQ `code`, `ON DELETE
  RESTRICT`). Migration `20260927175913_stage_2_1_enums_states_practice_areas`.
- `prisma/seed/practice_areas.seed.json` generated from the §3.2 list:
  **42 categories + 344 specializations**. §3.2 says "около 400"; the
  enumerated list itself (ground truth) contains 344 — nothing invented.
- `src/common/reference-data/`: `US_STATES` (50 + DC) and
  `practice-areas.util.ts` (§3.2 code rule `practiceAreaSnake()`, plus
  `flattenPracticeAreaSeed()` that rejects rule-breaking or duplicate
  codes so a hand-edited JSON can't seed bad data).
- `seed.ts`: `seedStates()` → `seedPracticeAreas()` run first, per §7.2
  order; upsert by code, `is_active` not overwritten on re-seed (so an
  admin deactivation survives).

### Verification (real, local CockroachDB v24.1 via docker compose)
- `prisma validate`, `prisma migrate dev` — clean.
- Seed run twice → `states=51`, categories `42`, leaves `344`, duplicate
  codes `0`, leaves not prefixed by parent code `0`, enum types `44`.
- `tsc --noEmit`, `npm run lint`, `npm run build` clean; unit tests
  13 suites / 81 tests pass (12 new).

### Environment fix (not code)
- `node_modules` had been installed in a Linux arm64 sandbox, so Jest 30's
  native resolver (`unrs-resolver`) had no macOS binding and every Jest run
  failed with "Module ts-jest … was not found". Installed
  `@unrs/resolver-binding-darwin-arm64@1.12.2` with `--no-save` (lockfile
  untouched). A clean `npm ci` on the Mac would also fix it.

### e2e isolation fix (pre-existing bug, surfaced on first re-run on a Mac)
- `auth.e2e-spec.ts` assumed a fresh DB + empty Redis but used the dev
  ones, so any second run failed (429s from leftover rate-limit keys,
  `isNewUser=false`). `test/jest-e2e.json` now has a `globalSetup` that
  creates a throwaway `<db>_e2e_<ts>` database + `prisma migrate deploy`,
  flushes Redis logical DB 15, and a `globalTeardown` that drops only that
  database. The dev database is never touched. `prisma migrate reset` was
  deliberately not used.
- For e2e only, `OTP_RATE_LIMIT_PER_IP_PER_HOUR=1000`: the whole suite
  runs from 127.0.0.1 and makes >10 OTP requests; no scenario asserts the
  per-IP limit. The per-identifier limit keeps its real value.
- Result: 2 suites / 14 tests pass, twice in a row.

## Stage 2.2 (users/auth/consents/files/config/i18n alignment) — 2026-09-27

Per docs/02_DATABASE.md §8 "Этап 2.2": align §4.A/§4.B with the tables
stage 1.3 created. Migration `20260927181416_stage_2_2_files_user_uniques`.

- New `files` table (§4.A) with every listed column, `s3_key` UQ,
  `scan_status` default `pending`, `is_public` default false, soft delete
  (`deleted_at`), owner FK `ON DELETE RESTRICT`.
- `users.avatar_file_id` now a real FK → `files` (was a bare uuid).
- `users.email` / `users.phone_e164` unique. §5.1 describes them as
  partial (`WHERE … IS NOT NULL`); a plain unique index in CockroachDB
  already allows any number of NULLs (exactly the 2.2 acceptance), and
  Prisma can express it (enables `findUnique` by email/phone). Same
  semantics. *Correction (stage 2.4):* the original note claimed a raw-SQL
  partial index would be dropped as drift — tested, Prisma ignores
  partial indexes in its diff, so that reason was wrong; the choice
  stands on semantics alone.
- `prisma migrate diff` (DB vs schema): no drift.
- New `test/db-auth-schema.e2e-spec.ts` (real CockroachDB): multiple NULL
  email/phone allowed, duplicate email and phone rejected, identifier
  (provider, provider_uid) UQ, session + auth event creation, files
  s3_key UQ + avatar link. 6/6 pass.
- Checks: tsc, lint, build clean; unit 81/81; e2e 3 suites / 20 tests.

Known differences from §4.A/§4.B left as-is on purpose (need an owner
decision per .cursorrules, not silently "fixed"):
- `users.role` is nullable (stage 1.4: role is chosen after login during
  onboarding); §4.A says NN.
- `onboarding_state.current_step`/`data` nullable; §4.A has `current_step`
  NN.
- `sessions.session_chain_id` exists (extra, stage 1.4 reuse detection).
- Reference/config tables (`blocked_email_domains`, `i18n_languages`,
  `feature_flags`, `app_config`, `i18n_translations`) lack
  `created_at`/`updated_at` per §1.3, because their own §4 column lists
  omit them.

## Stage 1.7 backend gap: onboarding API + POST /cases stub — 2026-09-27

An audit of the code (not the changelog) found stage 1.7 incomplete: the
Flutter flow had no server-side onboarding at all, `POST /cases` and
`CLIENT_CONTACTS_INCOMPLETE` did not exist. This adds the server half.

- `GET /users/me`: profile, verified flags, required-consent state,
  onboarding `{currentStep, completedAt, data}` and `missing[]` — the
  list the Flutter `AppRouterGuard` redirects on (consents → role → name →
  contacts), so the rules live only on the server.
- `PATCH /users/me` (first/last name, `uiLanguage` checked against active
  `i18n_languages`, `theme`) — acceptance item 7.
- `POST /users/me/role` — client/attorney only, settable once (atomic
  `WHERE role IS NULL`), `ROLE_ALREADY_SET` (409) afterwards (§11 step 2).
  Client refreshes tokens to get the new `role` claim.
- `PATCH /users/me/onboarding` — saves the step and merges step data, so
  the app resumes where it was closed (item 4). Client state/languages
  live in `data` until `client_profiles` arrives in stage 2.3.
- `POST /users/me/onboarding/complete` — server-enforced: required
  consents (18+, ToS, Privacy, disclaimer), role, name; client needs BOTH
  verified phone and email (`CLIENT_CONTACTS_INCOMPLETE`), attorney a
  verified phone (`ONBOARDING_INCOMPLETE` otherwise).
- `POST /cases` stub (`CasesModule`): non-client → `FORBIDDEN`, client
  without both contacts → `CLIENT_CONTACTS_INCOMPLETE` (item 9), else
  `501 NOT_IMPLEMENTED` until file 04.
- New ErrorCodes: `CLIENT_CONTACTS_INCOMPLETE`, `ONBOARDING_INCOMPLETE`,
  `ROLE_ALREADY_SET`, `NOT_IMPLEMENTED`.
- Route paths other than `/cases` aren't named in the spec (§10.5 lists
  no onboarding routes); chosen as the minimal REST shape under
  `/users/me` — flagged for the owner.
- Tests: unit `missingRequirements` (3), e2e `test/onboarding.e2e-spec.ts`
  (3 scenarios: full client flow incl. resume and contact gate, attorney,
  validation). Totals: unit 84/84, e2e 4 suites / 23 tests; lint, tsc,
  build clean.
- Still open for 1.7 (mobile): Splash, email login, consents/18+,
  language, contacts, attorney profile, verification/subscription,
  tour, "Download my data" screens, AppRouterGuard wired to
  `GET /users/me`, idempotency/retry interceptors.

## OpenAPI export (file 01 §16 DoD: "Swagger покрывает все эндпоинты") — 2026-09-27

- Swagger was effectively empty: no `@nestjs/swagger` CLI plugin and no
  `@Api*` decorators, so request bodies had no schemas. Enabled the plugin
  (`classValidatorShim`, `introspectComments`) in `nest-cli.json`.
- `src/openapi/openapi.config.ts` — one document builder used by `main.ts`
  (`/docs`) and by `npm run openapi:export`, which writes
  `packages/api-contract/openapi.json` (25 paths, 14 request schemas; the
  dev-only `/dev/echo` is excluded).
- Still open: typed response schemas (need response DTO classes) and
  generating the Dart client from this file.

## Stage 2.3 (profiles, licenses, verification) — 2026-09-27

Per docs/02_DATABASE.md §8 "Этап 2.3" / §4.C. Migration
`20260927183543_stage_2_3_profiles_verification`, no drift.

- Tables: `client_profiles`, `attorney_profiles`, `attorney_licenses`
  (UQ `state_code, bar_number`), `attorney_practice_areas` (composite PK,
  reverse index), `verification_requests`, `verification_documents`
  (FK → `files`), `verification_checks`. §5.2 indexes for these tables
  included (`attorney_licenses(attorney_id)`, `(state_code,
  license_status)`, `verification_requests(status, submitted_at)`).
- Raw SQL CHECKs: `bio ≤ 300`, `preferred_contact_note ≤ 200`,
  `username_lower = lower(username)` (makes the UQ case-insensitive by
  construction).
- `test/db-profiles-schema.e2e-spec.ts`: bar number on two attorneys
  rejected, username UQ ignores case, CHECKs enforced — 4/4.
## Cost guard — protection against runaway paid-API spend — 2026-09-27

Owner-approved spec extension (docs/OPEN_QUESTIONS.md OQ-001): "I don't
want to go bankrupt on day one if a user/bot fires hundreds of paid
requests". Owner-side provider settings: docs/COST_PROTECTION.md (RU).

- `src/common/cost-guard/` (global module): `CostGuardService.consume(provider, units)`
  called BEFORE every paid call. One Lua script checks then increments
  UTC minute/day/month counters `budget:{provider}:min|d|m:<stamp>`
  (hash-tagged, TTLs), never increments past a cap, SET-NX flags emit the
  80% `alert: 'cost_budget'` warn and the exhaustion error once per
  window. Caps from app_config `budget.<provider>.per_minute_max|daily_max|monthly_max`
  with env fallbacks (`BUDGET_*`): sms 30/min, 300/day, 5000/month; email
  100/2000/30000; id_check 5/20/200. Exhausted -> `503
  PROVIDER_BUDGET_EXCEEDED`; Redis error -> fail closed (same 503).
  Providers: `sms`, `email` (wired in `OtpService`), `id_check` (TODO for
  the identity-verification stage, file 03).
- SMS US-only: `checkSmsDestination()` (validators.ts, libphonenumber-js
  `max` metadata from the existing dependency) rejects non-allowed
  countries (Canada/Caribbean NANP, US territories unless added) and
  premium/toll-free/shared-cost types -> `400 PHONE_COUNTRY_NOT_SUPPORTED`.
  Allow-list: app_config `sms.allowed_country_codes` (default `["US"]`,
  env `SMS_ALLOWED_COUNTRY_CODES`).
- `/auth/otp/request`: per-device limit on `X-Device-Id` (10/h, docs/01
  §10.2). `/users/me/contacts/request`: 3/h + 10/day per user and the
  shared 5/h per-identifier window (previously only the global throttler).
- `main.ts`: `app.set('trust proxy', TRUST_PROXY_HOPS)` (default 0; set 1
  behind the ALB) so per-IP limits see the real client IP.
- `RedisModule` now quits its client on shutdown (graceful shutdown; also
  required for the e2e run to exit now that it is serial).
- `prisma/seed.ts`: seeds the 10 cost keys idempotently (`update: {}` so
  owner edits survive re-seeding).
- Tests: unit `cost-guard.service.spec.ts`, `validators.spec.ts`; e2e
  `test/cost-guard.e2e-spec.ts` (real Redis: cap/no over-increment,
  25-way concurrency vs cap 7, alert once, fail closed with dead Redis;
  HTTP: non-US/premium 400, app_config cap 503, velocity breaker,
  per-device 429, contacts per-user 429, trust proxy). `jest-e2e.json`
  `maxWorkers: 1` because this suite mutates global budget state;
  e2e env lifts only `BUDGET_SMS_PER_MINUTE_MAX` (1000).

### Verification (local CockroachDB + Redis via docker)
- `npm run lint`, `tsc --noEmit`, `npm run build` clean.
- Unit: 15 suites / 117 tests pass (36 new). e2e: 3 suites / 26 tests
  pass (12 new), run twice.
- Seed run twice on a throwaway database: 10 cost keys, no duplicates.

## Stage 2.4 (cases, bids, negotiation, journal, contacts, disputes, reviews) — 2026-09-27

Per docs/02_DATABASE.md §8 "Этап 2.4" / §4.D, §4.E, §6.1. Migrations
`…_stage_2_4_cases_bids_journal`, `…_stage_2_4_case_states_primary_uq`.

- Tables: `cases`, `case_states`, `bids` (UQ `case_id, attorney_id`),
  `bid_offers` (UQ `bid_id, round_no`), `case_journal` (append-only, no
  `updated_at`, `retain_until` defaults to now() + 5 years),
  `contact_disclosures` (UQ `bid_id`), `contact_issue_reports`,
  `case_disputes`, `reviews` (UQ `case_id`). All FKs `ON DELETE RESTRICT`.
  Plain §5.2 indexes included; partial/hash-sharded ones are stage 2.6.
- §6.1 CHECKs as raw SQL: round_count 0..5, non-negative amounts,
  budget_mode ⇔ budget_cents, rating 1..5, length limits.
- `case_states`: partial UQ "one primary per case" in the DB;
  `validateCaseStates()` (cases/domain) enforces 1..3 states / exactly one
  primary / no duplicates (CockroachDB 24.1 has no triggers).
- `test/db-cases-schema.e2e-spec.ts`: one bid per attorney, round_count 6
  rejected, >3 states / no primary / second primary rejected, journal row
  commits and rolls back with the case, budget and rating CHECKs — 5/5.
  The "UPDATE/DELETE journal under lawbid_app" item needs the DB roles
  and is tested with stage 2.6.
## UI modernization pass — 2026-09-27

Owner request: make every existing screen except the welcome screen look modern, polished and animated, fitting the legal theme. Direction picked with the `ui-ux-pro-max` skill ("Trust & Authority" pattern, "Accessible & Ethical" style, subtle/standard motion): brand palette and fonts from file 07 stay as they are. The pass refines elevation, spacing rhythm, surfaces and micro-interactions only.

**Welcome screen untouched.** `welcome_screen.dart` and `auth_welcome_screen_{light,dark}.png` are byte-identical to the base commit. Every shared component the welcome screen uses (`AppButton` primary/ctaBright, `AppIconButton`, `GavelStrike*`, `ScalesLogo`, `LegalText`) renders the same at rest. We checked this by comparing the welcome golden test's rendered image before and after the change: they are byte-identical. The welcome route keeps its default page transition, and the global theme has no `snackBarTheme` (the welcome screen's snackbar keeps Material defaults).

### Design-system additions
- Tokens: `AppMotion` (enter/exit curves, page 320/240ms, entrance 360ms + 55ms stagger, state change 220ms, step switch 300ms, shimmer 1400ms), new `AppSizes` (touch target, icons, medallions, nav indicator, shadows), `AppRadii.card/sheet/pill`, `AppSpacing.section/xxxl`. New color tokens are alpha variants of the approved palette only: `shadow`, `goldTint`, `dangerTint`, `successTint`, `skeletonBase`, `skeletonHighlight`, `onDanger`.
- Motion: `AppEntrance` / `staggeredEntrance()` (flutter_animate fade + short rise, effect-level delays so `pumpAndSettle` settles), `AppPressable` (0.98 press-scale), and `context.reduceMotion`. Every animation is skipped under `MediaQuery.disableAnimations`.
- Components: `AppIconMedallion` (gold/danger/success/neutral "seal"), `AppListRow` + `AppListSection` (grouped settings rows), `AppStateLayout` shared by `AppEmptyState` / `AppErrorState` / new `AppOfflineState`, `AppStepProgress`, `AppSheetHandle` + `showAppBottomSheet`, `showAppSnackBar`. `AppSkeleton` now has a sweeping shimmer instead of an opacity pulse, and the new `AppSkeletonCard` matches the shape of list rows. `AppButton` gets a `danger` variant and an opt-in `dimWhenDisabled`, and the secondary variant has a hairline border (welcome doesn't use it). `AppCard` gets an opt-in `elevated` shadow and press feedback. `RoleCard` gets the file 07 §4 press-scale and an animated selection border. The theme gets `dialogTheme`, `bottomSheetTheme` and `textButtonTheme`.
- Navigation: `AppPageTransitions` (go_router `CustomTransitionPage`s): shared-axis fade+slide for pushes (phone/otp/role/settings/devices/delete), a rise+fade modal for "+" create, and a fade into the shell. Tab switches fade the body in without remounting the `indexedStack`. The bottom nav has an animated gold pill behind the selected icon, a selection haptic, and a gold-ringed "+" with press feedback.

### Screens
- Settings: the same rows, order and handlers, grouped into 4 captioned elevated sections (Account / Preferences / Support / Session) with icon medallions and a staggered entrance. The theme picker sheet is restyled.
- Active devices: skeleton cards while loading, an offline state for `ApiException.isNetworkError`, a subtitle, elevated cards with a platform medallion, a staggered entrance and a gold pull-to-refresh.
- Delete account: a danger-toned 3-step progress bar, animated step cross-fade, medallions for warning and success, and a real `AppButton.danger` in place of the raw `ElevatedButton`.
- Phone / OTP / role: staggered entrance only. The resting layout is unchanged (role screen per file 07 §6.4).
- Profile / feed / search / mine / create: branded empty states. The profile gear and the create close button are now labelled 44x44 targets. Language picker: rounded sheet, handle, bordered rows with an animated selected state, and a staggered list.
- All back arrows in settings, devices and delete account now use `AppBackButton`.

### i18n
New keys (en+ru) in `static_translator.dart` and `apps/api/prisma/seed/translations_seed.xlsx` (116 → 124 rows): `offline.title`, `offline.message`, `common.stepOf`, `common.close`, `settings.section.{account,preferences,support,session}`. Pre-existing gap, not fixed here: 3 older keys in `static_translator.dart` are still missing from the xlsx.

### Pre-existing test/analyzer failures fixed (not caused by this pass)
- Auth golden tests threw `MissingPluginException(path_provider)` because they opened the real drift DB. The fix overrides `l10nDatabaseProvider` with `L10nDatabase(NativeDatabase.memory())`.
- 2 `GavelStrikeButton` tests assumed `strike: true` by default. The owner changed that default on 2026-09-23 and it stays; the tests now pass `strike: true` explicitly.
- `scales_logo_static_{light,dark}.png` were regenerated. `scales_logo.dart` is unchanged from base; the 0.76% difference comes from toolchain rendering drift.
- Removed the deprecated `plugins: - custom_lint` from `analysis_options.yaml`. `custom_lint` is no longer a dependency.
- Fixed `unawaited_return_in_try_block` in `l10n_repository.dart` (`return await`).
- `dart fix` + `dart format` were applied to the files this pass touched. Infos went from 756 to 526; the rest are in untouched files, including `welcome_screen.dart`, which has to stay unmodified.

### Goldens
Regenerated (intentional changes): `app_bottom_nav_*`, `auth_{phone,otp,role}_screen_*`. These were also stale at base; their resting render matches base. New: `app_states_*`, `settings_screen_*`, plus a reduce-motion widget test.

### Known remaining failure
`auth_welcome_screen_{light,dark}.png` still fails, as it did at base (19%/28% diff). The committed baseline predates later owner-approved welcome changes: English default, top theme/language buttons, layout. It fails whether or not the drift fix is in, and this pass is not allowed to regenerate it. The owner should re-baseline it in a separate commit.

### Verification
- `flutter analyze --no-fatal-infos`: 0 errors, 0 warnings.
- `flutter test`: 34 pass, 2 fail (only the stale welcome goldens described above).

## Stage 2.5 (feed, chats, notifications, subscriptions, moderation, audit) — 2026-09-27

Per docs/02_DATABASE.md §8 "Этап 2.5" / §4.F–§4.J. Migration
`…_stage_2_5_feed_chat_notifications_billing_admin`, no drift; DB now has
59 application tables.

- 4.F: `posts`, `post_media` (UQ post+position), `tags` (UQ tag_lower),
  `post_tags`, `comments` (one nesting level), `post_likes`,
  `comment_likes`, `follows` (CHECK follower ≠ followee), `saved_items`.
- 4.G: `conversations` (UQ case+attorney), `conversation_participants`,
  `messages` (UQ conversation+sender+client_message_id).
  `conversations.last_message_id` is a bare uuid (an FK would make every
  message insert a cycle).
- 4.H: `notifications`, `notification_settings`, `notification_quiet_hours`,
  `push_tokens` (UQ fcm_token, cascades with the session).
- 4.I: `stripe_customers`, `subscriptions` (UQ user), `payments`,
  `stripe_webhook_events` (PK = Stripe event id → idempotent webhooks).
- 4.J: `reports`, `moderation_actions`, `admin_profiles`, `audit_log`,
  `data_access_requests`, `data_access_log`.
- Cascades only on auxiliary rows (likes, saves, follows, tags,
  participants, media, push tokens, notification prefs) per §1.4.
- `test/db-social-billing-schema.e2e-spec.ts`: duplicate
  client_message_id rejected, repeated webhook rejected, repeated like
  idempotent, self-follow rejected — 4/4.

## Stage 2.6 (raw SQL: indexes, computed columns, roles) — 2026-09-27

Per docs/02_DATABASE.md §8 "Этап 2.6" / §5, §6.2–6.3. Migration
`…_stage_2_6_raw_sql_indexes_roles`. Prisma's diff ignores partial and
inverted indexes, so they coexist with `schema.prisma` without drift
(verified); computed columns are declared read-only in the schema
(`users.full_name_lower String?`, `posts/cases.search_tsv
Unsupported("tsvector")?`).

- Computed STORED columns (§5.3): `users.full_name_lower`,
  `posts.search_tsv`, `cases.search_tsv`.
- Partial indexes (§5.2) replacing plain ones: attorney case feed,
  client "My cases", open-activity and auto-close crons, open cases by
  practice (for §5.4), active sessions, unread notifications, author's
  published posts.
- Hash-sharded (§1.1, 16 buckets): global published-posts feed,
  `auth_events(created_at)`, `audit_log(created_at)`.
- GIN / trigram / full-text (§5.3): username and full-name trigram, tag
  trigram, posts and cases tsvector, attorney languages, client preferred
  languages.
- Roles (§6.3): `lawbid_migrator`, `lawbid_app` (DML; only INSERT/SELECT on
  the six append-only tables of §6.2), `lawbid_retention` (SELECT/DELETE on
  `case_journal`; the `retain_until < now()` filter is the job's — no RLS in
  CockroachDB 24.1), `lawbid_readonly` (SELECT except identity, contact,
  message and document tables). No passwords in migrations. Database-level
  privileges are left to infrastructure because the DB name differs per
  environment (CONNECT is granted to `public` by default).
- Found and fixed before commit: the first draft hard-coded
  `GRANT … ON DATABASE lawbid`, which would have failed in CI/prod where
  the DB is named differently.

## Stage 2.7 (tests, withTxRetry, documentation) — 2026-09-27

Per docs/02_DATABASE.md §8 "Этап 2.7".

- `withTxRetry()` default raised 3 → **5** attempts (§1.1 "до 5 попыток").
  New `test/db-tx-retry.e2e-spec.ts` triggers a *real* CockroachDB 40001
  with `crdb_internal.force_retry()` (preceded by a plain SELECT, otherwise
  CockroachDB silently retries the first statement server-side): retried
  once and succeeds; gives up after `maxAttempts`.
- `test/db-roles-indexes.e2e-spec.ts` (7 tests): role grants (also the
  2.4 item "UPDATE/DELETE journal under lawbid_app is rejected"), search
  by fuzzy username / full name / tag / post and case text, §5.4 "cases
  visible to an attorney" returns exactly the right rows (primary and
  secondary state, pending license, wrong practice, closed), and EXPLAIN
  of §5.4 + the §5.2 case queries has no FULL SCAN on `cases` (lookups by
  primary key after an index are allowed).
- `docs/db/ERD.md` (Mermaid, 59 tables) generated by
  `npm run db:erd --workspace apps/api` (`apps/api/scripts/generate-erd.ts`).
- CI (`api-ci.yml`): new "no drift between schema.prisma and migrations"
  (`prisma migrate diff --exit-code`, §7.1) and "ERD is up to date" steps.
- e2e speed: a fresh CockroachDB takes ~10 min to migrate (each DDL is a
  schema-change job). The e2e database is now `<db>_e2e_<hash of
  migrations>`: rebuilt only when migrations change, otherwise TRUNCATEd
  (full suite: ~30 s instead of ~10 min).
- Migrations apply on a clean DB (e2e build) and on the previous-version
  dev DB (incremental `migrate deploy`).
- Totals: unit 18 suites / 126 tests; e2e 10 suites / 57 tests; lint,
  tsc, build clean; `prisma migrate diff`: no drift.

### File 02 Definition of Done (§9)
- [x] Stages 2.1–2.7 done, acceptance tests pass.
- [x] `prisma validate` and `prisma migrate diff` clean.
- [x] All tables, enums and indexes of file 02 exist (59 tables, 44
  enums); nothing extra except `sessions.session_chain_id` (stage 1.4,
  see stage 2.2 notes) and `id`/timestamps on tables whose §4 lists omit
  them.
- [x] Seed idempotent; reference data matches §3 (51 states, 42
  categories, 344 specializations — the §3.2 list itself).
- [x] Append-only protection tested under `lawbid_app`.
- [x] No sequential IDs; no `ON DELETE CASCADE` on legally significant
  tables.
- [x] `docs/db/ERD.md` created.
- [x] No TODO without a spec reference in the new code.

## Keys wiring — credential-driven provider activation — 2026-09-27

Owner requirement: "real keys will be pasted one by one; each must work
immediately". No real keys exist yet; everything runs on mocks until they
are pasted. Owner guide (Russian, ordered table): `docs/KEYS_SETUP.md`.
Recorded as OQ-002 in `docs/OPEN_QUESTIONS.md`.

### Backend (`apps/api`)
- `src/config/provider-selection.ts` (new, pure): `SMS_PROVIDER` /
  `EMAIL_PROVIDER` now accept `auto` (new default) | `mock` | `twilio`/
  `ses`. `auto` picks the real provider as soon as all its credentials are
  present, else mock. In `staging`/`production` mock is never allowed
  (explicit or via auto) — missing credentials fail boot with one zod
  issue per missing var. Forcing `twilio`/`ses` without creds fails in
  every env (previous behavior). The choice + missing vars are logged at
  boot (`SMS provider selected` / `Email provider selected`).
- `env.schema.ts`: blank values (`KEY=`) count as unset; format checks
  for every credential (Twilio `AC…`/32-hex token/E.164/`MG…`, AWS region,
  SES from address, AWS key pair, Google client ids
  `….apps.googleusercontent.com`, Apple bundle ids / team id,
  `SEED_ADMIN_EMAIL`). Reserved, format-checked only (no code reads them
  yet): `STRIPE_SECRET_KEY` (live key only in production, test key never
  in production), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `S3_*`
  (`S3_ENDPOINT` refused when deployed), `FCM_*` (all or none). Deployed
  envs refuse placeholder secrets (`CHANGE_ME…`, test values) in
  `JWT_KEYS`/`OTP_*`/`AUTH_EVENT_PEPPER`.
- Bug fix: `OTP_DEV_FIXED_CODE` / `FEATURE_ATTESTATION` used
  `z.coerce.boolean()`, which parses the string `"false"` as `true` —
  `OTP_DEV_FIXED_CODE=false` would have enabled the fixed code in dev and
  blocked every production boot. Now strict: `true|1` / `false|0|blank`,
  anything else is a validation error.
- Twilio: new optional `TWILIO_MESSAGING_SERVICE_SID` (US A2P 10DLC
  sender pool) as an alternative to `TWILIO_FROM_NUMBER`; wins if both.
  Still the Messages API, not Verify (stage 1.4 decision, file 01 §10.6).
- `.env.example`: every variable, empty, with where-to-get comments.

### Mobile (`apps/mobile`, config/wiring only — no UI changes)
- `lib/core/config/app_config.dart`: single source of build-time client
  ids (`API_BASE_URL`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_SERVER_CLIENT_ID`,
  `STRIPE_PUBLISHABLE_KEY` reserved) via
  `flutter run --dart-define-from-file=config/dev.json`; template
  `config/dev.example.json`, real `config/*.json` gitignored.
- `social_auth_native_client.dart`: passes `clientId`/`serverClientId`
  to `GoogleSignIn.initialize`; on iOS without a client id throws a clear
  `StateError` instead of letting the native SDK abort.
- iOS: Info.plist URL scheme is now `$(GOOGLE_REVERSED_CLIENT_ID)`;
  Debug/Release.xcconfig set a harmless default and `#include?` the
  gitignored `ios/Flutter/Secrets.xcconfig` (template
  `Secrets.example.xcconfig`, also optional `DEVELOPMENT_TEAM`).
- `.gitignore`: mobile config json, `Secrets.xcconfig`,
  `GoogleService-Info.plist`, `google-services.json`, symlinked
  `node_modules` (worktrees).

### Verification (local CockroachDB + Redis via docker)
- `npm run lint`, `tsc --noEmit`, `npm run build` clean.
- Unit: 18 suites / 152 tests pass (32 new: `provider-selection.spec.ts`,
  `env.schema.spec.ts`). e2e: 6 suites / 39 tests pass; boot log shows
  mock selected with the missing Twilio/SES vars listed.
- `flutter analyze` on touched files: no new issues (4 pre-existing infos).
- Not verified: real Twilio/SES/Google/Apple calls (no keys yet).


## Stage 1.7 (mobile: auth + onboarding wired to the backend) — 2026-09-27

Branch `cursor/stage-1-7-onboarding-mobile`. Implements docs/01_FOUNDATION_AUTH.md §10.2, §11 and the §15 "Этап 1.7" mobile scope on top of the stage-1.7 backend (`/users/me*`).

### Session + routing
- `CurrentUserController` (features/onboarding/application) — the "SessionState driven by `GET /users/me`": loads when a session appears, resets on sign-out, replaced wholesale by every `/users/me*` mutation (they all return the fresh MeView). `currentUserRoleProvider` now reads the role from it (falls back to the JWT `role` claim); the hardcoded-client stub `shared/domain/current_role_provider.dart` is deleted.
- `AppRouterGuard` (core/navigation/guards/app_router_guard.dart) replaces `authGuardRedirect` and is the only redirect decision point. It implements every row of the §11 table from the server's `missing` list + `onboarding.currentStep`. go_router re-runs it through `refreshListenable` whenever startup, sign-in/out or me changes. Screens only mutate server state; they never navigate forward. Resume-after-restart is server-driven, so `OnboardingLocalStore` is removed.
- Two refinements, both documented in the guard and covered by tests:
  1. Шаг 1 «Язык» runs before consents for a brand-new account.
  2. Going back to an earlier onboarding step is allowed. Skipping forward is not.
- New `/splash` initial route (§10.2 A). `AppStartupController` runs the session refresh, `/config/bootstrap` and the translation-bundle refresh (time-boxed, 4 s), then `GET /users/me`. These moved out of `main.dart`. A network failure during the refresh no longer wipes the stored refresh token; the splash shows offline + Retry instead.

### Screens (all use the UI-modernization components/tokens: `OnboardingScaffold` with step progress + back, staggered entrances, sticky CTA, inline error banner)
- Splash: loading, offline and error states, each with Retry.
- Email sign-in `/auth/email`. It reuses the OTP screen, which now handles both channels. The entry point is a "Use email instead" link on the phone screen, because welcome_screen.dart is frozen by owner decision.
- `/onboarding/language`: active languages from `/i18n/languages`, switches the UI live, persists `uiLanguage`.
- `/onboarding/consents`: 18+, Terms+Privacy, a separate disclaimer card and optional marketing email/push/analytics. The Continue button stays active; tapping it early highlights what's missing (file 07 §4). Documents open in the new in-app `/legal/:docType` viewer, fed by bootstrap `legal_documents` (now parsed).
- `/onboarding/role`: the existing screen, now calling `POST /users/me/role` and then `/auth/refresh` for the role claim. A 409 for the same role counts as success.
- `/onboarding/contacts`: phone and email cards verified inline (client: both required; attorney: phone required, email recommended). Status pills plus a footnote show exactly what's missing.
- `/onboarding/profile`:
  - client: name, state (50+DC local list), preferred languages, contact method and time;
  - attorney: name, bio ≤300 with a counter, firm, languages, licensed states (multi).
  - Everything except the name is stored in `onboarding.data.profile`.
- `/onboarding/push`: explainer with Allow/Not now. No FCM yet; the choice is saved as `pushOptIn` (TODO file 05).
- `/onboarding/verification` (attorney, Шаг 4B): checklist with "Verify now" (→ `/verification` placeholder, TODO file 03) and "Later".
- `/onboarding/tour`: 3 role-specific skippable pages. Finishing calls `POST /users/me/onboarding/complete`; on 403 it re-reads me and the guard routes to what's missing.
- Mine tab: an attorney with `verified: false` sees the verification CTA (§11 row 7).
- Settings: "Download my data" stub (TODO file 06). Log out and Legal are now wired.

### Network
- `IdempotencyInterceptor` puts an `Idempotency-Key` on resource-creating POSTs (opt-in via `RequestFlags.createOptions()`: role, consents, contacts/request, onboarding/complete). The key survives retries.
- `RetryInterceptor`: exponential backoff with jitter, 3 retries.
  - Retries only idempotent methods or keyed POSTs, and only on timeouts/connection errors or a bare 502/503/504.
  - Never retries `PROVIDER_BUDGET_EXCEEDED` or a plain POST such as `/auth/refresh` (a replayed refresh would look like token reuse).
  - The i18n background calls opt out.
- The existing single-flight refresh is unchanged.
- Localized messages by error code (`core/l10n/api_error_text.dart`): `CONTACT_DOMAIN_BLOCKED`, `CONTACT_ALREADY_EXISTS`, `PHONE_COUNTRY_NOT_SUPPORTED`, `PROVIDER_BUDGET_EXCEEDED`, `AUTH_OTP_*`, `REAUTH_*`, `CLIENT_CONTACTS_INCOMPLETE`, `ONBOARDING_INCOMPLETE`, `ROLE_ALREADY_SET`, rate limits with retry-after, and others. `OnboardingFlow` no longer contains hardcoded Russian strings.

### Hardcode cleanup
- `'US +1'` → `t('auth.phone.countryCode')` (shared `CountryCodeChip`/`UsPhoneFormatter`).
- The phone hint moved to `t()`.
- `RoleCard`'s `'PRO'` → `proBadgeLabel` param (`t('onboarding.role.attorney.badge')`).
- `brand_glyphs` fallback `Color(0xFF000000)` → the `text` token.
- `delete_account_screen` had already been cleaned by the UI pass.

### L10n
- 146 new keys, en+ru, in `static_translator.dart`.
- The same keys plus 3 pre-existing missing `app.update.*` rows were appended to `apps/api/prisma/seed/translations_seed.xlsx`. It now has 273 rows, the same set as the static maps.

### Tests (`flutter test`: 151 pass; `flutter analyze --no-fatal-infos`: 0 errors/warnings)
- `app_router_guard_test.dart`: 55 table cases covering every §11 row plus splash, loading, back and forward navigation.
- `interceptors_test.dart`: idempotency + retry/backoff.
- `onboarding_repository_test.dart`: dio with a fake adapter; request shapes, `X-Reauth-Token`, 409/403 handling, error-code mapping.
- `onboarding_widgets_test.dart`:
  - consents validation;
  - inline contact verification;
  - profile required fields;
  - 200% text scale on every onboarding screen.
- `onboarding_screens_golden_test.dart`: 12 screens in light and dark.
- Phone and settings goldens were re-baselined for the new link/row. Welcome, OTP and role goldens are unchanged, and `welcome_screen.dart` is byte-identical.
- Smoke-tested against the dev API (`OTP_DEV_FIXED_CODE`). This used the replayed request sequence, not the app UI. Path: email sign-in → consents → role (plus 409 on repeat) → refresh gives the role claim → complete returns 403 with `missing` → `contacts/request` returns `REAUTH_REQUIRED` without reauth, and relay email returns `CONTACT_DOMAIN_BLOCKED` → reauth → phone request/verify → profile → complete returns 200.

### Flagged for the owner / backend (not changed here)
- `POST /users/me/contacts/request` sits behind `ReauthGuard` even for a user's FIRST phone/email. Onboarding therefore needs an extra identity code sent to the contact the user signed in with, and every resend needs a new one, because the reauth token is single-use. The app handles this inline, but it costs an extra paid SMS/email per contact. Suggested fix: require reauth only when *changing* an already-verified contact of that type.
- `/config/bootstrap` `legal_documents` omits `id`, so consents are saved without `documentId` (the version isn't linked). Suggested fix: include `id`.
- The welcome screen's email icon still shows "not built yet", because the file is frozen. Email sign-in is reachable from the phone screen.
- Not in this pass:
  - photo upload (needs the S3 pipeline);
  - the real push prompt/FCM (file 05);
  - the verification wizard (file 03);
  - data export (file 06);
  - theme sync to `PATCH /users/me` (theme stays local-only; language is synced on the language step).
