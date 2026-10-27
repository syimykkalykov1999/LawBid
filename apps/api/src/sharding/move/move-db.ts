import { PrismaClient } from '@prisma/client';
import { PRIMARY_DB } from '../shard-router';
import { parseShardDatabaseUrls } from '../shard-databases';

/**
 * Shard-ready step 10: a minimal raw-SQL handle on ONE physical database,
 * used only by the move tool. It is a plain `PrismaClient` with its own
 * small pool, NOT the routed `PrismaService`: the tool must say exactly
 * which database it talks to, whatever shard context or shard_map says.
 */
export interface MoveDb {
  readonly key: string;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** One transaction. `bypass` lets the tool write through the guard. */
  tx<T>(
    fn: (tx: MoveDb) => Promise<T>,
    opts?: { bypass?: boolean },
  ): Promise<T>;
  close(): Promise<void>;
}

type RawClient = Pick<
  PrismaClient,
  '$queryRawUnsafe' | '$executeRawUnsafe' | '$transaction' | '$disconnect'
>;

class PrismaMoveDb implements MoveDb {
  constructor(
    readonly key: string,
    private readonly client: RawClient,
    private readonly owns: boolean,
  ) {}

  query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return this.client.$queryRawUnsafe<T[]>(sql, ...params);
  }

  tx<T>(
    fn: (tx: MoveDb) => Promise<T>,
    opts: { bypass?: boolean } = {},
  ): Promise<T> {
    return (this.client as PrismaClient).$transaction(
      async (inner) => {
        const handle = new PrismaMoveDb(
          this.key,
          inner as unknown as RawClient,
          false,
        );
        if (opts.bypass) {
          await handle.query(
            `SELECT set_config('lawbid.shard_move_bypass', 'on', true)`,
          );
        }
        return fn(handle);
      },
      { timeout: 10 * 60_000, maxWait: 30_000 },
    );
  }

  async close(): Promise<void> {
    if (this.owns) await this.client.$disconnect();
  }
}

/** Database URLs by key: `primary` = DATABASE_URL, the rest DATABASE_URL_SHARDS. */
export function moveDatabaseUrls(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const urls: Record<string, string> = {};
  if (env.DATABASE_URL) urls[PRIMARY_DB] = env.DATABASE_URL;
  Object.assign(urls, parseShardDatabaseUrls(env.DATABASE_URL_SHARDS));
  return urls;
}

/** Opens (and caches) one handle per database key. */
export class MoveDbPool {
  private readonly open = new Map<string, MoveDb>();

  constructor(
    private readonly urls: Record<string, string> = moveDatabaseUrls(),
    private readonly factory: (key: string, url: string) => MoveDb = (
      key,
      url,
    ) =>
      new PrismaMoveDb(
        key,
        new PrismaClient({ datasourceUrl: withPool(url, 4) }),
        true,
      ),
  ) {}

  keys(): string[] {
    return Object.keys(this.urls);
  }

  has(key: string): boolean {
    return key in this.urls;
  }

  get(key: string): MoveDb {
    let db = this.open.get(key);
    if (!db) {
      const url = this.urls[key];
      if (!url) throw new Error(`physical database "${key}" is not configured`);
      db = this.factory(key, url);
      this.open.set(key, db);
    }
    return db;
  }

  async close(): Promise<void> {
    await Promise.all([...this.open.values()].map((d) => d.close()));
    this.open.clear();
  }
}

function withPool(url: string, size: number): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connection_limit')) {
      u.searchParams.set('connection_limit', String(size));
    }
    return u.toString();
  } catch {
    return url;
  }
}
