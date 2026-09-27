import { z } from 'zod';

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
    // docs/01_FOUNDATION_AUTH.md §15 stage 1.4: "код 000000 только в
    // NODE_ENV=development" — validated below (.superRefine) so a
    // misconfigured staging/production env fails at boot instead of
    // silently accepting a fixed code. Extended (docs/CHANGELOG.md,
    // stage 1.4) to also permit NODE_ENV=test: e2e tests need a
    // deterministic code to drive the OTP flow, and mock SMS/email
    // providers deliberately never expose the real generated code
    // anywhere (not even logs) — 'test' carries the same "never a real
    // deployed environment" guarantee as 'development' for this purpose.
    OTP_DEV_FIXED_CODE: z.coerce.boolean().default(false),

    // --- Stage 1.4: SMS provider ---
    SMS_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),

    // --- Stage 1.4: email provider ---
    EMAIL_PROVIDER: z.enum(['mock', 'ses']).default('mock'),
    SES_REGION: z.string().optional(),
    SES_FROM_ADDRESS: z.string().optional(),
    // Mailhog (dev/test), used by the mock provider so codes are visible
    // in a real inbox rather than only in logs (docs/01_FOUNDATION_AUTH.md
    // §15 stage 1.1: Mailhog is already part of docker-compose.yml).
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),

    // --- Stage 1.4: social login ---
    // Comma-separated allowed audiences/bundle ids.
    GOOGLE_CLIENT_IDS: z.string().optional(),
    APPLE_BUNDLE_IDS: z.string().optional(),

    // --- Stage 1.4: fraud/attestation seam (flag-gated, no-op today) ---
    FEATURE_ATTESTATION: z.coerce.boolean().default(false),

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
    if (env.SMS_PROVIDER === 'twilio') {
      for (const key of [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_FROM_NUMBER',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when SMS_PROVIDER=twilio`,
          });
        }
      }
    }
    if (env.EMAIL_PROVIDER === 'ses') {
      for (const key of ['SES_REGION', 'SES_FROM_ADDRESS'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when EMAIL_PROVIDER=ses`,
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
