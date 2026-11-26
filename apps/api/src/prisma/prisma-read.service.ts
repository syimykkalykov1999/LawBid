import {
  shardDatabaseUrlsFromEnv,
  shardReplicaUrlsFromEnv,
} from '../sharding/shard-databases';
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { AppSettingsService } from '../common/app-settings/app-settings.service';
import { demoContext } from '../common/demo/demo-context';
import { withPoolerRouting } from './pooler-url';
import { pgAdapter } from './pg-adapter';
import {
  newSecretOmittingClient,
  SecretOmittingClient,
} from './secret-columns';
import { resolveReplicaUrl, resolveReplicaUrls } from './replica-url';
import { shardContext } from '../sharding/shard-context';
import { isTransientInfraError } from '../common/resilience/transient-errors';
import {
  extend,
  PrismaService,
  ROUTING,
  withPoolDefaults,
} from './prisma.service';

/** Connection-level Prisma errors: the replica is unreachable, not "wrong". */
const CONNECTION_ERRORS = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  // Prisma 7 (driver adapter): the OS socket error is the code.
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/** The read operations of a model, as in Prisma's own read-replicas
 * extension (@prisma/extension-read-replicas 0.5.0, Apache-2.0,
 * src/extension.ts `readOperations`; THIRD_PARTY_NOTICES.md). */
const READ_OPERATIONS: ReadonlySet<string> = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'aggregate',
  'count',
]);

/** SQL text of a raw call as the query extension sees it (Prisma 7.10:
 * `$queryRaw` hands the Sql object, `$queryRawUnsafe` `[text, ...values]`). */
function rawText(operation: string, args: unknown): string | null {
  if (operation === '$queryRawUnsafe' && Array.isArray(args)) {
    return typeof args[0] === 'string' ? args[0] : null;
  }
  if (operation === '$queryRaw' && args && typeof args === 'object') {
    const a = args as { sql?: unknown; strings?: unknown };
    if (typeof a.sql === 'string') return a.sql;
    if (Array.isArray(a.strings)) return a.strings.join('?');
  }
  return null;
}

/** A call that only reads, so it may be asked again of the primary. */
export function isReplayableRead(operation: string, args: unknown): boolean {
  if (READ_OPERATIONS.has(operation)) return true;
  const sql = rawText(operation, args);
  return sql !== null && /^\s*(select|with)\b/i.test(sql);
}

/**
 * Rows 8 / 9 (15.11, KNOWN_ERRORS 161): the same read once more, on the
 * primary. Model calls as Prisma's read-replicas extension routes them
 * (`client[model][operation](args)`), with the camelCase delegate our
 * shard router keys on; raw reads with the arguments the extension got.
 */
export function readOnPrimary(
  primary: PrismaService,
  model: string | undefined,
  operation: string,
  args: unknown,
): Promise<unknown> {
  const p = primary as unknown as Record<
    string,
    Record<string, (a: unknown) => Promise<unknown>> &
      ((...a: unknown[]) => Promise<unknown>)
  >;
  if (model) {
    const delegate = model[0].toLowerCase() + model.slice(1);
    return p[delegate][operation](args);
  }
  if (operation === '$queryRawUnsafe') {
    return p.$queryRawUnsafe(...(args as unknown[]));
  }
  return p[operation](args);
}

/** One read copy: its client, its own health (rows 8 / 9). */
interface Copy {
  url: string;
  raw: SecretOmittingClient;
  client: PrismaService;
  /** Last sampled lag; null = no good sample yet or the last one failed. */
  lagMs: number | null;
  /** Out of the rotation until (it did not answer). */
  downUntil: number;
  sampling: Promise<void> | null;
}

