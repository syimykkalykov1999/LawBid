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
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
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
    STRIPE_PRICE_ID: optionalMatching(
      /^price_[A-Za-z0-9]+$/,
      'STRIPE_PRICE_ID must start with price_',
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

    // --- Stage 1.4: fraud/attestation seam (flag-gated, no-op today) ---
    FEATURE_ATTESTATION: envBoolean(false),

    // --- Background jobs (docs/01 §5.2 BullMQ; docs/06 §6 `worker`
    // service; src/jobs/) ---
    // true: this API process also runs the `cron` queue scheduler and
    // worker. Set false on API tasks once the dedicated worker service
    // (node dist/src/worker.js) runs; worker.ts ignores this flag.
    JOBS_ENABLED: envBoolean(true),
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
    BUDGET_SMS_MONTHLY_MAX: z.coerce.number().int().nonnegative().default(5000),
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
      .default(30000),
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
  })
  .superRefine((env, ctx) => {
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
