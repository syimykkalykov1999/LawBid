import type { InfraTarget } from '../../../common/ops/infra-switches';
import { infraSuggestions, type SuggestionSignals } from './infra-change.logic';

/**
 * Automation audit 2026-11-08 (owner: «Авто» must really act, on at the
 * threshold and off when no longer needed, never only a message).
 *
 * The signals the app already keeps become cloud changes by themselves:
 * a signal that held `onMs` switches the item ON through the same pipeline
 * as the admin buttons (InfraChangeRequest -> GitHub plan -> apply); an item
 * the automation itself switched on goes OFF again after `offMs` without
 * its signal. Same pattern as AWS Application Auto Scaling (scale out fast,
 * scale in after a long cool-down) and Kubernetes HPA's stabilization
 * window. Everything here is pure; infra-auto.service.ts does the I/O.
 */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export interface AutoSignals extends SuggestionSignals {
  /** A table in partition «Авто» / «Вкл» is at 80 % of partition.auto_rows
   * (or «Вкл» at any size) and the runner has no login yet. */
  partitionNeedsRunner: boolean;
  /**
   * The direct database pool per task is below POOL_FLOOR (DB_POOL_SIZE,
   * set by Terraform from the smallest database size and the peak task
   * count) and no pooler runs: every task queues on a few connections
   * (prod 08.11: 3 per task made the admin slow). The cure is the pooler.
   */
  poolSmall?: boolean;
  /** G4: `events.sink` wants the Kinesis stream and this stand has none. */
  eventsStreamWanted?: boolean;
  /** G5: `cache.redis_mode` (off / on / auto) and whether a cache node runs. */
  cacheRedisMode?: string;
  cacheNodeLive?: boolean;
  /** G6: `db.replica_provision` (off / auto) and whether the app's own RDS
   * path may create the replica (Terraform `db_replica_toggle`, IAM). */
  replicaProvision?: string;
  replicaAppPath?: boolean;
}

/** Fewer direct connections per task than this = switch the pooler on. */
export const POOL_FLOOR = 8;

export interface AutoWant {
  id: string;
  to: InfraTarget;
  reason: string;
}

/**
 * Items that may be switched OFF again by the automation, with the signal
 * that keeps them on. Only what the automation itself switched on is ever
 * switched off (a position the owner set by hand stays). The partition
 * login stays on: once a table is converted the runner keeps its months.
 */
const KEEP_ON: Readonly<Record<string, (s: AutoSignals) => boolean>> = {
  'aws.pgbouncer': (s) =>
    s.pressures.includes('db_connections') || s.poolSmall === true,
  'aws.rds_replicas': (s) => s.pressures.includes('db_cpu'),
  'aws.opensearch': (s) =>
    s.searchEngine === 'shadow' || s.searchEngine === 'engine',
  // G4: the stream goes when the event volume fell back under the ceiling
  // for the whole cool-down (events.sink auto turns back to the table).
  'aws.events_stream': (s) => s.eventsStreamWanted === true,
  // G5: the cache node is NOT here on purpose: its own effect removes the
  // signal (main Redis memory drops once the cache moved), so switching it
  // off by that signal would flap. Once on by itself, it stays.
};

/**
 * Switch-offs the over-budget proposal makes (WAF bot control, Macie,
 * Synthetics, Container Insights) stay proposals: turning security or
 * monitoring off by itself would hide the very thing the owner needs when
 * money runs short. Big platforms do the same (AWS Budgets actions only
 * stop or restrict, never disable detective controls without a human).
 */
export function autoWants(
  s: AutoSignals,
  live: (id: string) => InfraTarget | null,
  autoOn: ReadonlySet<string>,
): AutoWant[] {
  const provision = (s.replicaProvision ?? 'auto').trim().toLowerCase();
  const out: AutoWant[] = infraSuggestions(s, live).filter(
    (x) =>
      x.to === 'on' &&
      // G6 (2026-11-08): `db.replica_provision` rules the replica on both
      // paths. Off = never by itself. With the app's own RDS path (IAM
      // toggle on) that path creates it, so the pipeline does not ALSO
      // plan one; without it (prod today) the pipeline is the way «Авто»
      // works, both ways (on by CPU, off after the cool-down).
      !(
        x.id === 'aws.rds_replicas' &&
        (provision === 'off' || s.replicaAppPath === true)
      ),
  );
  if (
    s.poolSmall === true &&
    live('aws.pgbouncer') !== 'on' &&
    !out.some((x) => x.id === 'aws.pgbouncer')
  ) {
    out.push({
      id: 'aws.pgbouncer',
      to: 'on',
      reason: `У каждого сервера меньше ${POOL_FLOOR} соединений с базой: запросы ждут в очереди, пул соединений это снимет.`,
    });
  }
  if (s.eventsStreamWanted === true && live('aws.events_stream') !== 'on') {
    out.push({
      id: 'aws.events_stream',
      to: 'on',
      reason:
        'Событий в сутки больше потолка events.auto_ceiling_per_day (или events.sink = stream): нужен поток Kinesis.',
    });
  }
  const cacheMode = (s.cacheRedisMode ?? 'auto').trim().toLowerCase();
  if (
    !s.cacheNodeLive &&
    live('aws.redis_cache') !== 'on' &&
    (cacheMode === 'on' ||
      (cacheMode === 'auto' && s.pressures.includes('redis_memory')))
  ) {
    out.push({
      id: 'aws.redis_cache',
      to: 'on',
      reason:
        cacheMode === 'on'
          ? 'cache.redis_mode = Вкл, а отдельного узла кэша нет.'
          : 'Основному Redis не хватает памяти: кэш переезжает в свой узел.',
    });
  }
  if (s.partitionNeedsRunner && live('aws.partition_role') !== 'on') {
    out.push({
      id: 'aws.partition_role',
      to: 'on',
      reason:
        'Таблица подходит к порогу деления «Авто»: нужен вход роли lawbid_partition.',
    });
  }
  for (const [id, keep] of Object.entries(KEEP_ON)) {
    if (autoOn.has(id) && live(id) === 'on' && !keep(s)) {
      out.push({
        id,
        to: 'off',
        reason: 'Сигнал, ради которого это включилось само, давно пропал.',
      });
    }
  }
  return out;
}

