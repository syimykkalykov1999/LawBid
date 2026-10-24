import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { demoContext } from '../common/demo/demo-context';
import {
  slowQueryExtension,
  slowQueryThresholdMs,
} from './slow-query.extension';
import { softDeleteExtension } from './soft-delete.extension';
import { parentShardLookup, shardExtension } from '../sharding/shard.extension';
import { shardContext } from '../sharding/shard-context';
import {
  ShardDatabaseNotConfiguredError,
  parseShardDatabaseUrls,
} from '../sharding/shard-databases';
import { delegateInfo } from '../sharding/shard-delegates';
import { PRIMARY_DB, ShardMapRow, ShardRouter } from '../sharding/shard-router';
import { shardStats } from '../sharding/shard-stats';

/**
 * The application's database client. Every query made through it (and
 * through `$transaction` clients it hands out) goes through the
 * soft-delete extension (docs/02_DATABASE.md §1.4, see
 * soft-delete.extension.ts): reads of models with `deleted_at` exclude
 * soft-deleted rows unless the caller opts out with `withDeleted()` /
 * `onlyDeleted()` or filters on `deleted_at` itself.
 *
 * Owner 2026-10-05 (demo mode, src/common/demo): the service is a proxy
 * over TWO extended clients — the real database and the demo database
 * (`<db>_demo`, see DemoDatabaseService). Every property access picks the
 * client by `demoContext.isDemo()`, so a request that entered the demo
 * world at the middleware reads and writes only demo tables, and nothing
 * else in the code base has to know. The demo client is created lazily
 * and only when `demoDatabaseUrl()` resolves; while it is missing, demo
 * context queries throw `DemoDatabaseUnavailableError` (the demo
 * endpoints turn that into 503 DEMO_UNAVAILABLE before any query runs).
 *
 * Shard-ready step 3 (docs/architecture/SHARDING_READY.md §5): the real
 * side is itself a set of clients, one per PHYSICAL database: `primary`
 * (DATABASE_URL, also the global family and `shard_map`) plus the optional
 * DATABASE_URL_SHARDS JSON. Which one a query uses:
 *  - a delegate of a GLOBAL model: always `primary`;
 *  - a delegate of a sharded model: the database of the current shard
 *    context (`shardContext`, step 4), `primary` while there is none (and
 *    the query is counted, see shard-stats.ts);
 *  - `$transaction`, `$queryRaw` ...: the database of the shard context.
 * `forShard(n)`, `forCase(id)`, `forUser(id)` and `global()` return a client
 * explicitly. With one physical database all of them are the same client,
 * so behaviour is identical to before.
 *
 * The constructor returns the proxy, so `PrismaService` keeps the plain
 * `PrismaClient` type and every existing injection site, `withTxRetry(
 * prisma, ...)` and `prisma.$transaction` call keep compiling and behaving
 * as before.
 */
export class DemoDatabaseUnavailableError extends Error {
  constructor(reason: string) {
    super(`Demo database unavailable: ${reason}`);
    this.name = 'DemoDatabaseUnavailableError';
  }
}

type ExtendedClient = ReturnType<typeof extend>;

const slowLog = new Logger('SlowQuery');
const shardLog = new Logger('ShardRouting');

