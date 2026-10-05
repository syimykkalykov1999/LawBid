import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './soft-delete.extension';

/**
 * The application's database client. Every query made through it (and
 * through `$transaction` clients it hands out) goes through the
 * soft-delete extension (docs/02_DATABASE.md §1.4, see
 * soft-delete.extension.ts): reads of models with `deleted_at` exclude
 * soft-deleted rows unless the caller opts out with `withDeleted()` /
 * `onlyDeleted()` or filters on `deleted_at` itself.
 *
 * The constructor returns the extended client (a proxy over this very
 * instance), so `PrismaService` keeps the plain `PrismaClient` type and
 * every existing injection site, `withTxRetry(prisma, ...)` and
 * `prisma.$transaction` call keep compiling and behaving as before. A query
 * extension changes no types, only the args that reach the engine.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const datasourceUrl = withPoolDefaults(process.env.DATABASE_URL);
    super(datasourceUrl ? { datasourceUrl } : undefined);
    // WARNING: do not add instance fields to this class. The constructor
    // returns the $extends proxy below, so per-instance state set here is
    // lost for every consumer; only prototype methods survive.
    // Returning an object from a derived-class constructor makes it the
    // `new` result; Nest registers that proxy as the provider instance.
    return this.$extends(softDeleteExtension()) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * Owner 2026-10-05 zero maintenance: bounded connection pool and timeouts
 * so a traffic spike or a slow database queues requests for a few seconds
 * and then fails them, instead of opening connections without limit and
 * hanging (each API/worker task holds at most DB_POOL_SIZE connections,
 * default 10). Values already in the URL win. Statement timeouts are set
 * on the database roles (infra/cockroach/role-settings.sql).
 */
export function withPoolDefaults(
  raw: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const pool = Number(env.DB_POOL_SIZE);
  const defaults: Record<string, string> = {
    connection_limit: String(Number.isInteger(pool) && pool > 0 ? pool : 10),
    pool_timeout: '10',
    connect_timeout: '10',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!url.searchParams.has(k)) url.searchParams.set(k, v);
  }
  return url.toString();
}
