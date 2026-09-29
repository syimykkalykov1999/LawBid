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
