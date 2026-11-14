import { hostname } from 'node:os';
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  HEALTH_CHECK_TIMEOUT_MS,
  withTimeout,
} from './indicators/with-timeout.util';

/** One field per API task: when that task last reached the database. */
export const DB_OK_HASH = 'health:db_ok';
/** Held by the one task of the whole fleet that is restarting itself. */
export const DB_LOST_EXIT_LOCK = 'health:db_lost_exit';
/** How often each task asks the database by itself. */
export const DB_WATCH_EVERY_MS = 30_000;
/** Another task reached the database this recently = the database is up. */
export const DB_PEER_FRESH_MS = 90_000;
/** At most one self-restart in the whole fleet per this many seconds. */
export const DB_LOST_EXIT_LOCK_SEC = 600;
/** Fields of tasks gone longer than this are dropped from the hash. */
const DB_OK_FORGET_MS = 3_600_000;

export type WatchResult =
  | 'ok'
  | 'off'
  | 'waiting'
  | 'unsure'
  | 'db_down_everywhere'
  | 'locked'
  | 'exit';

/**
 * Perf batch 2 (13.11, row 125, detective S1): one API task lost the
 * database for ~50 minutes twice (11.11 and 13.11: 3,229 `/health/ready`
 * 503 «database unreachable» from ONE task while the database itself was
 * healthy and the other task served), and nobody replaced it: the ECS
 * container check is `/health/live`, which never looks at the database.
 *
 * The choice (Kubernetes «Configure Liveness, Readiness and Startup
 * Probes»: liveness must not depend on a shared dependency, or one outage
 * restarts every replica at once and adds a cold-start storm when it
 * returns): `/health/live` stays dependency-free and `/health/ready` keeps
 * routing decisions (the ALB change to `ready` is the owner's terraform
 * step). This watchdog is the narrow «stuck task» exit on top:
 * - it asks the database every 30 s by itself (does not rely on probes);
 * - after `ops.db_lost_exit_min` minutes (admin, 0 = never) without one
 *   answer, it exits ONLY when another task reached the database in the
 *   last 90 s (a per-task field in one Redis hash) — a database-wide
 *   outage, or no way to tell (Redis away too), never restarts anything;
 * - one restart per fleet per 10 minutes (a Redis lock), after a random
 *   0..`ops.db_lost_exit_jitter_sec` wait, so two cut-off tasks never
 *   leave together;
 * - the exit is a normal SIGTERM (graceful Nest shutdown, the ECS service
 *   starts a replacement), with a hard exit 30 s later as a fallback.
 * Settings are read only while the database answers (no read can hang
 * while it is gone); until then the built-in defaults apply.
 */
@Injectable()
export class DbLostWatchdog implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DbLostWatchdog.name);
  private readonly me = `${hostname()}:${process.pid}`;
  /** Boot counts as the last answer: a task that never reached the
   * database is replaced by the deploy's own health checks first. */
  private lastOkAt: number;
  private exitMin: number = APP_SETTINGS['ops.db_lost_exit_min'];
  private jitterSec: number = APP_SETTINGS['ops.db_lost_exit_jitter_sec'];
  private timer?: NodeJS.Timeout;
  private leaving = false;

  /** Replaceable in tests. */
  now: () => number = Date.now;
  random: () => number = Math.random;
  exit: () => void = () => {
    setTimeout(() => process.exit(1), 30_000).unref();
    process.kill(process.pid, 'SIGTERM');
  };

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.lastOkAt = this.now();
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, DB_WATCH_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One check (exposed for tests). */
  async tick(): Promise<WatchResult> {
    if (this.leaving) return 'exit';
    const now = this.now();
    if (await this.databaseAnswers()) {
      this.lastOkAt = now;
      await this.safe(async () => {
        await this.redis.hset(DB_OK_HASH, this.me, String(now));
        await this.redis.expire(DB_OK_HASH, DB_OK_FORGET_MS / 1000);
      });
      await this.readSettings();
      return 'ok';
    }
    if (this.exitMin <= 0) return 'off';
    if (now - this.lastOkAt < this.exitMin * 60_000) return 'waiting';

    const seen = await this.safe(() => this.redis.hgetall(DB_OK_HASH));
    if (!seen) return 'unsure';
    let peerFresh = false;
    for (const [task, at] of Object.entries(seen)) {
      const t = Number(at);
      if (!Number.isFinite(t) || now - t > DB_OK_FORGET_MS) {
        await this.safe(() => this.redis.hdel(DB_OK_HASH, task));
        continue;
      }
      if (task !== this.me && now - t <= DB_PEER_FRESH_MS) peerFresh = true;
    }
    if (!peerFresh) return 'db_down_everywhere';

    const got = await this.safe(() =>
      this.redis.set(
        DB_LOST_EXIT_LOCK,
        this.me,
        'EX',
        DB_LOST_EXIT_LOCK_SEC,
        'NX',
      ),
    );
    if (got !== 'OK') return 'locked';

    this.leaving = true;
    const waitMs = Math.round(this.random() * this.jitterSec * 1000);
    this.logger.error(
      {
        alert: 'api_task_db_lost_exit',
        lostForSec: Math.round((now - this.lastOkAt) / 1000),
        waitMs,
      },
      'this task cannot reach the database while another task can: restarting it',
    );
    setTimeout(() => this.exit(), waitMs);
    return 'exit';
  }

  private async databaseAnswers(): Promise<boolean> {
    try {
      await withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        HEALTH_CHECK_TIMEOUT_MS,
        'database',
      );
      return true;
    } catch {
      return false;
    }
  }

  private async readSettings(): Promise<void> {
    const read = async (
      key: 'ops.db_lost_exit_min' | 'ops.db_lost_exit_jitter_sec',
    ): Promise<number | undefined> => {
      try {
        const v = await withTimeout(
          this.settings?.number(key) ?? Promise.resolve(undefined),
          HEALTH_CHECK_TIMEOUT_MS,
          'settings',
        );
        return typeof v === 'number' && Number.isFinite(v) && v >= 0
          ? v
          : undefined;
      } catch {
        return undefined;
      }
    };
    this.exitMin = (await read('ops.db_lost_exit_min')) ?? this.exitMin;
    this.jitterSec =
      (await read('ops.db_lost_exit_jitter_sec')) ?? this.jitterSec;
  }

  /** Redis trouble = «cannot tell» (undefined), never an error. */
  private async safe<T>(op: () => Promise<T>): Promise<T | undefined> {
    try {
      return await withTimeout(op(), HEALTH_CHECK_TIMEOUT_MS, 'redis');
    } catch {
      return undefined;
    }
  }
}
