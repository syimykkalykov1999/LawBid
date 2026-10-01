# Changelog


All notable changes to this project are documented here, per
.cursorrules (each stage ends with a CHANGELOG update + commit on
branch cursor/stage-X-Y-description).

## Owner pass 8 (2026-09-30) — OQ-045

- Flush "Comments" row under a case description; full names in the chat list; centred case photos and files.
- "Calls" notification category (migration `20261001000000_owner_calls_notification_category`): incoming-call push and missed calls follow it.
- Pending direct requests: no call button; "Request sent" on my own request row.

## Owner pass 7 (2026-09-30) — OQ-038 follow-up, OQ-040

- Client profile counters sized like the attorney's; rating moved into the Reviews tab with the 5→1 distribution, star filter and date sort (`GET /clients/:id/reviews/summary`, `?rating&sort`).
- Voice messages in chats (OQ-040): migration `20260930160000_owner_chat_voice`, `chat_voice` files, send/listened API, push text, moderation link, export and deletion; app recorder (hold, slide to cancel, lock), player with waveform, seek and speed; e2e `owner-chat-voice`.
- In-app audio calls (OQ-041): `calls` API, signaling relay, TURN (coturn), missed-call notifications, call log in chats; app call screen, CallKit incoming UI, push ringing; e2e `owner-calls`, unit tests for the call state machine.
- @username mentions (OQ-042): suggestions while typing "@", tappable mentions in posts/comments, `mention` notifications; e2e `owner-mentions`.
- Direct chats and message requests (OQ-043): "Message" on profiles, Requests folder with count, accept/delete/block, 3-message limit, hidden Seen; e2e `owner-direct-chats`.
- Sounds (OQ-044): ringback/busy/end tones, 30 s auto end, message chimes; mic quick-tap fix; tighter top bars (goldens updated).
- `docs/REMAINING.md`: what is left after checking every owner request against the code.

## Owner pass 6 (2026-09-30) — OQ-035…039

- Search redesign and per-tab filters (OQ-035/036); compact counters, share counters, double-tap like, swipe back everywhere (OQ-037).
- Client profile like Instagram: client posts, followers/following, "Posts" and "Reviews from attorneys" tabs, attorney → client reviews (`client-reviews` module, migration `20260930150000_owner_client_profile_social`); "My cases" removed from the client's Search (OQ-038).
- "Mine" cards redesigned: practice photo banner, practice chip, status, meta icons, footer; practice added to work items and bid case refs.
- Case wizard: privacy note above Publish (OQ-039).

## Owner pass 5 (2026-09-30) — OQ-034

- API: case comments module (`/cases/:id/comments`, `/case-comments/:id/*`), migration `20260930130000_owner_case_comments_attachments`, counters/moderation/reports/notifications/export wired; case feed `practiceCategory` filter, `commentCount`/`isSaved` on feed items; post state filter and `/search/latest-posts`; `case_attachment` files (PDF, DOCX); e2e `owner-case-comments`.
- Mobile: shared topic + state filter for posts and cases; case cards with comments/share/time/save; case comments screen; documents in the case wizard and detail; photo gallery; whole post photos over blur; animated scales in feed and profile headers; 43 practice photos.
- Dev: `scripts/seed-demo-all.mjs` — a post and a case in every practice.

## Owner pass 4 (2026-09-30) — practice art + demo content

- Mobile: bundled practice photo art (`assets/practice_art/`) for family law, immigration, criminal defense, traffic tickets and DUI; other categories keep the gold glyph fallback until photos are supplied.
- Mobile: feed header shows the animated scales (welcome-screen logo, header size) instead of the text wordmark; feed post photos are a 2:1 band so a whole card fits one screen (the opened post keeps the original ratio); case art can be keyed by a leaf practice (e.g. CDL) before its category.
- Mobile (OQ-033): full-height edge-to-edge feed cards for posts and cases with our default practice photo when a post has none; topic slider for attorneys; case filters share the row; profile "⋯" moved to the top bar; firm field and "+" aligned. API: at most 9 photos per post.
- API: `scripts/seed-demo.mjs` (dev only, idempotent) — demo verified attorneys with photo posts and demo clients with cases (incl. Illinois traffic cases), published through the real OTP / files / posts / cases API.

## Owner pass 3 (2026-09-30) — OQ-029/030

- Name/username changes no longer reset a verified attorney (OQ-029); several firms per attorney (`firm_names`, `firms`, OQ-030); "Add a state (license)" from Edit; tap anywhere hides the keyboard; frameless in-app icon buttons by default (welcome keeps frames); profile header: counters beside the avatar, name under it, no "★ · New" line.

## Owner UI pass (2026-09-29, after phone testing) — OQ-026/027/028

- **People search for both roles** (`GET /search/people`): attorneys AND clients by @username / first / last name, one ranked list; clients now have `@username`s (`client_profiles.username`, one namespace with attorneys via `UsernameRegistry`, lazy allocation for existing rows, editable in the client profile with the same cooldown/reserved/taken rules), a public mini-profile `GET /clients/:username` and appear in an attorney's followers list (`PersonItemDto`).
- **Block system** (OQ-028): `user_blocks`, `PUT/DELETE /users/:id/block`, `GET /users/me/blocks`; guards in chat send, follow, People search; `isBlocked`/`hasBlockedMe` on public profiles; app: Block/Unblock in profile "⋯" and chat menu, Settings → Blocked users.
- **In-app UI**: centered "LawBid" wordmark and lower feed header, hidden status bar in-app, segmented tabs (no tint/underline), rounded bottom nav, "@username" profile headers, Mine/Profile/Messages titles removed, search field on top with sections below, cases-feed filters over all states/practices with searchable full-height sheets, frameless header icon buttons, Telegram-style bubble alignment, Publish dimmed until consent, iOS swipe-back (`CupertinoPage`), quiet-hours toggle clear of the gesture bar.
- Tests: `test/owner-people-search.e2e-spec.ts`, `test/owner-blocks.e2e-spec.ts`; stage-5-5 follower expectation updated (clients listed); mobile goldens regenerated.

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

## Fix: stage 2.6 broke Prisma introspection — drift checks were false — 2026-09-27

Found while starting stage 3.1: `prisma migrate diff` printed nothing and
exited 0 even with real schema changes pending. Root cause: Prisma's schema
engine **panics** when it introspects a CockroachDB `USING HASH` index
(`sql-schema-describer/src/postgres.rs: unwrap() on None`), and the CLI
swallows the panic. Every "no drift" claim made after the stage 2.6
migration (the 2.6/2.7 entries and the file 02 DoD checkbox) was therefore
unverified. Corrected:

- Migration `…_stage_2_6_fix_explicit_shards`: the three hash-sharded
  indexes (`posts` global feed, `auth_events`, `audit_log`) are replaced by
  an explicit STORED column `created_shard = mod(fnv32(id), 16)` and a plain
  `(created_shard, created_at)` index. Writes still spread across 16 ranges
  (§1.1). Probing showed that on this CockroachDB even the native
  hash-sharded index gave a full scan + top-k for the feed query, so nothing
  was lost; the global feed (stage 5.3) will read 16 limited per-shard scans
  merged by `created_at`.
- Migration `…_stage_2_6_fix_partial_trigram`: the three trigram GIN indexes
  are recreated as *partial* (`WHERE col IS NOT NULL`). Prisma's CockroachDB
  connector can't declare `gin_trgm_ops`, so it wanted to drop them; it
  ignores partial indexes. EXPLAIN confirms `LIKE '%term%'` uses them; the
  `%` similarity operator does not use any trigram index on this version, so
  search (stage 5.6) filters with LIKE and ranks with `similarity()`.
- `schema.prisma` now declares the remaining GIN indexes (array and
  tsvector), the `(created_shard, created_at)` indexes and the computed
  column expressions, so the diff matches the DB exactly. Also corrected: my
  earlier note that "Prisma ignores partial *and inverted* indexes" — only
  partial ones are ignored.
- Verified for real this time: introspection returns 59 models and
  `migrate diff` is `-- This is an empty migration.`
- CI drift step hardened: it first asserts `prisma db pull --print`
  returns models (> 0), so a silent engine panic now fails CI instead of
  passing it.
- e2e rebuilt from scratch with all migrations: 10 suites / 57 tests; unit
  158/158.
- Environment note: the running dev container `lawbid-cockroach-1` is
  CockroachDB **v25.3** (left over from an older compose project), while
  `docker-compose.yml` pins v24.1.5. Code stays 24.1-compatible (no
  triggers/RLS relied on).

## Fix: reauth only when changing a contact; legal document ids — 2026-09-27

Two backend gaps reported by the stage 1.7 mobile work:

- `POST /users/me/contacts/request` required a reauth token even for a
  user's FIRST phone/email, so onboarding cost an extra paid identity code
  per contact (and per resend). docs/01 §11 step 3A only requires reauth to
  *change* a contact. Reauth validation moved from `ReauthGuard` into a
  reusable `ReauthVerifier` (guard delegates to it; `DELETE /users/me` is
  unchanged); `contacts/request` calls it only when the user already has a
  verified contact of that type. Mobile: the identity step now appears only
  for replacements; a first contact goes straight to its own code.
- `GET /config/bootstrap` `legal_documents` now includes `id`; the consents
  step sends it as `documentId` for terms/privacy/disclaimer, so the
  accepted document version is recorded (§10.2 H).
- Tests: e2e `onboarding.e2e-spec.ts` +2 (first contact without reauth →
  201, changing a verified one → `REAUTH_REQUIRED`; bootstrap docs carry
  `id`); Flutter contacts-step widget test updated to the new flow.

## Stage 3.1 (migration and module skeletons) — 2026-09-27

Per docs/03_VERIFICATION_PROFILES.md §11 "Этап 3.1", §9, §10. Migration
`…_stage_3_1_verification_profiles` (generated from a verified-working
introspection: 59 models, then empty diff).

- §10 columns: `attorney_profiles.username_changed_at`, `reviews.edited_at`,
  `verification_documents.side` (CHECK front|back),
  `verification_requests.info_request_message / applicant_comment (CHECK
  ≤ 500) / rejection_code`, `attorney_licenses.rejection_code /
  rejection_note`; enum `notification_type` + `review_requested`,
  `review_received`. `verification_documents(request_id)` index already
  existed (stage 2.3).
- Modules `verification`, `profiles`, `reviews` registered; interfaces
  `BarLookupProvider` / `IdVerificationProvider` with `manual`
  implementations returning `manual_review` (paid adapters come behind
  flags in 3.4 and must consume CostGuard `id_check`).
- `AppSettingsService` (global): typed reads of §9 keys through the
  Redis-cached `AppConfigService`, falling back to the spec defaults on a
  missing/wrong-typed value. Defaults live in one place
  (`app-settings.defaults.ts`) and are seeded with `update: {}` so an
  admin-edited value is never overwritten. `profile.reserved_usernames`:
  §9 gives no contents, so a starter list of platform/route names.
- Tests: unit +5 (settings typing/fallbacks, manual providers); e2e
  `stage-3-1.e2e-spec.ts` (modules boot, values read and cached in Redis,
  §10 columns exist). Also made the 2.7 EXPLAIN test deterministic
  (`ANALYZE` first — a fresh DB has no stats and the plan choice varied).
- Totals: unit 163/163; e2e 11 suites / 62 tests; lint, tsc clean.

## Onboarding language step removed; clearer phone errors — 2026-09-27

- Owner decision (OQ-006): the "Language" onboarding step duplicated the
  welcome screen's globe picker and, on real devices, did not advance on
  "Continue". Removed: screen, route, guard branch, progress segment,
  `saveLanguage`, server `ONBOARDING_STEPS` value. A saved `language` step
  parses as "no step" and lands on consents. Onboarding goldens
  regenerated (one progress segment fewer; consents has no back button);
  welcome goldens untouched.
- Phone sign-in: every refused +1 number showed "numbers from this country
  aren't supported", even for a mistyped US number. The message now follows
  the server's `details.reason`: non-existent US number → "check the area
  code, e.g. (202) 555-1234"; non-mobile/premium line → "use a US mobile
  number"; non-US +1 country (e.g. 345 Cayman) keeps the country message.
  Keys added en+ru (static translator + translations_seed.xlsx).
- Tests: Flutter 149/149 (+3 api_error_text); API unit 163/163.

## p12 — closing files 01/02/07 (2026-09-27)

Work split into verified leaves (unlazy scope p12); each leaf gate was re-run on the merged branch by the driver.

## p12 leaf 1.1 — api-db (docs/02 §1.4, §3.3, §6.4, §8 stage 2.7) — 2026-09-27

- **Soft delete by default (§1.4).** `PrismaService` is now the client
  extended with `src/prisma/soft-delete.extension.ts`: reads
  (findMany / findFirst(OrThrow) / findUnique(OrThrow) / count / aggregate /
  groupBy) of every model with a `deleted_at` column — list derived from the
  Prisma DMMF (today User, File, Case, Post, Comment, Message) — add
  `deleted_at: null`. Nested to-many `include`/`select` and `_count` are
  filtered too. Opt-out: `withDeleted(where)` / `onlyDeleted(where)` or any
  explicit `deleted_at` condition (also inside AND/OR/NOT). Writes are not
  rewritten; deletes are not turned into soft deletes; to-one includes and
  raw SQL are not filtered (documented in the extension).
  Auth paths that must still see deleted accounts opt out explicitly:
  social-login email collision check, refresh and reauth user lookup,
  contacts `hasVerified` (reauth gate). OTP/social login already read the
  user through the identifier include, so `ACCOUNT_DELETED` still works.
- **Sessions (§6.4 / docs/01 §10.6).** Migration
  `20260927220000_p12_sessions_user_device_idx`: index
  `sessions(user_id, device_id)` for `SessionService.isNewDevice` (was a
  full scan). Applied to the dev DB.
- **Jobs (docs/01 §5.2, docs/06 §6).** `src/jobs`: BullMQ `cron` queue with
  job schedulers under fixed ids (one schedule regardless of instance
  count; stale schedulers removed on boot), worker with concurrency 1,
  3 attempts with exponential backoff, bounded job history.
  - `sessions.cleanup` daily 03:15 UTC: deletes expired sessions and
    terminally revoked ones older than 30 days (rotated rows kept until
    expiry for reuse detection); PK-ordered 1000-row batches, no hot-spot
    index on `expires_at`.
  - `otp.cleanup` daily 03:45 UTC: removes `otp:*` / `rl:*` Redis keys that
    have no TTL (atomic check-and-UNLINK in Lua); TTL-bound keys untouched.
  - `disposable-domains.refresh` monthly (1st, 04:30 UTC): fetches
    `DISPOSABLE_DOMAINS_URL` via an injectable fetcher (timeout, 5 MB cap),
    validates (domain syntax, ≤1% bad lines, 1k–200k domains, refuses to
    shrink by >50%), inserts new / deletes stale `disposable` rows in
    1000-row chunks, never touches `apple_relay` (or any non-disposable)
    rows; on any failure logs a warning and keeps the table.
  - Runs inside the API while `JOBS_ENABLED=true` (default);
    `src/worker.ts` (`node dist/src/worker.js`) is the dedicated worker
    entrypoint (always runs jobs).
  - New env: `JOBS_ENABLED`, `DISPOSABLE_DOMAINS_URL` (env.schema.ts,
    .env.example). New dependency: `bullmq`.
- **Upgrade migration check (§8 stage 2.7).**
  `scripts/migrate-from-previous.mjs`: throwaway DB at the previous
  migration set (MIGRATE_PREV_REF, else newest release tag, else the parent
  of the last commit touching prisma/migrations / HEAD for uncommitted
  ones), files read from git and compared byte-for-byte with the working
  tree, seeded, upgraded with `migrate deploy`, then asserts full status,
  no drift, > 50 introspected models and surviving rows; drops only its own
  DB. Added to `api-ci.yml` (checkout `fetch-depth: 0`, timeout 45 min).
- Tests: `src/prisma/soft-delete.extension.spec.ts`, `src/jobs/**.spec.ts`,
  `test/db-soft-delete.e2e-spec.ts`, `test/db-sessions.e2e-spec.ts`
  (EXPLAIN of the exact captured isNewDevice SQL after ANALYZE),
  `test/jobs.e2e-spec.ts` (real queue + two worker instances).

## leaf-1.2 — API production hardening and remaining docs/01 §10.6 security items

### Infrastructure (docs/01 §7, §13)
- `GET /health/ready` now checks CockroachDB (`SELECT 1`) and Redis (`PING`),
  each with a 1.5 s timeout; 503 when either is down. `/health/live` stays
  dependency-free. Health routes skip the per-IP throttler (LB probes).
- `main.ts` delegates to `src/app.setup.ts#configureApp`: `enableShutdownHooks()`
  (Prisma/Redis close cleanly on SIGTERM), `helmet` (CSP + HSTS in
  production/staging; CSP relaxed only where Swagger is served), trust proxy,
  ValidationPipe, global prefix. Swagger `/docs` and `/docs-json` are **not
  mounted when `NODE_ENV=production`**.
- pino `genReqId` and `RequestIdMiddleware` share `resolveRequestId()`: the
  request log `req.id` always equals the `X-Request-Id` response header.
  Unsafe incoming ids (control chars, >128 chars) are replaced by a UUID.
- `GET /config/bootstrap`: languages, bundle versions and current legal
  documents are Redis cache-aside (`config:bootstrap:content`, 30 s TTL, like
  feature flags). Bundle versions are overlaid with the per-language key that
  the i18n import already writes on commit, so an import is visible at once.
- `IdempotencyInterceptor`: atomic claim (`SET NX`, 60 s pending TTL) instead of
  GET-then-SET. Only one concurrent duplicate runs the handler; others get
  **409 `IDEMPOTENCY_KEY_CONFLICT`** (`details.reason='in_progress'`,
  `Retry-After: 1`), no waiting. The result is stored before the response is
  sent and replayed for 24 h. Handler errors release the key (not cached).
  The same key with a different body gets 409 (`reason='payload_mismatch'`).

### Auth (docs/01 §10.2–§10.6)
- Refresh rejects suspended/deleted users (403 `ACCOUNT_SUSPENDED` /
  `ACCOUNT_DELETED`), revokes that chain and records `login_blocked_*` with
  `meta.via='refresh'`. New per-session-chain refresh limit
  (`AUTH_REFRESH_LIMIT_PER_SESSION_PER_HOUR`, default 30) → 429 `RATE_LIMITED`.
- Login flags `phone_login`, `email_login`, `apple_login`, `google_login` are
  enforced server-side on `otp/request`, `otp/verify` and `social`
  (403 `AUTH_PROVIDER_DISABLED`). A missing flag row counts as enabled.
  `AUTH_SOCIAL_LIMIT_PER_IP_PER_HOUR` (already in env, previously unused) is
  now applied to `/auth/social`.
- New-device alert: when a login creates a session on a `device_id` an
  existing user never used, an `auth_events` row `new_device` is written and
  a notice goes to every `LoginNotificationChannel`, detached from the
  request (the login never waits or fails because of it). Email channel:
  only to a verified email, through `CostGuardService`, with a
  `lawbid://profile/settings/devices` link (plus https variant). Push channel
  is a no-op seam until docs/05 `NotificationsService.emit()` exists.
- Email OTP (login purpose): body keeps the code and adds the magic link
  `lawbid://auth/email-code?email=<urlenc>&code=<code>` plus
  `<APP_LINK_BASE_URL>/auth/email-code?...` when `APP_LINK_BASE_URL` is set.
  Contact-verification codes get no sign-in link. `EmailProvider` now takes a
  rendered message (`sendEmail({to, subject, text, html})`).
- Social nonce: Apple claim must equal `sha256hex(rawNonce)`; Google claim
  must be present and equal the raw nonce or `sha256hex(rawNonce)`; else 401
  `AUTH_SOCIAL_TOKEN_INVALID` (constant-time compare).
- Device attestation: `DeviceAttestationGuard` on `otp/request` and `social`,
  behind the new flag `device_attestation` (seeded **false**). When on,
  missing/unverifiable `X-Device-Attestation` (+ `X-Platform: ios|android`)
  → 403 `DEVICE_ATTESTATION_REQUIRED`. The App Attest / Play Integrity
  verifiers are interfaces. The registered placeholder rejects every token,
  so **do not turn the flag on until real verifiers exist**.

