import { CRON_JOBS } from '../../jobs/jobs.constants';
import { HISTORY_EXPORT_QUEUE } from '../../modules/case-history/case-history-export.runner';
import { DATA_EXPORT_QUEUE } from '../../modules/privacy/privacy.constants';

/**
 * Owner 2026-10-05: zero-maintenance operations. Shared state lives in
 * Redis so the API (admin «Здоровье системы») and the worker (the guards
 * that react on their own) see the same picture.
 */
export const OPS_KEYS = {
  /** JSON {at, pid, host, mode}; written every 30 s by every process that
   * runs the `cron` worker. TTL 180 s, so a dead worker disappears. */
  workerHeartbeat: 'ops:heartbeat:worker',
  /** JSON {by: 'owner'|'auto', at, reason}. Auto pauses carry a TTL. */
  heavyPaused: 'ops:heavy-paused',
  /** JSON {at, checkedAt, source}: the newest database backup seen. */
  lastBackup: 'ops:last-backup',
  /** JSON {actualUsd, forecastUsd, limitUsd, checkedAt}. */
  cost: 'ops:cost',
  /** JSON {mode: 'min'|'normal', by: 'owner'|'auto', at}. */
  scaleMode: 'ops:scale-mode',
  /** JSON {ok, latencyMs, at}: the last database probe of the ops guard. */
  dbProbe: 'ops:db-probe',
  /** JSON EconomyState: the economy guard (owner 2026-10-16). */
  economy: 'ops:economy',
  /** JSON {api, worker, mode, at}: the autoscaling ceilings the economy
   * job applied last (what «обычный режим» means now). */
  ceiling: 'ops:ceiling',
  /** List (newest first, capped) of EconomyEvent JSON. */
  economyEvents: 'ops:economy:events',
  /** JSON {metrics, info, at}: the newest database / Redis load reading. */
  capacity: 'ops:capacity',
  /** SET NX flag per resource pressure, so one alert per 6 hours. */
  pressureFlag: 'ops:pressure:',
  /** JSON MessageReencryptState (jobs/handlers/message-reencrypt.job.ts). */
  messageReencrypt: 'ops:message-reencrypt',
  /** JSON ChatSearchBackfillState (jobs/handlers/chat-search-backfill.job.ts). */
  chatSearchBackfill: 'ops:chat-search-backfill',
} as const;

/** An automatic pause lasts this long; the guard renews it while the
 * database stays slow, so it lifts itself once things calm down. */
export const AUTO_PAUSE_TTL_SEC = 15 * 60;

/** Background work that can wait an hour without anybody noticing. */
export const HEAVY_CRON_JOBS: readonly string[] = [
  CRON_JOBS.feedReco,
  CRON_JOBS.trendingTags,
  CRON_JOBS.countersReconcile,
  CRON_JOBS.ratingReconcile,
  CRON_JOBS.trustRecompute,
  CRON_JOBS.licenseRegistryRecheck,
  CRON_JOBS.opsBusinessMetrics,
  CRON_JOBS.messagesReencrypt,
  CRON_JOBS.chatSearchBackfill,
  CRON_JOBS.adminSummaries,
  CRON_JOBS.ledgerReconcile,
  CRON_JOBS.seoGenerate,
];

/** Queues paused as a whole (users get their file a little later). */
export const HEAVY_QUEUES: readonly string[] = [
  HISTORY_EXPORT_QUEUE,
  DATA_EXPORT_QUEUE,
];

/** Local path the worker touches with every heartbeat; the ECS container
 * health check restarts the worker when it goes stale (infra/modules/ecs). */
export const WORKER_HEARTBEAT_FILE = '/tmp/lawbid-worker-heartbeat';

export interface HeavyPause {
  by: 'owner' | 'auto';
  at: string;
  reason: string;
}

export interface ScaleMode {
  mode: 'min' | 'normal';
  by: 'owner' | 'auto';
  at: string;
  /** Who capped it (absent in older rows = the AWS budget check): the
   * economy guard only lifts its own cap. */
  source?: 'budget' | 'economy';
}

/** Owner 2026-10-16: the economy guard. `limited` = third-party spend is
 * projected above the rule: provider caps at their floors, new video
 * uploads paused, SMS for sign-in / reset only, autoscaling at the minimum. */
export interface EconomyState {
  guard: 'ok' | 'limited';
  since: string;
  projectedUsd: number;
  allowedUsd: number;
  /** Provider caps the guard cut (restored on release, unless an admin
   * changed them meanwhile): `budget.<provider>.<suffix>` → the stored
   * value before (null = no row existed) and the floor it was set to. */
  savedCaps: Record<string, { before: number | null; set: number }>;
}

export interface EconomyEvent {
  at: string;
  kind:
    | 'guard_on'
    | 'guard_off'
    | 'ceiling'
    | 'db_cpu'
    | 'db_connections'
    | 'redis_memory'
    | 'scaled_up'
    | 'scaled_down';
  text: string;
}

export interface CapacityReading {
  at: string;
  dbClass: string | null;
  redisClass: string | null;
  dbCpuPercent: number | null;
  dbConnections: number | null;
  dbMaxConnections: number | null;
  redisMemoryPercent: number | null;
  /** S9-14 (optional: older readings in Redis lack them). */
  dbStorageGb?: number | null;
  dbMultiAz?: boolean | null;
}

export interface CeilingSnapshot {
  api: number;
  worker: number;
  mode: 'auto' | 'manual';
  at: string;
}

export interface CostSnapshot {
  actualUsd: number;
  forecastUsd: number | null;
  limitUsd: number;
  checkedAt: string;
}

export interface BackupSnapshot {
  /** Time of the newest backup, ISO. */
  at: string;
  checkedAt: string;
  source: string;
}

export interface DbProbe {
  ok: boolean;
  latencyMs: number | null;
  at: string;
}

export function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
