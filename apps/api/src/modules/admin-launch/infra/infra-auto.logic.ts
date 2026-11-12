import type { InfraMode } from '../../../common/ops/infra-modes';
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
  /**
   * People in the database (pg_class estimate of `users`, no COUNT). Perf
   * guard 2026-11-08 (docs/perf/USER_API_PERF_GUARD_2026-11-08.md): from
   * ~10M people the name search's typo branch in PostgreSQL turns into a
   * table scan; the search engine takes people search over before that.
   */
  people?: number;
  /** `infra.search_engine_on_people` (default SEARCH_ENGINE_ON_PEOPLE). */
  searchOnPeople?: number;
  /** Owner 2026-11-11: `db.shards_mode` and the split threshold status of
   * «Здоровье системы» (green / yellow at 80 % / red). */
  shardsMode?: string;
  shardGrowth?: 'green' | 'yellow' | 'red';
  /** Owner 2026-11-11: some database server (the primary or an extra one) is
   * at 80 % of the split threshold and every extra server already holds
   * data parts — the next server (third, fourth) is needed. */
  serversFull?: boolean;
  /** Owner 2026-11-12: the extra database servers (`db1`, `db2`, `db3`)
   * that hold no data at all (ShardMoveService.emptyServers). */
  emptyServers?: readonly string[];
  /** Owner 2026-11-11: the position picked on «Масштаб» for each item the
   * automation switches (common/ops/infra-modes.ts; missing = Авто), and
   * the items the owner set to Авто himself (handed to the automation: it
   * may switch them off too, not only what it switched on itself). */
  modes?: Readonly<Record<string, InfraMode>>;
  pickedAuto?: ReadonlySet<string>;
}

/** People at which the search engine (OpenSearch) is switched on, and the
 * lower number below which the one switched on by itself goes off again
 * (hysteresis, so a count near the line never flaps). */
export const SEARCH_ENGINE_ON_PEOPLE = 5_000_000;
export const SEARCH_ENGINE_OFF_PEOPLE = 4_000_000;

/** The on line from Admin → Настройки, and the off line at 80 % of it. */
export function searchOnPeople(s: Pick<AutoSignals, 'searchOnPeople'>): number {
  const v = s.searchOnPeople;
  return v != null && Number.isFinite(v) && v > 0 ? v : SEARCH_ENGINE_ON_PEOPLE;
}
export function searchOffPeople(
  s: Pick<AutoSignals, 'searchOnPeople'>,
): number {
  return Math.floor(
    (searchOnPeople(s) * SEARCH_ENGINE_OFF_PEOPLE) / SEARCH_ENGINE_ON_PEOPLE,
  );
}

/** Fewer direct connections per task than this = switch the pooler on. */
export const POOL_FLOOR = 8;