### New env
- `AUTH_REFRESH_LIMIT_PER_SESSION_PER_HOUR` (default 30).
- `APP_LINK_BASE_URL` (optional, https, no trailing slash, e.g. `https://lawbid.app`).

### For docs/KEYS_SETUP.md (owner action; not edited by this leaf)
**Device attestation keys (needed before enabling `device_attestation`):**
1. iOS App Attest: in the Apple Developer account, enable the App Attest
   capability for the app ID and note the **Team ID** and **bundle id**. The
   server needs `APP_ATTEST_TEAM_ID`, `APP_ATTEST_BUNDLE_ID` and
   `APP_ATTEST_ENV` (`development` or `production`). It also needs Apple's App
   Attestation Root CA (public; ship it with the verifier).
2. Android Play Integrity: in Google Play Console, link a Google Cloud project
   (App integrity → Play Integrity API) and enable the API. Create a service
   account with the *Play Integrity API* role. Give the server its JSON key as
   `PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON` (Secrets Manager) and the package name
   as `PLAY_INTEGRITY_PACKAGE_NAME`.
3. After real `AttestationVerifier` implementations are registered in
   `AuthModule` (replacing `UnconfiguredAttestationVerifier`), turn on
   `feature_flags.device_attestation`. The mobile app must also send the
   `X-Device-Attestation` header (not built yet).

**Universal links:** set `APP_LINK_BASE_URL` to the domain that serves
`apple-app-site-association` / `assetlinks.json` (docs/01 §12). Until then,
emails carry only the `lawbid://` link.

### Files outside the leaf's OWNS (minimal, additive)
`apps/api/prisma/seed.ts` (flag `device_attestation`), `apps/api/src/config/env.schema.ts` +
`.env.example` (2 env vars), `apps/api/package.json` + `package-lock.json` (`helmet`),
`src/common/middleware/request-id.middleware.ts` (+spec), `test/support/fake-redis.ts`
(`NX`, `del`, `ping`), `test/app.e2e-spec.ts` (Prisma stub `$queryRawUnsafe` for the ready probe).

## p12 leaf-1.4: mobile platform (flavors, app version, updates, SMS autofill, deep links)

Spec: docs/01 §5.1, §7, §10.2 D/E/F, §12, §15 "Этап 1.8".

### Three installable variants (owner requirement)
- **dev**: "LawBid Dev", `com.lawbid.lawbid.dev`
- **staging**: "LawBid Staging", `com.lawbid.lawbid.staging`
- **prod**: "LawBid", `com.lawbid.lawbid` (the build for the App Store and Google Play)

Details:
- **Android.** `productFlavors` (dimension `env`) with `applicationIdSuffix` and `resValue app_name`. The manifest uses `android:label="@string/app_name"`. AGP 9 needs `buildFeatures.resValues = true`.
- **iOS.**
  - Build configurations `Debug/Profile/Release-{dev,staging,prod}` and schemes `dev`, `staging`, `prod` (Flutter flavor convention).
  - `PRODUCT_BUNDLE_IDENTIFIER` and `APP_DISPLAY_NAME` are set per configuration on the Runner target. `Info.plist` reads `CFBundleDisplayName = $(APP_DISPLAY_NAME)`.
  - `ios/Flutter/<config>.xcconfig` includes the Pods xcconfig and `Common.xcconfig`, which holds the Google URL-scheme default, `DEEP_LINK_HOST` and `Secrets.xcconfig`. The old flavorless `Debug/Release.xcconfig`, the Debug/Release/Profile configurations and the `Runner` scheme are removed.
  - The Podfile maps all 9 configurations. `pod install` is verified.
- **Entry points.** `lib/main_{dev,staging,prod}.dart` call `runLawBid(AppFlavor.x)` (`lib/core/config/run_app.dart`). `lib/main.dart` is dev, and `pubspec.yaml` sets `default-flavor: dev`, so a plain `flutter run` still works.
- **API base URL.** `AppEnvironment` (`lib/core/config/app_environment.dart`) picks a per-flavor default, and the `API_BASE_URL` dart-define overrides it.
  - **Owner to confirm:** the staging and prod defaults are placeholders: `https://staging-api.lawbid.app/api/v1` and `https://api.lawbid.app/api/v1`.
  - `config/{dev,staging,prod}.example.json` exist.
- **Run.** `flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=config/dev.json`. See apps/mobile/README.md → Flavors.
- **Verification.** `node tool/verify_flavors.mjs android|ios` builds each flavor and checks the id and label with aapt or plutil.
- **Entitlements.** `Runner.entitlements` is now wired via `CODE_SIGN_ENTITLEMENTS` for every configuration. It was pending since the Sign in with Apple pass. It now also carries Associated Domains.
  - Associated Domains and Sign in with Apple need a paid Apple Developer team to sign for a device. Simulator builds and no-codesign builds are unaffected.

### App version, soft update and forced update
- **X-App-Version.** The header now sends the real installed version (`package_info_plus`, loaded before `runApp`). It was hardcoded to `'0.1.0'` before. `AppVersion.fallback` stays `0.1.0` so that a failed lookup can never trigger 426 on every request.
- **Forced update on 426.** `AppUpdateInterceptor`, registered in `dioProvider` right after the headers interceptor, handles any `426` or `APP_UPDATE_REQUIRED` response by opening the non-dismissible forced-update screen over whatever route is showing. This closes the stage 1.8 gap noted in CHANGELOG. The bootstrap `min_app_version_*` self-check still applies.
- **Soft update.**
  - `soft_update_version_{platform}` from `/config/bootstrap` shows a dismissible prompt. "Later" is remembered per soft version, and a newer soft version prompts again.
  - The prompt is shown only after the splash and only to a signed-in user, so the pre-app flow does not change.
- **Update button.** It opens `app_config.store_url_{platform}` when set, which lets the admin configure it. Otherwise it opens the Play listing of the running applicationId on Android, or `apps.apple.com/app/id$APP_STORE_ID` (a dart-define) on iOS. If no URL is available it shows a snackbar. The old `_UpdateRequiredGate` in app.dart moved to `lib/core/app_update/app_update_gate.dart`.

### Android
- **minSdk 26.** `minSdk = 26` (docs/01 §5.1).
- **SMS Retriever OTP autofill** (docs/01 §10.2 D) via `smart_auth`.
  - Listening starts before the code is requested, and again on resend. The code appears in the cells and is verified automatically.
  - Late SMS for a previous number are ignored.
  - iOS keeps the `oneTimeCode` keyboard autofill.

### OTP screen
- **«Изменить номер» / "Change number"** ("Change email" for the email code) sits under the resend timer. It uses the same caption link style and a 44pt hit area, and returns to the phone or email entry with the value kept.
- **Golden updates.** Only `auth_otp_screen_light.png` and `auth_otp_screen_dark.png` were regenerated. The diff is exactly the new link.
- **Unchanged.** The welcome screen and its goldens are byte-identical.

### Deep links (docs/01 §12, §10.2 E/F)
- **Magic link.** `lawbid://auth/email-code?email&code` and `https://lawbid.app/auth/email-code?email&code` open the email code screen with the code prefilled and verify it. The link is ignored if the user is already signed in.
- **Content links.** `https://lawbid.app/case/:id`, `/lawyer/:username` and `/post/:id` (also over `lawbid://`) open "coming soon" placeholder routes. TODO(docs/03, docs/04, docs/05): real screens. The link waits until the user is signed in and onboarded.
- **Cold start.** A link that launches the app is held until the splash finishes.
- **Handling.** `app_links` feeds `DeepLinkController` (`lib/core/deeplinks`). Flutter's built-in deep linking is disabled (`flutter_deeplinking_enabled` / `FlutterDeepLinkingEnabled` = false) so the magic link can run verification. The parser only accepts strict shapes: a 6-digit code, and usernames per §12.
- **Native config.**
  - Android: custom-scheme and `autoVerify` App Links intent filters on `${deepLinkHost}` (Gradle property `lawbid.deepLinkHost`, default `lawbid.app`).
  - iOS: the `lawbid` URL scheme, plus `applinks:$(DEEP_LINK_HOST)`.
- **Owner hosts two files:**
  - `docs/deeplinks/apple-app-site-association`, with `TEAM_ID` placeholders.
  - `docs/deeplinks/assetlinks.json`, with SHA-256 placeholders.
  - Instructions are in `docs/deeplinks/README.md`.

### Note for leaf-1.2 / server (not edited here)
- **SMS text.** To make Android SMS Retriever autofill work, the OTP SMS must end with the app's 11-character hash, for example `<#> Your LawBid code: 123456` followed by the hash on a new line. The hash depends on the applicationId and signing key, so it differs per flavor and between debug and release. `SmsCodeRetriever.appSignature()` returns it on the device, or compute it with the usual keytool method. Suggested server change: an env or app_config value such as `sms.android_app_hash` appended to the Twilio or Verify message. With Twilio Verify, use its Android app-hash parameter.
- **Magic link format.** The sign-in email's magic link must be `https://lawbid.app/auth/email-code?email=<urlencoded>&code=<code>`.

### New translation keys
`auth.otp.changeNumber`, `auth.otp.changeEmail`, `app.update.storeUnavailable`, `app.softUpdate.{title,message,update,later}`, `deeplink.{case,lawyer,post}.title`, `deeplink.comingSoon.{heading,body}`. They are in apps/api/prisma/seed/pending_keys/leaf-1.4.csv.

### Shared files touched outside this leaf's OWNS (minimal)
- `pubspec.yaml`: additive. Adds `package_info_plus`, `app_links`, `url_launcher`, `smart_auth` and `default-flavor`.
- `lib/app.dart`: uses the gate from core/app_update and the flavor title.
- `lib/core/network/{dio_client,headers_interceptor}.dart`
- `lib/core/navigation/app_router.dart`: deep-link routes.
- `lib/core/design_system/widgets/inputs/app_otp_field.dart`: optional `controller`.
- `lib/core/l10n/static_translator.dart`
- `docs/KEYS_SETUP.md` and `apps/mobile/README.md`: run commands.

### p12 leaf-1.5 — mobile i18n (docs/01 §8.1, §9; docs/07 §8)

