import { PrismaClient } from '@prisma/client';
import { envSchema } from '../config/env.schema';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import { createRedisClient } from '../redis/redis-connection';

// Deploy safety audit 2026-10-27 (docs/dev/DEPLOY_SAFETY_AUDIT_2026-10-27.md):
// the owner's fear is "green in CI, broken on the server". CI never sees the
// real task definition (env + Secrets Manager values), so a missing or weak
// prod value used to surface only when the NEW api tasks crash-looped and
// ECS rolled them back — after the migrations had already run.
//
// `node dist/src/cli/check-config.js` runs inside a one-off copy of the api
// task (scripts/deploy/prod-admin-ecs.sh <tag> config) BEFORE migrations:
// the new image's env rules against the real env, the KMS unwrap, and one
// round trip to Postgres and Redis. It prints variable NAMES and rule texts
// only, never values, and exits 1 on the first class of problems so the
// deploy stops with a readable message instead of a rollback storm.

export interface CheckResult {
  ok: boolean;
  problems: string[];
}

/** Env rules of THIS image against [env]. Pure (no network), unit-tested. */
export function checkEnv(env: Record<string, string | undefined>): CheckResult {
  const parsed = envSchema.safeParse(env);
  if (parsed.success) return { ok: true, problems: [] };
  const problems = parsed.error.issues.map((i) =>
    `${i.path.join('.') || '(env)'}: ${i.message}`.slice(0, 300),
  );
  return { ok: false, problems: [...new Set(problems)].sort() };
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what}: no answer in ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/** First line of an error, without anything that looks like a URL (it could
 * carry a password). */
function safeMessage(e: unknown): string {
  return String((e as Error)?.message ?? e)
    .split('\n')[0]
    .replace(/[a-z]+:\/\/\S+/gi, '<url>')
    .slice(0, 200);
}

async function checkPostgres(url: string): Promise<string | null> {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await withTimeout(prisma.$queryRawUnsafe('SELECT 1'), 10_000, 'Postgres');
    return null;
  } catch (e) {
    return `Postgres: ${safeMessage(e)}`;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function checkRedis(url: string): Promise<string | null> {
  // The app's own factory (standalone or REDIS_CLUSTER, TLS, auth).
  const redis = createRedisClient(url, {
    maxRetriesPerRequest: 1,
    commandTimeout: 5_000,
    authRefresh: false,
  });
  redis.on('error', () => undefined);
  try {
    await withTimeout(redis.ping(), 10_000, 'Redis');
    return null;
  } catch (e) {
    return `Redis: ${safeMessage(e)}`;
  } finally {
    redis.disconnect();
  }
}

async function run(): Promise<number> {
  try {
    await unwrapKmsWrappedKeys();
  } catch (e) {
    process.stdout.write(`config INVALID\n  KMS: ${safeMessage(e)}\n`);
    return 1;
  }
  const env = checkEnv(process.env);
  if (!env.ok) {
    process.stdout.write(
      `config INVALID (${env.problems.length}): the new api would not boot\n` +
        env.problems.map((p) => `  ${p}`).join('\n') +
        '\n',
    );
    return 1;
  }
  const net = (
    await Promise.all([
      checkPostgres(process.env.DATABASE_URL ?? ''),
      checkRedis(process.env.REDIS_URL ?? ''),
    ])
  ).filter((x): x is string => x !== null);
  if (net.length > 0) {
    process.stdout.write(
      `config OK, but a dependency is unreachable:\n${net.map((p) => `  ${p}`).join('\n')}\n`,
    );
    return 1;
  }
  process.stdout.write('config OK: env rules, KMS, Postgres, Redis\n');
  return 0;
}

if (require.main === module) {
  run().then(
    (code) => process.exit(code),
    (e) => {
      process.stdout.write(`config check crashed: ${safeMessage(e)}\n`);
      process.exit(1);
    },
  );
}
