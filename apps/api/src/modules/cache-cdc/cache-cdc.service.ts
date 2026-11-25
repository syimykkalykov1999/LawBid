import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  parseSwitchMode,
  type SwitchMode,
} from '../../common/app-settings/switch-mode';
import { REDIS_CACHE_CLIENT, REDIS_CLIENT } from '../../redis/redis.constants';
import { shardDatabaseUrlsFromEnv } from '../../sharding/shard-databases';
import { PRIMARY_DB } from '../../sharding/shard-router';
import { CdcInvalidator } from './cdc-invalidator';
import {
  blockers,
  createSlot,
  dropSlot,
  readReadiness,
  readSlot,
  slotVerdict,
  withClient,
  type CdcBlocker,
  type CdcSlotRow,
} from './cdc-slot';
import { CdcStream, type CdcStreamStats } from './cdc-stream';
import {
  CDC_STATUS_KEY,
  CDC_STATUS_TTL_SEC as STATUS_TTL_SEC,
  CDC_TICK_MS as TICK_MS,
  type CdcDbState,
  type CdcDbStatus,
  type CdcStatus,
} from './cdc-status';

interface Target {
  db: string;
  url: string;
  stream: CdcStream | null;
  slotDrops: number;
  lastError: string | null;
  /** Выкл and our slot is known to be gone: no more database probes until
   * the switch moves (no needless connection every 30 s). */
  offClean: boolean;
}

/** A stream with no message (data or keepalive) this long is restarted. */
const SILENT_RESTART_MS = 3 * 60_000;

const mb = (bytes: number | null | undefined) =>
  bytes === null || bytes === undefined
    ? null
    : Math.round((bytes / 1024 / 1024) * 10) / 10;

/** The databases to read: CACHE_CDC_DATABASE_URL (a direct, non-pooler
 * URL) or DATABASE_URL as `primary`, plus every extra physical database. */
export function cdcTargets(env: NodeJS.ProcessEnv = process.env): {
  db: string;
  url: string;
}[] {
  const primary = (env.CACHE_CDC_DATABASE_URL || env.DATABASE_URL)?.trim();
  const out = primary ? [{ db: PRIMARY_DB, url: primary }] : [];
  for (const [db, url] of Object.entries(shardDatabaseUrlsFromEnv(env))) {
    out.push({ db, url });
  }
  return out;
}

/**
 * C2: the second line of cache invalidation, read from the database change
 * log (logical replication, pgoutput). Runs in the worker only. Admin
 * switch `db.cdc_mode` Выкл / Вкл / Авто (default Выкл until the owner
 * turns on rds.logical_replication; Авто starts by itself once the
 * database is ready), re-read every 30 s.
 *
 * Safety around the slot (a forgotten logical slot keeps WAL until the
 * disk is full):
 *  - Выкл removes our slot (when no worker reads it);
 *  - `db.cdc_max_slot_wal_mb`: a slot that keeps more WAL than this, or
 *    has lost its WAL, is dropped and created again (the gap ends with
 *    the TTLs; the in-request invalidations never stop);
 *  - lag and kept WAL go out every 30 s as log metrics
 *    `cache_cdc_lag_seconds` / `cache_cdc_slot_retained_mb` (CloudWatch
 *    alarms, infra/modules/monitoring/db-health.tf) and to the admin light.
 */