/**
 * Load audit 6 (2026-10-23): the read-replica seam.
 *
 * `db` is the client for READS THAT MAY BE A FEW SECONDS OLD (search, public
 * profiles, feeds, anything cached anyway). With `DATABASE_REPLICA_URL` empty
 * it IS the primary client - nothing changes. When the Terraform replica
 * exists (`rds_read_replicas` > 0) setting that one environment variable
 * moves those reads to the replica: no code change, no deploy of new code.
 * Instagram/Facebook run the same split (writes to the primary region,
 * reads from the nearest replica).
 *
 * Safety:
 * - never used for a read that follows a write of the same person in the same
 *   request (read-your-writes) - callers choose `db` only where lag is fine;
 * - demo-mode requests always use the primary (the demo database has no replica);
 * - rows 8 / 9 (15.11, KNOWN_ERRORS 161), the AWS load balancer target rule
 *   (a new target is "initial" and gets no request until its first health
 *   check passes; one that fails it is taken out): a copy serves reads only
 *   after a lag sample on it answered, each copy is sampled on its own, and
 *   a copy that does not answer is out of the rotation for 15 s. The read
 *   that met the dead copy is asked once more of the primary (AWS JDBC
 *   wrapper read/write splitting: no reader = the writer), so a copy that
 *   «Авто» removed, or a stale DB_REPLICA_HOST, costs no error;
 * - `DB_REPLICA_ENABLED=false` switches it off without removing the URL;
 * - DB-ops S5-6 lag awareness: every 5 s each copy's lag is sampled
 *   (`pg_last_wal_receive_lsn` vs `pg_last_wal_replay_lsn`, else
 *   `now() - pg_last_xact_replay_timestamp()`); while it is above
 *   `DB_REPLICA_MAX_LAG_MS` (default 5000) that copy gets no read, and a
 *   caller that tolerates less (or more) passes its own `maxStalenessMs` to
 *   `readDb()`. A failing sample counts as "too far behind";
 * - `DB_REPLICA_POOLER_HOST` sends the replica URL through a PgBouncer in
 *   front of the replica (see pooler-url.ts for why it is not DB_POOLER_HOST).
 */
