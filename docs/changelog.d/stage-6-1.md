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
