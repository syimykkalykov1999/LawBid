import { z } from 'zod';
import {
  isDeployedEnv,
  resolveEmailProvider,
  resolveSmsProvider,
} from './provider-selection';

/**
 * Stage 1.2 (docs/01_FOUNDATION_AUTH.md §15): "приложение отказывается
 * стартовать при невалидном env" (docs/06_PRODUCTION.md §6.2) — validate,
 * don't warn. Only vars actually used by shipped code are required; add
 * more here as later stages introduce them.
 *
 * Stage 1.4 additions (auth backend): JWT signing keys, OTP secrets/
 * tuning, SMS/email provider selection + credentials, social login
 * audiences, refresh-rotation grace window, and per-endpoint auth rate
 * limits (docs/01_FOUNDATION_AUTH.md §10, judgment calls recorded in
 * docs/CHANGELOG.md).
 */

const jwtKeysPattern = /^[\w-]+:.{32,}(,[\w-]+:.{32,})*$/;

// --- External credentials (docs/KEYS_SETUP.md) ---
// `.env` files write unset vars as `KEY=` (empty string). Treat blank as
// "not provided" so an empty placeholder never trips a format check and
// provider selection (provider-selection.ts) sees it as missing.
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Optional credential; when present it must match [pattern]. */
const optionalMatching = (pattern: RegExp, message: string) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().regex(pattern, message).optional(),
  );

/** Optional comma-separated list; every item must match [pattern]. */
const optionalListOf = (pattern: RegExp, message: string) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .refine(
        (raw) =>
          raw
            .split(',')
            .map((item) => item.trim())
            .every((item) => pattern.test(item)),
        message,
      )
      .optional(),
  );

/**
 * "true"/"1" → true, "false"/"0"/blank → default. z.coerce.boolean() is
 * Boolean(value), which turns the string "false" into true — so
 * OTP_DEV_FIXED_CODE=false would have enabled the fixed code (and blocked
 * a production boot). Anything else is a validation error.
 */
const envBoolean = (fallback: boolean) =>
  z.preprocess((value: unknown) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return undefined;
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return value;
  }, z.boolean().default(fallback));