@Injectable()
export class PrismaReadService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger('PrismaRead');
  /** Owner 2026-11-11 («Авто» by count): every read copy, first one first. */
  private readonly copies = new Map<string, Copy>();
  /**
   * Owner 2026-11-11: with extra database servers, the read client is a
   * routed PrismaService whose servers are the read copies (the primary's
   * copy, each extra server's copy or the server itself without one), so
   * every data part is read from the copy of its own server.
   */
  private routed: PrismaService | null = null;
  private turn = 0;
  /** The routed copy client did not answer (extra servers only). */
  private downUntil = 0;
  private lagging = false;
  private timer: NodeJS.Timeout | null = null;

  /** Admin three-state switch `db.replica_reads` (off / on / auto). */
  private mode: 'off' | 'on' | 'auto' = 'auto';
  /** Admin ceiling `db.replica_max_lag_ms` (null = env / 5000). */
  private settingLagMs: number | null = null;

  constructor(
    private readonly primary: PrismaService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /** Reads the admin switch and ceiling; never throws. */
  async refreshSettings(): Promise<void> {
    if (!this.settings) return;
    try {
      const m = await this.settings.string('db.replica_reads');
      this.mode = m === 'off' || m === 'on' ? m : 'auto';
      this.settingLagMs = await this.settings.number('db.replica_max_lag_ms');
    } catch {
      /* keep the last known values */
    }
  }

  /** The first copy (the one DB_REPLICA_HOST names first). */
  private first(): Copy | undefined {
    return this.copies.values().next().value;
  }

  /** Last sampled lag of the first copy (ms); null before its first good
   * sample or after a failed one (and while no replica is configured). */
  get replicaLagMs(): number | null {
    return this.first()?.lagMs ?? null;
  }

  /** True when reads go to a replica right now. */
  get usingReplica(): boolean {
    return this.client() !== null;
  }

  /** The client for lag-tolerant reads (replica when configured and healthy). */
  get db(): PrismaService {
    return this.client() ?? this.primary;
  }

  /**
   * Like `db`, for a caller with its own staleness budget: the replica is
   * used only while its sampled lag is at most `maxStalenessMs` (default
   * `DB_REPLICA_MAX_LAG_MS`, 5000). `maxStalenessMs <= 0` = always primary.
   */
  readDb(options: { maxStalenessMs?: number } = {}): PrismaService {
    return this.client(options.maxStalenessMs) ?? this.primary;
  }

  /** The replica client has no shard router: while sharded tables live on
   * several physical databases every read goes through the primary client
   * (which routes), never straight to a single replica. */
  private shardedDatabases(): boolean {
    const routing = (this.primary as unknown as Record<symbol, unknown>)[
      ROUTING
    ] as { shardDatabaseKeys(): string[] } | undefined;
    return (routing?.shardDatabaseKeys().length ?? 0) > 0;
  }

  private maxLagMs(override?: number): number {
    if (override !== undefined) return override;
    if (this.settingLagMs !== null) return this.settingLagMs;
    const env = Number(process.env.DB_REPLICA_MAX_LAG_MS);
    return Number.isFinite(env) && process.env.DB_REPLICA_MAX_LAG_MS
      ? env
      : 5000;
  }

  /** One lag sample of every copy; never throws. */
  async sampleLag(): Promise<void> {
    await Promise.all([...this.copies.values()].map((c) => this.sampleOne(c)));
    const first = this.first();
    if (!first) return;
    const lagging = first.lagMs === null || first.lagMs > this.maxLagMs();
    if (lagging !== this.lagging) {
      this.lagging = lagging;
      this.log.warn({
        metric: 'replica_lag_state',
        lagging,
        lagMs: first.lagMs,
        msg: lagging
          ? 'read replica too far behind: reads go to the primary'
          : 'read replica caught up: reads go to the replica again',
      });
    }
  }

  /** One sample of one copy (one at a time per copy); never throws. */
  private sampleOne(c: Copy): Promise<void> {
    if (c.sampling) return c.sampling;
    c.sampling = (async () => {
      try {
        const rows = await c.raw.$queryRaw<{ lag_ms: number | null }[]>`
        SELECT (CASE
          WHEN NOT pg_is_in_recovery() THEN 0
          WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
          ELSE COALESCE(EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000, 0)
        END)::FLOAT8 AS lag_ms`;
        c.lagMs = Number(rows[0]?.lag_ms ?? 0);
      } catch (e) {
        c.lagMs = null; // unknown lag after a failure = do not trust it
        this.log.warn(
          `replica lag sample failed (${new URL(c.url).hostname}): ${String(e).slice(0, 200)}`,
        );
      } finally {
        c.sampling = null;
      }
    })();
    return c.sampling;
  }

  private startSampler(): void {
    if (this.timer) return;
    void this.refreshSettings();
    this.timer = setInterval(() => {
      void this.refreshSettings();
      void this.sampleLag();
    }, 5_000);
    this.timer.unref();
  }

  /** The copies follow the address list (a copy «Авто» added or removed);
   * a new one is sampled at once and serves after that sample answered. */
  private syncCopies(urls: readonly string[]): void {
    for (const [u, c] of this.copies) {
      if (!urls.includes(u)) {
        this.copies.delete(u);
        void c.raw.$disconnect().catch(() => undefined);
      }
    }
    for (const u of urls) {
      if (this.copies.has(u)) continue;
      const made = this.makeCopy(u);
      const c: Copy = {
        url: u,
        raw: made.raw,
        client: made.client,
        lagMs: null,
        downUntil: 0,
        sampling: null,
      };
      made.bind(c);
      this.copies.set(u, c);
      void this.sampleOne(c);
    }
  }

  private client(maxStalenessMs?: number): PrismaService | null {
    // #334: the admin «Копия базы для чтения» switch can create the replica
    // later; its address comes from the env or the switch's stored value.
    const url = resolveReplicaUrl();
    if (!url || process.env.DB_REPLICA_ENABLED === 'false') return null;
    if (demoContext.isDemo()) return null;
    const sharded =
      this.shardedDatabases() ||
      Object.keys(shardDatabaseUrlsFromEnv()).length > 0;
    // One server: a request pinned to a physical database reads its primary.
    if (!sharded && shardContext.current()?.physical) return null;
    // Admin switch: off = primary only; on = replica whatever its lag.
    if (this.mode === 'off') return null;
    const budget =
      this.mode === 'on' ? Infinity : this.maxLagMs(maxStalenessMs);
    if (budget <= 0) return null;
    // Extra servers: the routed copy client (built at start; until then, and
    // if it could not be built, the primary).
    if (sharded) {
      if (Date.now() < this.downUntil) return null;
      this.startSampler();
      return this.routed;
    }
    const urls = resolveReplicaUrls();
    this.syncCopies(urls.length > 0 ? urls : [url]);
    this.startSampler();
    const now = Date.now();
    const ready = [...this.copies.values()].filter(
      (c) =>
        now >= c.downUntil &&
        (this.mode === 'on' || (c.lagMs !== null && c.lagMs <= budget)),
    );
    if (ready.length === 0) return null;
    // Owner 2026-11-11 («Авто» by count): with several copies the reads are
    // shared between them, one after the other (round robin).
    this.turn = (this.turn + 1) % ready.length;
    return ready[this.turn].client;
  }

  /** One read copy client. A copy that does not answer is out for 15 s, and
   * the read that met it is asked again of the primary. */
  private makeCopy(url: string): {
    raw: SecretOmittingClient;
    client: PrismaService;
    bind: (c: Copy) => void;
  } {
    const datasourceUrl = withPoolDefaults(
      withPoolerRouting(url, process.env, 'DB_REPLICA_POOLER_HOST'),
      process.env,
      'DB_READ_POOL_SIZE',
    );
    // S10 (#17): a read copy omits the same secret columns as the primary.
    const raw = newSecretOmittingClient(pgAdapter(datasourceUrl));
    let self: Copy | null = null;
    const primary = this.primary;
    const log = this.log;
    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'replica';
      }
    })();
    const client = extend(raw).$extends({
      name: 'replica-health',
      query: {
        async $allOperations({
          model,
          operation,
          args,
          query,
          // Prisma's read-replicas extension reads the same internal field
          // to leave transactions alone.
          // @ts-expect-error internal Prisma parameter
          __internalParams,
        }) {
          try {
            return (await query(args)) as unknown;
          } catch (e) {
            const code = (e as { code?: string } | null)?.code;
            const read = isReplayableRead(operation, args);
            const gone =
              (!!code && CONNECTION_ERRORS.has(code)) ||
              (read && isTransientInfraError(e));
            if (!gone) throw e;
            if (self) self.downUntil = Date.now() + 15_000;
            const inTx = !!(
              __internalParams as { transaction?: unknown } | undefined
            )?.transaction;
            if (!read || inTx) {
              log.warn(
                `read replica ${host} unreachable (${code}); out for 15 s`,
              );
              throw e;
            }
            log.warn(
              `read replica ${host} unreachable (${code ?? 'transient'}); out for 15 s, this read on the primary`,
            );
            return readOnPrimary(primary, model, operation, args);
          }
        },
      },
    }) as unknown as PrismaService;
    return {
      raw,
      client,
      bind: (c) => {
        self = c;
      },
    };
  }

  /** Builds the routed copy client when extra servers and a copy exist, in
   * the background: a copy that does not answer never holds the start. */
  onModuleInit(): void {
    void this.buildRouted();
  }

  private async buildRouted(): Promise<void> {
    const url = resolveReplicaUrl();
    const servers = shardReplicaUrlsFromEnv(process.env, (m) =>
      this.log.warn(m),
    );
    if (!url || Object.keys(servers).length === 0) return;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: url,
      // The copies are reached directly (or through their own pooler).
      DB_POOLER_HOST: process.env.DB_REPLICA_POOLER_HOST ?? '',
      DB_POOL_SIZE: process.env.DB_READ_POOL_SIZE ?? process.env.DB_POOL_SIZE,
      DB_SHARD_HOSTS: '',
      DATABASE_URL_SHARDS: JSON.stringify(servers),
    };
    try {
      const routed = new PrismaService(env);
      await (
        routed as unknown as { onModuleInit(): Promise<void> }
      ).onModuleInit();
      this.routed = routed;
    } catch (e) {
      this.log.warn(`read copies of the extra servers not used: ${String(e)}`);
    }
  }

  /** Row 213: closed in the last phase, with the primary (see the proxy's
   * onApplicationShutdown in prisma.service.ts). */
  async onApplicationShutdown(): Promise<void> {
    if (this.routed) {
      await (
        this.routed as unknown as { onApplicationShutdown(): Promise<void> }
      )
        .onApplicationShutdown()
        .catch(() => undefined);
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const c of this.copies.values()) {
      await c.raw.$disconnect().catch(() => undefined);
    }
    this.copies.clear();
  }
}