function shardMapTtlMs(
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const n = Number(env.SHARD_MAP_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function extend(client: PrismaClient) {
  return client
    .$extends(softDeleteExtension())
    .$extends(shardExtension(parentShardLookup(client)))
    .$extends(
      slowQueryExtension(slowQueryThresholdMs(), (q) =>
        slowLog.warn(`${q.operation} took ${q.ms} ms`),
      ),
    );
}

/** `postgresql://u@h:26257/lawbid?x=y` → `postgresql://u@h:26257/lawbid_demo?x=y` */
export function deriveDemoDatabaseUrl(
  realUrl: string | undefined,
): string | null {
  if (!realUrl) return null;
  try {
    const u = new URL(realUrl);
    const db = u.pathname.replace(/^\//, '');
    if (!db) return null;
    u.pathname = `/${db}_demo`;
    return u.toString();
  } catch {
    return null;
  }
}

/** DEMO_DATABASE_URL wins; otherwise `<DATABASE_URL db>_demo`; `off` disables. */
export function demoDatabaseUrl(): string | null {
  const explicit = process.env.DEMO_DATABASE_URL?.trim();
  if (explicit === 'off') return null;
  if (explicit) return explicit;
  return deriveDemoDatabaseUrl(process.env.DATABASE_URL);
}

export function demoDatabaseName(): string | null {
  const url = demoDatabaseUrl();
  if (!url) return null;
  try {
    return new URL(url).pathname.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const datasourceUrl = withPoolDefaults(process.env.DATABASE_URL);
    super(datasourceUrl ? { datasourceUrl } : undefined);
    // WARNING: do not add instance fields to this class. The constructor
    // returns a proxy, so per-instance state set here is lost for every
    // consumer; only prototype methods survive. State lives in the
    // closure below.
    const real = extend(this) as unknown as PrismaService;
    const rawPrimary = this as PrismaClient;
    const shardUrls = parseShardDatabaseUrls(
      process.env.DATABASE_URL_SHARDS,
      (m) => shardLog.error(m),
    );
    const shardClients = new Map<
      string,
      { raw: PrismaClient; ext: PrismaService }
    >();
    const router = new ShardRouter(
      async () => {
        const rows = await rawPrimary.$queryRaw<ShardMapRow[]>`
        SELECT logical_shard::int AS logical_shard, physical_db, version
        FROM shard_map`;
        return rows;
      },
      { ttlMs: shardMapTtlMs() },
    );

    /** The extended client of a physical database (created on first use). */
    const clientFor = (key: string): PrismaService => {
      if (key === PRIMARY_DB) return real;
      const hit = shardClients.get(key);
      if (hit) return hit.ext;
      const url = shardUrls[key];
      if (!url) throw new ShardDatabaseNotConfiguredError(key);
      const raw = new PrismaClient({
        datasourceUrl: withPoolDefaults(url, process.env, 'DB_POOL_SIZE_SHARD'),
      });
      const ext = extend(raw) as unknown as PrismaService;
      shardClients.set(key, { raw, ext });
      return ext;
    };
    let demo: ExtendedClient | null = null;
    let demoRaw: PrismaClient | null = null;
    let demoReady = false;
    let demoReason = 'not initialised';

    const demoClient = (): PrismaService => {
      if (!demo || !demoReady) {
        throw new DemoDatabaseUnavailableError(demoReason);
      }
      return demo as unknown as PrismaService;
    };

    /** The database of the current shard context; primary without one. */
    const byContext = (): PrismaService => {
      const ctx = shardContext.current();
      if (!ctx) return real;
      if (ctx.physical) return clientFor(ctx.physical);
      if (ctx.shard === undefined) return real;
      return clientFor(router.physicalFor(ctx.shard));
    };

    const pick = (prop: PropertyKey): PrismaService => {
      if (demoContext.isDemo()) return demoClient();
      const info = typeof prop === 'string' ? delegateInfo(prop) : undefined;
      if (!info) return byContext();
      if (info.family === 'global') return real;
      const ctx = shardContext.current();
      if (!ctx) shardStats.noContext(info.model);
      else if (ctx.source === 'auth' || ctx.source === 'socket') {
        shardStats.weakContext(info.model);
      }
      return byContext();
    };

    /** Explicit routing: a physical database, or the demo one in demo mode. */
    const explicit = (key: () => string): PrismaService =>
      demoContext.isDemo() ? demoClient() : clientFor(key());

    const control: PrismaRoutingControl = {
      demoClient(): PrismaClient | null {
        if (demoRaw) return demoRaw;
        const url = demoDatabaseUrl();
        if (!url) {
          demoReason = 'DEMO_DATABASE_URL is off';
          return null;
        }
        demoRaw = new PrismaClient({ datasourceUrl: withPoolDefaults(url) });
        demo = extend(demoRaw);
        return demoRaw;
      },
      markDemoReady(ready: boolean, reason = 'ready'): void {
        demoReady = ready;
        demoReason = reason;
      },
      demoState: () => ({ ready: demoReady, reason: demoReason }),
      realClient: () => real,
      async disconnectDemo() {
        if (demoRaw) await demoRaw.$disconnect().catch(() => undefined);
      },
      router,
      clientFor,
      shardDatabaseKeys: () => Object.keys(shardUrls),
      async connectShardDatabases() {
        for (const key of Object.keys(shardUrls)) {
          try {
            clientFor(key);
            await shardClients.get(key)!.raw.$connect();
          } catch (e) {
            shardLog.error(
              `cannot connect physical database ${key}: ${String(e)}`,
            );
          }
        }
      },
      async disconnectShardDatabases() {
        for (const { raw } of shardClients.values()) {
          await raw.$disconnect().catch(() => undefined);
        }
      },
    };

    const proxy = new Proxy(real, {
      get(_target, prop) {
        if (prop === ROUTING) return control;
        if (prop === 'onModuleInit') {
          return async () => {
            await (real as unknown as PrismaClient).$connect();
            await control.connectShardDatabases();
            await router.start();
          };
        }
        if (prop === 'onModuleDestroy') {
          return async () => {
            await (real as unknown as PrismaClient).$disconnect();
            await control.disconnectShardDatabases();
            await control.disconnectDemo();
          };
        }
        if (prop === 'forShard') {
          return (shard: number) => explicit(() => router.physicalFor(shard));
        }
        if (prop === 'forCase') {
          return (caseId: string) => explicit(() => router.forCase(caseId));
        }
        if (prop === 'forUser') {
          return (userId: string) => explicit(() => router.forUser(userId));
        }
        if (prop === 'global') return () => explicit(() => PRIMARY_DB);
        const client = pick(prop) as unknown as Record<PropertyKey, unknown>;
        const value = client[prop];
        // Jest spies must stay as they are: binding would hide .mockXxx().
        if (
          typeof value === 'function' &&
          !(value as { _isMockFunction?: boolean })._isMockFunction
        ) {
          return (value as (...args: unknown[]) => unknown).bind(client);
        }
        return value;
      },
      set(_target, prop, value) {
        (real as unknown as Record<PropertyKey, unknown>)[prop] = value;
        return true;
      },
      has(_target, prop) {
        return prop === ROUTING || prop in (real as object);
      },
    });
    return proxy;
  }

  /**
   * Shard-ready step 3. These four are answered by the proxy in the
   * constructor (they cannot be, here, because `this` is the raw client);
   * the declarations give them types. Each returns the client of the
   * physical database that holds the shard / case / user, the primary
   * database for `global()`, and the demo client in demo mode.
   */
  forShard(shard: number): PrismaService {
    throw new Error(`forShard(${shard}) is served by the PrismaService proxy`);
  }
  forCase(caseId: string): PrismaService {
    throw new Error(`forCase(${caseId}) is served by the PrismaService proxy`);
  }
  forUser(userId: string): PrismaService {
    throw new Error(`forUser(${userId}) is served by the PrismaService proxy`);
  }
  global(): PrismaService {
    throw new Error('PrismaService.global is served by the proxy');
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Hidden handle used by DemoDatabaseService to prepare / inspect the demo
 * client without exposing it on the PrismaClient type. */
export const ROUTING = Symbol('prisma.routing');

export interface PrismaRoutingControl {
  /** The raw (unextended) demo client, created on first call; null when
   * the demo database is switched off. */
  demoClient(): PrismaClient | null;
  markDemoReady(ready: boolean, reason?: string): void;
  demoState(): { ready: boolean; reason: string };
  realClient(): PrismaService;
  disconnectDemo(): Promise<void>;
  /** Shard-ready step 3: the shard_map cache. */
  router: ShardRouter;
  /** The extended client of a physical database key (`primary` or a key of
   * DATABASE_URL_SHARDS); throws ShardDatabaseNotConfiguredError otherwise. */
  clientFor(key: string): PrismaService;
  /** Keys of DATABASE_URL_SHARDS (without `primary`). */
  shardDatabaseKeys(): string[];
  connectShardDatabases(): Promise<void>;
  disconnectShardDatabases(): Promise<void>;
}

export function routingOf(prisma: PrismaService): PrismaRoutingControl {
  return (prisma as unknown as Record<symbol, PrismaRoutingControl>)[ROUTING];
}

/**
 * Owner 2026-10-05 zero maintenance: bounded connection pool and timeouts
 * so a traffic spike or a slow database queues requests for a few seconds
 * and then fails them, instead of opening connections without limit and
 * hanging (each API/worker task holds at most DB_POOL_SIZE connections,
 * default 10). Values already in the URL win. Statement timeouts are set
 * on the database roles (infra/postgres/role-settings.sql).
 */
export function withPoolDefaults(
  raw: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  poolVar = 'DB_POOL_SIZE',
): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const pool = Number(env[poolVar] ?? env.DB_POOL_SIZE);
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
