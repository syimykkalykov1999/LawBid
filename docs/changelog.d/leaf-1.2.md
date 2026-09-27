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
