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
