import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  fetchBunnyUsage,
  fetchTurnEgressBytes,
  GB,
  usageLevel,
  type FetchFn,
  type UsageLevel,
} from '../../common/ops/usage/usage-clients';
import { PnlService } from '../../common/pnl/pnl.service';
import { SpendService } from '../../common/ops/spend/spend.service';
import { SecretsService } from '../../common/secrets/secrets.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** The last answers, read by the system-health board. */
import { USAGE_SNAPSHOT_KEY } from '../../common/ops/usage-snapshot-key';
export { USAGE_SNAPSHOT_KEY };
const SNAPSHOT_TTL_SEC = 3 * 24 * 3600;

export interface UsageSnapshot {
  at: string;
  cloudflare?: {
    ok: boolean;
    egressGb?: number;
    warnGb: number;
    critGb: number;
    level?: UsageLevel;
    error?: string;
  };
  bunny?: {
    ok: boolean;
    bandwidthGb?: number;
    storageGb?: number | null;
    bandwidthLevel?: UsageLevel;
    storageLevel?: UsageLevel;
    error?: string;
  };
}

/**
 * Batch C items 11 and 16 (2026-10-24): `ops.usage-poll`, once a day.
 * Reads month-to-date Cloudflare Realtime (TURN) egress and Bunny traffic /
 * storage, logs them as metrics (`cf_realtime_egress_gb`, `bunny_usage`) and
 * logs `alert: usage_*` lines at the admin-set thresholds. infra/modules/
 * monitoring turns the logs into CloudWatch alarms. Isolated like the
 * watchdog: it only reads two outside APIs and writes one Redis key; no
 * keys configured = skipped, any failure = a warning line, never a crash.
 */
@Injectable()
export class UsagePollJob {
  constructor(
    private readonly secrets: SecretsService,
    private readonly settings: AppSettingsService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    // Owner 2026-10-24 («Расходы»): the same daily poll also stores the
    // money snapshot (AWS only if its last read is older than 6 h).
    @Optional() private readonly spend?: SpendService,
    // Owner 2026-10-25 («Прибыль»): the P&L snapshot is recounted right after
    // the spend poll, once a day (one grouped query, $0).
    @Optional() private readonly pnl?: PnlService,
  ) {
    this.logger.setContext(UsagePollJob.name);
  }

  async run(now: Date = new Date(), fetchFn?: FetchFn): Promise<UsageSnapshot> {
    const snap: UsageSnapshot = { at: now.toISOString() };
    snap.cloudflare = await this.cloudflare(now, fetchFn);
    snap.bunny = await this.bunny(now, fetchFn);
    await this.redis
      .set(USAGE_SNAPSHOT_KEY, JSON.stringify(snap), 'EX', SNAPSHOT_TTL_SEC)
      .catch(() => undefined);
    await this.spend?.refresh(now, fetchFn).catch(() => undefined);
    await this.pnl?.refresh().catch(() => undefined);
    return snap;
  }

  private async cloudflare(
    now: Date,
    fetchFn?: FetchFn,
  ): Promise<UsageSnapshot['cloudflare'] | undefined> {
    const f = (await this.secrets.get('cloudflare_turn'))?.fields ?? {};
    const accountId = (
      f.accountId ??
      this.config.get<string>('CLOUDFLARE_ANALYTICS_ACCOUNT_ID') ??
      ''
    ).trim();
    const token = (
      f.analyticsToken ??
      this.config.get<string>('CLOUDFLARE_ANALYTICS_API_TOKEN') ??
      ''
    ).trim();
    if (!accountId || !token) return undefined;
    const [warnGb, critGb] = await Promise.all([
      this.settings.number('usage.cloudflare_egress_warn_gb'),
      this.settings.number('usage.cloudflare_egress_crit_gb'),
    ]);
    try {
      const { egressBytes } = await fetchTurnEgressBytes(
        accountId,
        token,
        now,
        fetchFn,
      );
      const egressGb = Math.round((egressBytes / GB) * 100) / 100;
      const level = usageLevel(egressGb, warnGb, critGb);
      this.logger.info(
        { metric: 'cf_realtime_egress_gb', gb: egressGb, warnGb, critGb },
        'Cloudflare Realtime egress this month',
      );
      if (level !== 'ok') {
        this.logger.warn(
          {
            alert: level === 'crit' ? 'usage_cf_crit' : 'usage_cf_warn',
            gb: egressGb,
            freeGb: 1000,
          },
          'Cloudflare Realtime traffic is close to the free 1000 GB',
        );
      }
      return { ok: true, egressGb, warnGb, critGb, level };
    } catch (e) {
      const error = (e as Error).message;
      this.logger.warn(
        { alert: 'usage_poll_failed', provider: 'cloudflare', err: error },
        'Cloudflare usage poll failed',
      );
      return { ok: false, warnGb, critGb, error };
    }
  }

  private async bunny(
    now: Date,
    fetchFn?: FetchFn,
  ): Promise<UsageSnapshot['bunny'] | undefined> {
    const f = (await this.secrets.get('bunny_stream'))?.fields ?? {};
    const key = (
      f.accountApiKey ??
      this.config.get<string>('BUNNY_ACCOUNT_API_KEY') ??
      ''
    ).trim();
    if (!key) return undefined;
    const [bwWarn, bwCrit, stWarn, stCrit] = await Promise.all([
      this.settings.number('usage.bunny_bandwidth_warn_gb'),
      this.settings.number('usage.bunny_bandwidth_crit_gb'),
      this.settings.number('usage.bunny_storage_warn_gb'),
      this.settings.number('usage.bunny_storage_crit_gb'),
    ]);
    try {
      const u = await fetchBunnyUsage(key, f.libraryId, now, fetchFn);
      const bandwidthGb = Math.round((u.bandwidthBytes / GB) * 100) / 100;
      const storageGb =
        u.storageBytes === null
          ? null
          : Math.round((u.storageBytes / GB) * 100) / 100;
      const bandwidthLevel = usageLevel(bandwidthGb, bwWarn, bwCrit);
      const storageLevel =
        storageGb === null ? 'ok' : usageLevel(storageGb, stWarn, stCrit);
      this.logger.info(
        { metric: 'bunny_usage', bandwidthGb, storageGb: storageGb ?? 0 },
        'Bunny usage',
      );
      if (bandwidthLevel !== 'ok') {
        this.logger.warn(
          {
            alert:
              bandwidthLevel === 'crit'
                ? 'usage_bunny_bandwidth_crit'
                : 'usage_bunny_bandwidth_warn',
            gb: bandwidthGb,
          },
          'Bunny video traffic passed its threshold',
        );
      }
      if (storageLevel !== 'ok') {
        this.logger.warn(
          {
            alert:
              storageLevel === 'crit'
                ? 'usage_bunny_storage_crit'
                : 'usage_bunny_storage_warn',
            gb: storageGb,
          },
          'Bunny video storage passed its threshold',
        );
      }
      return { ok: true, bandwidthGb, storageGb, bandwidthLevel, storageLevel };
    } catch (e) {
      const error = (e as Error).message;
      this.logger.warn(
        { alert: 'usage_poll_failed', provider: 'bunny', err: error },
        'Bunny usage poll failed',
      );
      return { ok: false, error };
    }
  }
}
