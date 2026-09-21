import { envSchema, type AppEnv } from './env.schema';

export function loadConfig(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast on boot — docs/06_PRODUCTION.md §6.2: refuse to start on
    // invalid env, do not warn and continue with defaults for required vars.
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