/** The read copies 1..5 as cloud rows (owner 2026-11-11, «Авто» by count). */
export const COPIES = [
  'aws.rds_replicas',
  'aws.rds_replicas_2',
  'aws.rds_replicas_3',
  'aws.rds_replicas_4',
  'aws.rds_replicas_5',
] as const;

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
    s.searchEngine === 'shadow' ||
    s.searchEngine === 'engine' ||
    (s.people ?? 0) >= searchOffPeople(s),
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
  if (
    (s.people ?? 0) >= searchOnPeople(s) &&
    live('aws.opensearch') !== 'on' &&
    !out.some((x) => x.id === 'aws.opensearch')
  ) {
    out.push({
      id: 'aws.opensearch',
      to: 'on',
      reason: `Людей больше ${searchOnPeople(s).toLocaleString('ru-RU')}: поиск людей по имени с опечаткой в базе начнёт читать всю таблицу, нужен поисковый движок.`,
    });
  }
  // Owner 2026-11-11: the second database server. Auto: when the database
  // nears the split threshold (a server takes 15-40 min, so from 80 %), or
  // its CPU stays high although the read copy and the pooler already run.
  // Switched off by itself only when empty (below).
  const shardsMode = (s.shardsMode ?? 'auto').trim().toLowerCase();
  if (live('aws.db_shards') !== 'on') {
    const near = s.shardGrowth === 'yellow' || s.shardGrowth === 'red';
    const cpu =
      s.pressures.includes('db_cpu') &&
      live('aws.rds_replicas') === 'on' &&
      live('aws.pgbouncer') === 'on';
    if (shardsMode === 'on' || (shardsMode === 'auto' && (near || cpu))) {
      out.push({
        id: 'aws.db_shards',
        to: 'on',
        reason:
          shardsMode === 'on'
            ? 'db.shards_mode = Вкл, а второго сервера базы нет.'
            : near
              ? 'База подходит к порогу деления (размер или строки): нужен второй сервер базы.'
              : 'База долго перегружена, хотя копия для чтения и пул соединений уже работают: нужен второй сервер базы.',
      });
    }
  }
  // Owner 2026-11-11: the third and fourth servers, one after the other, on
  // the same rule once the servers before are taken (Aurora Limitless adds
  // capacity the same way). Switched off by itself only when empty (below).
  const MORE = ['aws.db_shards', 'aws.db_shards_2', 'aws.db_shards_3'];
  for (let i = 1; i < MORE.length; i++) {
    const id = MORE[i];
    const mode = s.modes?.[id] ?? 'auto';
    if (live(MORE[i - 1]) !== 'on' || live(id) === 'on') continue;
    if (mode === 'auto' && s.serversFull === true) {
      out.push({
        id,
        to: 'on',
        reason:
          'Все серверы базы уже с данными, а один подходит к порогу деления: нужен следующий сервер.',
      });
    }
    break;
  }
  // Owner 2026-11-12 («Авто» both ways): the last extra server goes again
  // only while it is EMPTY (no data part, no move, not one row) and no
  // server nears the split threshold (then the empty one takes the next
  // split). One at a time, the highest first; AWS keeps a final snapshot.
  // A server with data is never removed (the API and the plan guard check
  // emptiness again).
  let last = -1;
  while (last + 1 < MORE.length && live(MORE[last + 1]) === 'on') last++;
  if (last >= 0 && s.emptyServers?.includes(`db${last + 1}`)) {
    const id = MORE[last];
    const near = s.shardGrowth === 'yellow' || s.shardGrowth === 'red';
    const cpu =
      last === 0 &&
      s.pressures.includes('db_cpu') &&
      live('aws.rds_replicas') === 'on' &&
      live('aws.pgbouncer') === 'on';
    const kept = last === 0 && shardsMode === 'on';
    if ((s.modes?.[id] ?? 'auto') === 'auto' && !near && !cpu && !kept) {
      out.push({
        id,
        to: 'off',
        reason:
          'Сервер базы пустой (на нём нет ни одной части данных) и для роста не нужен: уходит, AWS оставляет его последний снимок.',
      });
    }
  }
  // Owner 2026-11-11: read copies 2..5, like Aurora Auto Scaling: one more
  // while the copies' average CPU is over the line (`replica_cpu`), the last
  // extra one goes while it is below half the line (`replica_idle`); one at
  // a time, the highest first. The first copy follows its own rule above.
  let top = 0;
  while (top + 1 < COPIES.length && live(COPIES[top + 1]) === 'on') top++;
  if (live(COPIES[0]) === 'on') {
    const next = COPIES[top + 1];
    if (
      next &&
      (s.modes?.[next] ?? 'auto') === 'auto' &&
      s.pressures.includes('replica_cpu')
    ) {
      out.push({
        id: next,
        to: 'on',
        reason:
          'Копиям базы для чтения тяжело (средний процессор выше порога): нужна ещё одна.',
      });
    }
    if (
      top > 0 &&
      (s.modes?.[COPIES[top]] ?? 'auto') === 'auto' &&
      s.pressures.includes('replica_idle')
    ) {
      out.push({
        id: COPIES[top],
        to: 'off',
        reason:
          'Копиям базы для чтения давно легко (средний процессор ниже половины порога): лишняя уходит.',
      });
    }
  }
  if (s.partitionNeedsRunner && live('aws.partition_role') !== 'on') {
    out.push({
      id: 'aws.partition_role',
      to: 'on',
      reason:
        'Таблица подходит к порогу деления «Авто»: нужен вход роли lawbid_partition.',
    });
  }
  const modeOf = (id: string): InfraMode => s.modes?.[id] ?? 'auto';
  for (const [id, keep] of Object.entries(KEEP_ON)) {
    const handed = autoOn.has(id) || s.pickedAuto?.has(id) === true;
    if (handed && modeOf(id) === 'auto' && live(id) === 'on' && !keep(s)) {
      out.push({
        id,
        to: 'off',
        reason: autoOn.has(id)
          ? 'Сигнал, ради которого это включилось само, давно пропал.'
          : 'Стоит «Авто», а нужды в этом давно нет.',
      });
    }
  }
  // Вкл = kept on: switched on again if it is off.
  for (const [id, mode] of Object.entries(s.modes ?? {})) {
    // A later database server needs the one before it.
    const n = MORE.indexOf(id);
    if (n > 0 && live(MORE[n - 1]) !== 'on') continue;
    // A later read copy needs the one before it.
    const c = (COPIES as readonly string[]).indexOf(id);
    if (c > 0 && live(COPIES[c - 1]) !== 'on') continue;
    if (
      mode === 'on' &&
      live(id) !== 'on' &&
      !out.some((x) => x.id === id && x.to === 'on')
    ) {
      out.push({
        id,
        to: 'on',
        reason: 'Стоит «Вкл», а сейчас выключено.',
      });
    }
  }
  // Выкл = never switched on by itself; Вкл = never switched off by itself.
  return out.filter(
    (w) =>
      // A read copy goes only after the ones above it (highest first).
      !(
        w.to === 'off' &&
        (COPIES as readonly string[]).includes(w.id) &&
        live(COPIES[(COPIES as readonly string[]).indexOf(w.id) + 1] ?? '') ===
          'on'
      ) &&
      !(w.to === 'on' && modeOf(w.id) === 'off') &&
      !(w.to === 'off' && modeOf(w.id) === 'on'),
  );
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
