import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { demoContext } from '../common/demo/demo-context';
import { softDeleteExtension } from './soft-delete.extension';

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

function extend(client: PrismaClient) {
  return client.$extends(softDeleteExtension());
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
    let demo: ExtendedClient | null = null;
    let demoRaw: PrismaClient | null = null;
    let demoReady = false;
    let demoReason = 'not initialised';

    const pick = (): PrismaService => {
      if (!demoContext.isDemo()) return real;
      if (!demo || !demoReady) {
        throw new DemoDatabaseUnavailableError(demoReason);
      }
      return demo as unknown as PrismaService;
    };

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
    };

    const proxy = new Proxy(real, {
      get(_target, prop) {
        if (prop === ROUTING) return control;
        if (prop === 'onModuleInit') {
          return async () => {
            await (real as unknown as PrismaClient).$connect();
          };
        }
        if (prop === 'onModuleDestroy') {
          return async () => {
            await (real as unknown as PrismaClient).$disconnect();
            await control.disconnectDemo();
          };
        }
        const client = pick() as unknown as Record<PropertyKey, unknown>;
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
