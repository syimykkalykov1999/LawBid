import { PrismaClient } from '@prisma/client';

/**
 * The few things the partition runner needs from a database connection.
 * Two implementations: Prisma (production: `PARTITION_DATABASE_URL`, a role
 * that owns the table) and any fake in unit tests.
 */
export interface Sql {
  rows<T = Record<string, unknown>>(sql: string, ...p: unknown[]): Promise<T[]>;
  run(sql: string, ...p: unknown[]): Promise<number>;
}

export interface SqlDb extends Sql {
  tx<T>(fn: (t: Sql) => Promise<T>, timeoutMs?: number): Promise<T>;
  close(): Promise<void>;
}

function norm(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return v.map(norm);
  return v;
}

function normRows<T>(rows: unknown[]): T[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      o[k] = norm(v);
    }
    return o as T;
  });
}

type Exec = Pick<PrismaClient, '$queryRawUnsafe' | '$executeRawUnsafe'>;

function wrap(c: Exec): Sql {
  return {
    async rows<T>(sql: string, ...p: unknown[]) {
      return normRows<T>(await c.$queryRawUnsafe<unknown[]>(sql, ...p));
    },
    run: (sql: string, ...p: unknown[]) => c.$executeRawUnsafe(sql, ...p),
  };
}

/** A Prisma-backed connection. `url` must be a role that owns the table. */
export function prismaSql(url: string): SqlDb {
  const client = new PrismaClient({ datasourceUrl: url });
  const base = wrap(client);
  return {
    ...base,
    tx: (fn, timeoutMs = 120_000) =>
      client.$transaction(async (t) => fn(wrap(t as unknown as Exec)), {
        timeout: timeoutMs,
        maxWait: 10_000,
      }),
    close: () => client.$disconnect(),
  };
}

/** Wraps a connection the caller already owns (the app's own client). */
export function sharedSql(client: Exec): Sql {
  return wrap(client);
}
