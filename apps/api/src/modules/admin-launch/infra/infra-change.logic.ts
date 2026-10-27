import type { CostEntry } from '../../../common/ops/cost-registry';
import {
  INFRA_KEYS,
  type InfraSwitch,
  type InfraTarget,
  type InfraValue,
} from '../../../common/ops/infra-switches';

/**
 * Infra change requests (owner 2026-10-26): the pure rules. A request goes
 *
 *   requested ─▶ planning ─▶ planned ─▶ confirmed ─▶ applying ─▶ done
 *        │           │          │ │                     │          │
 *        ▼           ▼          │ ▼                     ▼          ▼
 *     failed      failed        │ expired (30 min)    failed   rolled_back
 *                               ▼                               (its inverse
 *                    dry_run (dry-run mode: plan only)           is done)
 *
 * and requested / planning / planned can be cancelled by the owner. Only
 * one request may be active at a time (also a partial unique index in the
 * database). Nothing here touches the database or the network.
 */
export const INFRA_STATUSES = [
  'requested',
  'planning',
  'planned',
  'confirmed',
  'applying',
  'done',
  'failed',
  'expired',
  'cancelled',
  'dry_run',
  'rolled_back',
] as const;
export type InfraStatus = (typeof INFRA_STATUSES)[number];

export const ACTIVE_STATUSES: readonly InfraStatus[] = [
  'requested',
  'planning',
  'planned',
  'confirmed',
  'applying',
];

export type InfraEvent =
  | 'dispatch_failed'
  | 'job_started'
  | 'plan_ready'
  | 'plan_ready_dry_run'
  | 'plan_failed'
  | 'confirm'
  | 'expire'
  | 'stale'
  | 'cancel'
  | 'apply_started'
  | 'apply_done'
  | 'apply_failed'
  | 'rolled_back';

const T: Record<InfraEvent, [InfraStatus[], InfraStatus]> = {
  dispatch_failed: [['requested'], 'failed'],
  job_started: [['requested'], 'planning'],
  plan_ready: [['planning'], 'planned'],
  plan_ready_dry_run: [['planning'], 'dry_run'],
  plan_failed: [['requested', 'planning'], 'failed'],
  confirm: [['planned'], 'confirmed'],
  expire: [['planned', 'confirmed'], 'expired'],
  stale: [['requested', 'planning', 'applying'], 'failed'],
  cancel: [['requested', 'planning', 'planned'], 'cancelled'],
  apply_started: [['confirmed'], 'applying'],
  apply_done: [['applying'], 'done'],
  apply_failed: [['applying', 'confirmed'], 'failed'],
  rolled_back: [['done'], 'rolled_back'],
};

export class InfraTransitionError extends Error {
  constructor(
    readonly from: InfraStatus,
    readonly event: InfraEvent,
  ) {
    super(`Cannot ${event} a request that is ${from}`);
  }
}

/** The next status, or InfraTransitionError when the event is not allowed. */
export function transition(from: InfraStatus, event: InfraEvent): InfraStatus {
  const [allowed, to] = T[event];
  if (!allowed.includes(from)) throw new InfraTransitionError(from, event);
  return to;
}

export function canTransition(from: InfraStatus, event: InfraEvent): boolean {
  return T[event][0].includes(from);
}

/** A plan waits this long for the owner's code, then it is thrown away. */
export const PLAN_TTL_MS = 30 * 60_000;
/** No word from the workflow for this long: the run died. */
export const START_TTL_MS = 60 * 60_000;
/** An apply with no report for this long is marked failed (check the log). */
export const APPLY_TTL_MS = 3 * 60 * 60_000;

/**
 * The time-based event due for an active request now, or null. Planned
 * requests expire 30 minutes after the plan; requested / planning ones
 * fail after an hour without news; applying after three hours.
 */
export function dueTimeEvent(
  r: {
    status: InfraStatus;
    createdAt: Date;
    plannedAt: Date | null;
    updatedAt: Date;
  },
  now: Date,
): InfraEvent | null {
  const t = now.getTime();
  if (r.status === 'planned' || r.status === 'confirmed') {
    const at = (r.plannedAt ?? r.updatedAt).getTime();
    // A confirmed request the workflow has not picked up within the plan's
    // life is useless too: the workflow stopped waiting.
    return t - at > PLAN_TTL_MS ? 'expire' : null;
  }
  if (r.status === 'requested' || r.status === 'planning') {
    return t - r.createdAt.getTime() > START_TTL_MS ? 'stale' : null;
  }
  if (r.status === 'applying') {
    return t - r.updatedAt.getTime() > APPLY_TTL_MS ? 'stale' : null;
  }
  return null;
}

/**
 * Quiet hours: "HH:MM-HH:MM" in America/Chicago, may cross midnight
 * ("23:00-06:00"). Empty = any time.
 */
export const QUIET_HOURS_PATTERN =
  /^$|^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

export function inQuietWindow(
  window: string,
  now: Date,
  timeZone = 'America/Chicago',
): boolean {
  const w = window.trim();
  if (!w) return true;
  if (!QUIET_HOURS_PATTERN.test(w)) return true;
  const [a, b] = w.split('-').map((x) => {
    const [h, m] = x.split(':').map(Number);
    return h * 60 + m;
  });
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const cur = h * 60 + m;
  if (a === b) return true;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}

/** Monthly $ the registry says one "on" of this row costs. */
export function unitUsd(entry: CostEntry): readonly [number, number] | null {
  const u = entry.ifOnUsd ?? entry.usd.launch;
  if (!u || (u[0] === 0 && u[1] === 0)) return null;
  return u;
}

