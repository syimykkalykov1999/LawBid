import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { demoContext } from '../common/demo/demo-context';
import { resolveReplicaUrl } from './replica-url';
import { shardContext } from '../sharding/shard-context';
import { extend, PrismaService, withPoolDefaults } from './prisma.service';

/** Connection-level Prisma errors: the replica is unreachable, not "wrong". */
const CONNECTION_ERRORS = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
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
 * - `DB_REPLICA_ENABLED=false` switches it off without removing the URL.
 */
@Injectable()
export class PrismaReadService implements OnModuleDestroy {
  private readonly log = new Logger('PrismaRead');
  private raw: PrismaClient | null = null;
  private replica: PrismaService | null = null;
  private replicaUrl = '';
  private downUntil = 0;

  constructor(private readonly primary: PrismaService) {}

  /** True when reads go to a replica right now. */
  get usingReplica(): boolean {
    return this.client() !== null;
  }

  /** The client for lag-tolerant reads (replica when configured and healthy). */
  get db(): PrismaService {
    return this.client() ?? this.primary;
  }

  private client(): PrismaService | null {
    const url = resolveReplicaUrl();
    if (!url || process.env.DB_REPLICA_ENABLED === 'false') return null;
    if (demoContext.isDemo()) return null;
    // The replica copies the PRIMARY family only (one replica set per shard
    // family is not built, docs/architecture/SHARDING_READY.md). A request
    // pinned to another physical database, or any request once extra shard
    // databases are configured, reads from its own primary: never a row from
    // the wrong family. Unsharded production: no effect.
    if (shardContext.current()?.physical) return null;
    if (process.env.DATABASE_URL_SHARDS?.trim()) return null;
    if (Date.now() < this.downUntil) return null;
    if (this.replica && this.replicaUrl !== url) {
      // The replica moved (admin button: deleted and created again).
      const old = this.raw;
      this.replica = null;
      this.raw = null;
      if (old) void old.$disconnect().catch(() => undefined);
    }
    if (!this.replica) {
      this.replicaUrl = url;
      const datasourceUrl = withPoolDefaults(
        url,
        process.env,
        'DB_READ_POOL_SIZE',
      );
      this.raw = new PrismaClient(
        datasourceUrl ? { datasourceUrl } : undefined,
      );
      const markDown = (e: unknown) => {
        const code = (e as { code?: string } | null)?.code;
        if (code && CONNECTION_ERRORS.has(code)) {
          this.downUntil = Date.now() + 15_000;
          this.log.warn(`read replica unreachable (${code}); primary for 15 s`);
        }
      };
      this.replica = extend(this.raw).$extends({
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
    }
    return this.replica;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.raw) await this.raw.$disconnect().catch(() => undefined);
  }
}