const awsRegionPattern = /^[a-z]{2}(-gov)?-[a-z]+-\d+$/;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
// "no-reply@lawbid.com" or "LawBid <no-reply@lawbid.com>".
const fromAddressPattern =
  /^(?:[^<>]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;
const s3BucketPattern = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
// Secrets copied from .env.example / .env.test must never reach a
// deployed environment.
const placeholderSecretPattern = /CHANGE_ME|test_secret|_at_least_32_char/i;

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    // docs/02 §6.3 / docs/06 §5.3: the `lawbid_retention` role (DELETE on
    // case_journal only) used by the monthly journal retention job. Unset
    // (dev / e2e): the job runs on DATABASE_URL and logs a warning.
    RETENTION_DATABASE_URL: z.string().min(1).optional(),
    // Owner 2026-10-05 (demo mode, src/common/demo): the demo world's own
    // database. Unset → `<DATABASE_URL database>_demo`, created and
    // migrated by the API itself; `off` → no demo world.
    DEMO_DATABASE_URL: z.string().min(1).optional(),
    // Own PgBouncer (docs/architecture/DB_POOLER.md). Set by infra when
    // `db_pooler_enabled = true`: DATABASE_URL is sent to this host:port
    // (src/prisma/pooler-url.ts). Unset = direct database connection.
    DB_POOLER_HOST: z.string().min(1).optional(),
    DB_POOLER_PORT: z.coerce.number().int().positive().optional(),
    DB_POOLER_QUERY: z.string().optional(),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    // How long one Redis command may wait before failing. The e2e harness
    // raises it: a busy CI runner stalls the event loop past 2 s while an
    // app boots, and the timer then fires before the reply is read.
    REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
    // Batch C item 9 (2026-10-24): a separate allkeys-lru Redis for pure
    // caches (search results, translations, link previews …) so cache keys
    // can never fill the queue Redis (noeviction). Unset = caches use
    // REDIS_URL. Command timeout is short: a slow cache is skipped.
    REDIS_CACHE_URL: z.preprocess(blankToUndefined, z.string().optional()),
    REDIS_CACHE_COMMAND_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(500),
    // Owner 2026-10-22 (server load audit, finding 5): the Socket.IO Redis
    // adapter. `sharded` (Redis 7 sharded pub/sub: an event reaches only the
    // instances holding its room); `classic` = the old pub/sub, a rollback
    // switch. Set the same value on the API and the worker.
    // Redis Cluster switch (docs/architecture/REDIS_CLUSTER_READY.md): true =
    // REDIS_URL is the configuration endpoint of an ElastiCache "cluster mode
    // enabled" group; every client becomes an ioredis Cluster, BullMQ queues
    // get a {queue} hash tag, Socket.IO is forced to the sharded adapter.
    REDIS_CLUSTER: envBoolean(false),
    // Local docker cluster only: JSON natMap for announced addresses.
    REDIS_CLUSTER_NAT_MAP: z.string().optional(),
    SOCKET_IO_ADAPTER: z.enum(['sharded', 'classic']).default('sharded'),
    SUBSCRIPTION_PAST_DUE_GRACE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(3),

    // --- Stage 1.4: JWT (access + reauth tokens) ---
    // "kid1:secret1,kid2:secret2" — multiple kids let a secret rotate
    // without invalidating tokens signed under the previous one (the
    // active kid signs new tokens, all listed kids can still verify).
    JWT_KEYS: z
      .string()
      .regex(
        jwtKeysPattern,
        'JWT_KEYS must be "kid:secret[,kid:secret...]" with each secret >= 32 chars',
      ),
    JWT_ACTIVE_KID: z.string().min(1),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(60),
    REAUTH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    // docs/01_FOUNDATION_AUTH.md §10.4 doesn't specify this; engineering
    // judgment (docs/CHANGELOG.md, stage 1.4) to absorb a client retry
    // that races a completed rotation without nuking the session chain.
    REFRESH_ROTATION_GRACE_SECONDS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(10),

    // --- Stage 1.4: OTP ---
    OTP_CODE_SECRET: z.string().min(32),
    OTP_KEY_PEPPER: z.string().min(32),
    AUTH_EVENT_PEPPER: z.string().min(32),
    // Security research #5 (2026-10-22), A7: HMAC pepper for the stored
    // phone-book hashes (contacts-sync). Optional so a deploy never fails
    // for it; without it the API warns at boot on production and stores
    // the plain hashes as before.
    CONTACTS_PEPPER: z.string().min(32).optional(),
    OTP_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),
    OTP_RATE_LIMIT_PER_IDENTIFIER_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(5),
    OTP_RATE_LIMIT_PER_IP_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    // Owner 2026-10-07: codes sent to one phone / e-mail in a rolling 24 h.
    // Fallback only: the admin setting `security.otp_per_identifier_per_day`
    // (Система → Настройки) wins when an admin has saved it. Positive like
    // the other OTP limits — there is no "0 = unlimited".
    OTP_RATE_LIMIT_PER_IDENTIFIER_PER_DAY: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    // Security audit 2026-10-01: wrong-code attempts per IP across all
    // accounts (stops spraying lockouts at many users from one address).
    OTP_VERIFY_LIMIT_PER_IP_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    AUTH_OTP_VERIFY_LIMIT_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    AUTH_SOCIAL_LIMIT_PER_IP_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(20),
    AUTH_REFRESH_LIMIT_PER_IP_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    // Per session chain (one device's login): an access token lives 15
    // min (docs/01 §10.4), so a well-behaved client refreshes ~4x/hour;
    // 30 leaves room for retries while capping a stolen-token refresh loop.
    AUTH_REFRESH_LIMIT_PER_SESSION_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    // docs/01 §10.2 E / §12: https base of the universal-link domain
    // (e.g. https://lawbid.app). Optional: when unset, emails carry only
    // the lawbid:// deep link. No trailing slash.
    APP_LINK_BASE_URL: z
      .string()
      .regex(
        /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*[\w-])?$/i,
        'APP_LINK_BASE_URL must be an https URL without a trailing slash',
      )
      .optional()
      .or(z.literal('').transform(() => undefined)),
    // docs/01_FOUNDATION_AUTH.md §15 stage 1.4: "код 000000 только в
    // NODE_ENV=development" — validated below (.superRefine) so a
    // misconfigured staging/production env fails at boot instead of
    // silently accepting a fixed code. Extended (docs/CHANGELOG.md,
    // stage 1.4) to also permit NODE_ENV=test: e2e tests need a
    // deterministic code to drive the OTP flow, and mock SMS/email
    // providers deliberately never expose the real generated code
    // anywhere (not even logs) — 'test' carries the same "never a real
    // deployed environment" guarantee as 'development' for this purpose.
    OTP_DEV_FIXED_CODE: envBoolean(false),
    // Owner 2026-10-02: local stand-in for Bunny Stream (tools/fake-bunny.mjs)
    // so reels can be tried end to end on the emulator without keys.
    DEV_FAKE_BUNNY: envBoolean(false),
    // The host:port the fake CDN is reached at from the client: the Android
    // emulator sees the Mac as 10.0.2.2, a browser on the Mac as localhost.
    DEV_FAKE_BUNNY_HOST: z.string().optional(),

    // --- SMS provider (stage 1.4; auto-selection: provider-selection.ts) ---
    // auto (default): twilio once every TWILIO_* credential below is set,
    // otherwise mock — and mock is refused in staging/production.
    SMS_PROVIDER: z.preprocess(
      blankToUndefined,
      z.enum(['auto', 'mock', 'twilio']).default('auto'),
    ),
    TWILIO_ACCOUNT_SID: optionalMatching(
      /^AC[0-9a-fA-F]{32}$/,
      'TWILIO_ACCOUNT_SID must be "AC" + 32 hex chars (Twilio Console → Account Info)',
    ),
    TWILIO_AUTH_TOKEN: optionalMatching(
      /^[0-9a-fA-F]{32}$/,
      'TWILIO_AUTH_TOKEN must be 32 hex chars (Twilio Console → Account Info)',
    ),
    // One sender is enough; the Messaging Service wins when both are set.
    TWILIO_FROM_NUMBER: optionalMatching(
      /^\+[1-9]\d{7,14}$/,
      'TWILIO_FROM_NUMBER must be E.164, e.g. +15551234567',
    ),
    TWILIO_MESSAGING_SERVICE_SID: optionalMatching(
      /^MG[0-9a-fA-F]{32}$/,
      'TWILIO_MESSAGING_SERVICE_SID must be "MG" + 32 hex chars',
    ),
    // Android SMS Retriever autofill (docs/01 §10.2 D): the 11-character
    // app hash of the PROD Android build (release signing key). When set,
    // the OTP SMS gets the "<#>" prefix and the hash on its last line.
    SMS_ANDROID_APP_HASH: optionalMatching(
      /^[A-Za-z0-9+/]{11}$/,
      'SMS_ANDROID_APP_HASH must be the 11-character Android app hash',
    ),

    // --- Email provider (stage 1.4; auto-selection: provider-selection.ts) ---
    // auto (default): ses once SES_REGION + SES_FROM_ADDRESS are set.
    EMAIL_PROVIDER: z.preprocess(
      blankToUndefined,
      z.enum(['auto', 'mock', 'ses']).default('auto'),
    ),
    SES_REGION: optionalMatching(
      awsRegionPattern,
      'SES_REGION must be an AWS region, e.g. us-east-1',
    ),
    SES_FROM_ADDRESS: optionalMatching(
      fromAddressPattern,
      'SES_FROM_ADDRESS must be "no-reply@domain" or "Name <no-reply@domain>"',
    ),
    // AWS credentials: normally the SDK default chain (IAM role on AWS,
    // ~/.aws profile locally). Explicit keys are optional; the same
    // default chain reads them straight from process.env. Both or neither.
    AWS_ACCESS_KEY_ID: optionalMatching(
      /^(AKIA|ASIA)[A-Z0-9]{16}$/,
      'AWS_ACCESS_KEY_ID must look like AKIA… (20 chars)',
    ),
    AWS_SECRET_ACCESS_KEY: optionalMatching(
      /^[A-Za-z0-9/+=]{40}$/,
      'AWS_SECRET_ACCESS_KEY must be 40 chars',
    ),
    // Mailhog (dev/test), used by the mock provider so codes are visible
    // in a real inbox rather than only in logs (docs/01_FOUNDATION_AUTH.md
    // §15 stage 1.1: Mailhog is already part of docker-compose.yml).
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),

    // --- Social login (stage 1.4) ---
    // Comma-separated allowed audiences. Empty = that sign-in method
    // answers AUTH_PROVIDER_DISABLED (feature off, no crash).
    GOOGLE_CLIENT_IDS: optionalListOf(
      /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
      'GOOGLE_CLIENT_IDS must be comma-separated "<digits>-<id>.apps.googleusercontent.com"',
    ),
    APPLE_BUNDLE_IDS: optionalListOf(
      /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/,
      'APPLE_BUNDLE_IDS must be comma-separated bundle ids, e.g. com.lawbid.lawbid',
    ),
    // Reserved: Sign in with Apple token revocation on account deletion
    // (docs/01_FOUNDATION_AUTH.md §10; not wired yet).
    APPLE_TEAM_ID: optionalMatching(
      /^[A-Z0-9]{10}$/,
      'APPLE_TEAM_ID must be 10 uppercase letters/digits',
    ),

    // --- Seed (prisma/seed.ts reads it directly; validated here too) ---
    SEED_ADMIN_EMAIL: optionalMatching(
      emailPattern,
      'SEED_ADMIN_EMAIL must be an email address',
    ),

    // --- Reserved for later stages: validated now so a pasted key is
    // checked at boot; no code reads them yet (docs/KEYS_SETUP.md) ---
    // Stripe — docs/06_PRODUCTION.md §1, stage 6.7.
    STRIPE_SECRET_KEY: optionalMatching(
      /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/,
      'STRIPE_SECRET_KEY must start with sk_test_/sk_live_ (or rk_ restricted key)',
    ),
    STRIPE_WEBHOOK_SECRET: optionalMatching(
      /^whsec_[A-Za-z0-9]+$/,
      'STRIPE_WEBHOOK_SECRET must start with whsec_',
    ),
    // Owner 2026-10-05: the Connect webhook endpoint (client → attorney
    // payments) signs with its own secret.
    STRIPE_CONNECT_WEBHOOK_SECRET: optionalMatching(
      /^whsec_[A-Za-z0-9]+$/,
      'STRIPE_CONNECT_WEBHOOK_SECRET must start with whsec_',
    ),
    STRIPE_PRICE_ID: optionalMatching(
      /^price_[A-Za-z0-9]+$/,
      'STRIPE_PRICE_ID must start with price_',
    ),
    // OQ-048: $100 / month per assistant seat, and the yearly team plan.
    STRIPE_PRICE_SEAT_ID: optionalMatching(
      /^price_[A-Za-z0-9]+$/,
      'STRIPE_PRICE_SEAT_ID must start with price_',
    ),
    // Owner 2026-10-02: the client's gold badge, $10/month.
    STRIPE_PRICE_VERIFIED_ID: optionalMatching(
      /^price_/,
      'STRIPE_PRICE_VERIFIED_ID must start with price_',
    ),
    STRIPE_PRICE_YEARLY_ID: optionalMatching(
      /^price_[A-Za-z0-9]+$/,
      'STRIPE_PRICE_YEARLY_ID must start with price_',
    ),
    // S3 — docs/03_VERIFICATION_PROFILES.md §2 (documents); MinIO locally.
    S3_REGION: optionalMatching(
      awsRegionPattern,
      'S3_REGION must be an AWS region, e.g. us-east-1',
    ),
    // Local MinIO only (http://localhost:9000); must stay empty when deployed.
    S3_ENDPOINT: optionalMatching(
      /^https?:\/\/\S+$/,
      'S3_ENDPOINT must be an http(s) URL',
    ),
    S3_BUCKET_DOCUMENTS: optionalMatching(
      s3BucketPattern,
      'S3_BUCKET_DOCUMENTS must be a valid S3 bucket name',
    ),
    S3_BUCKET_MEDIA: optionalMatching(
      s3BucketPattern,
      'S3_BUCKET_MEDIA must be a valid S3 bucket name',
    ),
    // docs/06 §6.1: media (post images, avatars) served through CloudFront
    // when set (https base URL of the distribution, no trailing slash);
    // unset (dev/e2e) keeps short-lived signed S3 links. Documents never
    // go through the CDN.
    MEDIA_CDN_BASE_URL: optionalMatching(
      /^https:\/\/[^\s/]+$/,
      'MEDIA_CDN_BASE_URL must be an https origin without a path',
    ),
    // Owner 2026-10-22 (systems checklist §22): private media (documents
    // bucket) through CloudFront signed URLs. The three go together; unset
    // keeps presigned S3 GET links. The PEM may be pasted with literal \n.
    CLOUDFRONT_PRIVATE_DOMAIN: optionalMatching(
      /^[a-z0-9.-]+\.[a-z]{2,}$/i,
      'CLOUDFRONT_PRIVATE_DOMAIN must be a host name (no scheme, no path)',
    ),
    CLOUDFRONT_PRIVATE_KEY_ID: optionalMatching(
      /^[A-Z0-9]{10,20}$/,
      'CLOUDFRONT_PRIVATE_KEY_ID must be a CloudFront public key id',
    ),
    CLOUDFRONT_PRIVATE_KEY_PEM: optionalMatching(
      /-----BEGIN (RSA )?PRIVATE KEY-----/,
      'CLOUDFRONT_PRIVATE_KEY_PEM must be a PEM private key',
    ),
    // Owner 2026-10-22 (passkeys): the WebAuthn relying party. Defaults:
    // RP ID = host of APP_LINK_BASE_URL (lawbid.dev, which also covers
    // admin.lawbid.dev and both native apps), origins = web.allowed_origins
    // + ADMIN_ORIGINS + https://<rpId>. WEBAUTHN_ORIGINS adds the Android
    // apps (`android:apk-key-hash:<base64url sha256 of the signing cert>`).
    WEBAUTHN_RP_ID: optionalMatching(
      /^[a-z0-9.-]+$/i,
      'WEBAUTHN_RP_ID must be a bare domain (no scheme, no port)',
    ),
    WEBAUTHN_ORIGINS: optionalMatching(
      /^(https?:\/\/[^\s,]+|android:apk-key-hash:[A-Za-z0-9_-]+)(,(https?:\/\/[^\s,]+|android:apk-key-hash:[A-Za-z0-9_-]+))*$/,
      'WEBAUTHN_ORIGINS must be a comma-separated list of https origins or android:apk-key-hash:… values',
    ),
    // Owner 2026-10-22 (SECURITY_TODO «KMS-wrapped keys»): the KMS key and
    // encryption context used to unwrap `kid:kms:…` entries of
    // MESSAGE_ENC_KEYS / SECRETS_MASTER_KEYS at boot (common/secrets/kms-env.ts).
    DATA_KEYS_KMS_KEY_ARN: optionalMatching(
      /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[\w-]+$/,
      'DATA_KEYS_KMS_KEY_ARN must be a KMS key ARN',
    ),
    DATA_KEYS_KMS_APP: optionalMatching(
      /^[\w-]{1,64}$/,
      'DATA_KEYS_KMS_APP must be the stack name',
    ),
    // MinIO root user/password locally; on AWS leave empty (IAM role).
    S3_ACCESS_KEY_ID: optionalMatching(
      /^\S{3,}$/,
      'S3_ACCESS_KEY_ID is too short',
    ),
    S3_SECRET_ACCESS_KEY: optionalMatching(
      /^\S{8,}$/,
      'S3_SECRET_ACCESS_KEY is too short',
    ),
    // FCM via Firebase Admin service account — docs/05 §10 (push stage).
    FCM_PROJECT_ID: optionalMatching(
      /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
      'FCM_PROJECT_ID must be a Firebase project id, e.g. lawbid-prod',
    ),
    FCM_CLIENT_EMAIL: optionalMatching(
      /^[^\s@]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/,
      'FCM_CLIENT_EMAIL must end with .iam.gserviceaccount.com',
    ),
    // The "private_key" field of the service-account JSON, "\n" escapes kept.
    FCM_PRIVATE_KEY: optionalMatching(
      /-----BEGIN PRIVATE KEY-----/,
      'FCM_PRIVATE_KEY must be the PEM "private_key" field of the service-account JSON',
    ),
    // Owner 2026-10-17: APNs auth key for iPhone VoIP (call) pushes.
    APNS_KEY_ID: optionalMatching(
      /^[A-Z0-9]{10}$/,
      'APNS_KEY_ID must be the 10-character Key ID of the APNs key',
    ),
    APNS_TEAM_ID: optionalMatching(
      /^[A-Z0-9]{10}$/,
      'APNS_TEAM_ID must be the 10-character Apple Developer Team ID',
    ),
    APNS_PRIVATE_KEY: optionalMatching(
      /-----BEGIN PRIVATE KEY-----/,
      'APNS_PRIVATE_KEY must be the contents of the AuthKey_XXXX.p8 file',
    ),

    // --- Background jobs (docs/01 §5.2 BullMQ; docs/06 §6 `worker`
    // service; src/jobs/) ---
    // true: this API process also runs the `cron` queue scheduler and
    // worker. Set false on API tasks once the dedicated worker service
    // (node dist/src/worker.js) runs; worker.ts ignores this flag.
    JOBS_ENABLED: envBoolean(true),
    // Owner 2026-10-15 (speed, no cost): answers over 1 KB are gzip/brotli
    // compressed (JSON shrinks 5–10x on a phone's network). Set false to
    // switch it off without a release.
    HTTP_COMPRESSION: envBoolean(true),
    // Owner 2026-10-15: ETag on JSON answers (the phone gets 304 when
    // nothing changed). false = no tags, a safe off-switch.
    HTTP_ETAG: envBoolean(true),
    // Owner 2026-10-15: a database call slower than this many ms is written
    // to the log (operation name and time only, never the values). 0 = off.
    DB_SLOW_QUERY_MS: z.coerce.number().int().min(0).default(300),
    // WP-G: heaviest users / cases (admin «Масштаб»). 1 request in N is
    // counted (0 = off); the window is how far back the top list looks.
    HEAVY_HITTERS_SAMPLE: z.coerce.number().int().min(0).max(1000).default(0),
    HEAVY_HITTERS_WINDOW_MIN: z.coerce
      .number()
      .int()
      .min(5)
      .max(1440)
      .default(60),
    // Owner 2026-10-22 (server load audit, finding 1): request log lines.
    // Failures (status >= 400) are always written; of the fast successful
    // requests only this share (%, 0-100) is, and a request slower than
    // HTTP_LOG_SLOW_MS ms always is (docs/COST_PROTECTION.md).
    HTTP_LOG_SAMPLE_PERCENT: z.coerce.number().min(0).max(100).default(1),
    HTTP_LOG_SLOW_MS: z.coerce.number().int().min(0).default(1000),
    // docs/02 §3.3 monthly disposable-domain refresh: plain text, one
    // domain per line, '#' comments (the open disposable-email-domains
    // blocklist by default).
    DISPOSABLE_DOMAINS_URL: z
      .string()
      .trim()
      .regex(
        /^https?:\/\/\S+$/,
        'DISPOSABLE_DOMAINS_URL must be an http(s) URL',
      )
      .default(
        'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf',
      ),

    // --- Cost protection (owner-approved extension 2026-09-27,
    // docs/OPEN_QUESTIONS.md, docs/COST_PROTECTION.md) ---
    // Fallback caps for CostGuardService. The live values come from
    // app_config (`budget.<provider>.per_minute_max|daily_max|monthly_max`,
    // changeable without a deploy); these env values apply only when the
    // app_config key is missing or malformed. Deliberately conservative.
    BUDGET_SMS_PER_MINUTE_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(30),
    BUDGET_SMS_DAILY_MAX: z.coerce.number().int().nonnegative().default(300),
    BUDGET_SMS_MONTHLY_MAX: z.coerce.number().int().nonnegative().default(9000),
    BUDGET_EMAIL_PER_MINUTE_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(100),
    BUDGET_EMAIL_DAILY_MAX: z.coerce.number().int().nonnegative().default(2000),
    BUDGET_EMAIL_MONTHLY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(60000),
    BUDGET_ID_CHECK_PER_MINUTE_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(5),
    BUDGET_ID_CHECK_DAILY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(20),
    BUDGET_ID_CHECK_MONTHLY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(200),
    // S3 uploads (docs/03 stage 3.2): one unit per pre-signed upload.
    BUDGET_STORAGE_PER_MINUTE_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(120),
    BUDGET_STORAGE_DAILY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(5000),
    BUDGET_STORAGE_MONTHLY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(100000),
    // Google Translate (chat): one unit per uncached message translation.
    BUDGET_TRANSLATE_PER_MINUTE_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(60),
    BUDGET_TRANSLATE_DAILY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(5000),
    BUDGET_TRANSLATE_MONTHLY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(50000),
    // Bunny Stream (reels): one unit per video upload session.
    BUDGET_VIDEO_PER_MINUTE_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(30),
    BUDGET_VIDEO_DAILY_MAX: z.coerce.number().int().nonnegative().default(1000),
    BUDGET_VIDEO_MONTHLY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(10000),
    // Owner 2026-10-22 (audit #4 §6): daily spend caps in US cents on top
    // of the per-call caps. Global = every paid provider together; user =
    // one person's own spend (translations, uploads, video). 0 = no money
    // cap. Per provider: BUDGET_<PROVIDER>_DAILY_CENTS, else the call cap
    // above converted with the price table (cost-prices.ts).
    BUDGET_GLOBAL_DAILY_CENTS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(50_000),
    BUDGET_USER_DAILY_CENTS: z.coerce.number().int().nonnegative().default(500),
    BUDGET_SMS_DAILY_CENTS: z.coerce.number().int().nonnegative().optional(),
    BUDGET_EMAIL_DAILY_CENTS: z.coerce.number().int().nonnegative().optional(),
    BUDGET_ID_CHECK_DAILY_CENTS: z.coerce
      .number()
      .int()
      .nonnegative()
      .optional(),
    BUDGET_STORAGE_DAILY_CENTS: z.coerce
      .number()
      .int()
      .nonnegative()
      .optional(),
    BUDGET_TRANSLATE_DAILY_CENTS: z.coerce
      .number()
      .int()
      .nonnegative()
      .optional(),
    BUDGET_VIDEO_DAILY_CENTS: z.coerce.number().int().nonnegative().optional(),
    BUDGET_IMAGE_MODERATION_DAILY_CENTS: z.coerce
      .number()
      .int()
      .nonnegative()
      .optional(),
    // Owner 2026-10-22: AWS Rekognition — one unit per image checked.
    BUDGET_IMAGE_MODERATION_PER_MINUTE_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(300),
    BUDGET_IMAGE_MODERATION_DAILY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(20000),
    BUDGET_IMAGE_MODERATION_MONTHLY_MAX: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(300000),
    // POST /files/presign per authenticated user (docs/03 stage 3.2): a
    // verification request needs ~10 files, a post up to 10 photos.
    FILES_PRESIGN_LIMIT_PER_USER_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    // Antivirus (docs/01 §5 "антивирус-скан (ClamAV ...)", docs/03 §2.2):
    // clamd TCP endpoint. Unset: development/test use a built-in scanner
    // that only flags the EICAR test signature; staging/production have
    // NO scanner, so uploads stay scan_status=pending and can never be
    // attached — production must set CLAMAV_HOST.
    CLAMAV_HOST: optionalMatching(
      /^[A-Za-z0-9.-]+$/,
      'CLAMAV_HOST must be a host name or IP address',
    ),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    // Comma-separated ISO-3166 alpha-2 codes; fallback for app_config
    // `sms.allowed_country_codes`. US-only product → 'US' (+1 NANP minus
    // Canada/Caribbean territories, which libphonenumber maps to their
    // own country codes).
    SMS_ALLOWED_COUNTRY_CODES: z
      .string()
      .regex(
        /^[A-Z]{2}(,[A-Z]{2})*$/,
        'SMS_ALLOWED_COUNTRY_CODES must be "US" or "US,PR,..."',
      )
      .default('US'),
    // docs/01_FOUNDATION_AUTH.md §10.2: "10/час на IP/устройство". Keyed
    // on the X-Device-Id header the mobile app sends on every request.
    OTP_RATE_LIMIT_PER_DEVICE_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    // POST /users/me/contacts/request per authenticated user.
    CONTACT_OTP_LIMIT_PER_USER_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(3),
    CONTACT_OTP_LIMIT_PER_USER_PER_DAY: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    // Express `trust proxy` hop count (main.ts). 0 = use the socket
    // address (local dev, no proxy). Behind exactly one AWS ALB set 1 so
    // req.ip is the real client IP from X-Forwarded-For; never set it
    // higher than the real number of proxies (clients could then spoof
    // their IP and escape per-IP limits).
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // docs/06 §4.1 (stage 6.1): CORS only for the admin panel's origin(s);
    // the mobile app sends no Origin. Comma-separated.
    ADMIN_ORIGINS: z.string().default(''),
    // Request body cap (KB) and server timeouts (ms).
    BODY_LIMIT_KB: z.coerce.number().int().min(16).max(10240).default(256),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
    // docs/06 §4.3 (stage 6.1): Sentry with PII scrubbing; off when unset.
    // docs/06 §8: OpenTelemetry Collector (OTLP/HTTP base URL). Unset = off.
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalMatching(
      /^https?:\/\//,
      'OTEL_EXPORTER_OTLP_ENDPOINT must be an http(s) URL',
    ),
    SENTRY_DSN: z.string().url().optional(),
    // Owner 2026-10-01: master keys for the API keys the owner manages in
    // the admin (integration_credentials, AES-256-GCM). "kid:secret[,…]"
    // like JWT_KEYS; the active kid encrypts, every listed kid decrypts
    // (rotation). Unset → the integrations admin is off, env keys are used.
    SECRETS_MASTER_KEYS: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(
          jwtKeysPattern,
          'SECRETS_MASTER_KEYS must be "kid:secret[,kid:secret...]" with each secret >= 32 chars',
        )
        .optional(),
    ),
    SECRETS_ACTIVE_KID: z.preprocess(blankToUndefined, z.string().optional()),
    // Scaling TZ point 11 (2026-10-04): chat message texts encrypted at
    // rest (MessageBodyCipher). Required on staging/production.
    MESSAGE_ENC_KEYS: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(
          jwtKeysPattern,
          'MESSAGE_ENC_KEYS must be "kid:secret[,kid:secret...]" with each secret >= 32 chars',
        )
        .optional(),
    ),
    MESSAGE_ENC_ACTIVE_KID: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    // Owner 2026-10-01: Bunny Stream (video posts) — normally set in the
    // admin → Integrations; these are only the fallback.
    BUNNY_LIBRARY_ID: z.preprocess(blankToUndefined, z.string().optional()),
    BUNNY_CDN_HOSTNAME: z.preprocess(blankToUndefined, z.string().optional()),
    BUNNY_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
    // Owner 2026-10-04: chat translation; normally saved in the admin.
    GOOGLE_TRANSLATE_API_KEY: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    BUNNY_TOKEN_AUTH_KEY: z.preprocess(blankToUndefined, z.string().optional()),
    BUNNY_WEBHOOK_TOKEN: z.preprocess(blankToUndefined, z.string().optional()),
    // Audit #4: Bunny's Read-Only API key — verifies X-BunnyStream-Signature.
    BUNNY_READ_ONLY_API_KEY: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    // Owner 2026-10-22 (audit #4 §5): image moderation and CSAM reporting
    // (env fallbacks of the admin integrations aws_rekognition / photodna /
    // ncmec; docs/SECURITY_TODO.md).
    REKOGNITION_REGION: optionalMatching(
      awsRegionPattern,
      'REKOGNITION_REGION must be an AWS region, e.g. us-east-1',
    ),
    REKOGNITION_ACCESS_KEY_ID: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    REKOGNITION_SECRET_ACCESS_KEY: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    PHOTODNA_SUBSCRIPTION_KEY: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    PHOTODNA_ENDPOINT: z.preprocess(blankToUndefined, z.string().optional()),
    NCMEC_USERNAME: z.preprocess(blankToUndefined, z.string().optional()),
    NCMEC_PASSWORD: z.preprocess(blankToUndefined, z.string().optional()),
    NCMEC_ENVIRONMENT: z.preprocess(
      blankToUndefined,
      z.enum(['test', 'production']).optional(),
    ),
    // OQ-041: STUN / TURN for in-app calls (TURN can also be set in the
    // admin → Integrations).
    STUN_URLS: z.preprocess(blankToUndefined, z.string().optional()),
    TURN_URLS: z.preprocess(blankToUndefined, z.string().optional()),
    TURN_SECRET: z.preprocess(blankToUndefined, z.string().optional()),
    // Cloudflare Realtime TURN (also settable in admin -> Integrations).
    CLOUDFLARE_TURN_KEY_ID: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    CLOUDFLARE_TURN_API_TOKEN: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    // Batch C item 11: usage alerts (GraphQL Analytics, «Account Analytics:
    // Read»); also settable in admin -> Integrations -> Cloudflare TURN.
    CLOUDFLARE_ANALYTICS_ACCOUNT_ID: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    CLOUDFLARE_ANALYTICS_API_TOKEN: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    // Batch C item 16: Bunny account API key for the usage poll.
    BUNNY_ACCOUNT_API_KEY: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    // Cloudflare Realtime SFU for group calls (also settable in admin ->
    // Integrations -> Cloudflare SFU); used when calls.video_provider =
    // cloudflare.
    CLOUDFLARE_SFU_APP_ID: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    CLOUDFLARE_SFU_APP_TOKEN: z.preprocess(
      blankToUndefined,
      z.string().optional(),
    ),
    // Owner 2026-10-22: LiveKit (open-source SFU) for big calls; used only
    // when `calls.video_provider` = livekit (admin → Settings). Also
    // settable in admin → Integrations → LiveKit.
    LIVEKIT_URL: z.preprocess(blankToUndefined, z.string().optional()),
    LIVEKIT_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
    LIVEKIT_API_SECRET: z.preprocess(blankToUndefined, z.string().optional()),
    // Owner 2026-10-24 (search-ready): the search engine behind the
    // `search.engine` switch (admin → Settings); also settable in admin →
    // Integrations → Search engine. Unused while the switch is `postgres`.
    OPENSEARCH_URL: z.preprocess(blankToUndefined, z.string().optional()),
    OPENSEARCH_USERNAME: z.preprocess(blankToUndefined, z.string().optional()),
    OPENSEARCH_PASSWORD: z.preprocess(blankToUndefined, z.string().optional()),
    OPENSEARCH_PREFIX: z.preprocess(blankToUndefined, z.string().optional()),
    OPENSEARCH_REPLICAS: z.preprocess(blankToUndefined, z.string().optional()),
    // docs/06 §2.1 (stage 6.2): encrypts admin TOTP secrets at rest
    // (admin_credentials.totp_secret_enc). Admin sign-in is 503 until set.
    ADMIN_TOTP_ENC_KEY: z.preprocess(
      blankToUndefined,
      z.string().min(32).optional(),
    ),
    // Sign-in code requests per IP per hour (the office NAT shares one IP).
    ADMIN_LOGIN_LIMIT_PER_IP_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(20),
    // docs/06 §2.3 item 7 (stage 6.6): provider keys a paid flag needs
    // before it can be switched on. Optional; presence is all the panel
    // checks (the integrations themselves come with their stages).
    PERSONA_API_KEY: z.preprocess(
      blankToUndefined,
      z.string().min(8).optional(),
    ),
    // Optional Socrata app token of the NY attorney registry (data.ny.gov).
    NY_OPEN_DATA_APP_TOKEN: z.preprocess(
      blankToUndefined,
      z.string().min(8).optional(),
    ),
    // docs/06 §1.4: where the Stripe Customer Portal returns to (a deep
    // link of the app); defaults to APP_LINK_BASE_URL + /subscription.
    STRIPE_PORTAL_RETURN_URL: z.preprocess(
      blankToUndefined,
      z.string().url().optional(),
    ),
    // Shown in authenticator apps and in the admin panel's links.
    ADMIN_PANEL_URL: z.preprocess(
      blankToUndefined,
      z.string().url().optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
      const kids = (env.MESSAGE_ENC_KEYS ?? '')
        .split(',')
        .map((pair) => pair.slice(0, pair.indexOf(':')));
      if (
        !env.MESSAGE_ENC_ACTIVE_KID ||
        !kids.includes(env.MESSAGE_ENC_ACTIVE_KID)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MESSAGE_ENC_KEYS'],
          message:
            'MESSAGE_ENC_KEYS with MESSAGE_ENC_ACTIVE_KID among its kids is required on staging/production (chat encryption at rest)',
        });
      }
    }
    // Owner 2026-10-14: the database link is encrypted on a deployed
    // environment (PostgreSQL: sslmode=require or stricter).
    if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
      const mode = /[?&]sslmode=([a-z-]+)/.exec(env.DATABASE_URL)?.[1];
      if (!mode || !['require', 'verify-ca', 'verify-full'].includes(mode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message:
            'DATABASE_URL needs sslmode=require (or verify-ca / verify-full) on staging/production: the database connection must be encrypted',
        });
      }
    }
    // Security research #5 (2026-10-22), A12: the Redis link is TLS on a
    // deployed environment (ElastiCache in-transit encryption, modules/
    // redis writes rediss://). A plain redis:// there would send the
    // auth token and every session / OTP key in clear text.
    if (
      (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') &&
      !env.REDIS_URL.startsWith('rediss://')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message:
          'REDIS_URL must be rediss:// (TLS) on staging/production: the Redis connection must be encrypted',
      });
    }
    if (
      (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') &&
      env.REDIS_CACHE_URL &&
      !env.REDIS_CACHE_URL.startsWith('rediss://')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_CACHE_URL'],
        message:
          'REDIS_CACHE_URL must be rediss:// (TLS) on staging/production',
      });
    }
    // Security audit 2026-10-01: deployed behind the ALB with 0 hops,
    // req.ip is the load balancer for everyone and every per-IP limit
    // (OTP, admin login, refresh) becomes one shared bucket.
    if (
      (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') &&
      env.TRUST_PROXY_HOPS === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUST_PROXY_HOPS'],
        message:
          'TRUST_PROXY_HOPS must be ≥ 1 when deployed behind the load balancer (staging/production)',
      });
    }
    if (
      env.OTP_DEV_FIXED_CODE &&
      env.NODE_ENV !== 'development' &&
      env.NODE_ENV !== 'test'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTP_DEV_FIXED_CODE'],
        message:
          'OTP_DEV_FIXED_CODE must never be true outside NODE_ENV=development or NODE_ENV=test',
      });
    }
    if (
      env.DEV_FAKE_BUNNY &&
      env.NODE_ENV !== 'development' &&
      env.NODE_ENV !== 'test'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEV_FAKE_BUNNY'],
        message:
          'DEV_FAKE_BUNNY must never be true outside NODE_ENV=development or NODE_ENV=test',
      });
    }
    // SMS/email: credential-driven selection; never mock when deployed.
    const selections = [
      {
        modeKey: 'SMS_PROVIDER',
        realName: 'twilio',
        selection: resolveSmsProvider(env),
      },
      {
        modeKey: 'EMAIL_PROVIDER',
        realName: 'ses',
        selection: resolveEmailProvider(env),
      },
    ] as const;
    for (const { modeKey, realName, selection } of selections) {
      if (!selection.fatal) continue;
      // Owner 2026-10-01: with the admin key store on, the keys may live
      // in the admin (Integrations); a send without keys then fails loudly.
      if (env.SECRETS_MASTER_KEYS && env[modeKey] !== 'mock') continue;
      if (env[modeKey] === 'mock') {
        ctx.addIssue({
          code: 'custom',
          path: [modeKey],
          message: `${modeKey}=mock is not allowed in NODE_ENV=${env.NODE_ENV}; use auto or ${realName} (docs/KEYS_SETUP.md)`,
        });
        continue;
      }
      const why =
        env[modeKey] === realName
          ? `${modeKey}=${realName}`
          : `NODE_ENV=${env.NODE_ENV} never falls back to the mock provider`;
      for (const key of selection.missing) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required (${why}); see docs/KEYS_SETUP.md`,
        });
      }
    }

    // Credentials that only work as a set: all or none.
    const groups = [
      ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
      ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
      ['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY'],
      ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY'],
      [
        'CLOUDFRONT_PRIVATE_DOMAIN',
        'CLOUDFRONT_PRIVATE_KEY_ID',
        'CLOUDFRONT_PRIVATE_KEY_PEM',
      ],
    ] as const;
    for (const group of groups) {
      const present = group.filter((key) => env[key] !== undefined);
      if (present.length === 0 || present.length === group.length) continue;
      for (const key of group.filter((k) => env[k] === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required together with ${present.join(', ')}`,
        });
      }
    }

    // Stripe: live keys only in production and never test keys there — a
    // dev machine must not be able to charge real cards.
    if (env.STRIPE_SECRET_KEY) {
      const live = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY);
      if (live !== (env.NODE_ENV === 'production')) {
        ctx.addIssue({
          code: 'custom',
          path: ['STRIPE_SECRET_KEY'],
          message: live
            ? 'STRIPE_SECRET_KEY: live keys are allowed only in NODE_ENV=production'
            : 'STRIPE_SECRET_KEY: NODE_ENV=production requires a live key',
        });
      }
    }

    if (isDeployedEnv(env.NODE_ENV)) {
      // docs/06 §1.5 / security review: a deployed API must never fall back to
      // the fake payment provider (it accepts `Stripe-Signature: fake`).
      for (const key of [
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'STRIPE_PRICE_ID',
      ] as const) {
        // Owner 2026-10-01: or in the admin (Integrations).
        if (!env[key] && !env.SECRETS_MASTER_KEYS) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: ` is required in NODE_ENV= (the fake payment provider is dev/test only)`,
          });
        }
      }
      if (env.S3_ENDPOINT) {
        ctx.addIssue({
          code: 'custom',
          path: ['S3_ENDPOINT'],
          message: `S3_ENDPOINT is for local MinIO only; leave it empty in NODE_ENV=${env.NODE_ENV}`,
        });
      }
      for (const key of [
        'JWT_KEYS',
        'OTP_CODE_SECRET',
        'OTP_KEY_PEPPER',
        'AUTH_EVENT_PEPPER',
      ] as const) {
        if (placeholderSecretPattern.test(env[key])) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} still holds a placeholder/test value; generate a real secret (docs/KEYS_SETUP.md)`,
          });
        }
      }
    }
    if (env.SECRETS_MASTER_KEYS) {
      const secretKids = env.SECRETS_MASTER_KEYS.split(',').map(
        (pair) => pair.split(':')[0],
      );
      if (
        !env.SECRETS_ACTIVE_KID ||
        !secretKids.includes(env.SECRETS_ACTIVE_KID)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SECRETS_ACTIVE_KID'],
          message:
            'SECRETS_ACTIVE_KID must name one of the kids listed in SECRETS_MASTER_KEYS',
        });
      }
    }
    const kids = env.JWT_KEYS.split(',').map((pair) => pair.split(':')[0]);
    if (!kids.includes(env.JWT_ACTIVE_KID)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACTIVE_KID'],
        message: 'JWT_ACTIVE_KID must name one of the kids listed in JWT_KEYS',
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;