/**
 * Monthly cost change of putting [entry] from [from] to [to], from the
 * registry: + the "if on" price when switched on, − it when switched off.
 * A size key (read replicas) counts the difference of units.
 */
export function costDelta(
  entry: CostEntry,
  sw: InfraSwitch,
  from: InfraTarget | null,
  to: InfraTarget,
): [number, number] {
  const u = unitUsd(entry) ?? [0, 0];
  // Unknown position: assume the opposite of where it is going.
  const f: InfraTarget = from ?? (to === 'on' ? 'off' : 'on');
  const sizeKey = Object.keys(sw.values.on).find(
    (k) => INFRA_KEYS[k]?.spec.type === 'integer',
  );
  const units =
    f === to
      ? 0
      : sizeKey
        ? Number(sw.values[to][sizeKey] ?? 0) -
          Number(sw.values[f][sizeKey] ?? 0)
        : to === 'on'
          ? 1
          : -1;
  const r = (n: number) => Math.round(n * 100) / 100;
  const lo = r(u[0] * units);
  const hi = r(u[1] * units);
  return lo <= hi ? [lo, hi] : [hi, lo];
}

export type CreateRefusal =
  | 'unknown_item'
  | 'bad_state'
  | 'same_state'
  | 'no_price'
  | 'busy'
  | 'daily_cap'
  | 'not_configured';

/**
 * Whether a new request may be created. [current] is the live position
 * (null = not known), [activeCount] requests are in progress, [last24h]
 * were made in the last 24 hours.
 */
export function createRefusal(i: {
  entry: CostEntry | undefined;
  sw: InfraSwitch | undefined;
  to: string;
  current: InfraTarget | null;
  activeCount: number;
  last24h: number;
  dailyCap: number;
  configured: boolean;
}): CreateRefusal | null {
  if (!i.entry || !i.sw) return 'unknown_item';
  if ((i.to !== 'off' && i.to !== 'on') || !i.entry.states.includes(i.to)) {
    return 'bad_state';
  }
  if (i.current === i.to) return 'same_state';
  // OFF → ON needs a price in the registry (the plan shows what it costs).
  // A row that is free or saves money when on (Graviton / Spot) has no
  // "if on" number; its price text and source are still required.
  if (i.to === 'on' && (!i.entry.price.text || !i.entry.price.sourceUrl)) {
    return 'no_price';
  }
  if (i.activeCount > 0) return 'busy';
  if (i.last24h >= i.dailyCap) return 'daily_cap';
  if (!i.configured) return 'not_configured';
  return null;
}

export const REFUSAL_TEXT: Record<CreateRefusal, string> = {
  unknown_item: 'Этот пункт нельзя переключать из админки.',
  bad_state: 'Такого положения у этого пункта нет.',
  same_state: 'Пункт уже в этом положении.',
  no_price: 'У пункта нет цены в реестре расходов: сначала добавьте цену.',
  busy: 'Уже идёт другое изменение в облаке. Дождитесь его конца (одно за раз).',
  daily_cap:
    'Достигнут дневной предел изменений в облаке (настройка infra.daily_cap).',
  not_configured:
    'GitHub-приложение для запуска изменений не подключено (Интеграции → «GitHub: изменения облака»).',
};

/** The values a request writes into growth.auto.tfvars.json. */
export function changesFor(
  sw: InfraSwitch,
  to: InfraTarget,
): Record<string, InfraValue> {
  return { ...sw.values[to] };
}

/**
 * Авто for infra (owner: Авто never applies infra by itself, it proposes).
 * Growth signals the app already keeps → «пора включить X». Pure.
 */
export interface SuggestionSignals {
  /** economy pressures now: db_cpu, db_connections, redis_memory. */
  pressures: string[];
  /** AWS month-to-date ÷ budget (null = unknown). */
  budgetRatio: number | null;
  /** search.engine setting value. */
  searchEngine: string | null;
}

export interface InfraSuggestion {
  id: string;
  to: InfraTarget;
  reason: string;
}

export function infraSuggestions(
  s: SuggestionSignals,
  live: (id: string) => InfraTarget | null,
): InfraSuggestion[] {
  const out: InfraSuggestion[] = [];
  const want = (id: string, to: InfraTarget, reason: string) => {
    if (live(id) !== to && !out.some((o) => o.id === id)) {
      out.push({ id, to, reason });
    }
  };
  if (s.pressures.includes('db_connections')) {
    want(
      'aws.pgbouncer',
      'on',
      'Соединений с базой больше нормы: пул соединений снимет нагрузку.',
    );
  }
  if (s.pressures.includes('db_cpu')) {
    want(
      'aws.rds_replicas',
      'on',
      'Процессор базы долго загружен: копия для чтения заберёт поиск и ленты.',
    );
  }
  if (s.searchEngine === 'shadow' || s.searchEngine === 'engine') {
    want(
      'aws.opensearch',
      'on',
      'Поиск переведён на движок, а сам движок в облаке выключен.',
    );
  }
  // Over budget: propose switching OFF the optional extras that are on.
  if (s.budgetRatio !== null && s.budgetRatio >= 0.9) {
    for (const id of [
      'aws.waf_bot_control',
      'aws.container_insights',
      'aws.macie',
      'aws.synthetics',
    ]) {
      if (live(id) === 'on') {
        want(id, 'off', 'Месячный бюджет AWS почти израсходован.');
      }
    }
  }
  return out;
}
