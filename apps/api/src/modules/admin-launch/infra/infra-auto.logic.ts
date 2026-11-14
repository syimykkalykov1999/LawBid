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
  /**
   * 13.11 outage (KNOWN_ERRORS 144): the live services reach the database
   * through the pooler (DB_POOLER_HOST is set in this task). poolSmall is
   * false whenever the pooler runs (its own effect removes the signal), so
   * without this the pooler looked unneeded and was switched off under the
   * running tasks.
   */
  poolerLive?: boolean;
  /** 13.11: reads are forced onto the read copy (DB_REPLICA_HOST or
   * DATABASE_REPLICA_URL set and `db.replica_reads` = Вкл). With Авто the
   * read path drains a gone copy by itself (the 5 s lag sample fails, reads
   * go to the primary; prisma-read.service.ts); with Вкл it does not. */
  replicaReadsForced?: boolean;
  /** G4: `events.sink` wants the Kinesis stream and this stand has none. */
  eventsStreamWanted?: boolean;
  /** 13.11: the stream exists and `events.sink` writes to it (stream, or
   * auto turned to stream). eventsStreamWanted is false once the stream
   * exists, so it alone cannot keep the stream on. */
  eventsStreamInUse?: boolean;
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

/** The search engine node steps as cloud rows (owner 2026-11-12, «Авто» by
 * count): the domain itself (1 node), 2 nodes, 4 nodes (even across the two
 * zones). Same ladder as COPIES. */
export const SEARCH_NODES = [
  'aws.opensearch',
  'aws.opensearch_nodes_2',
  'aws.opensearch_nodes_4',
] as const;

/** Owner 2026-11-12 («Да сделай авто для двух защит»): the two WAF
 * protections that switch with an attack, like AWS Shield Advanced automatic
 * application-layer DDoS mitigation (rules on while an attack is detected,
 * removed after it ends). Signals `waf_attack` / `waf_calm` come from
 * cost-registry.service wafAttackSignals (not the shared pressures()). */
export const WAF_GUARDS = [
  'aws.waf_bot_control',
  'aws.waf_extra_rules',
] as const;

/** Read copies and search nodes: each step needs the one before it and goes
 * only after the ones above it. */
