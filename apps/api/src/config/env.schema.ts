import { z } from 'zod';

/**
 * Stage 1.2 (docs/01_FOUNDATION_AUTH.md §15): "приложение отказывается
 * стартовать при невалидном env" (docs/06_PRODUCTION.md §6.2) — validate,
 * don't warn. Only vars actually used by stage 1.1/1.2 code are required;
 * add more here as later stages introduce them (Stripe, Twilio, SES, ...).
 */
export const envSchema = z.object({
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
});

export type AppEnv = z.infer<typeof envSchema>;