export const wantKey = (w: Pick<AutoWant, 'id' | 'to'>): string =>
  `${w.id}:${w.to}`;

/**
 * Hysteresis: a want acts only after it was seen on every pass for `onMs`
 * (switch on) or `offMs` (switch off). A want that disappears forgets its
 * start, so a flapping signal never acts. Returns the wants that are due
 * and the new first-seen map (only the wants seen now).
 */
export function dueWants(
  wants: readonly AutoWant[],
  seen: Readonly<Record<string, number>>,
  nowMs: number,
  onMs: number,
  offMs: number,
): { due: AutoWant[]; seen: Record<string, number> } {
  const next: Record<string, number> = {};
  const due: AutoWant[] = [];
  for (const w of wants) {
    const k = wantKey(w);
    const first = seen[k] ?? nowMs;
    next[k] = first;
    if (nowMs - first >= (w.to === 'on' ? onMs : offMs)) due.push(w);
  }
  return { due, seen: next };
}

export type AutoRefusal =
  | 'auto_off'
  | 'not_configured'
  | 'quiet_hours'
  | 'busy'
  | 'daily_cap'
  | 'money_budget'
  | 'money_item';

export const AUTO_REFUSAL_TEXT: Record<AutoRefusal, string> = {
  auto_off: 'Автоматика облака выключена (infra.auto_mode = off).',
  not_configured:
    'GitHub-приложение для изменений облака не подключено (шаги владельца в docs/runbooks/infra-from-admin.md).',
  quiet_hours: 'Сейчас не тихие часы (infra.quiet_hours).',
  busy: 'Идёт другое изменение облака.',
  daily_cap: 'Достигнут дневной предел изменений облака (infra.daily_cap).',
  money_budget:
    'Бюджет AWS за месяц израсходован на 90 %: включать новое нельзя.',
  money_item:
    'Может стоить больше потолка infra.auto_max_usd_month в месяц: включать само нельзя.',
};

/** Why an automatic change must not start now (null = go). Pure. Turning
 * something OFF is never held back by money. */
export function autoRefusal(p: {
  mode: string;
  want: AutoWant;
  configured: boolean;
  inQuietWindow: boolean;
  activeCount: number;
  last24h: number;
  dailyCap: number;
  budgetRatio: number | null;
  costHighUsd: number;
  maxUsdMonth: number;
}): AutoRefusal | null {
  if (p.mode.trim().toLowerCase() !== 'auto') return 'auto_off';
  if (!p.configured) return 'not_configured';
  if (p.activeCount > 0) return 'busy';
  if (p.last24h >= p.dailyCap) return 'daily_cap';
  if (!p.inQuietWindow) return 'quiet_hours';
  if (p.want.to === 'on') {
    if (p.budgetRatio !== null && p.budgetRatio >= 0.9) return 'money_budget';
    if (p.costHighUsd > p.maxUsdMonth) return 'money_item';
  }
  return null;
}

/**
 * The plan of an automatic request is applied without a tap only when a
 * switch-on removes nothing but replaced task definitions (a new revision
 * is how ECS rolls a service), and a switch-off creates nothing but those.
 * Protected data (database, buckets, keys, backups) is refused earlier for
 * every request by forbiddenDestroys. Pure.
 */
export function autoApplyOk(
  to: InfraTarget,
  resources: readonly { address: string; action: string }[],
): boolean {
  const rolling = (a: string) => /(^|\.)aws_ecs_task_definition\./.test(a);
  if (to === 'on') {
    return resources.every(
      (r) => !r.action.includes('delete') || rolling(r.address),
    );
  }
  return resources.every(
    (r) => !r.action.includes('create') || rolling(r.address),
  );
}