const LADDERS: readonly (readonly string[])[] = [COPIES, SEARCH_NODES];

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
  // 13.11 outage: a dependency the running services point at is never
  // removed by itself (drain first, like an ALB deregistration or Aurora
  // taking a reader out of the endpoint before deleting it). The pooler
  // removes its own signal (poolSmall is false while it runs), the same
  // flap the cache node below avoids, and nothing drains it: every query
  // of the tasks goes through it.
  'aws.pgbouncer': (s) =>
    s.pressures.includes('db_connections') ||
    s.poolSmall === true ||
    s.poolerLive === true,
  'aws.rds_replicas': (s) =>
    s.pressures.includes('db_cpu') || s.replicaReadsForced === true,
  'aws.opensearch': (s) =>
    s.searchEngine === 'shadow' ||
    s.searchEngine === 'engine' ||
    (s.people ?? 0) >= searchOffPeople(s),
  // G4: the stream goes when the event volume fell back under the ceiling
  // for the whole cool-down (events.sink auto turns back to the table).
  'aws.events_stream': (s) =>
    s.eventsStreamWanted === true || s.eventsStreamInUse === true,
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
  // Owner 2026-11-12: search engine nodes, the same way (AWS advice: scale
  // the domain out on CPU or JVM memory pressure). Only while the engine
  // runs; with the engine off an extra step left on goes, highest first.
  let topNode = 0;
  while (
    topNode + 1 < SEARCH_NODES.length &&
    live(SEARCH_NODES[topNode + 1]) === 'on'
  ) {
    topNode++;
  }
  const engineOn = live(SEARCH_NODES[0]) === 'on';
  if (engineOn) {
    const next = SEARCH_NODES[topNode + 1];
    if (
      next &&
      (s.modes?.[next] ?? 'auto') === 'auto' &&
      s.pressures.includes('search_busy')
    ) {
      out.push({
        id: next,
        to: 'on',
        reason:
          'Поисковому движку тяжело (процессор выше порога или память JVM выше 75 %): нужно больше узлов.',
      });
    }
  }
  if (
    topNode > 0 &&
    (s.modes?.[SEARCH_NODES[topNode]] ?? 'auto') === 'auto' &&
    (!engineOn || s.pressures.includes('search_idle'))
  ) {
    out.push({
      id: SEARCH_NODES[topNode],
      to: 'off',
      reason: engineOn
        ? 'Поисковому движку давно легко (процессор ниже половины порога, память JVM ниже 50 %): лишние узлы уходят.'
        : 'Поисковый движок выключен: лишние узлы не нужны.',
    });
  }
  // Owner 2026-11-12: the WAF protections on «Авто». On while the web ACL
  // in front of the server blocks a lot or sign-ins fail a lot (only with
  // that ACL on: the rules live inside it); off once it is calm again, and
  // only what was switched on by itself or handed to «Авто» (a position set
  // by hand earlier stays).
  for (const id of WAF_GUARDS) {
    if ((s.modes?.[id] ?? 'auto') !== 'auto') continue;
    if (
      live(id) !== 'on' &&
      live('aws.waf_alb') === 'on' &&
      s.pressures.includes('waf_attack')
    ) {
      out.push({
        id,
        to: 'on',
        reason:
          'Похоже на атаку: фильтр WAF перед сервером отбивает много запросов или много неудачных входов за 5 минут (пороги infra.waf_attack_blocked_per_5m и infra.waf_attack_auth_failed_per_5m).',
      });
    }
    const handed = autoOn.has(id) || s.pickedAuto?.has(id) === true;
    if (handed && live(id) === 'on' && s.pressures.includes('waf_calm')) {
      out.push({
        id,
        to: 'off',
        reason:
          'Атака давно закончилась: отбитых запросов и неудачных входов меньше половины порога.',
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
    // A later read copy (search node step) needs the one before it.
    if (
      LADDERS.some((l) => {
        const c = l.indexOf(id);
        return c > 0 && live(l[c - 1]) !== 'on';
      })
    ) {
      continue;
    }
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
      // A read copy (search node step) goes only after the ones above it
      // (highest first).
      !(
        w.to === 'off' &&
        LADDERS.some(
          (l) =>
            l.includes(w.id) && live(l[l.indexOf(w.id) + 1] ?? '') === 'on',
        )
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
  /** Per item: its own on / off wait (the WAF protections react to an
   * attack in minutes, like AWS Shield Advanced). */
  per: Readonly<Record<string, { onMs: number; offMs: number }>> = {},
): { due: AutoWant[]; seen: Record<string, number> } {
  const next: Record<string, number> = {};
  const due: AutoWant[] = [];
  for (const w of wants) {
    const k = wantKey(w);
    const first = seen[k] ?? nowMs;
    next[k] = first;
    const own = per[w.id];
    const wait = w.to === 'on' ? (own?.onMs ?? onMs) : (own?.offMs ?? offMs);
    if (nowMs - first >= wait) due.push(w);
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
  // Owner 2026-11-12: 0 = no daily limit.
  if (p.dailyCap > 0 && p.last24h >= p.dailyCap) return 'daily_cap';
  if (!p.inQuietWindow) return 'quiet_hours';
  if (p.want.to === 'on') {
    if (p.budgetRatio !== null && p.budgetRatio >= 0.9) return 'money_budget';
    if (p.costHighUsd > p.maxUsdMonth) return 'money_item';
  }
  return null;
}

/**
 * 13.11 outage (KNOWN_ERRORS 144): items every query of the running
 * services goes through, with no fallback. Their switch-off plan removes
 * the server while the api / worker task definitions still point at it:
 * Terraform deletes the old dependency without waiting for the ECS rolling
 * deploy (UpdateService returns at once), and a failed step elsewhere skips
 * the task definition update altogether. An automatic request for these is
 * planned but never applied without the owner's 2FA. (The read copies are
 * not here: the read path falls back to the primary by itself, and owner
 * rows 8 / 85 want them removed by «Авто».)
 */
export const OWNER_CONFIRM_OFF: ReadonlySet<string> = new Set([
  'aws.pgbouncer',
]);

/**
 * D1-34 (detective round 1, 13.11): serving infrastructure an automatic plan
 * may never delete or replace, whatever item it belongs to. Losing one of
 * these takes the site down (load balancer, services, CDN, DNS, network).
 * The owner still can, with his 2FA tap.
 */
export const NEVER_AUTO_DESTROY: readonly string[] = [
  'aws_lb',
  'aws_lb_listener',
  'aws_lb_listener_rule',
  'aws_lb_target_group',
  'aws_ecs_service',
  'aws_ecs_cluster',
  'aws_cloudfront_distribution',
  'aws_route53_record',
  'aws_route53_zone',
  'aws_nat_gateway',
  'aws_vpc',
  'aws_subnet',
  'aws_internet_gateway',
  'aws_route_table',
  'aws_route',
  'aws_service_discovery_service',
  'aws_service_discovery_private_dns_namespace',
];

/** Resource types any automatic plan may change in place (never create or
 * delete outside its item): how a switch reaches the running services
 * (new task revision, service update, policy, function settings) and the
 * alarms / dashboards that watch them. */
const ROLL_THROUGH_UPDATE: readonly string[] = [
  'aws_ecs_service',
  'aws_iam_role_policy',
  'aws_iam_policy',
  'aws_lambda_function',
  'aws_scheduler_schedule',
  'aws_cloudwatch_dashboard',
  'aws_cloudwatch_metric_alarm',
  'aws_cloudwatch_composite_alarm',
];

/** New alarms for anything an item adds are always fine. */
const ROLL_THROUGH_CREATE: readonly string[] = [
  'aws_cloudwatch_metric_alarm',
  'aws_cloudwatch_composite_alarm',
];

const S = 'module\\.stack\\.';
const end = '(\\[|$)';
const re = (body: string) => new RegExp(`^${S}${body}`);
const REPLICAS: readonly RegExp[] = [
  re(
    `module\\.growth(_shard\\[\\d+\\])?\\.(aws_db_instance\\.replica|aws_cloudwatch_metric_alarm\\.replica_lag|aws_iam_role\\.replica_monitoring|aws_iam_role_policy_attachment\\.replica_monitoring)${end}`,
  ),
  re(
    `(aws_iam_role|aws_iam_role_policy_attachment)\\.db_replica_monitoring${end}`,
  ),
];
const SHARDS: readonly RegExp[] = [
  re(`module\\.postgres_shard\\[\\d+\\]\\.`),
  re(`module\\.growth_shard\\[\\d+\\]\\.`),
];
const SEARCH: readonly RegExp[] = [
  re(
    `module\\.growth\\.(aws_security_group\\.opensearch|aws_opensearch_domain\\.search|aws_cloudwatch_metric_alarm\\.opensearch)${end}`,
  ),
];
const WAF_ALB: readonly RegExp[] = [
  re(`module\\.alb\\.aws_wafv2_[a-z0-9_]+\\.`),
];

/**
 * D1-34: what the plan of each automatic item may touch (Terraform
 * addresses). An item that is not here is never applied without the owner.
 * Leader: AWS Aurora Auto Scaling "only removes Aurora Replicas that it
 * created" (AWS docs, read 13.11.2026).
 */
export const AUTO_SCOPE: Readonly<Record<string, readonly RegExp[]>> = {
  'aws.rds_replicas': REPLICAS,
  'aws.rds_replicas_2': REPLICAS,
  'aws.rds_replicas_3': REPLICAS,
  'aws.rds_replicas_4': REPLICAS,
  'aws.rds_replicas_5': REPLICAS,
  'aws.db_shards': SHARDS,
  'aws.db_shards_2': SHARDS,
  'aws.db_shards_3': SHARDS,
  'aws.opensearch': SEARCH,
  'aws.opensearch_nodes_2': SEARCH,
  'aws.opensearch_nodes_4': SEARCH,
  'aws.events_stream': [
    re(
      `(aws_kinesis_stream\\.events|aws_iam_role_policy\\.events_stream_put)${end}`,
    ),
  ],
  'aws.redis_cache': [re(`module\\.redis_cache\\[0\\]\\.`)],
  'aws.pgbouncer': [
    re(`module\\.pgbouncer\\[0\\]\\.`),
    re(`module\\.postgres\\.aws_security_group\\.db${end}`),
  ],
  'aws.partition_role': [
    re(
      `(random_password\\.partition|aws_secretsmanager_secret\\.partition_db_password|aws_secretsmanager_secret_version\\.partition_db_password)${end}`,
    ),
  ],
  'aws.waf_alb': WAF_ALB,
  'aws.waf_bot_control': WAF_ALB,
  'aws.waf_extra_rules': WAF_ALB,
};

/** Terraform resource type of a plan address
 * (`module.a[0].aws_db_instance.replica[1]` -> `aws_db_instance`). */
export function resourceType(address: string): string {
  const parts = address.replace(/\[[^\]]*\]/g, '').split('.');
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

/**
 * Why the plan of an automatic request must wait for the owner's 2FA
 * (empty = it may be applied without a tap). Rules, all at once:
 *  - a switch-on removes nothing but replaced task definitions (a new
 *    revision is how ECS rolls a service), a switch-off creates nothing but
 *    those;
 *  - a switch-off of something live services use waits (OWNER_CONFIRM_OFF);
 *  - serving infrastructure is never deleted or replaced (NEVER_AUTO_DESTROY);
 *  - every changed address belongs to the switched item (AUTO_SCOPE), or is
 *    a task definition, or an in-place update / new alarm that only rolls
 *    the change through (ROLL_THROUGH_*).
 * Protected data (database, buckets, keys, backups) is refused earlier for
 * every request by forbiddenDestroys. Pure.
 */
export function autoApplyBlockers(
  to: InfraTarget,
  resources: readonly { address: string; action: string }[],
  itemId?: string,
): string[] {
  if (itemId === undefined) return ['no item'];
  if (to === 'off' && OWNER_CONFIRM_OFF.has(itemId)) {
    return [`${itemId}: switch-off waits for the owner`];
  }
  const scope = AUTO_SCOPE[itemId];
  if (!scope) return [`${itemId}: no automatic scope`];
  const out: string[] = [];
  for (const r of resources) {
    const type = resourceType(r.address);
    const rolling = type === 'aws_ecs_task_definition';
    const deletes = r.action.includes('delete');
    const creates = r.action.includes('create');
    if (rolling) continue;
    if (deletes && NEVER_AUTO_DESTROY.includes(type)) {
      out.push(`${r.address}: ${r.action} of serving infrastructure`);
      continue;
    }
    if (to === 'on' && deletes) {
      out.push(`${r.address}: ${r.action} in a switch-on`);
      continue;
    }
    if (to === 'off' && creates) {
      out.push(`${r.address}: ${r.action} in a switch-off`);
      continue;
    }
    if (scope.some((x) => x.test(r.address))) continue;
    if (r.action === 'update' && ROLL_THROUGH_UPDATE.includes(type)) continue;
    if (r.action === 'create' && ROLL_THROUGH_CREATE.includes(type)) continue;
    out.push(`${r.address}: ${r.action} outside ${itemId}`);
  }
  return out;
}

/** The plan of an automatic request may be applied without a tap. */
export function autoApplyOk(
  to: InfraTarget,
  resources: readonly { address: string; action: string }[],
  itemId?: string,
): boolean {
  return autoApplyBlockers(to, resources, itemId).length === 0;
}