@Injectable()
export class CacheCdcService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly targets: Target[];
  private readonly invalidator: CdcInvalidator;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDIS_CACHE_CLIENT) cache: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(CacheCdcService.name);
    this.invalidator = new CdcInvalidator(redis, cache);
    this.targets = cdcTargets().map((t) => ({
      ...t,
      stream: null,
      slotDrops: 0,
      lastError: null,
      offClean: false,
    }));
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || this.targets.length === 0) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    for (const t of this.targets) await t.stream?.stop();
  }

  private async setting<T extends 'number' | 'string'>(
    kind: T,
    key: 'db.cdc_mode' | 'db.cdc_max_slot_wal_mb' | 'db.cdc_lag_alarm_sec',
    fallback: T extends 'number' ? number : string,
  ): Promise<T extends 'number' ? number : string> {
    try {
      const v =
        kind === 'number'
          ? await this.settings?.number(key)
          : await this.settings?.string(key);
      return (v ?? fallback) as T extends 'number' ? number : string;
    } catch {
      return fallback;
    }
  }

  /** One pass over every database; public for tests. */
  async tick(now = Date.now()): Promise<CdcStatus | null> {
    if (this.ticking) return null;
    this.ticking = true;
    try {
      // Unreadable = off: this switch starts load on the database.
      const raw = await this.setting('string', 'db.cdc_mode', 'off');
      const mode = parseSwitchMode(raw);
      const maxMb = await this.setting(
        'number',
        'db.cdc_max_slot_wal_mb',
        2048,
      );
      const lagAlarmSec = await this.setting(
        'number',
        'db.cdc_lag_alarm_sec',
        120,
      );
      const dbs: CdcDbStatus[] = [];
      for (const t of this.targets)
        dbs.push(await this.step(t, mode, maxMb, now));
      const status: CdcStatus = {
        at: new Date(now).toISOString(),
        mode,
        maxSlotWalMb: maxMb,
        lagAlarmSec,
        dbs,
      };
      await this.publish(status);
      return status;
    } finally {
      this.ticking = false;
    }
  }

  private async step(
    t: Target,
    mode: SwitchMode,
    maxMb: number,
    now: number,
  ): Promise<CdcDbStatus> {
    let slot: CdcSlotRow | null = null;
    let found: CdcBlocker[] = [];
    let state: CdcDbState;
    try {
      if (mode === 'off') {
        await t.stream?.stop();
        t.stream = null;
        if (!t.offClean) {
          // Another worker may still read it for up to 30 s: retried.
          slot = await withClient(t.url, async (c) => {
            const s = await readSlot(c);
            if (s && !s.active) {
              await dropSlot(c, false);
              return readSlot(c);
            }
            return s;
          });
          t.offClean = slot === null;
        }
        state = 'off';
      } else {
        t.offClean = false;
        const r = await withClient(t.url, async (c) => {
          const readiness = await readReadiness(c);
          let s = await readSlot(c);
          if (slotVerdict(s, maxMb) === 'drop') {
            await t.stream?.stop();
            t.stream = null;
            await dropSlot(c, true);
            t.slotDrops++;
            this.logger.warn(
              {
                alert: 'cache_cdc_slot_dropped',
                database: t.db,
                retainedMb: mb(s?.retainedBytes),
                walStatus: s?.walStatus,
              },
              'cache CDC slot dropped by the WAL guard',
            );
            s = null;
          }
          const b = blockers(readiness);
          if (b.length === 0 && !s) {
            await createSlot(c);
            s = await readSlot(c);
          }
          return { readiness, slot: s, blockers: b };
        });
        slot = r.slot;
        found = r.blockers;
        if (found.length > 0) {
          await t.stream?.stop();
          t.stream = null;
          state = mode === 'auto' ? 'waiting' : 'not_ready';
        } else {
          state = this.ensureStream(t, slot, now);
        }
      }
      if (state !== 'error') t.lastError = null;
    } catch (e) {
      t.lastError = e instanceof Error ? e.message : String(e);
      state = 'error';
    }
    const s: CdcStreamStats | null = t.stream?.snapshot(now) ?? null;
    const row: CdcDbStatus = {
      db: t.db,
      state,
      blockers: found,
      slotRetainedMb: mb(slot?.retainedBytes),
      slotBehindMb: mb(slot?.behindBytes),
      lagSec: state === 'streaming' && s ? s.pendingLagSec : null,
      applied: s?.applied ?? 0,
      actions: s?.actions ?? 0,
      overflows: s?.overflows ?? 0,
      slotDrops: t.slotDrops,
      lastError: t.lastError ?? s?.lastError ?? null,
    };
    if (state === 'streaming' || state === 'standby') {
      // Log metrics for the CloudWatch alarms (db-health.tf).
      if (state === 'streaming') {
        this.logger.info(
          {
            metric: 'cache_cdc_lag_seconds',
            database: t.db,
            lagSec: row.lagSec ?? 0,
          },
          'cache CDC lag',
        );
      }
      this.logger.info(
        {
          metric: 'cache_cdc_slot_retained_mb',
          database: t.db,
          mb: row.slotRetainedMb ?? 0,
        },
        'cache CDC slot kept WAL',
      );
    }
    return row;
  }

  /** Keeps one stream per database in this worker; another task already
   * reading the slot makes this one a standby. */
  private ensureStream(
    t: Target,
    slot: CdcSlotRow | null,
    now: number,
  ): CdcDbState {
    const s = t.stream;
    if (s?.running) {
      const snap = s.snapshot(now);
      const last = snap.lastMessageAt ?? now;
      if (snap.state === 'streaming' && now - last > SILENT_RESTART_MS) {
        void s.stop();
        t.stream = null;
        return 'error';
      }
      return snap.state === 'streaming' ? 'streaming' : 'starting';
    }
    if (slot?.active) return 'standby';
    const stream = new CdcStream(t.url, this.invalidator, (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      t.lastError = msg;
      // 55006: the slot is read by another worker task right now.
      if (!/is active for PID|55006/.test(msg)) {
        this.logger.warn(
          { database: t.db, err: msg },
          'cache CDC stream stopped',
        );
      }
    });
    t.stream = stream;
    stream.start();
    return 'starting';
  }

  /** The admin light: the streaming worker's view wins; a standby only
   * writes when no streaming view is fresh (the reader died). */
  private async publish(status: CdcStatus): Promise<void> {
    try {
      const mine = status.dbs.some((d) => d.state === 'streaming');
      if (!mine) {
        const raw = await this.redis.get(CDC_STATUS_KEY);
        const prev = raw ? (JSON.parse(raw) as CdcStatus) : null;
        const fresh =
          prev &&
          prev.mode === status.mode &&
          Date.parse(prev.at) > Date.parse(status.at) - 2 * TICK_MS &&
          prev.dbs.some((d) => d.state === 'streaming');
        if (fresh) return;
      }
      await this.redis.set(
        CDC_STATUS_KEY,
        JSON.stringify(status),
        'EX',
        STATUS_TTL_SEC,
      );
    } catch {
      // the light shows «нет данных»; streaming is unaffected
    }
  }
}
