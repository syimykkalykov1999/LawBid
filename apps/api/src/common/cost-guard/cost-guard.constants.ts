/**
 * Paid third-party providers guarded by CostGuardService (owner-approved
 * spec extension 2026-09-27 — docs/OPEN_QUESTIONS.md, docs/COST_PROTECTION.md).
 *
 * To guard a new metered API (maps, S3 egress, LLM, ...): add its name
 * here, add BUDGET_<NAME>_* fallbacks to env.schema.ts, seed its
 * `budget.<name>.*` app_config keys in prisma/seed.ts, and call
 * `costGuard.consume('<name>')` right before the provider call.
 *
 * - sms: Twilio Messages (OtpService, login + contact OTP)
 * - email: AWS SES (OtpService)
 * - id_check: Stripe Identity / Persona — TODO(docs/03_VERIFICATION_PROFILES.md,
 *   stage 3.x identity verification): call consume('id_check') before
 *   creating a verification session once that stage is built.
 * - storage: S3 uploads — one unit per pre-signed upload issued by
 *   FilesService.presign (docs/03 §11 stage 3.2): storage, PUT requests
 *   and the antivirus/image work every upload triggers.
 */
export const COST_PROVIDERS = ['sms', 'email', 'id_check', 'storage'] as const;
export type CostProvider = (typeof COST_PROVIDERS)[number];

export type CostWindow = 'minute' | 'daily' | 'monthly';

/** Share of a daily/monthly cap at which a one-time pino warn with
 * `alert: 'cost_budget'` is emitted (per window). */
export const COST_ALERT_RATIO = 0.8;

/** app_config key suffix + env suffix for each window. */
export const COST_WINDOW_CONFIG: Record<
  CostWindow,
  {
    configSuffix: string;
    envSuffix: string;
    keyTag: string;
    ttlSeconds: number;
  }
> = {
  // TTLs outlive the window a little; keys are named after the window
  // (UTC minute/day/month), so a longer TTL never merges two windows.
  minute: {
    configSuffix: 'per_minute_max',
    envSuffix: 'PER_MINUTE_MAX',
    keyTag: 'min',
    ttlSeconds: 120,
  },
  daily: {
    configSuffix: 'daily_max',
    envSuffix: 'DAILY_MAX',
    keyTag: 'd',
    ttlSeconds: 2 * 86_400,
  },
  monthly: {
    configSuffix: 'monthly_max',
    envSuffix: 'MONTHLY_MAX',
    keyTag: 'm',
    ttlSeconds: 35 * 86_400,
  },
};

export const COST_WINDOWS: readonly CostWindow[] = [
  'minute',
  'daily',
  'monthly',
];