- **Server-driven languages** (§9.3/§9.4, stage 1.6 acceptance "новый язык,
  импортированный через xlsx, появляется в приложении без пересборки"):
  `AppLanguage` is now a value class keyed by ISO 639-1 code (same
  `en`/`ru`/`values`/`name` API as the old enum). `GET /i18n/languages` is
  fetched on the splash and cached locally; every active server language
  is selectable in the existing language picker (UI unchanged; rows the
  server doesn't serve keep the "coming soon" badge). A server-only
  language renders from its `GET /i18n/bundle/:lang` bundle (Drift cache,
  `since=` delta) with English fallback per key (§9.3).
- **System locale** (§9.4): with no explicit choice the app uses the first
  system locale whose language is active (compiled-in en/ru offline, the
  cached server list afterwards), otherwise English. Auto-detection is not
  persisted; picking a language is.
- **Plurals** (§9.2): `Translator.plural(key, count)` resolves
  `key.one/.few/.many/.other` via intl's CLDR rules; `{count}` is
  locale-formatted.
- **Dates/numbers/currency** (§9.4): `l10nFormatsProvider` (`intl`, per
  selected language; unknown locales format as English).
- **Theme + language on the server** (docs/07 §8.1, docs/01 §15 stage 1.7
  item 7): `PreferencesSyncController` (core/theme) PATCHes
  `/users/me {theme|uiLanguage}` through `OnboardingRepository` when signed
  in; after login a returning account's values are applied locally, a new
  account's welcome-screen choices are pushed; offline changes stay
  pending and are retried.
- **EN texts = docs/07 §8** (owner decision): `auth.welcome.title`,
  `auth.welcome.legal`, `auth.phone.subtitle`, `auth.phone.terms`,
  `auth.otp.submit`, `onboarding.role.attorney.desc` updated; RU unchanged.
  xlsx updates listed in `apps/api/prisma/seed/pending_keys/leaf-1.5.csv`
  (`op=update`). Goldens regenerated for the text change only: auth
  welcome/phone/otp/role and onboarding email (light + dark).
- Not done: RTL layout for `is_rtl` languages (not required by §9.4; no
  RTL language is active).

## p12 leaf-1.6 — mobile UX: offline banner, pagination, goldens, a11y, layering

**Connectivity (docs/01 §8.3 "Offline — баннер сверху").** New `core/connectivity/`:
`ConnectivityService` combines connectivity_plus (interface up/down), a real
reachability signal from dio traffic (`ReachabilityInterceptor`, last in the
chain: any HTTP response = reachable; connectionError/connectionTimeout/
sendTimeout = unreachable; receiveTimeout/cancel/unknown = no signal) and a
`GET /health/live` probe with exponential backoff (2s → 30s) while unreachable.
Exposed via Riverpod (`connectivityStatusProvider`, `isOfflineProvider`).
`OfflineBannerHost` in `MaterialApp.builder` shows an animated banner on in-app
routes only (pre-app flow untouched): slides from under the status bar, takes
over the inset so the top bar never jumps, polite live region, Retry with
busy state, short "Back online" confirmation; instant under reduce-motion.

**Pagination (docs/01 §7 `meta.nextCursor`, §8.3).** `AppPaginatedListView` +
`AppPaginationFooter` (loading more / error + Retry at the list end / end of
list), shared `CursorPage`/`PaginatedList` in `shared/domain`. Active Devices
uses it; `GET /auth/sessions` currently returns no cursor, so the list ends
after one page — `?cursor=`/`meta.nextCursor` are already honoured.

**Layering (docs/01 §6.4).** Active Devices moved to
`features/settings/active_devices/{domain,data,application,presentation}`
with a `DeviceSessionInfo` domain model and DTO mapper; the screen no longer
imports `auth/data`. Controller: cursor pagination, refresh that keeps rows on
failure, local removal on revoke, no silent Riverpod auto-retry, auto-reload
when connectivity returns.

**Design system.** `AppFeedHeader` (docs/07 §10: static ScalesLogo 96, left;
documented `trailing` slot for file 05's Chats icon + badge), reusable
`AppContentCard` + `AppContentCardSkeleton` (feed empty-state preview),
`AppConnectivityBanner`/`AppTopBannerSlot`, `AppTapTarget` (48dp hit/semantic
area without layout change — welcome goldens byte-identical). `AppTopBar` now
applies the status-bar inset (it drew under the notch). `AppAvatar` initials
on a navy seal (old pairing was 4.35:1). Button/chip semantics de-duplicated.
Bottom-nav label gap 2 → 6 and label text scale capped at 1.35x (overflowed at
200%). `AppOtpField.semanticLabel` added (call sites still use the RU default).

**Tokens.** Status colors aligned to docs/01 §8.1: success `#1F9D67`, warning
`#D98A00`, new `info` `#2F80ED` (+ `infoTint`), danger unchanged. New AA helpers
`dangerText` (light `#C53A3A`, dark `#E36464`) and `dangerFill` (`#C53A3A`)
used by the danger button and destructive list rows — spec `#D64545` is
4.38:1 with white. Onboarding goldens `contacts_client` and
`verification_attorney` regenerated for the new success color (only change).

**Tests.** `test/core/connectivity/**`, `test/design_system/pagination_test.dart`,
`test/design_system/a11y_test.dart` (android/iOS tap target, labeled targets,
text contrast; widgets + feed/search/mine/profile/settings/active devices in
both themes; 200% text), base-widget goldens (text field normal/focus/error,
OTP, icon button, chip, card, avatar, top bar, feed header, banner, footer),
feed screen golden, active devices data/controller/screen tests, token tests.

## leaf-1.7 — accounts & profiles (docs/01 §10.3, §11 3A/3B; docs/02 §4.C)

### Backend (apps/api, users module)
- `PATCH /users/me/onboarding` accepts a structured `profile` (names, client
  `stateCode`/`languages`/`contactMethod`/`contactNote` ≤200, attorney
  `bio` ≤300/`firmName`/`languages`/`licensedStates`). Validated (state
  exists and is active in `states`, ISO 639-1 language codes, lengths,
  fields of the other role rejected with `VALIDATION_ERROR` +
  `details.fields`/`details.states`) and upserted into `client_profiles` /
  `attorney_profiles` together with the names and step in one
  `withTxRetry` transaction.
- Attorney `username`/`username_lower` (NOT NULL) generated once from the
  name (`first.last`, numeric suffix if taken, skipping
  `app_config profile.reserved_usernames` via AppSettingsService; fallback
  `attorney` for non-latin names). Editing stays docs/03 stage 3.6.
- Licensed states (3B multi-select) are kept server-owned in
  `onboarding_state.data.licensedStates` — they cannot be
  `attorney_licenses` rows before verification collects bar numbers
  (docs/03); a raw `data` payload cannot overwrite them.
- `POST /users/me/onboarding/complete` upserts at completion too (migrates
  the old free-form `data.profile` of older app builds; always creates the
  attorney row) and now requires `state` (client) / `licensed_states`
  (attorney): `ONBOARDING_INCOMPLETE` with `details.missing`.
- `GET /users/me` returns `profile`; new `GET /users/me/identifiers`
  (Settings → Account). Replacing a verified phone/email via
  `contacts/verify` now also retires the old value as a sign-in method
  (same transaction; auth_event meta `replaced: true`).
- Photo (required for attorneys) is deferred to docs/03 stage 3.2 (owner).

### Mobile
- Onboarding profile step sends the structured `profile` (no visual
  change; goldens unchanged) and prefills from `GET /users/me.profile`.
  `MissingRequirement.profile` (`state`/`licensed_states`) keeps the guard
  on the profile step.
- Settings → Account (`/profile/settings/account`): contacts with Change /
  Add (reauth + code on the new contact, reusing
  ContactVerificationController), linked sign-in methods, link another
  phone / email (`POST /auth/identifiers`) and Apple / Google. Loading
  skeleton, empty, error + Retry, offline states; 200% text scale.
- New translation keys: `account.*` (see
  `apps/api/prisma/seed/pending_keys/leaf-1.7.csv`).

## Security: device-bound email magic link; consents redesign — 2026-09-27

- **Magic link (security review High).** The login email's link used to
  carry the email address and the OTP code, and the app auto-submitted
  them — link scanners, proxy logs or browser history could sign someone
  in. Now the app binds a device verifier (`linkChallenge` = SHA-256) when
  it requests an email code; the link carries only a random one-time token
  (`?token=`), redeemable via `POST /auth/otp/verify-link` together with
  the verifier kept in secure storage on that phone. Single use (even on
  failure), burns the typed code too. Opened on another device → the app
  asks for the code instead. API e2e `magic-link.e2e-spec.ts` (4), mobile
  deeplink/repository tests.
- **Consents step (owner request, OQ-013):** required consents as
  role-style cards, documents in a compact two-column grid (odd last item
  full width), optional consents removed from this screen.
- **Other fixes:** reviewer findings (bootstrap cache parse fallback,
  bounded username allocation, tagged health query, https-only store URL),
  SMS Retriever app hash (`SMS_ANDROID_APP_HASH`), translated OTP field
  labels, 48dp tap target on Create, stable e2e (single listener per
  suite, EXPLAIN without stats forecasts).
- Totals at this point: API unit 293, e2e 128; mobile 429.

## p12 leaf-1.3: API contract — typed OpenAPI, generated Dart client, one ErrorCode — 2026-09-27

docs/01 §6.3 (packages/api-contract: OpenAPI-generated Dart client, never
hand-edited, regenerated after any endpoint change), §7 (envelope + error
format, one ErrorCode enum on server and client), §16 DoD ("Swagger покрывает
все эндпоинты, Dart-клиент сгенерирован из него").

**API (documentation only unless noted)**
- Response DTOs for every endpoint's `data` (`auth-responses.dto.ts`,
  `user-responses.dto.ts`, `i18n-responses.dto.ts`,
  `bootstrap-response.dto.ts`); controllers declare them as return types, so
  tsc checks the documented shape against what the services return.
- `ApiEnvelopeResponse(Dto, {status, isArray})` documents the global envelope
  as named `XxxEnvelope = {data, meta?: {nextCursor}}` schemas;
  `ApiErrors({status: [codes]})` documents `ErrorResponseDto` with the shared
  `ErrorCode` enum schema (`common/dto/api-docs.decorators.ts`).
- OpenAPI document: paths without the `/api/v1` prefix (server URL
  `/api/v1`; `/health/*` override per operation), operationId = handler
  method name (duplicates fail the build), one tag per controller, header
  params `Idempotency-Key` / `X-Reauth-Token` / `x-device-attestation` /
  `If-None-Match` where the routes read them, multipart body for
  `POST /admin/i18n/import`, binary xlsx 200 for `GET /admin/i18n/export`,
  304 for the i18n bundle.
- Handler renames (no route change): `I18nAdminController.import/export` →
  `importTranslations/exportTranslations`, `CasesController.create` →
  `createCase`.
- Runtime fixes found on the way:
  - AllExceptionsFilter turned EVERY `BadRequestException` into
    `VALIDATION_ERROR`, swallowing feature codes thrown that way
    (`I18N_IMPORT_INVALID` with `details.errors`, `I18N_LANGUAGE_NOT_FOUND`
    from PATCH /users/me). A 400 that carries its own `code` now keeps it;
    ValidationPipe's code-less 400s are unchanged.
  - `POST /users/me/role`, `/onboarding/complete`, `/consents` and
    `/contacts/request` now apply `IdempotencyInterceptor`: the app already
    sent an `Idempotency-Key` for them, but the server ignored it, so a
    retried contacts/request could send a second paid SMS/email.

**packages/api-contract**
- `generate.sh`: exports `openapi.json`, then generates the Dart package
  `lawbid_api` (`dart/`) with swagger_parser 1.45.0 (retrofit clients +
  json_serializable models) + build_runner, then `dart format`. Toolchain
  pinned (pubspec exact versions + committed pubspec.lock); regeneration is
  byte-identical. Generated `*.g.dart` are committed (package `.gitignore`
  overrides the repo-wide ignore). `build.yaml`: unset optional request
  fields are omitted, never sent as null.
- CI: api-ci "API contract is up to date" step runs `generate.sh` and fails
  on any diff/untracked file, then `dart analyze --fatal-warnings`; api-ci
  and mobile-ci also trigger on `packages/api-contract/**`.

**Mobile**
- `lawbid_api` path dependency. `AuthApiClient` and `UsersApiClient` now run
  on the generated `AuthClient`/`UsersClient` with the app's own Dio (all
  interceptors kept; `skipAuth`/`createsResource` passed as retrofit
  extras); request bodies are the generated DTOs, responses the generated
  envelopes. `DeviceInfo`/`AuthTokensResult` are aliases of the generated
  models; `CurrentUserMapper` maps `MeDto` → `CurrentUser` (unknown enum
  values dropped, as before). `guardApiCall` maps DioException → ApiException
  and an off-contract 2xx body → NETWORK_ERROR. The profile step keeps a raw
  PATCH for its body (explicit `contactMethod: null` clears the method; the
  generated models omit nulls) and parses the response as `MeEnvelope`.
- `ApiErrorCodes` lists all 38 server codes (+ `all`); a test compares it
  with the generated `ErrorCode` enum. New localized texts (en+ru) for
  DEVICE_ATTESTATION_REQUIRED, AUTH_REFRESH_REUSE_DETECTED,
  AUTH_SESSION_REVOKED (also used for AUTH_REFRESH_EXPIRED/INVALID),
  IDEMPOTENCY_KEY_CONFLICT, FORBIDDEN, NOT_FOUND, NOT_IMPLEMENTED; social
  token/provider codes reuse the existing `auth.social.error.*` texts. Keys:
  apps/api/prisma/seed/pending_keys/leaf-1.3.csv.

## Stage 3.2: file uploads — presign, confirm, antivirus, HEIC, avatars — 2026-09-27

docs/03 §11 stage 3.2, §2.2, §4.1 (photo), §9 (`files.max_size_mb`,
`files.avatar_max_size_mb`, `verification.signed_url_ttl_sec`); docs/02 §1.6 +
§4.A `files`; OQ-012 (attorney photo API now, mobile step in 3.9). No schema
change.

**API — `apps/api/src/modules/files`**
- `POST /files/presign` (Idempotency-Key): `{purpose, mime, sizeBytes, sha256}`.
  Per-purpose allow-list (avatar / post_image / verification_selfie: JPEG, PNG,
  HEIC; verification_document: + PDF) and size limit from app_config (avatar
  5 MB, others 10 MB). Per-user limit (env `FILES_PRESIGN_LIMIT_PER_USER_PER_HOUR`,
  60) + CostGuard provider `storage` (`budget.storage.*`, seeded 120/5000/100000).
  Returns an S3 POST policy (5 min) that accepts only exactly the declared size
  and Content-Type at one key `<purpose>/<userId>/<fileId>`; buckets: documents
  (verification) / media (avatar, posts). The intent waits in Redis (1 h).
- `POST /files/:id/confirm`: server reads the object back — size, SHA-256 and
  real type by magic bytes (JPEG/PNG/PDF/HEIC; AVIF and anything else refused);
  a mismatch deletes the object (`FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`,
  `FILE_CHECKSUM_MISMATCH`); not yet uploaded → `FILE_NOT_UPLOADED`. Success
  creates the `files` row (`scan_status=pending`) and queues the scan. Retry-safe.
- `GET /files/:id`: owner only (others 404); `url` = signed link only for clean
  avatar/post images, never for verification files.
- Scan worker: BullMQ queue `files` (in the API while JOBS_ENABLED, always in
  `src/worker.ts`), 3 attempts. `VirusScanner` interface: `ClamdScanner`
  (clamd `zINSTREAM` over TCP) when `CLAMAV_HOST` is set; otherwise
  development/test use `DevEicarScanner` (flags only the EICAR test string);
  **staging/production without `CLAMAV_HOST` have no scanner — files stay
  `pending` and can never be attached (production must set `CLAMAV_HOST`).**
  infected → object deleted, row `infected`; scanner/S3 failure on the last
  attempt or an undecodable image → `failed`.
- Processing (sharp; HEIC decoded by libheif-WASM `heic-decode`, since prebuilt
  sharp has no HEVC): HEIC → JPEG for every purpose; avatar → EXIF orientation
  applied, square centre crop 1024 px JPEG + `<key>_w256` variant, all
  metadata stripped. Row's mime/size/sha256/width/height describe the stored
  object; the row turns `clean` only after processing.
- `FilesService.assertAttachable(user, file, purposes)` — the only way other
  modules reference a file (owner + purpose + `clean`), `mediaUrl()`,
  `verificationFileUrl()` (TTL `verification.signed_url_ttl_sec`; for the
  verifier API of stage 3.4, which must check the role and write audit_log).
- `PATCH /users/me` accepts `avatarFileId` (uuid | null; clean own avatar only,
  else `FILE_NOT_ATTACHABLE`/404); `GET /users/me` returns `avatarFileId`,
  `avatarUrl` (signed, 1 h).
- Dev/test boot creates missing MinIO buckets (private, no policy);
  staging/prod never do.
- New ErrorCodes: FILE_TYPE_NOT_ALLOWED, FILE_TOO_LARGE, FILE_CHECKSUM_MISMATCH,
  FILE_NOT_UPLOADED, FILE_NOT_ATTACHABLE, FILE_STORAGE_UNAVAILABLE (mobile
  ApiErrorCodes + en/ru texts; keys in `prisma/seed/pending_keys/stage-3-2.csv`).
- Env: `CLAMAV_HOST`, `CLAMAV_PORT`, `FILES_PRESIGN_LIMIT_PER_USER_PER_HOUR`,
  `BUDGET_STORAGE_*`. Deps: @aws-sdk/client-s3, s3-presigned-post,
  s3-request-presigner, sharp, heic-decode.
- Contract regenerated (`FilesClient`, `FileDto`, `MeDto.avatarFileId/avatarUrl`).

**Tests**: unit (magic bytes, scanners incl. a fake clamd, image processing,
FilesService, scan processor); e2e `test/files.e2e-spec.ts` against MinIO —
PNG declared as PDF rejected + deleted, oversize/declared-type refusals, S3
refuses wrong size/Content-Type, checksum mismatch, EICAR → infected + deleted +
not attachable (also as avatar), avatar pipeline, HEIC selfie → JPEG, foreign
file 404, unsigned GET of a key → 403 on both buckets, signed link (TTL 2 s)
200 then 403. e2e uses per-tag buckets `lawbid-e2e-<tag>-*`; MinIO credentials
default to docker-compose.yml (override `S3_SECRET_ACCESS_KEY` if your MinIO
differs).

**Not in this stage**: post photo variants 320/1080 + CloudFront (docs/05 §3.2);
cleanup of presigned-but-never-confirmed objects (S3 lifecycle rule, docs/06
infra); re-queue of `pending` files once a scanner is configured; deleting the
previous avatar object on replacement.

## Stages 3.3–3.4: Verification requests and verifier admin API — docs/03 §2, §6, §9, §10 — 2026-09-27

**Attorney API (`modules/verification`, own attorney profile only; someone
else's request id → 404)**
- `GET /verification/me` — profile status, latest request, whether ID +
  selfie are required (not for an already verified attorney adding a
  state, §2.1), submissions used / `verification.max_submissions_30d`.
- `POST /verification/requests` — draft. 409 `VERIFICATION_ALREADY_PENDING`
  while a draft/submitted/in_review/needs_more_info request exists; 429
  `VERIFICATION_SUBMISSION_LIMIT` (details.retryAfterSeconds) when 5
  requests were submitted in 30 days (system-opened name/license re-checks
  don't count).
- `PATCH /verification/requests/:id` — `applicantComment` ≤500.
- `POST|DELETE /verification/requests/:id/licenses[/:licenseId]` — state +
  bar number (upper-cased). UQ (state, bar number) across attorneys → 409
  `LICENSE_ALREADY_REGISTERED`; one license per state per request → 409
  `LICENSE_ALREADY_ADDED`. The attorney's own earlier row with the same
  number (rejected/expired, or a renewal of a verified one, §2.6) returns to
  `pending` with the new expiry. Licenses in `pending` belong to the open
  request (there is only one). A renewal of a once-verified license can't
  be withdrawn by the attorney (409 `VERIFICATION_INVALID_STATUS`).
- `POST|DELETE /verification/requests/:id/documents[/:documentId]` —
  `bar_license` (needs `stateCode` of a pending license), `drivers_license` /
  `state_id` (side front/back), `passport` (front), `selfie`
  (`verification_selfie` file), `other`. Only the owner's `clean` file of the
  right purpose (`FilesService.assertAttachable` → 409 `FILE_NOT_ATTACHABLE`);
  up to 3 files per document. Removal only in `draft`; after an info request
  the attorney can only add.
- `POST /verification/requests/:id/submit` — draft → submitted after the
  completeness check (400 `VERIFICATION_INCOMPLETE`, `details.missing`:
  `license`, `bar_license:<STATE>`, `identity_document`,
  `identity_document_back`, `selfie`, `file_not_clean:<docId>`);
  needs_more_info → submitted keeps the original `submitted_at`.
- A suspended attorney gets 403 `ATTORNEY_SUSPENDED` on every write.
- §2.3 status sync (`verification.helpers.ts`): draft → unverified,
  submitted/in_review/needs_more_info → pending, approved → verified,
  rejected → rejected; never overrides `suspended`, and a `verified` attorney
  stays verified during/after an add-state request (a rejection leaving no
  verified license → `unverified`).

**Checks (§2.4)** — `VerificationProviderSelector` reads the flags on every
call: `auto_bar_check` → `AutoBarLookupProvider` routing by state to
`StateBarAdapter`s (none registered yet; `StubStateBarAdapter` is the
template; no adapter / adapter error → `manual_review`); `stripe_identity`
(wins) / `persona_verification` → structured stub adapters that
`CostGuard.consume('id_check')` before the (future) provider call. With all
flags off nothing runs and the request is purely manual. Results go to
`verification_checks` and `attorney_licenses.auto_check_result`; an
exhausted budget or provider error is recorded as `manual_review` and never
blocks the attorney.

**Verifier API `/admin/verification/*`** — `AdminRolesGuard`
(`modules/admin-access`, interim until docs/06 stage 6.2): `users.role =
admin`, active, and `admin_profiles.admin_role` ∈ {verifier, super_admin};
everything else 403 `FORBIDDEN` (deny by default, read from the DB).
- `GET requests` (queue: submitted + needs_more_info by default, `status`,
  `stateCode`, oldest first, keyset cursor on `submitted_at`), `GET
  requests/:id` (card: attorney, all licenses with bar numbers and
  auto-check result, document metadata, checks, history).
- `POST documents/:documentId/url` — 5-min signed link
  (`verification.signed_url_ttl_sec`), audit `verification.document_view`.
- `POST requests/:id/take` (submitted → in_review, locked to the verifier;
  others get 409 `VERIFICATION_REQUEST_LOCKED`), `…/licenses/:licenseId/
  decision` (verified | rejected + `rejection_code`/`rejection_note`),
  `…/approve` (409 `VERIFICATION_DECISION_INCOMPLETE` while a license is
  pending or none is verified; partial approval allowed), `…/request-info`
  (`info_request_message`), `…/reject` (`rejection_code` from §2.5.4 +
  comment → `rejection_reason`; pending licenses rejected with the code).
- `POST licenses/:licenseId/recheck` — bar lookup with the current
  provider; not `pass` → license `pending` in the open request or a new
  `submitted` request (`admin_note: license_recheck: …`).
- `POST attorneys/:attorneyId/suspend` (reason) → `suspended` (public
  profile 404, out of search) and active bids → `withdrawn` in one
  transaction (direct update — file 04's BidStateMachine doesn't exist yet);
  `…/restore` → the pre-suspension status from the audit row (`verified`
  → `unverified` if no verified license is left).
- Every action writes `audit_log` (before/after, IP) in its transaction and
  attorney-facing events emit `verification_update` with `payload.kind` ∈
  `in_review`, `needs_more_info` (+`message`), `approved` (+`partial`),
  `rejected` (+`rejectionCode`), `suspended`, `restored`.

**Error codes**: `VERIFICATION_ALREADY_PENDING`, `VERIFICATION_SUBMISSION_LIMIT`,
`VERIFICATION_INVALID_STATUS`, `VERIFICATION_INCOMPLETE`,
`VERIFICATION_REQUEST_LOCKED`, `VERIFICATION_DECISION_INCOMPLETE`,
`LICENSE_ALREADY_REGISTERED`, `LICENSE_ALREADY_ADDED`, `ATTORNEY_SUSPENDED`
(API enum, mobile `ApiErrorCodes`, en/ru texts).

**Translation keys** (`prisma/seed/pending_keys/stage-3-3-3-4.csv`):
`error.api.*` above, `notif.verification.{in_review,needs_more_info,approved,
approved_partial,rejected,suspended,restored}`, `verification.reject.<code>`.

**Not in scope / follow-ups**: docs/06 "reason for viewing" (`audit_log.
justification`) needs a file-06 schema change; real state bar adapters and
Stripe Identity/Persona sessions (keys); bid withdrawal via BidStateMachine
+ case journal once file 04 exists.

Tests: `test/verification.e2e-spec.ts` (13), unit specs for the guard,
providers/selector, checks service, document rules and status sync.

## File 03 stages 3.5–3.6: practices, license expiry, profiles API — 2026-09-27

docs/03_VERIFICATION_PROFILES.md §3 (practices/states), §2.6 (license
expiry), §4 (attorney profile), §5 (client profile), §6 (status display),
§9 (`profile.*`, `verification.license_expiry_notify_days`).

**API — stage 3.5**
- `GET /practice-areas` (public): active categories → active leaves with
  i18n keys, sorted; Redis-cached 5 min, `ETag` + 304 on `If-None-Match`.
- `GET/PUT /attorneys/me/practice-areas`: PUT replaces the whole set in
  one `withTxRetry` transaction; only `verification_status = verified`
  (403 `ATTORNEY_NOT_VERIFIED`, re-checked inside the transaction); only
  active leaves under an active category (400 `VALIDATION_ERROR`,
  `details.invalidIds`). Each change writes `audit_log`
  (`attorney.practice_areas.replace`, actor = the attorney, §3.2).
- Nightly BullMQ job `licenses.expiry` (05:05 UTC): verified licenses
  with `expires_at` ≤ today → `expired`; when no verified license is left
  a `verified` profile → `unverified`; reminders at
  `verification.license_expiry_notify_days` (30/7; the smallest due
  threshold, once per license+expiry date+threshold). All events are
  `verification_update` notifications (`kind`: `license_expiring`,
  `license_expired`, `profile_unverified`) in the same transaction as the
  change. The worker process now imports AppSettingsModule and
  NotificationsModule.
- New `NotificationsService.emit()` seam (`modules/notifications`,
  global): persists the `notifications` row with the type's category;
  delivery is docs/05.

**API — stage 3.6**
- `GET/PATCH /attorneys/me/profile`: own profile incl. own licenses with
  bar numbers, badge, rating, counters, `usernameNextChangeAt`. PATCH:
  names (1–50), bio (≤300), firm (≤80), languages (ISO 639-1),
  `username` (docs/03 §4.1 rules; cooldown
  `profile.username_change_cooldown_days` → 409
  `USERNAME_CHANGE_TOO_SOON` with `details.nextChangeAt`; reserved
  `profile.reserved_usernames` → 400 `USERNAME_RESERVED`; taken,
  case-insensitive → 409 `USERNAME_TAKEN`). The onboarding-generated
  username counts as never changed.
- `GET /attorneys/username-available?u=` (30/min per IP):
  `{available, reason: invalid|reserved|taken|null}`.
- `GET /attorneys/:username`: public profile — verified-license states
  only, practices, rating, counters, `verifiedBadge` (§6.3); never bar
  numbers, documents or contacts. 404 for unknown, suspended profile,
  blocked/deleted account.
- `GET/PATCH /users/me/profile`, `PATCH /users/me/contact-preferences`
  (client, own only; reuses UserProfilesService). Non-clients get 404; no
  route reads another user's client profile.
- Name re-check (§4.1): a `verified` attorney whose first/last name
  changes (via `/attorneys/me/profile`, `PATCH /users/me` or the
  onboarding profile step) goes to `pending`, and a `submitted`
  verification request (admin_note `name_change_recheck: "old" -> "new"`)
  enters the verifier queue unless one is already open.

**Error codes** (server enum, `ApiErrorCodes`, en+ru texts):
`ATTORNEY_NOT_VERIFIED`, `USERNAME_TAKEN`, `USERNAME_RESERVED`,
`USERNAME_CHANGE_TOO_SOON`. Also `notif.verification.license_expiring |
license_expired | profile_unverified` keys
(`prisma/seed/pending_keys/stage-3-5-3-6.csv`).

**Contract:** openapi.json + Dart client regenerated (AttorneysClient,
PracticeAreasClient, ProfilesClient).

**Tests:** unit (tree builder, practice replace policy, username
cooldown/reserved/taken/availability, public-profile 404 rules, name
re-check, license expiry thresholds/dedup) and
`test/profiles-practices.e2e-spec.ts` (all acceptance items against real
CockroachDB/Redis, incl. the §5.4 canonical query).

## Stage 3.7: Reviews (API) — docs/03 §7, §9 — 2026-09-27

**API (`modules/reviews`)**
- `POST /cases/:caseId/review` (client): the case must belong to the caller,
  be `closed` and have an `accepted` bid; the review is tied to that bid's
  attorney. One review per case (409 `REVIEW_ALREADY_EXISTS`, also for a
  concurrent UQ violation). `Idempotency-Key` is **required** here
  (`RequireIdempotencyKeyGuard` → 400 `IDEMPOTENCY_KEY_REQUIRED`) and
  replayed by `IdempotencyInterceptor`.
- `PATCH /reviews/:id` (author): within `review.edit_window_days` (default 14)
  of creation, only while `published`; sets `edited_at`. No delete endpoint.
- `GET /attorneys/:id/reviews` — published only, newest first, keyset cursor
  (`meta.nextCursor`, `limit` 1..50, default 20). Public shape: no case id,
  no client id/avatar; reviewer shown as "Anna K." (`authorDisplayName`).
  404 for a missing, deleted or suspended attorney.
- `GET /attorneys/:id/reviews/summary` — `ratingAvg` (1 decimal, null when no
  reviews), `ratingCount`, `distribution` 5→1.
- `POST /reviews/:id/report` (reviewed attorney only) — `reports` row
  (`target_type = review`, status `open`); repeating while open returns the
  same report.
- Rating: `attorney_profiles.rating_avg/rating_count` recalculated by one SQL
  statement inside the same `withTxRetry` transaction on create, edit and
  moderation (`review-rating.ts`).
- `ReviewModerationService.setStatus` (for file 06): hide / remove / restore,
  recalculation and an `audit_log` row in one transaction. No HTTP route yet.
- `ReviewsService.requestReview` (for file 04's case closing): emits
  `review_requested` to the client.

**Notifications seam** — `modules/notifications`: `NotificationsService.emit
({type, recipientId, payload}, tx?)` persists a `notifications` row with the
docs/05 §9.2 category (`new_message` is never stored). `review_received` goes
to the attorney in the create transaction. File 05 adds settings, dedupe,
realtime, push and email behind the same method.

**Jobs (`cron` queue)**
- `reviews.reminder` (daily 16:00 UTC): one `review_requested` reminder
  (`payload.reminder = true`) for cases closed `review.reminder_after_days`
  (default 7) to +3 days ago, with no review and no earlier reminder.
- `reviews.rating-reconcile` (nightly 04:15 UTC): recomputes rating counters
  with the same SQL expression and fixes drift (§7.5).
- The worker process now imports `AppSettingsModule`.

**Error codes (API + app, en/ru)**: `REVIEW_CASE_NOT_CLOSED`,
`REVIEW_NO_ACCEPTED_BID`, `REVIEW_ALREADY_EXISTS`,
`REVIEW_EDIT_WINDOW_EXPIRED`, `REVIEW_NOT_EDITABLE` (all 409). Keys in
`apps/api/prisma/seed/pending_keys/stage-3-7.csv`.

**Contract**: `openapi.json` and the Dart client regenerated
(`ReviewsClient`, review DTOs, `ReportReason`, `ReviewStatus`).

**Notes**: no schema change. There is no `cases(status, closed_at)` index, so
the reminder sweep scans closed cases; file 04 owns that table's indexes.

## Stage 3.8: Flutter — verification wizard and status screen — docs/03 §2, §6, §8, §11 — 2026-09-27

**Mobile (`apps/mobile/lib/features/verification`)**
- `/verification` (was a placeholder) → `VerificationStatusScreen` on
  `GET /verification/me`: start (what is needed + "Start verification"),
  saved draft ("N of M parts complete", Continue), pending (submitted → in
  review → decision timeline), `needs_more_info` (verifier message + "Add
  information"), rejected (localized `verification.reject.<code>` + verifier
  comment + per-license reasons + "Submit a new request", disabled with a
  message when the 30-day limit is used), verified (blue check, license
  statuses, "Add a state"), suspended; skeleton / error + Retry / offline
  (auto-reload on reconnect) / pull-to-refresh.
- `/verification/wizard` → `VerificationWizardScreen`: intro → licenses
  (several states; add sheet with state picker, bar number with the API's
  pattern, optional expiry; remove with confirm) → identity document (driver
  license / passport / state ID, front + back where needed) → selfie (camera
  only) → review (summary with Edit links, missing-items list, comment for
  the reviewer ≤500, autosaved via PATCH) → submit. Animated stepper (gold
  rail, tappable done steps, "Step N of M"), step slide/fade transitions,
  all motion off under reduce-motion. Identity/selfie steps are skipped for
  an already verified attorney adding a state (`identityRequired`).
- Draft lives on the server: reopening resumes at the first incomplete step
  (`resumeStep`), so closing the app at step 3 returns to step 3 with the
  uploaded files. An answer to `needs_more_info` opens at review with the
  verifier's message; files can only be added (up to 3 per document).
- Uploads: `POST /files/presign` (sha256, purpose) → direct multipart POST
  to storage through a bare Dio (`storageUploadDioProvider`, no bearer
  token) with progress bar and cancel → `POST /files/:id/confirm` → poll
  `GET /files/:id` until the scan leaves `pending` (timeout → retry that
  re-polls without re-uploading) → attach. Infected/failed files are marked
  on the card and can only be removed; any unfinished or failed upload blocks
  submit with a clear message; `VERIFICATION_INCOMPLETE.details.missing` is
  shown as a list.
- In-app camera (`camera` package) with a guide overlay (ID-1 card frame,
  page frame, face oval; breathing gold outline, static under
  reduce-motion), shot review (Retake / Use photo), denied/unavailable
  states. Files from the photo library / Files via `file_picker` (PDF allowed
  only for licenses).
- Guard: `/verification/wizard` is reachable from the onboarding
  verification step like `/verification`. The Mine (Cases) tab CTA already
  pushes `/verification`; stage 3.9 owns the tab gates.
- Removed `VerificationPlaceholderScreen`, its keys and goldens.

**Platform**
- iOS: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, localized
  in new `en.lproj` / `ru.lproj` `InfoPlist.strings` (registered in the Xcode
  project, `ru` added to known regions; texts = keys `permission.*.ios`).
- Android: `CAMERA` permission, camera feature optional.
- New dependencies: `camera`, `file_picker`.

**Contract issue (not changed, reported)** — the generated
`AddLicenseDto.expiresAt` is a `DateTime` serialized as a full ISO timestamp,
but the API accepts only `YYYY-MM-DD`; the app sends that endpoint as a plain
map (response still parsed with the generated envelope). Fix in the API
schema (`format: date` → string) and regenerate.

**Keys**: 154 new en+ru keys (`verification.*`, `permission.*.ios`) in
static_translator.dart and `apps/api/prisma/seed/pending_keys/stage-3-8.csv`.

**Tests**: acceptance widget tests (two-state wizard; close at step 3 and
resume; needs_more_info re-upload + resubmit; rejected reason + new request,
limit reached; unfinished and infected upload block submit), controller
unit tests (resume, polling, timeout/retry, cancel, infected, too large,
missing items), repository tests (date format, Idempotency-Key, sha256,
storage POST without auth), goldens light+dark for 6 wizard views and 9
status views + infected card, 200% text scale, reduce-motion.

## Stage 3.9: Flutter — practices, profiles, reviews — docs/03 §3–§8, §11 — 2026-09-27

**Mobile (`apps/mobile`, feature `profile`)** — all network calls through the
generated `lawbid_api` clients on the app's `dio` (`guardApiCall`), domain
models in `features/profile/domain`, repositories swappable in tests.

- **Public attorney profile** `/lawyer/:username` (§4.2), also the landing of
  the `lawbid.app/lawyer/:username` deep link (placeholder replaced): header
  card (photo, @username + blue check from `verifiedBadge` §6.3, Posts /
  Followers / Following), gold rating card (name, half-stars, count, number;
  "New — no reviews" with empty stars and a dash), "Attorney" chip + bio,
  chip rows (firm, practices grouped by category with a full-list sheet,
  verified license states, languages), Edit+Share (own) / Follow+Share
  (others; Follow is a file-05 stub, no "Message"), Posts / Reviews tabs.
  Reviews tab: summary with animated 5→1 distribution, cursor-paginated
  "Anna K." cards (`Edited` label), report action on one's own profile
  (`POST /reviews/:id/report`). 404 (unknown / suspended / a client) →
  "Profile unavailable". Share copies the link to the clipboard.
- **Profile tab**: attorney → own public profile (+ "Complete verification"
  banner before verification); client → private profile (§5: photo, name,
  state, "My cases" with lock + "Visible only to you" + empty state).
- **Edit**: attorney (§4.1: photo, name 1–50 with re-check hint once
  verified, @username with debounced availability check and 30-day cooldown
  message, bio ≤ 300, firm ≤ 80, languages, practices link, licenses with
  status); client (name, photo, state, languages, contact method + note).
- **Photo upload** (`AvatarUploadController`): image_picker (1024 px) → magic
  bytes / 5 MB check → `POST /files/presign` → multipart POST to storage via
  a bare `storageDioProvider` (no auth headers) with progress ring →
  `POST /files/:id/confirm` → scan polling → `PATCH /users/me {avatarFileId}`;
  Retry reruns with the same bytes. Also added as the one new field of the
  attorney onboarding profile step (OQ-012), in its existing style.
- **My practices** `/profile/practices` (§3.2): search, expandable categories,
  "Select all"/"Clear all", checkboxes, animated selected chips, Save =
  `PUT /attorneys/me/practice-areas`. Locked with an explanation before
  verification.
- **My contacts** (Settings → My contacts, §5): confirmed phone/email with
  status, change via the existing Account flows; clients also edit contact
  preferences (`PATCH /users/me/contact-preferences`).
- **Review form** `/profile/review/:caseId` (§7): star picker, text ≤ 1000,
  mandatory notice, create (Idempotency-Key) → published preview "Anna K." →
  edit within `editableUntil` (14 days), read-only afterwards. Reachable from
  a non-production placeholder entry on the client profile until file 04
  lists closed cases.
- **Gates**: `attorneyNeedsVerification` (unverified / pending / rejected /
  suspended). Cases tab shows "Complete verification"; `AppRouterGuard`
  redirects "+" (`/create`, Post to feed) to `/create/verification-required`;
  both lead to `/verification` (stage 3.8).
- Design: navy/gold, serif headings, staggered entrances, star fill and
  distribution animations, chip pop-in, tab indicator slide, Hero-tagged
  avatars, skeletons, pull-to-refresh — all instant under reduce-motion.
- `CurrentUser.avatarUrl` added (from `MeDto`). iOS photo/camera usage
  strings added. New dependency: `image_picker`.
- Tests: `test/features/profile/profile_screens_test.dart` (29 widget/unit
  tests) and goldens (light+dark) for the public profile with reviews and
  "New — no reviews", practices, review card, review form. Updated goldens:
  onboarding attorney profile step (photo field), Cases gate, settings.
- Translation keys: `apps/api/prisma/seed/pending_keys/stage-3-9.csv`.

**API gaps found (not changed):** the public attorney profile has no avatar
URL (own photo is taken from `GET /users/me`); there is no endpoint to read
the client's own review of a case (the form can edit only a review it just
created or is handed); the server does not require the attorney photo that
§4.1 calls mandatory.

## Stage 3.9 follow-up: gaps found by the mobile work — docs/03 §4.1, §4.2, §7.2 — 2026-09-27

**API**
- `GET /attorneys/:username` now returns `avatarUrl` and `avatarUrl256`
  (signed media links, 1 h). Built by `FilesService.avatarUrls()`: only a
  clean, live `avatar` file is signed — verification documents/selfies can
  never come out of this path even if `avatar_file_id` pointed at one.
- `GET /cases/:caseId/review` — the client's own review of a case (404
  `NOT_FOUND` for anyone else or when there is none). `ReviewDto` gains
  `editable` (published and before `editableUntil`).
- Attorney photo is mandatory (OQ-012 update): `missing` gains `photo`
  (attorney without a clean own avatar, `FilesService.isCleanAvatar()`);
  onboarding completion answers 403 `ONBOARDING_INCOMPLETE` until it is set.
- Contract regenerated (`packages/api-contract`).

**Mobile**
- Public attorney profile header shows the photo (256 px variant, else the
  main one) for every viewer; the own-profile `/users/me` workaround is gone.
- Review form opened without a review loads `GET /cases/:caseId/review`
  (skeleton / offline / error + Retry) and opens it for editing; the
  server's `editable` flag locks moderated reviews.
- `MissingRequirement.photo`: the router guard keeps an attorney on the
  profile step; the photo row shows "Add a photo — it is required for
  attorneys." after Continue (pre-app design otherwise unchanged).
- New key: `onboarding.profile.error.photoRequired` (en + ru).

**Tests**: unit (files, profiles, reviews, onboarding), e2e (files: public
photo + 256 px + no selfie leak; reviews: GET own review; onboarding /
profiles-onboarding: `photo` blocks completion), Flutter widget + guard tests.

**Owner device test follow-ups**
- An onboarding action refused with `ONBOARDING_INCOMPLETE` /
  `CLIENT_CONTACTS_INCOMPLETE` (e.g. the tour's "Get started" for an
  attorney without a photo) re-reads `GET /users/me` and moves the user to
  the step that owns the missing item (`AppRouterGuard.forwardRoute`); that
  step shows the localized reason (photo: "Add a photo — it is required for
  attorneys.") and flags its required fields (`onboardingBlockerProvider`).
- Role screen with a role already set: the other card is disabled
  (`AppSizes.disabledOpacity`), a note says the role can't be changed
  (`onboarding.role.locked`, en + ru), Continue moves on without an API call.

## Stage 4.1: Migration, state machines, journal — docs/04 §10, §5–§7, §14, §16 — 2026-09-27

**Migration `20260927230000_stage_4_1_case_journal_attorney`** (the only
schema migration of file 04; generated with `prisma migrate diff` against the
dev DB, raw SQL appended)
- §14: `case_journal.attorney_id uuid?` (FK → users, RESTRICT) + index
  `(attorney_id, created_at)`; `notification_type` + `case_updated`
  (category `cases`, docs/05 §9.2); `app_config`
  `contacts.suspend_after_confirmed_reports = 3` (INSERT … ON CONFLICT DO
  NOTHING; also in `FILE_04_SETTINGS` / seed / `AppSettingsService`).
- `lawbid_app` stays INSERT/SELECT-only on `case_journal` (re-asserted; no new
  tables).
- Job indexes from the file-03 DB review: `attorney_licenses(license_status,
  expires_at)` (license-expiry job), `cases(status, closed_at)`
  (review-reminder job), `reports(target_type, target_id, status)`,
  `reports(reporter_id)`.

**Domain (apps/api)**
- `CaseStateMachine` (`modules/cases/domain`): §10.1 table (+ in-place
  `client_edit` / `client_keep_alive` / `client_delete` only in the statuses
  §3.5/§10.2 allow); pure `planCaseTransition` + guarded `apply(tx, …)`
  (compare-and-set on status; 409 `CASE_INVALID_STATE`, 404
  `CASE_NOT_FOUND`). `client_restore` also resets `stale_prompt_sent_at` so
  the §10.2 reminder can fire again.
- `BidStateMachine` (`modules/bids/domain`): §6.3 counter / accept / decline /
  withdraw (+ system `auto_reject`, `system_withdraw`); bid row locked `FOR
  UPDATE` for negotiation actions; writes the matching `bid_offers` step
  (`OfferStateMachine`, `modules/negotiations`: pending → accepted / declined /
  countered / superseded). `applyToActive` for "reject every other active
  bid" / "withdraw an attorney's bids".
- `CaseJournalService.append(tx, …)` (`modules/journal`): the only
  case_journal writer; per-case serialization by `SELECT … FOR UPDATE` on the
  `cases` row; `row_hash = SHA-256(prev_hash + canonical JSON of the row)`,
  strictly increasing `created_at` per case, `retain_until = created_at + 5
  years`. `verifyChain(caseId)` reports `hash_mismatch` / `link_mismatch`.
- `CaseAccessPolicy` (deny by default): owner client; attorney with a bid or
  conversation; otherwise the §4.1/§5.4 predicate (verified attorney, verified
  license in a case state, practice match incl. the General Practice / Not
  Sure exception). Attorney access never includes client identity.
- `SubscriptionAccessService.isActive()` stub (verified attorney = active)
  until docs/06 stage 6.7.
- Error codes: `CASE_NOT_FOUND`, `CASE_INVALID_STATE`, `BID_INVALID_STATE`,
  `BID_NOT_YOUR_TURN`, `BID_MAX_ROUNDS_REACHED`, `BID_COUNTER_NOT_ALLOWED`
  (mobile `ApiErrorCodes`, en/ru texts, `pending_keys/stage-4-1.csv`,
  regenerated contract).

**Tests**: exhaustive unit tables (case 6×13, bid 3888 combinations, offer
5×5), journal/policy/subscription units; `test/stage-4-1.e2e-spec.ts`
(rollback together, chain under concurrent appends as `lawbid_app`, tamper
edit/delete detected, `lawbid_app` UPDATE/DELETE denied, full negotiation +
accept, policy SQL).

## Stage 4.2: Case creation and management — docs/04 §3, §11.1, §15, §16 — 2026-09-27

**API (apps/api)**
- `CasesController` (`modules/cases`) replaces the stage-1.7 `POST /cases`
  stub: `POST /cases`, `PATCH /cases/:id`, `POST /cases/:id/close`,
  `DELETE /cases/:id`, `POST /cases/:id/restore`,
  `POST /cases/:id/keep-alive`, `GET /users/me/cases?filter=&cursor=`.
  `CasesService` is the single implementation behind them; every status
  change goes through `CaseStateMachine.apply()` (4.1) inside `withTxRetry`,
  every mutation appends a `case_journal` row via
  `CaseJournalService.append()` in the same transaction.
- §3.1–§3.4 validation: title 10-120, description 30-5000, city ≤80,
  practice area must be an active leaf (specialization, not a category),
  primary + up to 2 additional states via `validateCaseStates` (4.1) plus a
  DB existence/active check; budget entered in whole dollars, stored in
  cents (`budgetCentsOf`, `.cursorrules` "Деньги только в центах").
- `contact-detector.ts`: regex-based phone/email/link detection for
  title/description/city (`CASE_CONTAINS_CONTACT_INFO`, 400), with
  normalization for spelled-out digits (en/ru) and "at"/"dot" (en/ru,
  "собака"/"точка") email obfuscation — Unicode-aware word boundaries
  (`\p{L}`/`\p{N}` lookaround) since `\b` doesn't bound Cyrillic in JS.
- `client_contact_sharing` consent gate: `POST /cases` checks the latest
  `user_consents` row for the type; if never granted, the request must
  carry `clientContactSharingConsent: true` (else 403
  `CLIENT_CONTACT_SHARING_CONSENT_REQUIRED`) and the consent row is written
  in the same transaction as the case. Later cases don't need the flag
  again.
- §3.5 edit: practice area / states are rejected (409 `CASE_INVALID_STATE`,
  `details.reason = 'bids_exist'`) once `bids_count > 0`; other fields stay
  editable. A state-only or practice-only patch merges with the case's
  current other half (client doesn't have to resend the unchanged side).
  Every changed field is diffed into the `updated` journal payload
  (`{old, new}`); attorneys with an `active` bid get a `case_updated`
  notification when bids exist and something actually changed.
- Close/delete auto-reject every `active` bid via
  `BidStateMachine.applyToActive()` (4.1), journal `bid_rejected` per bid
  (`payload.reason` = `case_closed` / `case_deleted`) and notify each
  attorney; delete only from `open`/`archived` (`in_progress` etc. get 409
  via the state machine's transition table, no extra guard needed).
  Restore resets `stale_prompt_sent_at` too (so the §10.2 stale job can
  fire again); keep-alive is the same in-place action as "Да, актуален".
- `GET /users/me/cases`: cursor pagination (`meta.nextCursor`,
  `(created_at, id)` keyset), `filter=active|archived|closed` maps to the
  §10.1 status groups; soft-deleted cases are hidden by the existing
  soft-delete Prisma extension, no explicit filter needed.
- New error codes: `CASE_CONTAINS_CONTACT_INFO`,
  `CLIENT_CONTACT_SHARING_CONSENT_REQUIRED` (mobile `ApiErrorCodes`, en/ru
  texts in `static_translator.dart` + `api_error_text.dart`,
  `pending_keys/stage-4-2.csv`, regenerated OpenAPI + Dart client). Renamed
  `CasesController` handler methods (`createCase`, `updateCase`, ...) to
  avoid an operationId collision with `ReviewsController`'s `create`/
  `update` (Nest's operationId = method name only, must be unique
  process-wide).

**Tests**
- Unit: `contact-detector.spec.ts` (email/link/phone incl. spelled-out
  en/ru and obfuscated email, plus negative cases: abbreviations, scattered
  numbers); `cases.service.spec.ts` (`budgetCentsOf`).
- e2e (`test/stage-4-2.e2e-spec.ts`, real CockroachDB/Redis): no case
  without verified contacts or the contact-sharing consent (and the
  consent isn't asked for again); >3 states / duplicate state / short
  description / contact info in text / unknown state / non-leaf practice
  all rejected, nothing persisted; Idempotency-Key required and replay-safe
  on create; edit blocks practice/state changes once a bid exists but
  keeps other fields editable and notifies bidders; close/delete
  auto-reject and notify; delete blocked on `in_progress`; restore resets
  the stale-prompt flag; keep-alive works only on `open`; `GET
  /users/me/cases` filters, paginates, and excludes other clients' and
  deleted cases.

## Stage 4.3 — Showing cases to attorneys (API)

docs/04_CASES_BIDS.md §16 stage 4.3, §4.

- `CasesFeedController` / `CasesFeedService` (`apps/api/src/modules/cases`):
  `GET /cases?practiceAreaId=&state=&cursor=&limit=` (attorney feed, newest
  first, cursor pagination, filters limited to the attorney's own practices
  and licensed states), `GET /cases/:id` (attorney representation: never a
  client field), `POST /cases/:id/view`, `POST|DELETE /saved-items`.
- Visibility (§4.1) in `queries/cases-visible.sql.ts`, the index-friendly
  shape of docs/02 §5.4 incl. the `general_practice.not_sure_or_other`
  exception; `EXPLAIN` in `test/stage-4-3.e2e-spec.ts` asserts no full scan.
- `CaseAccessPolicy.assertVisibleToAttorney`: ineligible attorney gets
  `CASE_NOT_AVAILABLE` (404) on a direct id (new code: API enum, mobile
  `ApiErrorCodes`, en/ru text, `pending_keys/stage-4-3.csv`).
- `CaseViewTrackingService` (§4.3 views): dedup per (attorney, case) in a
  Redis set with a 60-day TTL (bounded memory at scale), pending deltas in
  a Redis hash, flushed every 15 s by HSCAN + one atomic Lua drain per 500
  cases + one multi-row `UPDATE`; deltas are put back if the DB write
  fails (no lost views). Safe with many API instances flushing at once.
- Handler names made unique for OpenAPI operationIds (`listCaseFeed`,
  `getCaseDetail`, `recordCaseView`); contract regenerated.
- Not done here: client-owner representation of `GET /cases/:id` —
  TODO(stage 4.9), the client case screen that needs it.

Tests: unit (feed service, controller, view tracking incl. TTL and
DB-failure restore, policy), e2e `stage-4-3.e2e-spec.ts` 13/13; stages
4.1/4.2/4.4 e2e re-run after merge 30/30; API unit 685/685; flutter test
583/583, analyze 0 errors/warnings.

## Stage 4.4 — Bids and negotiation (API)

docs/04_CASES_BIDS.md §16 stage 4.4, §5–§6.

- `BidsController`/`BidsService` (`apps/api/src/modules/bids`):
  `POST /cases/:caseId/bids` (create — one active-or-ever bid per attorney
  per case via UQ `bids(case_id, attorney_id)`, second attempt is
  `BID_ALREADY_EXISTS`; requires `SubscriptionAccessService.isActive()`,
  else `SUBSCRIPTION_REQUIRED`; eligibility reuses stage 4.1's
  `CaseAccessPolicy`), `POST /bids/:id/withdraw`, `POST /bids/:id/decline`,
  `POST /bids/:id/counter` (§6.1 turn-taking, 5-round cap, unavailable for
  `free_consultation`), `GET /bids/:id` (participants only, full offer
  history). Every transition goes through stage 4.1's `BidStateMachine`;
  `CaseJournalService.append()` runs in the same transaction. Bid
  acceptance (§7, contacts) stays out of scope — stage 4.5.
- `BidsService.withdrawActiveBidsForAttorney(attorneyId)`: withdraws every
  `active` bid of an attorney (§2), for the future file-06 subscription
  webhook to call directly.
- `BidSubscriptionLapseJob` (hourly, `jobs/handlers/bid-subscription-
  lapse.job.ts`): safety net until file 06 wires the real webhook —
  sweeps attorneys with active bids whose `SubscriptionAccessService.
  isActive()` has gone false (today's stub: `verification_status`
  leaving `verified`, e.g. via the nightly license-expiry job or a
  suspension) and withdraws their bids. Idempotent; no extra Redis lock
  needed (the `cron` queue runs at worker concurrency 1).
- New error codes (`ErrorCode` + mobile `ApiErrorCodes` +
  `static_translator.dart` en/ru): `SUBSCRIPTION_REQUIRED`,
  `BID_ALREADY_EXISTS`.
- `CaseAccessPolicy` is provided directly inside `BidsModule` (not via
  importing `CasesModule`) to avoid pulling `CasesController` /
  `UsersModule` / `AuthModule` / `FilesModule` into the `worker` process,
  which now also imports `BidsModule` for the lapse job.
- Tests: `test/stage-4-4.e2e-spec.ts` (creation, dedup, subscription gate,
  turn-taking, 5-round cap + `failed_negotiation`, `free_consultation`
  counter block, `GET /bids/:id` access, direct
  `withdrawActiveBidsForAttorney`, the lapse job), plus unit specs for the
  pure DTO-normalization helpers and the job's pagination.
- Translation keys added to `prisma/seed/pending_keys/stage-4-4.csv`.
- Regenerated `packages/api-contract` (openapi.json + Dart client).

Not done in this stage (left for their own stages): `GET
/cases/:id/bids` (client's bid list — needs attorney profile/rating
rendering, stage 4.3/later), `POST /bids/:id/accept` (stage 4.5's
critical transaction).

## Stage 4.5 — Bid acceptance and client contacts (API)

docs/04_CASES_BIDS.md §16 stage 4.5, §7–§9.

- `POST /bids/:id/accept` (`bids/acceptance/BidAcceptanceService`): one
  `withTxRetry` transaction — `SELECT … FOR UPDATE` on the case row, then
  the bid row; case `open` is checked first so the loser of a race gets
  `CASE_INVALID_STATE`; turn/state via `BidStateMachine`; §7 step 2
  re-check (attorney verified, verified license in a case state,
  `SubscriptionAccessService.isActive(…, tx)`) — otherwise the transaction
  rolls back, the bid is `system_withdraw`n in its own transaction and the
  client gets `BID_ATTORNEY_INACTIVE`. Then: bid/offer `accepted`, case
  `in_progress` + `accepted_bid_id`, every other active bid
  `rejected_auto` (offers `superseded`), conversation upserted `active` +
  `contacts_unlocked`, other `pre_acceptance` chats on the case `closed`,
  one append-only `contact_disclosures` row (fields, IP, device), journal
  `bid_accepted` / `contacts_disclosed` / `bid_rejected` per loser,
  notifications (`bid_accepted` or `offer_accepted`, `bid_rejected`) in the
  same transaction. Idempotency-Key supported.
- `GET /cases/:id/bids` (client owner's bid list, §5.2).
- `GET /cases/:id/contacts` (accepted attorney only; `SUBSCRIPTION_REQUIRED`
  while the subscription is inactive, opens again on renewal without a
  second disclosure row, §8.3); `POST /cases/:id/contact-issues` (§8.4).
- `POST /admin/contact-issues/:id/resolve` (support/moderator/super_admin,
  audit_log): `contact_issue_update` to both sides, `moderation_notice` on
  `confirmed`, client suspended at `contacts.suspend_after_confirmed_reports`
  (default 3).
- New error codes (API enum, mobile `ApiErrorCodes`, en/ru,
  `pending_keys/stage-4-5.csv`): `BID_ATTORNEY_INACTIVE`, `CONTACTS_LOCKED`,
  `CONTACT_ISSUE_ALREADY_OPEN`, `CONTACT_ISSUE_INVALID_STATE`.

Tests: e2e `stage-4-5.e2e-spec.ts` 4/4 (parallel accepts — exactly one
wins, stable 3/3 re-runs; auto-reject, in_progress, gone from feed,
journal rows, single disclosure; contacts subscription gate; inactive
attorney; suspension on the 3rd confirmed report); stages 4.1–4.4 e2e
43/43; API unit 689/689; flutter test 583/583, analyze 0 errors/warnings.

## Stage 4.6 — Case lifecycle and jobs (API)

docs/04_CASES_BIDS.md §16 stage 4.6, §10.

- `CaseLifecycleService` / `CaseLifecycleController`
  (`modules/cases/lifecycle`): `POST /cases/:id/complete` (client
  "Выполнено": pending_completion, auto_close_at = +7 days,
  `completion_requested` to the attorney), `POST /cases/:id/confirm-completion`
  (attorney → closed), `POST /cases/:id/dispute {reason}` (attorney →
  disputed + `case_disputes` row; Idempotency-Key). Non-participants: 404.
- `POST /admin/case-disputes/:id/resolve {decision: closed|in_progress, note}`
  — API stub with a role (support/moderator/super_admin), audit_log; the
  admin screen is docs/06.
- Every close (confirm, auto-close, admin close): `case_closed` to both
  sides + `review_requested` to the client (docs/03 §7.3).
- `CaseStateMachine`: new in-place system action `system_stale_prompt`
  (`stale_prompt_sent_at = now()`), so the §10.2 job changes cases only via
  the machine (.cursorrules).
- Hourly jobs (`jobs/handlers/case-lifecycle.jobs.ts`): stale prompt
  (30 days idle → `case_stale_prompt`), auto-archive (14 days after the
  prompt without activity → archived, active bids rejected_auto reason
  `case_archived`, pre-acceptance chats closed, `case_archived`), auto-close
  (`auto_close_at` reached → closed, `auto_closed`), completion reminder
  (≤ 24 h left → one `completion_reminder`). Keyset batches of 500 on the
  §10.2 partial indexes; each case re-checked under `SELECT … FOR UPDATE`;
  Redis lock per job (`withJobLock`, SET NX PX + compare-and-delete).
- `CasesService.toFullDto` made public for the lifecycle controllers.

Tests: e2e `stage-4-6.e2e-spec.ts` 6/6 with an injected clock (stale
prompt once, archive at +14 d, keep-alive reset, reminder once, auto-close
at +7 d, confirm/dispute/admin decision, held lock skips); unit: machine
table 6×14, runner dispatch; API unit 695/695.

## Stage 4.7 — Case history (API)

docs/04_CASES_BIDS.md §16 stage 4.7, §12.

- `CaseHistoryModule` (`modules/case-history`):
  `GET /users/me/case-history?cursor=&limit=`, `GET /users/me/case-history/:caseId`
  (timeline from `case_journal`), `POST /users/me/case-history/export` (202,
  BullMQ queue `case-history-export`), `GET /users/me/case-history/export/:exportId`
  (status; when ready a signed S3 link valid 10 minutes).
- Client: cases where `client_id` = user; attorney: cases they bid on —
  including closed, archived and deleted-from-feed cases. Read-only: no
  update/delete route. Attorney timelines hide other attorneys' bid events;
  the client's name shows only if contacts were disclosed to that attorney
  (else null → "Client"); accepted bid shown to an attorney only if theirs.
  Payload reduced to display fields (no IP/device from contacts_disclosed).
- Reauth: viewing needs a valid `X-Reauth-Token` for its 5-minute life
  (`ReauthVerifier.assertValid`, non-consuming; a consumed token is still
  refused); export and every download link consume one (ReauthGuard) —
  "при повторном скачивании нужен новый reauth". Entry into the section
  and each timeline write `history_viewed` to auth_events.
- PDF: pdfkit (MIT) with Inter (`apps/api/assets/fonts`, Latin + Cyrillic),
  up to 1000 most recent cases per file, private `documents` bucket
  (`exports/case-history/<userId>/<exportId>.pdf`); export state in Redis
  24 h; jobId = exportId (no double render). Worker process runs the queue
  too (`CaseHistoryModule.register({ mode: 'worker' })`).
- Deviation (no migration allowed outside 4.1): there is no
  `notification_type` for "PDF ready" yet, so the app polls the export
  status; TODO(docs/05) adds the push.

Tests: e2e `stage-4-7.e2e-spec.ts` 3/3 (REAUTH_REQUIRED; deleted case stays
in history; same token for list+timeline; history_viewed rows; attorney
name/bid visibility; PDF `%PDF` via a link with `X-Amz-Expires=600`;
reused token → REAUTH_INVALID; foreign export 404); API unit 695/695.

## Stage 4.8 — Case & bid notifications

docs/04_CASES_BIDS.md §16 stage 4.8, §13.

- Every §13 event is emitted through `NotificationsService.emit()` inside
  the transaction of the change it announces (bid_received,
  offer_countered, bid_accepted, offer_accepted, bid_rejected incl.
  `reason=withdrawn`, negotiation_failed, case_updated, case_stale_prompt,
  case_archived, completion_requested, completion_reminder, case_closed,
  contact_issue_update, moderation_notice) — a retried transaction rolls
  its row back, Idempotency-Key replays create none, jobs re-check under
  row locks / Redis claims.
- Push queue (`modules/notifications/push`): `emit()` queues a delayed job
  on the `push` BullMQ queue with jobId = notification id (at most one
  push per stored row; never fails the caller on a Redis outage).
  `case_updated` (and likes) are list-only. `PushDispatcher` (API while
  JOBS_ENABLED, always in the worker) reads the committed row (a row that
  never committed is retried, then dropped), honours
  `notification_settings.push_enabled` per category, localizes the text by
  `users.ui_language` and hands it to `PushSender` — a logging stub until
  docs/05 wires FCM (TODO(docs/05 §9.5)).
- Localized templates `notif.bids.<type>.title|body`,
  `notif.cases.<type>.title|body` (en/ru defaults in
  `notification-templates.ts`, overridable in `i18n_translations`;
  `pending_keys/stage-4-8.csv`; same keys in mobile `static_translator`).
- Fix: the §10.2 jobs now use a lean `CaseLifecycleModule`, so the worker
  process boots without HTTP-side modules (jobs e2e caught it).
- Fix (stale since stage 4.2): `onboarding.e2e-spec.ts` still expected the
  stage 1.7 `POST /cases` stub (501 / empty body); it now posts a valid
  case and checks the role/contacts gates and a real 201.

Tests: e2e `stage-4-8.e2e-spec.ts` 3/3 (full negotiation → one row per
event and recipient, retries add none; one push job per row, case_updated
not queued; ru text, disabled category, rolled-back row); full API e2e
30/30 suites (234 tests); unit 695/695.

## Stages 4.9/4.10 — API support for the app screens

docs/04_CASES_BIDS.md §9, §11, §15 (`modules/cases/mine`).

- `GET /users/me/cases/:id` — the owner's case (CaseDto) + "Адвокат в
  работе" (accepted bid with the attorney summary) + the chat id.
  Deviation: §15 lists one `GET /cases/:id` with per-role representations;
  the generated typed client needs one response shape per route, so the
  owner representation lives here and `GET /cases/:id` stays the
  attorney one (§4.3).
- `GET /users/me/bids?filter=active|finished` — "Мои биды" (case ref +
  last offer), keyset on bids(attorney_id, status, updated_at DESC).
- `GET /users/me/work?filter=active|closed` — "В работе" / "Завершённые";
  the client's name is null while the subscription is inactive (§8.3).
- `GET /saved-items?type=case` — saved cases: available ones as feed
  cards, closed / no-longer-visible ones `available=false` ("Кейс
  недоступен"). §15 lists only POST/DELETE; the list is needed by §11.2.
- `POST /cases/:id/conversation` — "Написать клиенту" (§9 rule 2): case
  visible to the attorney, active subscription/trial, one conversation per
  (case, attorney), `pre_acceptance`, open cases only.

Tests: e2e `stage-4-mine.e2e-spec.ts` 4/4; unit 695/695.

## Stages 4.9 / 4.10 — Flutter: cases & bids for clients and attorneys

docs/04_CASES_BIDS.md §3, §4, §5, §6, §8, §11, §12 (`apps/mobile/lib/features/cases`).

**Client (4.9)**
- "+" → case wizard (§3.1): practice (category → specialization, search,
  "Not sure"), essence, place (main state from the profile, up to 2 more,
  city), budget (amount / "Clarify later"), review with the disclaimer and
  the first-case `client_contact_sharing` checkbox; publish with the gavel
  strike. Draft kept only locally (drift `lawbid_cases`, per account),
  saved as you type; closing offers Save / Discard; restored draft banner.
  CASE_CONTAINS_CONTACT_INFO returns to the text step with the message.
- "Моё" → "Мои кейсы" (Active / Archive / Closed) with unseen-bid counts
  (local), "Сохранённое" (posts: docs/05). Case detail: status actions
  (edit, close, delete, restore, "Выполнено", review), "Адвокат в работе",
  bids with sorting (newest / lowest price / top rated). Edit screen reuses
  the wizard steps; practice/states locked once bids exist.
- Bid detail with the negotiation timeline (dialogue by rounds, gold rail,
  closing line incl. "Стороны не договорились"), round counter, actions by
  turn: accept (gavel strike), decline, counter (binding-offer warning).
- Client profile "Мои кейсы" (§11.3): locked grid of the cases.

**Attorney (4.10)**
- Feed → "Кейсы" tab: cards (category band + NEW, place, budget, views,
  bids, "Вы сделали бид"), filters by own practice / licensed state, gates:
  not verified, no verified license, no practices.
- Case detail (no client field), save/unsave, "Сделать бид" or the own bid
  card (`ownBidId`), "Написать клиенту"; SUBSCRIPTION_REQUIRED → the
  subscription call-to-action (paywall is docs/06).
- Bid form (§5.1). "Моё": "Мои биды" (Active / Finished, "Re: …"),
  "В работе" + "Завершённые", "Сохранённое" (unavailable cases marked).
- In-progress case: client contacts with Call / SMS / Email / Chat, locked
  notice without a subscription, "Не могу связаться", confirm / dispute.
- Settings → "История кейсов": SMS-code reauth, read-only list and
  timelines, PDF export (polling; the link consumes the token).

**Design**: in-app only (pre-app screens untouched), navy/gold, Source
Serif titles, staggered entrances, sliding segmented controls and tab
underline, animated round pips and checkmarks; everything respects
reduce-motion; 44/48 targets; tokens + t() only; 5 states on every list.

**Other**: deep link `/case/:id` opens the real screen; `PagedNotifier`
shared pagination; 322 en/ru keys (`pending_keys/stage-4-9-10.csv`).
Chat screens are docs/05 (buttons explain where chats will appear).

Tests: flutter test 591/591 (new: draft rules, wizard publish/consent and
contact-info error, bid actions by turn, empty states); analyze 0
errors/warnings. Fixed along the way: empty-state sliver crash
(LayoutBuilder intrinsic), drift row class name clash.

## File 04 review fixes (subagent review: security, load, Flutter) — 2026-09-28

- Security: case-history client name also gated by an active subscription
  (§8.3); one case-history export per user in flight (Redis claim) and one
  S3 object per user (`latest.pdf`), link re-checks the user is active;
  "Не могу связаться" check-then-create under the bid row lock.
- Load: §10.2 jobs skip-and-log a failing case instead of aborting the run;
  stale-prompt / auto-archive walk new partial indexes (archive keyed by
  `stale_prompt_sent_at`); completion reminder relies on the Redis claim
  (no notifications scan). View counter: SADD+EXPIRE+HINCRBY in one Lua
  call; flush runs on one pod at a time. History PDF export batched (4
  queries instead of ~3 per case). Saved cases: one visibility query per
  page (`CaseAccessPolicy.visibleCaseIds`). "В работе" reads from the
  attorney's accepted bids. Migration `file04_scale_indexes` (OQ-011 #5).
- Not changed (by design): the accept transaction appends journal rows one
  by one — the hash chain is sequential by definition; losing bids per case
  are few.

## Stage 5.1 — Migration, counters, foundation

docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md §16 stage 5.1, §12–§14.

- Migrations (§14): `stage_5_1_file_purpose_post_video` (own file:
  CockroachDB can't use a new enum value in the adding transaction) and
  `stage_5_1_feed_chat_notifications` — `posts.edited_at`,
  `notifications.dedupe_key` + `aggregate_count` (default 1), partial UQ
  `(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL`, app_config
  `rate_limit.*` (§13) and `notifications.retention_days` = 180.
- `CounterAggregator` (`modules/counters`, global): bumps go to Redis
  pending hashes (+ "touched today" set) in one EVAL; one flusher across
  pods every 10 s applies each counter in one multi-row UPDATE (deltas put
  back on DB failure); reads can overlay pending deltas; nightly
  `counters.reconcile` job recomputes touched posts / comments /
  attorney profiles from the source tables.
- `UsageLimitsService` (`common/usage-limits`): §13 per-user fixed-window
  limits from app_config → 429 `RATE_LIMITED`.
- `ContentModerationHook` seam with the `allow` stub (§12.2, docs/06
  replaces it). `post_video` uploads answer `FEATURE_DISABLED` while the
  `video_posts` flag is off (§3.6).
- Error codes (API enum, mobile `ApiErrorCodes`, en/ru,
  `pending_keys/stage-5-1.csv`): POST_NOT_FOUND, POST_NOT_ALLOWED,
  COMMENT_NOT_FOUND, FOLLOW_NOT_ALLOWED, CONVERSATION_NOT_FOUND,
  CONVERSATION_CLOSED, MESSAGE_TOO_LONG, FEATURE_DISABLED,
  SEARCH_QUERY_TOO_SHORT.

Tests: e2e `stage-5-1.e2e-spec.ts` 3/3 (flush to DB, reconcile fixes
drift, 429 past the limit); unit jobs/files green; flutter test 591/591.

## Stage 5.2 — Posts and media (API)

docs/05 §16 stage 5.2, §3.

- `PostsModule` (`modules/posts`): `POST /posts` (Idempotency-Key; verified
  active attorney only → else 403 POST_NOT_ALLOWED; §13 limit
  `post_create`; ContentModerationHook allow/hold/block → published /
  hidden / 422), `GET /posts/:id`, `PATCH /posts/:id` (text only, hashtags
  recomputed, `editedAt` = "Изменено"), `DELETE /posts/:id` (soft),
  `GET /attorneys/:id/posts` (cursor; the author also sees own hidden).
- Hashtags (§3.1): letters/digits/`_`, ≤ 30 chars, lowercase, max 10 (the
  11th ignored), stored in `tags` / `post_tags`.
- Photos (§3.2): up to 10 clean `post_image` files in order
  (`FilesService.assertAttachable`; a file can't be reused); the scan
  worker re-encodes post photos (EXIF/GPS stripped — was kept before),
  main ≤ 2048 px + 320 / 1080 px variants; `FilesService.postImageUrls`
  signs all three (CloudFront: TODO docs/06).
- `PostPresenter`: PostDto for a page in a fixed number of queries
  (authors + avatars, media, likedByMe/savedByMe, tags, pending counter
  deltas) — reused by feed, tags, search and saved lists.
  `VISIBLE_POST_WHERE`: published, not deleted, author active and not
  suspended.
- `posts_count` through the counters aggregator (+1 publish, −1 delete).

Tests: e2e `stage-5-2.e2e-spec.ts` 5/5; unit hashtags + post photo
processing.

## Stage 5.3 — Feed (API)

docs/05 §16 stage 5.3, §2.2.

- `GET /feed?cursor=&limit=10..20` (`modules/feed`, `FeedProvider` seam for
  later profile promotion): followed attorneys' posts (+ own for an
  attorney), newest first; with follows every 4th item is a
  recommendation, without follows 100%; when followed posts run out,
  recommendations fill the page.
- Recommendations: `FeedRecoJob` every 10 minutes scores posts of the last
  14 days `(likes + 2·comments + 2·saves) / (age_h + 2)^1.5` (active,
  non-suspended authors) into a versioned ZSET `feed:reco:<v>` (TTL 1 h)
  and moves `feed:reco:current`.
- Opaque cursor `{f: last followed (created_at,id) | null, r: offset in the
  pinned snapshot, v: snapshot version}` — no SQL offset; pages stay stable
  while the snapshot is recomputed.
- Exclusions: non-published / deleted / suspended-author posts
  (`VISIBLE_POST_WHERE`); recommendations skip followed and own authors and
  the viewer's last 500 shown recommendations (ZSET, TTL 3 days). Followed
  posts are not hidden by "seen" so the feed still opens on them.
- First page cached in Redis for 60 s per user.

Tests: unit `feed-mixer.spec.ts` (mixing, multi-page no dups/gaps, cursor,
score); e2e `stage-5-3.e2e-spec.ts` 2/2.

## Stage 5.4 — Likes, comments, saves, reports (API)

docs/05 §16 stage 5.4, §4, §5, §12.1.

- Post likes `POST/DELETE /posts/:id/like` — idempotent on the PK; counter
  and `post_like` notification only when a row changed; §13 `like` limit.
- Saved posts through `/saved-items` (`itemType = post`, was 501) and
  `GET /saved-items/posts` (deleted/hidden → `available = false`, "Пост
  недоступен"); `save_count` via the aggregator.
- Comments (`modules/comments`): `GET /posts/:id/comments`,
  `GET /comments/:id/replies` (newest first, 20), `POST /posts/:id/comments`
  (1–1000 chars, moderation hook, §13 `comment` limit; one level — a reply
  to a reply attaches to the top-level parent with `@username` put in
  front), `DELETE /comments/:id` (author or the post's author; a top-level
  comment takes its replies), `POST/DELETE /comments/:id/like`.
  Notifications `post_comment`, `comment_reply`, `comment_like`.
- Comment authors: attorney → public profile fields; client → only
  "Anna K." (no id, no avatar) — client profiles stay closed.
- `POST /reports` (post, comment, message, user): §13 `report` limit; a
  repeat by the same user on the same object is ignored (Redis claim + DB
  check; no unique index — §14 allows no other schema change).

Tests: e2e `stage-5-4.e2e-spec.ts` 4/4.

## Stage 5.5 — Follows and suggestions (API)

docs/05 §16 stage 5.5, §6.

- `modules/follows`: `POST/DELETE /attorneys/:id/follow` — attorneys only,
  never yourself (`FOLLOW_NOT_ALLOWED` 422); idempotent; `followers_count`
  / `following_count` via the counter aggregator; `new_follower`
  notification only when a row was created; §13 `follow` limit.
- `GET /attorneys/:id/followers` lists attorney followers only (clients are
  counted, never named); `GET /attorneys/:id/following` — both 404 unless
  the id is an active, non-suspended attorney, so a client's follows are
  never listable by others.
- `GET /users/me/following` — the caller's own follows (§6.2).
- `GET /suggestions/attorneys` — verified attorneys ranked by rating and
  activity (posts in 30 days), the client's own state first; the pool is
  cached in Redis per state for 10 minutes; followed and self are filtered
  out per request.
- Public attorney profile: `isFollowing`, counters overlay pending
  aggregator deltas.

Tests: e2e `stage-5-5.e2e-spec.ts` 3/3; unit 703/703.

## Stage 5.6 — Search (API)

docs/05 §16 stage 5.6, §7, §15 "Поиск".

- `modules/search`: `SearchProvider` interface (`searchAttorneys`,
  `searchCases`, `searchPosts`, `searchTags`) with `CockroachSearchProvider`
  on the docs/02 §5.3 indexes (trigram GIN on `username_lower` /
  `full_name_lower`, tsvector GIN on `posts/cases.search_tsv`, btree prefix
  on `tags.tag_lower`).
- `GET /search/attorneys` — name, `@username`, practice name, state; filters
  practice, state, min rating, language. Attorneys only (clients are never
  found), `suspended` hidden. Ranking: exact `@username`, prefix, trigram
  similarity, then `verified`, then rating. List rows gain
  `practiceI18nKeys` (first 3 practices, also in follows/suggestions).
- `GET /search/cases` (attorneys only, 403 otherwise) — full text within the
  docs/04 §4.1 visibility query (`buildVisibleCasesSql` gets optional
  `text` / `since`), filters practice, state, period 24h/7d/30d/all; every
  page also passes `CaseAccessPolicy.visibleCaseIds`. Unverified → empty.
- `GET /search/posts` — published posts by `ts_rank`, then date.
- `GET /search/tags` — hashtag prefix; `GET /search/trending-tags` — top 20
  of 7 days from Redis, rebuilt by cron `search.trending-tags` every 10 min.
- `GET /tags/:tag/posts?sort=top|new` — "Топ" by the §2.2.2 score over the
  newest 5000 tagged posts, "Новые" by date (keyset).
- Cost/scale: ranked results (attorneys, posts, tag top) are computed once
  per query into a shared Redis id list (5–10 min) and paged by position —
  next pages are one Redis read, no SQL OFFSET. Cache keys hash the query,
  never the user id. §13 `search` limit (30/min) on `/search/*` except
  trending. Request logs redact the query string of `/search/*` (§7.6).

Tests: e2e `stage-5-6.e2e-spec.ts` 4/4 (incl. EXPLAIN on the trigram and
tsvector indexes); unit `search-text.spec.ts`.

## Stage 5.7 — Chats and realtime (API)

docs/05 §16 stage 5.7, §8, §15 "Чаты"; docs/04 §9.

- `modules/chat`: `GET /conversations?cursor=&updatedSince=` (by
  `last_message_at`, chats with a message; unread count, mute, the other
  side's `last_read_message_id` for "Seen"), `GET /conversations/:id`,
  `GET /conversations/:id/messages?cursor=` (newest first) and `?afterId=`
  (catch-up after a reconnect), `POST …/messages {clientMessageId, body}`
  (idempotent on the UQ, 2000 chars → `MESSAGE_TOO_LONG`, `closed` →
  `CONVERSATION_CLOSED` 409, attorney without subscription →
  `SUBSCRIPTION_REQUIRED`, §13 `message` limit; the row lock serializes
  with closing/unlocking), `POST …/read` (forward only, `message:read`),
  `PATCH …/mute {until}`.
- Counterpart: an attorney sees the client as "Клиент по кейсу" (no id,
  name or photo) until `contacts_unlocked`; a client always sees the
  attorney.
- Contact masking (§8.3): `maskContactInfo` next to the file-04 detector —
  phones (separators, spelled-out digits), emails (also "at … dot"), links
  → `[контакт скрыт]` in `body_display`; `body_original` kept; never after
  unlock.
- System messages (§8.2) inside the file-04 transactions
  (`ChatSystemMessages`): `offer_accepted` on accept, `accepted_by_other`
  (+ closed) in the other attorneys' pre-acceptance chats, `no_agreement`
  on decline/withdraw, `case_closed` on client close/delete and auto-archive
  (pre-acceptance chats closed — client close/delete did not close them
  before, docs/04 §9) and on completion close. `conversation:update` is
  published after commit.
- Realtime (§8.5): Socket.IO namespace `/realtime`, JWT at the handshake
  and on `auth:refresh`, disconnect at token expiry, rooms `user:{id}` and
  `conversation:{id}` (participants only), `typing:start/stop` relayed
  (≤ 1/s per socket, not stored), Redis adapter across instances;
  `RealtimePublisher` (Redis emitter) works from the API and the worker.
  Presence set `rt:view:{user}:{conversation}` for push suppression (5.8).
- Search (5.6 follow-up): short queries return `SEARCH_QUERY_TOO_SHORT`.

Deps: @nestjs/websockets, @nestjs/platform-socket.io, socket.io,
@socket.io/redis-adapter, @socket.io/redis-emitter; dev socket.io-client.

Tests: e2e `stage-5-7.e2e-spec.ts` 5/5 (two API instances); unit masking
cases; full unit 712/712, full e2e 38 suites green.

## Stage 5.8 — Notifications, push, badges (API)

docs/05 §16 stage 5.8, §9, §10, §15 "Уведомления и push".

- `NotificationsService.emit` (single entry point): stores the row and
  aggregates `post_like`, `comment_like`, `new_follower` per object and
  hour (`dedupe_key` on the partial UQ, `aggregate_count`, latest actor,
  back to unread and to the top). `new_message` is never stored — it only
  queues its push.
- Delivery (`push` queue, after commit): realtime `notification:new` +
  `badge:update`; push only for the first row of an aggregate and push
  types; category settings with `system` locked on; quiet hours defer the
  job to their end (per the user's time zone, across midnight;
  `security_new_device` exempt); chat pushes skipped while muted or while
  the chat is open on a device (`rt:view:*`); email for `system` types
  (once per row; `security_new_device` stays with the auth email channel).
- FCM HTTP v1 sender (google-auth-library), chosen automatically when
  `FCM_*` env is set; one send per device per logical push (retries skip
  served devices), `UNREGISTERED`/invalid tokens deleted, 4 attempts with
  exponential backoff. Tokens bound to the session chain: sign-out stops
  pushes.
- REST: `GET /notifications` (actor: attorney by profile, client as
  "Anna K."), `POST /notifications/read {ids|all}`, `GET /badges`,
  `GET/PUT /notification-settings`, `PUT /notification-settings/quiet-hours`,
  `POST/DELETE /push-tokens`.
- Badges (§10): Redis hash per user (chats, notifs), +1 on a message,
  recount on reads/notifications, rebuilt from the DB when missing and at
  least daily (TTL). `new_message` is not a row, so never counted twice.
- Push templates en/ru for messages, social and system types; the auth
  new-device push leg now emits `security_new_device`.
- Cron `notifications.retention` (04:40 UTC): deletes rows older than
  `notifications.retention_days` in batches.
- Email provider factory shared by auth and notifications (same selection).

Tests: e2e `stage-5-8.e2e-spec.ts` 6/6; stage 4.8 queue assertion updated
(list-only rows are queued with `push: false`); files e2e moved to its own
phone range (collided with profiles-practices); unit `notification-rules`.
Full unit 715/715, full e2e 39 suites / 270 tests green.

## Stage 5.9 — Flutter: feed, posts, comments, follows

docs/05 §16 stage 5.9, §2–§6, §11 (feed).

- `features/social`: repository (feed, posts CRUD, likes, saves via
  `/saved-items`, comments/replies, follows, suggestions, tag pages,
  reports, post photo upload presign → S3 → scan), drift store
  `lawbid_social` (feed first page for offline, chat outbox and recent
  searches for 5.10/5.11), providers with one source of truth for posts
  shown in many lists (likes/saves/edits/deletes sync everywhere),
  optimistic like/save/follow with rollback and in-flight dedupe (a second
  tap never calls the API twice).
- Feed: clients get one post stream; attorneys "Лента | Кейсы" with each
  tab's scroll kept (IndexedStack). Empty feed: "Пока в ленте пусто" +
  "Рекомендуемые адвокаты"; offline: the cached first page.
- Post card: author (gold ring for verified, blue check), time ago,
  "⋯" (report / copy link; own: edit text / delete / copy link), photo
  carousel with a gold page indicator, double tap = like with a heart
  bloom, animated like/save, share sheet with `lawbid.app/post/:id`,
  3-line text with "ещё", tappable #tags, "Посмотреть все комментарии".
  Text-only posts as quote cards.
- Post screen (`/post/:id`, also the deep link): post, disclaimer,
  comments with one reply level ("Anna K." for clients), likes, delete,
  report, composer with reply-to.
- Composer ("+" for attorneys): text with a 2200 counter, up to 10 photos
  uploaded as they're picked, drag to reorder, disclaimer.
- Tag page `#tag` (Топ / Новые), follower / following lists, profile:
  real Follow button (morphing pill), follower counters open the lists,
  "Посты" tab is a 3-column grid (text posts as tiles). "Моё →
  Сохранённое" shows saved posts ("Пост недоступен" when gone); attorneys
  switch between saved cases and posts.
- Packages: share_plus, cached_network_image (images cached by stable file
  key, so signed-URL rotation doesn't re-download), plus socket_io_client,
  firebase_core/messaging, app_badge_plus, flutter_timezone for 5.11.

Tests: `test/features/social` (optimistic like + rollback, no double API
call, double tap only likes, offline cache fallback, post card render);
deep link `/post/:id` now opens the post screen; feed/profile goldens
updated. flutter test 597/597.

## Stage 5.10 — Flutter: search

docs/05 §16 stage 5.10, §7, §11 (search).

- Search tab (replaces the stub): one query for all result tabs — clients
  "Адвокаты | Посты | Темы", attorneys "Люди | Кейсы | Посты | Темы";
  2+ characters and a 300 ms debounce, so one request per pause in typing
  (never per keystroke).
- Flip search bar: while idle and empty the hint flips through what can be
  searched (name, @username, #topics, practice/state or cases) like a
  split-flap board; focus warms the border to gold with a soft glow, the
  icon tilts, "Cancel" slides in, clear pops in. Reduced motion: static
  hint. The whole bar is a 48 px tap target.
- Before typing: recent searches (local drift, per account, "Очистить"),
  popular topics (trending, with post counts), recommended attorneys.
- Results: attorney rows (rating, practices, states, Follow), case cards
  (the attorney's accessible cases only — server-side), post cards, topic
  rows → the tag page.
- Filters sheet: practice (full tree, searchable), state, min rating and
  language for attorneys; practice, state and period (24h/7d/30d/all) for
  cases; active-filter badge on the tune button.

Tests: debounce + 2-char minimum (one API call for "sa→sau→saul"), role
tabs; a11y suite covers the search screen. flutter test 599/599.

## Stage 5.11 — Flutter: chats, notifications, settings, push, badges

docs/05 §16 stage 5.11, §8–§10, §11 (chat, notifications).

- Feed header: Chats icon with the §10 badge (unread messages + unread
  notifications), a gold count pill that pops on change; iOS app icon
  badge mirrors the total (app_badge_plus).
- Inbox screen "Чаты | Уведомления": a gliding segmented control with a
  count per tab; "Прочитать все"; notification settings shortcut.
- Chats list (§8.1): counterpart (a client is "Клиент по кейсу «…»" with a
  neutral avatar until contacts unlock), last message (system messages and
  hidden contacts localized), time, unread pill, muted icon, case chip,
  role-specific empty states. Refreshed (debounced) on realtime events.
- Conversation (§8.2–§8.5): header with case title (opens the case), "⋯"
  mute/unmute and report; bubbles (own navy, theirs outlined) with day
  separators; delivery states sending → sent → seen (gold double check +
  "Прочитано" under the newest seen); failed messages "Не отправлено ·
  Повторить / Удалить"; system messages as gold pills; masked contacts
  shown as a localized inline marker + one-time hint; typing dots;
  "Чат закрыт" banner; attorneys without a subscription get "Продлите
  подписку" instead of the composer; read receipts only while the chat
  is on screen.
- Offline outbox (drift): a message shows at once as "отправляется", is
  sent in order with its clientMessageId when the connection or the socket
  comes back (never twice — server UQ + single-flight drain); definitive
  refusals stop retrying.
- Realtime client (socket_io_client): `/realtime` with the access token,
  `auth:refresh` on rotation, re-auth on expiry, exponential reconnection;
  after a reconnect the list, badges and open chat catch up over REST.
- Notifications (§9.1): grouped Today / This week / Earlier, actor avatar
  or a category medallion, localized `notif.list.<type>` texts (aggregated
  "Sarah и ещё N"), gold unread dot; tap marks read and opens the target
  (§9.2 routing shared with push taps).
- Settings → Notifications (§9.5): push/email per category (system locked
  with a lock note), quiet hours with time pickers in the device time zone
  (flutter_timezone).
- Push: Firebase messaging token registered per session, re-registered on
  rotation, removed on sign-out; tapping a push opens its screen. Without
  Firebase config files the app runs with push off (docs/KEYS_SETUP.md).
- Case screens: "Написать клиенту" / "Открыть чат" now open the chat.
- API: `PATCH /conversations/:id/mute` and `PUT
  /notification-settings/quiet-hours` accept an absent value as "clear"
  (generated clients drop null fields).

Checks: flutter test 603/603 (outbox sends once after reconnect, refusal
marks "not sent", UUID v4, notification routing); Android debug APK and
iOS simulator builds succeed with the new plugins.

## File 05 review fixes (subagent review: security, load, Flutter) — 2026-09-28

- Security: while contacts are locked the attorney never receives the
  client's user id (messages come with `senderId: null`; `typing` and
  `message:read` carry no user id; a client actor's id is dropped from
  notification payloads and push data). `/search/*` requests are logged
  without their query object. A live socket re-checks the session
  blacklist every 45 s (logout / "log out all" end it). FCM deletes a
  token only on `UNREGISTERED` (a wrong project id can't wipe every
  token), calls time out after 10 s, and a device is claimed with SET NX
  before the send (a crash after FCM's 200 can skip, never duplicate).
  Push tokens: `MinLength(20)`, at most 10 per user. Contact detection
  and masking NFKC-normalize first (full-width digits).
- Load: avatar links for a page in one query (`avatarUrlsMany`) instead
  of one per row in posts, comments, follows, chats, notifications;
  unread counts stop at 100 per chat / 1000 notifications; partial index
  `notifications(user_id, created_at) WHERE read_at IS NULL` and
  `notifications(created_at)` for retention; badge `+1` is one Lua call;
  emit invalidates the cached unread count; feed streams at most the
  2000 most recent follows and checks "seen" by ZMSCORE of the candidates
  only; retention pauses between batches.
- Flutter: the outbox loops until nothing is pending (a message written
  while another is sending is no longer stranded), swallows non-API
  errors, and merges the sent message before removing the outbox row;
  older-page loading has a failed state with Retry (no refire loop, no
  state change during build); push registers per signed-in user
  (user B after user A) and clears the app-icon badge on sign-out;
  `conversation:join` is retried until the server has finished the
  handshake (server side guards an early join); a rotated token
  reconnects a dead socket; sign-in side effects run from a provider,
  not from MainShell's build; a fresh feed first page clears optimistic
  overrides.
- Owner decisions (OQ-014): Instagram-style attorney profile, "Написать"
  → Chats screen, review star filter + order icon, no feed logo.

Tests after the fixes: API unit 715/715, e2e 39 suites / 270; flutter
test 603/603.

# File 06 — Production (stages 6.1–6.12)

Stage entries below were written as fragments in `docs/changelog.d/` during file 06 and folded here at the end of the file (2026-09-29).

## Stage 6.1 — Base security and migration

docs/06_PRODUCTION.md §13 stage 6.1, §4, §10.

- Migration `stage_6_1_admin_credentials_export_jobs` (§10, the only
  schema changes file 06 allows): `admin_credentials`, `data_export_jobs`
  (+ enums), `subscriptions.grace_ends_at`, `audit_log.justification`;
  `app_config` keys `subscription.past_due_grace_days` = 3,
  `moderation.blocked_terms` / `hold_terms` = [], `moderation.auto_hide_reports`
  = 3 (`FILE_06_SETTINGS`, seeded).
- §4.1: CORS only for `ADMIN_ORIGINS` (the app sends no Origin); request
  body cap `BODY_LIMIT_KB` (default 256, Stripe raw body kept) → 413
  `PAYLOAD_TOO_LARGE`; server `requestTimeout` / `headersTimeout` /
  `keepAliveTimeout` (`REQUEST_TIMEOUT_MS`). helmet/HSTS/CSP, validation
  pipe, trust proxy and pino redaction were already in place (file 01).
- §4.3: Sentry (`@sentry/nestjs`) when `SENTRY_DSN` is set, with
  `scrubSentryEvent` (no request bodies/headers/cookies/query, user → id
  only, PII-named fields redacted).
- §4.4 CI: `codeql.yml` (security-extended), `container-scan.yml`
  (new `apps/api/Dockerfile`, Trivy fails on CRITICAL/HIGH),
  `dependabot.yml` (npm, pub, actions, docker), `npm audit` blocks on
  critical (high stays advisory until multer/uuid upgrades), mobile
  `dart pub outdated` advisory.
- Tests: `stage-6-1.e2e-spec.ts` (migration, settings, 413, CORS, log
  redaction of phone/email/token/search text), `authz-matrix.e2e-spec.ts`
  (object routes × anonymous / stranger / wrong role → 401/403/404,
  participant → 200), unit `scrubSentryEvent`.

## Stage 6.2 — Admin: sign-in, RBAC, skeleton

docs/06_PRODUCTION.md §13 stage 6.2, §2.1–2.3 (items 1, 12, 13).

### API
- `modules/admin-auth`: `POST /admin/auth/login/start` (emailed code,
  always 204 — no admin enumeration) → `login/verify` (code → 5-minute
  ticket; on the first sign-in also a TOTP enrollment: base32 secret +
  `otpauth://` URI) → `POST /admin/auth/totp` (authenticator code → admin
  JWT `aud = lawbid-admin`, 8 h; first time returns ten recovery codes
  once) or `POST /admin/auth/recovery`; `POST /admin/auth/logout`,
  `GET /admin/auth/me`. TOTP is RFC 6238 over `node:crypto` (no
  dependency; RFC vectors in `totp.util.spec.ts`); the secret is
  AES-256-GCM encrypted with `ADMIN_TOTP_ENC_KEY` in
  `admin_credentials.totp_secret_enc`; recovery codes are stored as
  SHA-256. Wrong second factor: 5 attempts, then the ticket is burned.
- Sessions: Redis `adm:sess:{jti}` with the 30-minute idle TTL refreshed
  on every request, absolute limit = JWT `exp` (8 h); logout, disable,
  role change and 2FA reset revoke sessions immediately.
- `AdminAuthGuard` + `@AdminEndpoint(...roles)` (= `@Public()` for the
  mobile guard, `@Roles`, guard, audit interceptor, OpenAPI scheme
  `admin`): audience check (mobile tokens → 401 on `/admin/*`, admin
  tokens → 401 on the mobile API), session, then role/status read from
  the DB on every call — deny by default, §2.2 matrix. `@Justification()`
  requires `X-Justification` (10–500 chars) → `audit_log.justification`;
  applied to verification document links.
- Audit: every mutating admin request (and every justified view) gets an
  `audit_log` row from `AdminAuditInterceptor` (`admin.<method route>`,
  body with secret-like keys redacted, IP); services that already write
  before/after rows opt out with `@SkipAutoAudit()`. Sign-in events:
  `admin.login`, `admin.totp_enrolled`, `admin.recovery_code_used`,
  `admin.logout`.
- `modules/admin`: `GET /admin/dashboard` (§2.3.1 numbers, Redis cache
  60 s; revenue = active × $399), `GET /admin/audit-log` (cursor; filters
  adminId/action prefix/targetType/targetId/from/to; non-super_admins are
  forced to their own rows), `/admin/admins` (super_admin: list, create,
  set role, disable/enable, reset 2FA; explicit before/after audit rows;
  no self-disable).
- Migrated to the new guard: `/admin/verification/*` (verifier,
  super_admin), `/admin/case-disputes/*` and `/admin/contact-issues/*`
  (support, super_admin — §2.2 "Кейсы"), `/admin/i18n/*` (super_admin).
  The interim `AdminRolesGuard` and i18n `AdminGuard` are removed.
- Env: `ADMIN_TOTP_ENC_KEY` (≥ 32 chars; sign-in is 503
  `ADMIN_AUTH_NOT_CONFIGURED` until set), `ADMIN_LOGIN_LIMIT_PER_IP_PER_HOUR`
  (20), `ADMIN_PANEL_URL` (optional). New `ErrorCode`s:
  `JUSTIFICATION_REQUIRED`, `ADMIN_TICKET_INVALID`, `ADMIN_TOTP_INVALID`,
  `ADMIN_RECOVERY_CODE_INVALID`, `ADMIN_AUTH_NOT_CONFIGURED`,
  `ADMIN_EMAIL_TAKEN`.
- Contract regenerated (`packages/api-contract`).

### apps/admin (Next.js 15, App Router, TypeScript, Tailwind v4,
shadcn-style components, TanStack Query)
- API types generated from `openapi.json` (`npm run generate`,
  `openapi-typescript` + `openapi-fetch`).
- The admin JWT never reaches the browser: `app/api/auth/session` performs
  the TOTP/recovery exchange and stores the token in an httpOnly,
  SameSite=strict cookie; `app/api/proxy/*` forwards calls to `/admin/*`
  with it and clears the cookie on 401; `middleware.ts` sends
  cookie-less visitors to `/login`. Strict CSP/headers in `next.config.ts`.
- Screens: sign-in (email → code → authenticator with QR enrollment →
  recovery codes shown once, recovery-code fallback), dashboard, audit
  log (filters, "show more"), administrators (create, role, disable/
  enable, reset 2FA). Navigation follows the §2.2 matrix; sections of
  later stages are listed as "скоро".
- CI: `admin-ci.yml` (generate → typecheck → lint → build).

### Tests
- Unit: `totp.util.spec.ts` (RFC 6238 vectors, ±1 step, base32, URI),
  `admin-auth.guard.spec.ts` (401/403 matrix, justification).
- e2e `stage-6-2.e2e-spec.ts`: enrollment + second sign-in, mobile token
  on `/admin/*` and admin token on the mobile API → 401, ticket is not a
  session, 5 wrong codes burn the ticket, no admin enumeration, recovery
  code single use, §2.2 matrix cells, admins CRUD with audit before/after
  and session revocation, auto-audit, dashboard cache, audit-log scoping
  and cursor, idle timeout. `verification`, `stage-4-5/4-6` suites now
  sign in through `/admin/auth` (`test/support/admin-login.ts`).

## Stage 6.3 — Admin: verification UI and users

docs/06_PRODUCTION.md §13 stage 6.3, §2.3 items 2–3, §3.4.

### API
- `modules/admin-users` (`/admin/users`, roles super_admin / moderator /
  support per §2.2): `GET /admin/users` search by name (trigram on
  `full_name_lower`), email, phone (any format → E.164), `@username`, id,
  with role/status filters and cursor; `GET /admin/users/:id` card (role,
  status, profile, licenses, subscription, active sessions/devices with
  push-token counts, last 20 cases or bids, warning count — no contacts);
  `GET /admin/users/:id/contacts` behind `@Justification()` (audited with
  the reason); `POST …/sessions/revoke` (all three roles); `POST …/warn`,
  `…/suspend`, `…/restore` (super_admin, moderator).
- §3.4 sanctions (`AdminUsersService`): warn → `moderation_actions`
  (`warn`) + `moderation_notice` notification (payload carries only the
  action id); suspend → `users.status = suspended` + `suspended_reason`,
  every session revoked (`admin_block`), `moderation_actions`; a client's
  `open` cases → `archived` with active bids `rejected_auto` (shared
  `CaseLifecycleService.archiveInTx`, journal + notifications + chats
  closed), `in_progress` untouched; an attorney gets the file-03 §2.5
  effects (`VerificationAdminService.suspendInTx`: profile suspended, bids
  withdrawn). Restore → `active`, cases stay archived, attorney profile
  restored (`restoreInTx`). Sign-in of a suspended user is refused
  (`ACCOUNT_SUSPENDED`, unchanged from file 01). Every action writes its
  own audit row with before/after; admins can't be sanctioned here.
- Contract regenerated.

### apps/admin
- `/users`: search + filters + cursor list; `/users/[id]`: card, contacts
  reveal through the reason dialog (X-Justification), actions by role
  (revoke sessions; warn / suspend / restore with a reason).
- `/verification`: queue with status/state filters; `/verification/[id]`:
  take, per-license decision (verified / rejected with code + note),
  re-check, documents opened by signed link after a reason, approve /
  request info / reject (rejection code + comment), attorney suspend /
  restore, checks and past requests.
- `useReason()` dialog shared by every "enter a reason" step; nav entries
  for Users and Verification enabled.
- Fixes found in the browser smoke run: CSP allows `'unsafe-eval'` only
  outside production (Next dev react-refresh); the openapi-fetch reroute
  middleware rebuilds requests with a materialized body (Chrome sends
  streaming bodies only over HTTP/2 → `ERR_ALPN_NEGOTIATION_FAILED`).

### Tests
- Unit: `parseUserQuery`. e2e `stage-6-3.e2e-spec.ts`: search by each
  shape + filters + matrix (verifier 403, mobile token 401); card without
  contacts, contacts need a reason and are audited; support revokes a real
  OTP session (token → 401), moderator warns (notification + action, support
  403); client suspension (sessions, `ACCOUNT_SUSPENDED` at sign-in, open
  cases archived + bid rejected_auto, in_progress kept, 409 on repeat,
  restore keeps the archive); attorney suspension (profile suspended, bid
  withdrawn, restore → verified); admins are 403.
- Browser smoke (built-in browser against the isolated e2e DB): sign-in
  with QR enrollment and recovery codes, dashboard, verification queue →
  take → license verified → approved, document link with a reason, users
  search → card → contacts with a reason.

## Stage 6.4 — Moderation

docs/06_PRODUCTION.md §13 stage 6.4, §3.

### API
- `RuleBasedModerationHook` replaces the file-05 stub behind
  `CONTENT_MODERATION_HOOK` (§3.3, no external AI): `moderation.blocked_terms`
  → block (`422 CONTENT_BLOCKED` on posts and comments), `moderation.hold_terms`
  → hold (stored as `hidden`), ≥ `moderation.max_links` (3) links → hold,
  the same normalized text from one author within
  `moderation.duplicate_window_hours` (24) → hold (Redis counter; Redis
  down = rule skipped). Whole-word matching after NFKC/lower-case
  normalization. New `app_config` keys seeded with `FILE_06_SETTINGS`.
- `ModerationService` (global): resolves a report target (post, comment,
  message, review, case, user → author, status, text, context) and applies
  hide / remove / restore with the same side effects as the owners' own
  paths — `posts_count` / `comment_count` / `reply_count` bumps, attorney
  rating recalculation for reviews (file 03 §7.5), `deleted_at` for a
  message (OQ-B). `autoHideIfThreshold`: `moderation.auto_hide_reports`
  (3) distinct reporters with an open or actioned report hide the object
  (OQ-C); called after `POST /reports` and `POST /reviews/:id/report`.
- `/admin/moderation` (super_admin, moderator): `GET queue` — reports
  grouped by object (count, distinct reporters, reasons, first/last
  report, current object status, excerpt, author with warning/suspension
  counts), oldest first, keyset cursor, filters status / targetType;
  `GET targets/:type/:id` — object + context, all reports, author, the
  author's history (sanctions and actions on their content),
  `availableActions`; `POST targets/:type/:id/actions` — `hide`, `remove`,
  `warn`, `suspend`, `restore`, `dismiss`, reason required: open reports
  → `actioned` / `dismissed` with `handled_by`, a `moderation_actions` row
  (except dismiss), an audit row with before/after, `moderation_notice` to
  the author except for dismiss; `warn` / `suspend` / user `restore` reuse
  `AdminUsersService` (§3.4). Non-applicable actions → `409
  MODERATION_ACTION_NOT_APPLICABLE`.
- Contract regenerated.

### apps/mobile
- `Post.status` from the contract; the author sees "Пост на проверке" /
  "Post under review" on their own hidden post (§3.3).

### apps/admin
- `/moderation` queue (status / object filters, grouped rows with reporter
  counts and author warnings) and `/moderation/[type]/[id]` card with the
  object text, context ids, author + history, the reports table and the
  action buttons (each through the reason dialog).

### Tests
- Unit: `RuleBasedModerationHook` (normalization, whole-word terms, links,
  duplicates per author, zero thresholds).
- e2e `stage-6-4.e2e-spec.ts`: blocked term → 422 on post and comment,
  hold term / links / duplicate → `hidden`; 3 distinct reporters hide a
  post (gone from profile, search and a follower's feed; `posts_count`
  follows) and the queue shows the grouped row; 3 reports hide a review
  and recalculate the rating; moderator card + hide/restore/hide (409 on
  repeat)/warn/dismiss/remove with reports, notices and the audit trail;
  support is 403; comment hide keeps `comment_count` in sync; message
  hide sets `deleted_at`.

## Stage 6.5 — Admin: disputes, "Не могу связаться", government requests

docs/06_PRODUCTION.md §13 stage 6.5, §2.3 items 5, 11, 12, §5.4.

### API
- `modules/admin-cases` (support, super_admin — §2.2 "Кейсы"):
  `GET /admin/case-disputes` (open | resolved, oldest first, cursor) and
  `GET /admin/case-disputes/:id` with the `case_journal` chronology
  (last 200 rows) and the opener's other disputes; `GET
  /admin/contact-issues` (open | confirmed | rejected) and
  `GET /admin/contact-issues/:id` with the disclosed fields, the client's
  confirmed count against `contacts.suspend_after_confirmed_reports` and
  the client's other reports. Decisions stay on the file-04 routes
  (`POST /admin/case-disputes/:id/resolve`, `POST
  /admin/contact-issues/:id/resolve`).
- Dispute reopen (`in_progress`) now notifies both parties
  (`case_updated` with `disputeId`/`decision`); `closed` already did via
  `case_closed`. The §8.4 auto-suspension after the 3rd confirmed report
  now carries the §3.4 effects: every session revoked and the client's
  open cases archived (after commit).
- `modules/admin-data-requests` (super_admin): `GET/POST
  /admin/data-requests` (register a subpoena / court order: type,
  reference, agency, received date, scope, notes), `GET /:id` with the
  `data_access_log`, `PATCH /:id/status` (received → in_progress →
  fulfilled | rejected, `closed_at`), `POST /:id/package` behind
  `@Justification()`: sections `profile`, `contacts`, `cases`, `bids`,
  `contact_disclosures`, `messages` chosen per request; the JSON package
  is returned to the panel and every entity in it (user, cases, bids,
  disclosures, conversations) becomes a `data_access_log` row before the
  response; the request moves to `in_progress`; audit rows for create /
  package (with the justification) / status.
- Contract regenerated.

### apps/admin
- `/cases` with the two queues (tabs, "показать решённые"),
  `/cases/disputes/[id]` (reason, parties, journal timeline, close / back
  to work with a comment), `/cases/contact-issues/[id]` (attorney's
  report, disclosure details, client's confirmed count and history,
  confirm / reject with a comment).
- `/data-requests` registry with the registration form and
  `/data-requests/[id]`: scope, package builder (user id + sections →
  reason dialog → JSON download), status editor, `data_access_log` table.

### Tests
- e2e `stage-6-5.e2e-spec.ts`: attorney opens a dispute → queue row and
  card journal → `closed` (journal `dispute_resolved`, `case_closed` to
  both) and `in_progress` (`case_updated` to both); three "Не могу
  связаться" reports → queue, card (disclosure, history) → third
  confirmation suspends the client (sessions revoked, open case archived,
  in_progress cases kept); government request: register, package without
  a reason → 400, with a reason → data (profile, contacts, cases, bids,
  disclosures) and one `data_access_log` row per entity, status →
  `in_progress` → `fulfilled` with `closed_at`, audit trail; support is
  403 on data requests, verifier 403 on disputes.

## Stage 6.6 — Admin: flags, config, localization, legal documents

docs/06_PRODUCTION.md §13 stage 6.6, §2.3 items 7–10.

### API (`modules/admin-config`, super_admin)
- Feature flags: `GET /admin/feature-flags` (enabled, rollout percent,
  description, `paid`, `requiredKeys`, `missingKeys`), `PATCH
  /admin/feature-flags/:key` {enabled?, rolloutPercent?}. Paid flags
  (`stripe_identity`, `persona_verification`, `profile_promotion`,
  `video_posts`, `auto_bar_check`) need their provider keys in env
  (`STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID`, `PERSONA_API_KEY`,
  `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET`, `BAR_LOOKUP_API_KEY` — new optional
  env keys) or enabling is `409 FLAG_PROVIDER_KEYS_MISSING`. The flags
  cache is dropped on every write, so `GET /config/bootstrap` reflects the
  change at once; audit before/after.
- `app_config` editor: `GET /admin/config` lists every editable key with
  its schema (type, min/max, default, current value, stored?) — the typed
  `APP_SETTINGS` tunables, the cost-guard `budget.*` caps,
  `sms.allowed_country_codes`, `min_app_version_ios|android`; `PUT
  /admin/config/:key` validates against the schema (unknown keys and wrong
  types/ranges → 400), drops the config cache, audits before/after.
- Localization: `GET /admin/i18n/languages` (all, with translation counts
  and bundle versions), `PATCH /admin/i18n/languages/:code` {isActive,
  sort} (`en` can't be disabled), bootstrap cache dropped. The existing
  xlsx/csv import already creates a language from a new column; it now
  also drops the bootstrap cache so the app sees the language without a
  release.
- Legal documents: `GET /admin/legal-documents` (+ `/:id` with the full
  text), `POST /admin/legal-documents` (draft version per type + locale,
  Markdown or URL), `POST /admin/legal-documents/:id/publish` (becomes
  current for its type + locale, previous current archived, bootstrap
  cache dropped). Re-acceptance: `OnboardingService` now requires that the
  accepted `terms` / `privacy` / `disclaimer` consent points at the
  current version for the user's locale (fallback `en`); otherwise
  `consents` is back in `missing` and the app's guard shows the consents
  step on the next sign-in.
- Contract regenerated.

### apps/admin
- `/flags` (switches with the paid-service warning and key status,
  rollout percent), `/config` (typed inline editor with client-side
  parsing and server validation), `/i18n` (languages on/off, import
  dry-run → apply with the report, export link), `/legal` (versions table
  with current/draft/archive, text preview, draft form, publish).

### Tests
- e2e `stage-6-6.e2e-spec.ts`: paid flag lists missing keys and refuses to
  enable (409) while rollout edits work; a free flag flip shows up in the
  next `/config/bootstrap`; finance is 403; config schema list, wrong
  type / range / unknown key / bad country code → 400, a valid write is
  visible through `AppSettingsService` and audited; xlsx import with a new
  language column (dry-run adds nothing, apply adds the language and
  bootstrap lists it), language switch-off removes it from bootstrap, `en`
  can't be disabled; a user who accepted the current documents stays
  complete after a draft is created and loses `requiredConsentsGranted`
  once the new terms version is published, until they accept the new
  document id.

## Stage 6.7 — Stripe: subscription backend

docs/06_PRODUCTION.md §13 stage 6.7, §1.1–1.6.

### API
- `modules/billing` behind `PaymentProvider` (§1.8): `StripePaymentProvider`
  (official SDK; customers, SetupIntents, subscriptions with
  `trial_period_days = 7`, card fingerprint, Customer Portal, webhook
  signature) and `FakePaymentProvider` used when `STRIPE_SECRET_KEY` is
  unset (dev / e2e; webhooks with `Stripe-Signature: fake`, state
  versioned so out-of-order events behave like Stripe's re-read).
- `SubscriptionAccessService` is real (§1.2): `trialing`/`active`, or
  `past_due` before `grace_ends_at`; Redis cache 60 s, dropped by the sync
  service and admin actions; a transaction client bypasses the cache
  (bid accept). The stage-4 stub (verified ⇒ active) is gone.
- `POST /subscriptions/start` (verified attorneys; customer + SetupIntent,
  `trialEligible`), `POST /subscriptions/confirm` (card → subscription;
  one trial per attorney and per `card_fingerprint`, otherwise `409
  SUBSCRIPTION_TRIAL_UNAVAILABLE` until the app repeats with `chargeNow`),
  `GET /subscriptions/me`, `GET /subscriptions/payments`, `POST
  /subscriptions/portal-session`, `POST /subscriptions/cancel`
  (`cancel_at_period_end`).
- `POST /webhooks/stripe` (§1.5): raw-body signature, row in
  `stripe_webhook_events` (idempotent by id), immediate 200, BullMQ queue
  `stripe-webhooks` (5 attempts, exponential backoff, then
  `stripe-webhooks-dlq` + error log). `SubscriptionSyncService` re-reads
  the subscription from the provider for every event and reconciles the
  row; access transitions: lost → `BidsService.withdrawActiveBidsForAttorney`
  + `subscription_status`; regained → `subscription_status`;
  `invoice.payment_failed` / `payment_action_required` → `past_due`,
  `grace_ends_at = now + subscription.past_due_grace_days`, failed
  `payments` row, `subscription_payment_failed`; `invoice.paid` →
  succeeded `payments` row; `charge.refunded` → `refunded`. Status map:
  `unpaid` / `incomplete_expired` → `expired`; a cancellation without a
  successful payment → `expired` (OQ-H).
- Trial reminder: delayed BullMQ job (`subscriptions` queue) at
  `trial_ends_at − 2 days`, skipped when canceled or no longer trialing
  (`subscription_trial_ending` with date and amount).
- Admin (§1.6): `GET /admin/subscriptions/:userId` (support, finance,
  super_admin — subscription, payments, Stripe Dashboard link, trials used
  with the card), `POST /admin/subscriptions/:userId/extend` (finance,
  super_admin; days + reason; `trial_end` moved at the provider, audited,
  `subscription_status` to the attorney).
- Workers run in the API process while `JOBS_ENABLED` and always in the
  `worker` process (`BillingModule.register({ mode })`). New optional env
  `STRIPE_PORTAL_RETURN_URL`; `stripe` dependency added. New `ErrorCode`s:
  `PAYMENTS_NOT_CONFIGURED`, `SUBSCRIPTION_ALREADY_ACTIVE`,
  `SUBSCRIPTION_TRIAL_UNAVAILABLE`, `SUBSCRIPTION_SETUP_INCOMPLETE`,
  `SUBSCRIPTION_NOT_FOUND`, `WEBHOOK_SIGNATURE_INVALID`.
- Contract regenerated.

### Tests
- Unit: `SubscriptionAccessService` (rule table, cache + invalidate,
  transaction bypass).
- e2e `stage-6-7.e2e-spec.ts` (fake provider): gates (client 403,
  unverified 403, confirm before the card 409); trial → `invoice.paid` +
  `subscription.updated` → active with one payment; the same event id
  again is not queued and creates no duplicate; a late older event does
  not win; bad signature 400; failed payment → `past_due` with grace
  (still active, notified, failed payment row) → `unpaid` → `expired`,
  bid withdrawn, `subscription_status`; re-subscription after expiry needs
  `chargeNow`; the same card on another attorney gets no trial; cancel
  keeps access with `cancelAtPeriodEnd`; portal URL; trial reminder
  payload and skip-after-cancel; admin view (support), extend (finance,
  audited), moderator 403.
- Real-Stripe acceptance (test mode, test clocks) runs with
  `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` set —
  the same code path, provider swapped (OQ-021).

## Stage 6.8 — Flutter: subscription screens and paywall

docs/06_PRODUCTION.md §13 stage 6.8, §1.7.

### Mobile (`apps/mobile`, feature `subscription`)
- Settings → «Подписка» (attorneys only, docs/01 §3.6): the $399/мес plan
  card (7-day trial line while a trial is still available, what the
  subscription unlocks, no commission), «Текущий статус» with the pill,
  the explanation line (trial end / next charge / scheduled cancellation
  / grace period) and the actions that fit the status — «Управление»
  (Stripe Customer Portal in the in-app browser), «Отменить» (confirm
  dialog, `cancel_at_period_end`), «Обновить карту» on `past_due` with
  the payment-failed notice, «Обновить» while `incomplete` — plus the
  payment history entry. Loading/error/offline via the shared detail
  states; pull-to-refresh; a refresh on app resume so a change made in
  the portal or by a webhook shows up.
- Start flow (§1.4): `POST /subscriptions/start` → `flutter_stripe`
  PaymentSheet in setup mode (3-D Secure included) → `POST
  /subscriptions/confirm` → polling `GET /subscriptions/me` while
  `incomplete`. No trial (account or card): the honest «Пробный период
  недоступен, будет списано $399 сейчас» dialog, and `chargeNow` only
  after that consent (§1.1). The button is disabled with an explanation
  and a link to verification until the attorney is `verified`.
  `SubscribeController` is the one state machine (starting → card →
  confirming → syncing); the Stripe SDK sits behind `CardCollector`, so
  screens and tests never touch the platform channel.
- Paywall (§1.7 п.3): `/subscription-required?reason=bid|chat|contacts`
  names the locked action («Сделать бид», «Написать клиенту», «Контакты
  клиента») and leads to the subscription screen; the docs/04 gates
  (`routeSubscriptionError`, the chat composer, the contacts card) pass
  their reason. The stage-4 placeholder screen is removed.
- «История платежей» (§1.7 п.4): cursor-paged list from
  `GET /subscriptions/payments` with amount, date, status and the failure
  code of a failed charge.
- Strings `file06_strings.dart` (ru/en); `ApiErrorCodes` now mirrors the
  whole server enum again (admin/moderation/webhook codes added, texts
  for `CONTENT_BLOCKED`, `PAYLOAD_TOO_LARGE` and the subscription codes).
- Android: the activity theme is an `AppCompat` descendant (a
  `flutter_stripe` requirement for the PaymentSheet); same window
  backgrounds, `FlutterFragmentActivity` was already in place.
  `STRIPE_PUBLISHABLE_KEY` (dart-define) is applied lazily on the first
  card sheet, so app start-up is unchanged.

### Tests
- Repository mapping against the fake HTTP adapter, the subscribe state
  machine (trial, consent before/after the card, cancel, polling window,
  failures, double tap), and the screens' states (skeleton, offline +
  retry, disabled CTA, trial start, charge-now dialog, payment failed,
  cancel, ended, incomplete, dark + 200 % text, paywall, payments).

## Stage 6.9 — Privacy and data lifecycle

docs/06_PRODUCTION.md §13 stage 6.9, §5.1–5.3.

### API (`modules/privacy`, jobs)
- Anonymization (§5.1): daily `privacy.anonymize` takes every
  `deletion_pending` user whose request is older than 14 days. External
  side effects first and idempotent (Stripe subscription canceled
  immediately through `PaymentProvider.cancelNow`; avatar and verification
  files removed from S3), then the cases still in work are closed with a
  journal event (`account_deleted_close`, new state-machine action from
  `in_progress` / `pending_completion` / `disputed`; the counterpart gets
  `case_closed`), a client's open cases are archived with bids
  `rejected_auto`, and one transaction scrubs the user: `Deleted User`,
  email/phone null, identifiers and push tokens gone, sessions revoked
  (+ access-token blacklist), `status = deleted`, `anonymized_at`, files
  `deleted_at`; attorney → `deleted_<id>`, bio/firm cleared, profile
  suspended, active bids withdrawn, posts `removed`; own messages become
  `[deleted]`. `case_journal`, `contact_disclosures`, `auth_events`,
  `user_consents`, `audit_log` are untouched.
- Data export (§5.2): `POST /users/me/data-export` (reauth) → row in
  `data_export_jobs` (`user_data`), BullMQ queue `data-export` (jobId =
  row id, atomic claim so a retry never builds two ZIPs); the worker
  writes JSON files (profile, consents, devices, cases, bids, posts,
  comments, likes, own messages) into one ZIP in the private documents
  bucket, records the `files` row (`purpose = data_export`), sets
  `expires_at = +24 h`, emits `data_export_ready` and emails the signed
  link. `GET /users/me/data-export/:id` returns the status and a fresh
  link while it is ready. The case-history PDF export now also records
  its `data_export_jobs` row (`case_history_pdf`).
- Journal (§5.3): monthly `journal.retention` removes `case_journal`
  rows past `retain_until` in batches, on `RETENTION_DATABASE_URL`
  (the `lawbid_retention` role; falls back to the app connection with a
  warning when unset). Daily `journal.chain-verify` recomputes the chain
  for every case with rows from the last 24 h plus 200 random cases; a
  break is a fatal log + Sentry `fatal`. A head row whose predecessor was
  removed by retention is accepted only when the head itself is older
  than four years (`trimmedHeadAllowed`).
- Cleanup (§5.3): daily `exports.cleanup` expires ready exports past
  `expires_at` (S3 object removed, `files.deleted_at`, status `expired`)
  and fails jobs stuck for a day.
- Migration `20260929200000_stage_6_9_privacy`: `file_purpose.data_export`,
  `notification_type.data_export_ready`. Env `RETENTION_DATABASE_URL`.

### Tests
- Unit: state machine (15 actions, `in_progress → closed`), journal
  trimmed head, cron registry (19 schedules).
- e2e `stage-6-9`: anonymized attorney has no name/email/phone/files and
  the journal (with one more `closed` event) stays valid; client's open
  case archived + bid `rejected_auto`; export needs reauth, one job in
  flight per user, ZIP behind a signed link, `data_export_ready`,
  expiry drops link and object; retention removes only rows past
  `retain_until`; a forged payload is reported as `hash_mismatch`.

## Stage 6.10 — Infrastructure (Terraform)

docs/06_PRODUCTION.md §13 stage 6.10, §6.

- `infra/modules`: network (VPC, 2 AZ, NAT per AZ, VPC endpoints), kms,
  s3 (documents private/versioned/SSE-KMS with cross-region replication,
  media behind CloudFront OAC, lifecycle for exports and old versions),
  redis (ElastiCache 7, multi-AZ, TLS, AUTH token → `REDIS_URL` secret),
  secrets (Secrets Manager entry per secret env var, values out of band),
  ses (domain identity, DKIM, MAIL FROM, DMARC), alb (HTTPS only, idle
  300 s for WebSockets, sticky api target group, WAF managed rules +
  per-IP rate rule), ecs (Fargate: `api`, `worker`, `admin` services from
  two images, one-off `migrate` task for `prisma migrate deploy` under
  `lawbid_migrator`, CPU-60 % autoscaling with min 2 tasks, deployment
  circuit breaker with rollback, secrets injected by ECS), monitoring
  (SNS → email/Slack, log metric filters, the alarms of §8), stack
  (composition) and `envs/staging`, `envs/prod` (S3 backend + lock,
  example tfvars/backend files, reduced vs production sizes).
- `apps/admin/Dockerfile` (Next.js standalone) and `output: 'standalone'`.
- Validated with `terraform fmt -check` and `terraform validate` for both
  environments (Terraform 1.9.8, AWS provider 5.100). Not applied: no AWS
  account in this session — the acceptance steps are listed in
  `infra/README.md`. OQ-023 (admin as an ECS service).

## Stage 6.11 — CI/CD, observability, backups

docs/06_PRODUCTION.md §13 stage 6.11, §7–§8, §6.4.

### CI/CD
- `deploy.yml` (§7.3): images to ECR → staging (one-off `migrate` ECS task
  under `lawbid_migrator`, rolling deploy of api/worker/admin, smoke) →
  `production` GitHub environment with required reviewers (the manual
  gate) → backup-freshness check (`check-backup.sh`, CockroachDB Cloud
  API) → migrations → rolling deploy → smoke; ECS circuit breaker rolls a
  failed revision back. Scripts in `scripts/deploy/`.
- `api-ci.yml`: OpenAPI breaking-change gate against the base branch
  (`oasdiff breaking --fail-on ERR`, §7.2 п.2) next to the existing
  contract-drift check.
- `mobile-release.yml` + Fastlane (§7.4): tag-driven release builds with
  Conventional-Commits notes, Android AAB signed with the upload keystore
  from secrets (`build.gradle.kts` reads `ANDROID_KEYSTORE_*`, debug key
  locally), iOS IPA (`ExportOptions.plist`, certificate/profile from
  secrets), artifacts + GitHub release. Store uploads only on manual
  dispatch with `upload=true` (owner tests on Android first; closed beta
  per §11.2).

### Observability (§8)
- OpenTelemetry tracing (`src/telemetry/otel.ts`): auto-instrumentation
  for http/express/ioredis/pg/socket.io, OTLP/HTTP exporter, on only when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set (API and worker).
- Metrics CloudWatch cannot see on its own are structured log lines picked
  up by the metric filters of `infra/modules/monitoring`: `ops.queue-metrics`
  (every minute: waiting/active/delayed/failed + oldest job age per BullMQ
  queue), `ops.business-metrics` (every 10 min: registrations 24 h, open
  cases, active bids, subscriptions by status), `transaction retried`
  (40001), `stripe webhook moved to DLQ`, `subscription payment failed`,
  WebSocket connection gauge, push failures, SMS sent.
- Grafana dashboards (CloudWatch data source) in `infra/observability/grafana`:
  API health, queues & workers, database & Redis, business.
- Alarms of §8 in Terraform (5xx > 1 %, p95, unhealthy hosts, queue
  backlog, retries, Stripe DLQ, failed payments, journal integrity, SMS
  spend, Redis, ECS CPU) → SNS (email + Slack webhook).
- `docs/runbooks/`: one page per alarm plus `backups.md` (RPO ≤ 1 h,
  RTO ≤ 4 h, restore procedure, pre-migration backup check) and the
  quarterly `restore-drill.md` log.

### Not verifiable in this session
The deploy and release workflows, the alarms firing and the first restore
drill need the AWS/CockroachDB accounts and store credentials (stage
6.11 acceptance is listed for the owner in `infra/README.md` and
`docs/runbooks/restore-drill.md`).

## Stage 6.12 — Testing, load, launch readiness

docs/06_PRODUCTION.md §13 stage 6.12, §9, §11.

- Security (§9.3): new e2e `security-contact-leak` — before acceptance
  no attorney-facing response (case feed and detail, own bid, pre-
  acceptance chat list/detail/messages with a phone and e-mail typed by
  the client, case search, notifications, contacts endpoint) carries the
  client's name, phone or e-mail; after acceptance without an active
  subscription the contacts endpoint is `SUBSCRIPTION_REQUIRED` and the
  work list stays clean. Together with the existing `authz-matrix`
  (roles + IDOR), `auth-hardening` (tokens, refresh reuse, attestation),
  `security-hardening` (headers, readiness, idempotency), `files` (MIME,
  size, EICAR), `stage-6-2` (mobile token on `/admin`) and the chat
  masking suites this is the automated part of §9.3.
- Load (§9.4): `apps/api/k6/` — feed, search, attorney cases, bid, chat
  (+ Socket.IO), OTP login, Stripe webhooks, and `all.js` mixing them at
  the 5k RPS peak (`STAGE=peak`) and the 1-hour soak (`STAGE=soak`), with
  the §9.4 thresholds; `docs/perf/README.md` (accounts, procedure,
  results table).
- Launch (§11): `docs/LAUNCH_CHECKLIST.md` — the §11.1 checklist, closed
  beta, store data and the store-payment decision, all owner-ticked.
- Critical flows (§9.2) are covered by the stage suites of files 1–6
  (49 e2e suites); the pentest, the real load run and the restore drill
  need the staging environment and are the owner's acceptance items.


## File 06 review fixes (subagent review: security, load/cost, Flutter) — 2026-09-29

### Security
- A deployed API (`NODE_ENV` staging/production) refuses to boot without
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`; the
  billing module also throws instead of falling back to the fake provider
  (which accepts `Stripe-Signature: fake`).
- Admin 2FA: the login ticket is consumed atomically (`DEL` result
  checked), a TOTP code is single-use inside its window
  (`adm:totp:used:<admin>:<code>`, 95 s), a recovery code is removed with a
  conditional update so two parallel requests cannot both succeed; the
  last active `super_admin` can be neither demoted nor disabled.
- Admin audit interceptor records failed/denied privileged calls too
  (`after: { outcome: 'failed', status }`).
- Admin proxy: no client-supplied `X-Forwarded-For` forwarded (OQ-024),
  dot segments rejected, non-JSON upstream answers handled.
- Terraform: admin task fixed to `https://api.<host>/api/v1` (a shell
  substitution had emptied the host), admin and migrate tasks get a
  permission-less task role, optional WAF allow-list for the admin host
  (`admin_allowed_cidrs`), state-secret note in `infra/README.md`.
- Mobile release workflow: secrets via `env` + `printf`, jobs in the
  protected `release` environment; mobile opens only `https` links.

### Load / cost
- Indexes: `users(created_at)`, `users(status, deletion_requested_at)`,
  `messages(sender_id)`, `case_journal(created_at)`, `bids(status)`
  (migration `20260929210000_stage_6_12_review_indexes`).
- Anonymization: Stripe cancel is idempotent on retry (already-canceled
  subscriptions are only synced), messages scrubbed in 5 000-row batches
  outside the transaction, verification payloads emptied (OQ-025).
- Journal chain check bounded (5 000 changed cases per run, random
  sample by UUID range instead of `ORDER BY random()`).
- Stripe: webhook retries back off 15 s → 2 min (a 429 burst is not a
  DLQ), DLQ jobs bounded, processed webhook rows pruned after 30 days,
  subscription idempotency key gets an hour bucket.
- Moderation duplicate counter: `INCR` + `EXPIRE` in one `MULTI`.
- Terraform: `noeviction` for Redis (BullMQ), request-count target
  tracking on the api service, staging on one NAT and fewer endpoints.
- k6: the 5k RPS budget is split by scenario weight; OTP-login and
  webhook scenarios require `STAGING_MOCK_PROVIDERS=1`.

### Flutter
- `subscriptionPrice` no longer recurses for amounts with cents (test
  added); the subscribe flow returns `pendingConfirmation` instead of
  touching a disposed provider; pending-review badge text wraps; iOS lane
  picks the IPA `flutter build ipa` wrote.

## File 06 wrap-up — leftovers found by the final cross-check — 2026-09-29

- Welcome screen: «Продолжить с email» opens the email sign-in flow (was a
  "not built yet" placeholder although the screen existed).
- docs/04 §12: `case_history_export_ready` notification when the PDF is
  built (migration `20260929220000_file06_review_history_export_notification`,
  template en/ru, tap opens Settings → Case history).
- docs/04 §14: attorney suspension (verifier / admin sanction) and account
  anonymization withdraw bids through `BidStateMachine.applyToActive`
  (`system_withdraw`) with a journal row per bid instead of a direct update.
- docs/06 §6.1: media links come from CloudFront when `MEDIA_CDN_BASE_URL`
  is set (Terraform passes the distribution domain to the api task);
  documents stay on signed S3 links; dev/e2e unchanged.
- OQ-001c: CloudWatch metric + alarm `cost-budget` on CostGuard's
  `alert: cost_budget` log line (runbook `sms-spend.md`).
- docs/01 §11 Шаг 3: users who declined pushes in onboarding are not
  prompted by the OS at every start (`pushOptIn` honoured by PushService).
- Dead code / stale notes removed: `AllowAllModerationHook` stub, the
  file-05/06 TODOs in case history, files, cases feed, verification, push
  step.
