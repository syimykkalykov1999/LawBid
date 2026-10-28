import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { DB_TIERS, nextTier } from '../../common/economy/economy.rules';
import {
  AdminSummaryService,
  type Summary,
} from '../../common/admin-summary/admin-summary.service';
import { LaunchChecksService } from '../../common/ops/launch/launch-checks.service';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { SecretRotationService } from '../../common/ops/secret-rotation.service';
import { IncidentsService } from '../../common/ops/status/incidents.service';
import { StatusProbesService } from '../../common/ops/status/status-probes.service';
import { SentryIssuesClient } from './sentry-issues.client';
import type { StaffTodaySystemDto } from './staff-home.dto';
import {
  buildSystemItems,
  countBySeverity,
  SYSTEM_FRESH_SEC,
  type SystemSignals,
} from './staff-system-items.logic';

/** Redis key of the stored block (AdminSummaryService prefixes it). */
export const STAFF_SYSTEM_KEY = 'staff.today.system';

type Stored = Omit<StaffTodaySystemDto, 'sentry'>;

const WORKER_ALIVE_MS = 180_000;

/**
 * Owner 2026-10-27 («Сегодня» as the owner's desk): the «Система» block of
 * «Сегодня». Reads ONLY what is already computed and cached — the Redis
 * readings of OpsStateService (budget, capacity, economy events, heartbeat,
 * backup, bloat), the 5-minute «Запуск» report, the status-board probes and
 * incidents, the rotation rows — words them with the pure builder and stores
 * the result for SYSTEM_FRESH_SEC (stale-while-revalidate, one refresher for
 * every admin process). No table is read here. A source that fails is simply
 * absent from the list, never an error page. The Sentry line is read from its
 * own 5-minute cache at request time so «Решено» shows at once.
 */
@Injectable()
export class StaffTodaySystemService {
  constructor(
    private readonly summary: AdminSummaryService,
    private readonly ops: OpsStateService,
    private readonly launch: LaunchChecksService,
    private readonly settings: AppSettingsService,
    private readonly sentry: SentryIssuesClient,
    @Optional() private readonly probes?: StatusProbesService,
    @Optional() private readonly incidents?: IncidentsService,
    @Optional() private readonly rotation?: SecretRotationService,
  ) {}

  /** What a request gets: the stored block (computed once if none). */
  async read(now: Date = new Date()): Promise<StaffTodaySystemDto> {
    const [s, sentry] = await Promise.all([
      this.summary.get(
        STAFF_SYSTEM_KEY,
        () => this.build(now),
        SYSTEM_FRESH_SEC,
      ),
      this.sentry.read(now),
    ]);
    return { ...withTime(s), sentry };
  }

  /** Recount and store now (no Sentry call). */
  async refresh(now: Date = new Date()): Promise<Stored> {
    return withTime(
      await this.summary.refresh(STAFF_SYSTEM_KEY, () => this.build(now)),
    );
  }

  /**
   * The `staff.today` job (every 2 minutes): recounts only when the stored
   * block is older than SYSTEM_FRESH_SEC, so the sources are read at most
   * once per TTL. Returns null when the stored block is still fresh.
   */
  async refreshIfStale(now: Date = new Date()): Promise<Stored | null> {
    const hit = await this.summary.peek<Stored>(STAFF_SYSTEM_KEY);
    if (
      hit &&
      now.getTime() - Date.parse(hit.computedAt) < SYSTEM_FRESH_SEC * 1000
    ) {
      return null;
    }
    return this.refresh(now);
  }

  /** Gathers the cached signals and words them. */
  async build(now: Date = new Date()): Promise<Stored> {
    const safe = async <T>(f: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await f();
      } catch {
        return fallback;
      }
    };
    const [
      launch,
      cost,
      capacity,
      events,
      economyLimited,
      heavyPaused,
      scaleMode,
      heartbeat,
      backup,
      backupMaxHours,
      bloat,
      probes,
      incidents,
      rotation,
      billingDuplicates,
    ] = await Promise.all([
      safe(() => this.launch.report(now), null),
      safe(() => this.ops.cost(), null),
      safe(() => this.ops.capacity(), null),
      safe(() => this.ops.economyEvents(20), []),
      safe(() => this.ops.isEconomyLimited(now.getTime()), false),
      safe(() => this.ops.isHeavyPaused(), false),
      safe(() => this.ops.scaleMode(), null),
      safe(() => this.ops.workerHeartbeat(), undefined),
      safe(() => this.ops.lastBackup(), null),
      safe(() => this.settings.number('ops.backup_max_age_hours'), 26),
      safe(() => this.ops.bloat(), null),
      this.probes ? safe(() => this.probes!.extra(), []) : Promise.resolve([]),
      this.incidents
        ? safe(() => this.incidents!.recent(24, now), [])
        : Promise.resolve([]),
      this.rotation?.enabled
        ? safe(() => this.rotation!.rows(now), [])
        : Promise.resolve([]),
      safe(() => this.ops.billingDuplicates(now), null),
    ]);
    const backupAge =
      backup && Number.isFinite(Date.parse(backup.at))
        ? Math.round(
            ((now.getTime() - Date.parse(backup.at)) / 3_600_000) * 10,
          ) / 10
        : null;
    const signals: SystemSignals = {
      health: probes.map((p) => ({
        key: p.key,
        status: p.status,
        detail: p.detail,
      })),
      incidents: incidents.map((i) => ({
        component: i.component,
        openedAt: i.openedAt.toISOString(),
        closedAt: i.closedAt?.toISOString() ?? null,
      })),
      launch: (launch?.items ?? []).map((l) => ({
        id: l.id,
        status: l.status,
        title: l.title,
        hint: l.hint,
        manualTick: l.manualTick,
        ticked: l.ticked,
      })),
      cost: cost
        ? {
            actualUsd: cost.actualUsd,
            forecastUsd: cost.forecastUsd,
            limitUsd: cost.limitUsd,
          }
        : null,
      capacity: capacity
        ? {
            dbCpuPercent: capacity.dbCpuPercent,
            dbConnections: capacity.dbConnections,
            dbMaxConnections: capacity.dbMaxConnections,
            redisMemoryPercent: capacity.redisMemoryPercent,
            // Same ladder as «Масштаб»: null = already the biggest size.
            dbNext: capacity.dbClass
              ? (nextTier(DB_TIERS, capacity.dbClass)?.name ?? null)
              : 'unknown',
          }
        : null,
      economyEvents: events.map((e) => ({
        at: e.at,
        kind: e.kind,
        text: e.text,
      })),
      economyLimited,
      heavyPaused,
      scaleMode: scaleMode?.mode ?? null,
      workerAlive:
        heartbeat === undefined
          ? null
          : heartbeat
            ? now.getTime() - Date.parse(heartbeat.at) < WORKER_ALIVE_MS
            : false,
      backup: backup ? { ageHours: backupAge, maxHours: backupMaxHours } : null,
      bloatOver: bloat?.over ?? [],
      rotation: rotation.map((r) => ({ name: r.name, state: r.state })),
      billingDuplicates,
    };
    const items = buildSystemItems(signals, now);
    return {
      computedAt: now.toISOString(),
      freshSec: SYSTEM_FRESH_SEC,
      items,
      counts: countBySeverity(items),
    };
  }
}

function withTime(s: Summary<Stored>): Stored {
  return { ...s.data, computedAt: s.computedAt };
}
