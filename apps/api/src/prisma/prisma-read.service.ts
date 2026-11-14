import {
  shardDatabaseUrlsFromEnv,
  shardReplicaUrlsFromEnv,
} from '../sharding/shard-databases';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { AppSettingsService } from '../common/app-settings/app-settings.service';
import { PrismaClient } from '../generated/prisma/client';
import { demoContext } from '../common/demo/demo-context';
import { withPoolerRouting } from './pooler-url';
import { pgAdapter } from './pg-adapter';
import { resolveReplicaUrl, resolveReplicaUrls } from './replica-url';
import { shardContext } from '../sharding/shard-context';
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
 * - if the replica is unreachable the seam falls back to the primary for 15 s
 *   (the first failing call still throws - callers already handle DB errors);
 * - `DB_REPLICA_ENABLED=false` switches it off without removing the URL;
 * - DB-ops S5-6 lag awareness: every 5 s the replica's lag is sampled
 *   (`pg_last_wal_receive_lsn` vs `pg_last_wal_replay_lsn`, else
 *   `now() - pg_last_xact_replay_timestamp()`); while it is above
 *   `DB_REPLICA_MAX_LAG_MS` (default 5000) every read goes to the primary,
 *   and a caller that tolerates less (or more) passes its own
 *   `maxStalenessMs` to `readDb()`. A failing sample counts as "too far
 *   behind". Before the first sample the replica is trusted (as before);
 * - `DB_REPLICA_POOLER_HOST` sends the replica URL through a PgBouncer in
 *   front of the replica (see pooler-url.ts for why it is not DB_POOLER_HOST).
 */
@Injectable()
export class PrismaReadService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('PrismaRead');
  private raw: PrismaClient | null = null;
  private replica: PrismaService | null = null;
  private replicaUrl = '';
  /**
   * Owner 2026-11-11: with extra database servers, the read client is a
   * routed PrismaService whose servers are the read copies (the primary's
   * copy, each extra server's copy or the server itself without one), so
   * every data part is read from the copy of its own server.
   */
  private routed: PrismaService | null = null;
  /** Owner 2026-11-11: the other read copies (beyond the first), by URL. */
  private readonly others = new Map<
    string,
    { raw: PrismaClient; client: PrismaService }
  >();
  private turn = 0;
  private downUntil = 0;
  /** Last sampled lag in ms; null = not sampled yet / sampling failed. */
  private lagMs: number | null = null;
  private lagKnown = false;
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

  /** Last sampled replica lag (ms); null before the first sample or after a
   * failed one (and while no replica is configured). */
  get replicaLagMs(): number | null {
    return this.lagMs;
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

  /** One lag sample; never throws. */
  async sampleLag(): Promise<void> {
    const replica = this.raw;
    if (!replica) return;
    try {
      const rows = await replica.$queryRaw<{ lag_ms: number | null }[]>`
        SELECT (CASE
          WHEN NOT pg_is_in_recovery() THEN 0
          WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
          ELSE COALESCE(EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000, 0)
        END)::FLOAT8 AS lag_ms`;
      this.lagMs = Number(rows[0]?.lag_ms ?? 0);
      this.lagKnown = true;
    } catch (e) {
      this.lagMs = null;
      this.lagKnown = true; // unknown lag after a failure = do not trust it
      this.log.warn(`replica lag sample failed: ${String(e).slice(0, 200)}`);
    }
    const lagging = this.lagMs === null || this.lagMs > this.maxLagMs();
    if (lagging !== this.lagging) {
      this.lagging = lagging;
      this.log.warn({
        metric: 'replica_lag_state',
        lagging,
        lagMs: this.lagMs,
        msg: lagging
          ? 'read replica too far behind: reads go to the primary'
          : 'read replica caught up: reads go to the replica again',
      });
    }
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
    if (Date.now() < this.downUntil) return null;
    // Admin switch: off = primary only; on = replica whatever its lag.
    if (this.mode === 'off') return null;
    const budget =
      this.mode === 'on' ? Infinity : this.maxLagMs(maxStalenessMs);
    if (budget <= 0) return null;
    if (
      this.mode !== 'on' &&
      this.lagKnown &&
      (this.lagMs === null || this.lagMs > budget)
    ) {
      return null;
    }
    // Extra servers: the routed copy client (built at start; until then, and
    // if it could not be built, the primary).
    if (sharded) {
      this.startSampler();
      return this.routed;
    }
    if (this.replica && this.replicaUrl !== url) {
      // The replica moved (admin button: deleted and created again).
      const old = this.raw;
      this.replica = null;
      this.raw = null;
      if (old) void old.$disconnect().catch(() => undefined);
    }
    if (!this.replica) {
      this.replicaUrl = url;
      const made = this.makeCopy(url);
      this.raw = made.raw;
      this.replica = made.client;
    }
    this.startSampler();
    // Owner 2026-11-11 («Авто» by count): with several copies the reads are
    // shared between them, one after the other (round robin).
    const urls = resolveReplicaUrls();
    if (urls.length <= 1) return this.replica;
    for (const u of urls.slice(1)) {
      if (!this.others.has(u)) this.others.set(u, this.makeCopy(u));
    }
    for (const [u, c] of this.others) {
      if (!urls.includes(u)) {
        this.others.delete(u);
        void c.raw.$disconnect().catch(() => undefined);
      }
    }
    const all = [
      this.replica,
      ...[...this.others.values()].map((c) => c.client),
    ];
    this.turn = (this.turn + 1) % all.length;
    return all[this.turn];
  }

  /** One read copy client, marked down for 15 s when it does not answer. */
  private makeCopy(url: string): { raw: PrismaClient; client: PrismaService } {
    const datasourceUrl = withPoolDefaults(
      withPoolerRouting(url, process.env, 'DB_REPLICA_POOLER_HOST'),
      process.env,
      'DB_READ_POOL_SIZE',
    );
    const raw = new PrismaClient({ adapter: pgAdapter(datasourceUrl) });
    const markDown = (e: unknown) => {
      const code = (e as { code?: string } | null)?.code;
      if (code && CONNECTION_ERRORS.has(code)) {
        this.downUntil = Date.now() + 15_000;
        this.log.warn(`read replica unreachable (${code}); primary for 15 s`);
      }
    };
    const client = extend(raw).$extends({
      name: 'replica-health',
      query: {
        async $allOperations({ args, query }) {
          try {
            return (await query(args)) as unknown;
          } catch (e) {
            markDown(e);
            throw e;
          }
        },
      },
    }) as unknown as PrismaService;
    return { raw, client };
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

  async onModuleDestroy(): Promise<void> {
    if (this.routed) {
      await (this.routed as unknown as { onModuleDestroy(): Promise<void> })
        .onModuleDestroy()
        .catch(() => undefined);
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.raw) await this.raw.$disconnect().catch(() => undefined);
    for (const c of this.others.values()) {
      await c.raw.$disconnect().catch(() => undefined);
    }
  }
}
