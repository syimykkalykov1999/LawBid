import { PartitionService } from '../../../partitioning/partition.service';
import { ShardMoveService } from '../../../sharding/move/shard-move.service';
import { serversFull } from '../../../sharding/shard-growth';
import { INFRA_MODE_KEYS, infraMode } from '../../../common/ops/infra-modes';
import { AUTO_SINK_KEY } from '../../events/domain-events.service';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { COST_REGISTRY } from '../../../common/ops/cost-registry';
import {
  switchFor,
  type InfraTarget,
} from '../../../common/ops/infra-switches';
import { IncidentsService } from '../../../common/ops/status/incidents.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { PushQueueService } from '../../notifications/push/push-queue.service';
import { partitionDatabaseUrl } from '../../../partitioning/partition-url';
import { CostRegistryService } from '../cost-registry.service';
import {
  AUTO_REFUSAL_TEXT,
  POOL_FLOOR,
  SYSTEM_ACTOR_ID,
  WAF_GUARDS,
  autoRefusal,
  autoWants,
  dueWants,
  wantKey,
  type AutoSignals,
  type AutoWant,
} from './infra-auto.logic';
import {
  ACTIVE_STATUSES,
  costDelta,
  inQuietWindow,
} from './infra-change.logic';
import { InfraChangeService } from './infra-change.service';
import { writeSystemSetting } from '../../../common/app-settings/app-settings.writer';
import {
  SEARCH_AUTO_LOG_KEY,
  SEARCH_REINDEX_PORT,
  type SearchReindexPort,
} from '../../../common/search/search-reindex.port';
import {
  searchActionImmediate,
  searchActionKey,
  searchAutoStep,
  type ReindexPhaseLike,
  type SearchAutoAction,
  type SearchMode,
} from './search-engine-auto.logic';

const SEARCH_SEEN_KEY = 'ops:infra-auto:search-seen';
/** The last automatic search steps (newest first), for «Масштаб». */
export const SEARCH_LOG_KEY = SEARCH_AUTO_LOG_KEY;

const CHECK_MS = 10 * 60_000;
const LOCK_KEY = 'ops:infra-auto:lock';
const LOCK_TTL_S = 9 * 60;
const SEEN_KEY = 'ops:infra-auto:seen';
const NOTIFIED_KEY = 'ops:infra-auto:notified';
/** A held-back want is told to the owner at most once a day. */
const HELD_PREFIX = 'ops:infra-auto:held:';
const HELD_TTL_S = 24 * 3600;
/** Share of partition.auto_rows at which the runner login is prepared. */
export const PARTITION_PREPARE_RATIO = 0.8;

/** Tables with a partition «Выкл / Вкл / Авто» switch (MODE_TABLES). */
const PARTITION_MODE_TABLES = [
  'messages',
  'chat_group_messages',
  'notifications',
  'post_view_events',
] as const;

/**
 * Automation audit 2026-11-08 (owner: «Авто» must really switch a cloud item
 * on at its threshold and off when it is no longer needed). One API task per
 * 10 minutes (Redis lock, like ha-auto.service): reads the growth signals,
 * applies the hysteresis of infra-auto.logic.ts, and starts the same change
 * request the admin buttons start (plan in GitHub -> applied by itself,
 * infra-change.service planReady). After each automatic step the on-call
 * admins get a push + e-mail; the request row is the action log on «Масштаб».
 *
 * Needs (owner, once): the GitHub App and infra_apply_enabled
 * (docs/runbooks/infra-from-admin.md). Until then every due step is told to
 * the owner once a day as «не настроено», never silently skipped.
 */
@Injectable()
export class InfraAutoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('InfraAuto');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly infra: InfraChangeService,
    private readonly registry: CostRegistryService,
    private readonly settings: AppSettingsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly incidents?: IncidentsService,
    @Optional() private readonly push?: PushQueueService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  onModuleInit(): void {
    if (process.env.JEST_WORKER_ID || process.argv[1]?.includes('worker')) {
      return;
    }
    const tick = () =>
      void this.check().catch((e: Error) =>
        this.log.warn(`infra-auto pass failed: ${e.message}`),
      );
    setTimeout(tick, 120_000 + Math.floor(Math.random() * 30_000)).unref();
    this.timer = setInterval(tick, CHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; returns the request started (for tests and logs). */
  async check(now: Date = new Date()): Promise<{
    started: AutoWant | null;
    held: { want: AutoWant; reason: string }[];
  }> {
    const none = { started: null, held: [] };
    if (!this.redis) return none;
    const got = await this.redis
      .set(LOCK_KEY, '1', 'EX', LOCK_TTL_S, 'NX')
      .catch(() => null);
    if (!got) return none;
    await this.notifyFinished().catch((e: Error) =>
      this.log.warn(`infra-auto notify failed: ${e.message}`),
    );
    const mode = (await this.settings.string('infra.auto_mode')) ?? 'auto';
    if (mode.trim().toLowerCase() === 'auto') {
      await this.searchPass(now).catch((e: Error) =>
        this.log.warn(`infra-auto search step failed: ${e.message}`),
      );
    }
    const signals = await this.signals(now);
    const live = await this.liveFn();
    const autoOn = await this.autoOwned();
    const wants = autoWants(signals, live, autoOn);
    const prev = await this.readSeen();
    const onMs =
      Math.max(10, await this.settings.number('infra.auto_on_minutes')) *
      60_000;
    const offMs =
      Math.max(6, await this.settings.number('infra.auto_off_hours')) *
      3_600_000;
    // Owner 2026-11-12 (foreman): the WAF protections switch on after
    // infra.waf_attack_on_minutes of an attack and off after
    // infra.waf_calm_off_hours of calm, not the slow growth waits.
    const wafOnMs =
      Math.max(1, await this.settings.number('infra.waf_attack_on_minutes')) *
      60_000;
    const wafOffMs =
      Math.max(1, await this.settings.number('infra.waf_calm_off_hours')) *
      3_600_000;
    const per = Object.fromEntries(
      WAF_GUARDS.map((id) => [id, { onMs: wafOnMs, offMs: wafOffMs }]),
    );
    const { due, seen } = dueWants(
      wants,
      prev,
      now.getTime(),
      onMs,
      offMs,
      per,
    );
    await this.redis
      .set(SEEN_KEY, JSON.stringify(seen), 'EX', 30 * 24 * 3600)
      .catch(() => undefined);
    const held: { want: AutoWant; reason: string }[] = [];
    if (due.length === 0) return { started: null, held };

    // Rows 8 / 85 (13.11): a request left active by a cancelled run is
    // timed out by sweep(), which only the admin pages and the workflow
    // called; the automation counted it as «busy» until an admin looked.
    await this.infra.sweep(now);
    const g = await this.infra.guards();
    const since = new Date(now.getTime() - 24 * 3600_000);
    const [activeCount, last24h] = await Promise.all([
      this.prisma.infraChangeRequest.count({
        where: {
          status: { in: [...ACTIVE_STATUSES] },
        },
      }),
      this.prisma.infraChangeRequest.count({
        where: { created_at: { gte: since }, status: { not: 'cancelled' } },
      }),
    ]);
    const maxUsd = await this.settings.number('infra.auto_max_usd_month');
    // Owner 2026-11-09: money holds an automatic switch-on back only when he
    // typed an AWS money ceiling (economy.aws_cap_usd); none = never.
    const capUsd = await this.settings.number('economy.aws_cap_usd');
    const moneyCap = Number.isFinite(capUsd) && capUsd > 0;
    // Switch-offs first: they only save money.
    const ordered = [...due].sort((a, b) =>
      a.to === b.to ? 0 : a.to === 'off' ? -1 : 1,
    );
    for (const want of ordered) {
      const entry = COST_REGISTRY.find((e) => e.id === want.id);
      const sw = switchFor(want.id);
      if (!entry || !sw) continue;
      const [, high] = costDelta(entry, sw, live(want.id), want.to);
      const refusal = autoRefusal({
        mode,
        want,
        configured: g.configured,
        inQuietWindow: inQuietWindow(g.quietHours, now),
        activeCount,
        last24h,
        dailyCap: g.dailyCap,
        budgetRatio: moneyCap ? signals.budgetRatio : null,
        costHighUsd: high,
        maxUsdMonth: moneyCap ? maxUsd : Number.POSITIVE_INFINITY,
      });
      if (refusal) {
        // Waiting for a free slot or the quiet hours is normal; the rest
        // (not configured, money) is told to the owner once a day.
        if (
          refusal !== 'busy' &&
          refusal !== 'quiet_hours' &&
          refusal !== 'auto_off'
        ) {
          held.push({ want, reason: AUTO_REFUSAL_TEXT[refusal] });
          await this.tellHeld(want, AUTO_REFUSAL_TEXT[refusal]);
        }
        continue;
      }
      try {
        const r = await this.infra.create(
          SYSTEM_ACTOR_ID,
          null,
          want.id,
          want.to,
          null,
          { auto: true },
        );
        await this.tell(
          `auto:${r.id}:start`,
          want.to === 'on'
            ? `Облако: включаю само «${entry.name}»`
            : `Облако: выключаю само «${entry.name}»`,
          `${want.reason} План и применение идут сами, результат придёт отдельным сообщением. Отменить: «Масштаб» → запрос → «Отменить» или «Откатить».`,
        );
        // The first-seen time of a want that acted starts over.
        delete seen[wantKey(want)];
        await this.redis
          .set(SEEN_KEY, JSON.stringify(seen), 'EX', 30 * 24 * 3600)
          .catch(() => undefined);
        return { started: want, held };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        held.push({ want, reason: msg });
        await this.tellHeld(want, msg);
      }
    }
    return { started: null, held };
  }

  /** Signals the app already keeps, plus the partition growth signal. */
  async signals(now: Date): Promise<AutoSignals> {
    const [
      s,
      engine,
      partitionNeedsRunner,
      eventsStreamWanted,
      cacheMode,
      replicaProvision,
      people,
      searchOnPeople,
      shardsMode,
      shardGrowth,
    ] = await Promise.all([
      this.registry.signals(now),
      this.registry.searchEngine(),
      this.partitionNeedsRunner().catch(() => false),
      this.eventsStreamWanted().catch(() => false),
      this.settings.string('cache.redis_mode').catch(() => 'auto'),
      this.settings.string('db.replica_provision').catch(() => 'auto'),
      this.people().catch(() => undefined),
      this.settings
        .number('infra.search_engine_on_people')
        .catch(() => undefined),
      this.settings.string('db.shards_mode').catch(() => 'auto'),
      this.shardGrowth().catch(() => undefined),
    ]);
    const full = await this.serversFull().catch(() => false);
    const empty: string[] = await this.emptyServers().catch(() => []);
    // Owner 2026-11-11: the position picked on «Масштаб» per item (a stored
    // row only; nothing stored = Авто by default, not picked by hand).
    const stored = await Promise.all(
      Object.entries(INFRA_MODE_KEYS).map(
        async ([id, key]) =>
          [id, await this.settings.raw(key).catch(() => undefined)] as const,
      ),
    );
    const modes = Object.fromEntries(
      stored.map(([id, raw]) => [id, infraMode(raw)]),
    );
    const pickedAuto = new Set(
      stored
        .filter(([, raw]) => raw !== undefined && infraMode(raw) === 'auto')
        .map(([id]) => id),
    );
    const pool = Number(this.config.get<string>('DB_POOL_SIZE') ?? '');
    const pooler = !!this.config.get<string>('DB_POOLER_HOST');
    return {
      pressures: s.pressures,
      budgetRatio: s.budgetRatio,
      searchEngine: engine,
      partitionNeedsRunner,
      poolSmall:
        !pooler && Number.isFinite(pool) && pool > 0 && pool < POOL_FLOOR,
      eventsStreamWanted,
      cacheRedisMode: cacheMode ?? 'auto',
      cacheNodeLive: !!this.config.get<string>('REDIS_CACHE_URL'),
      replicaProvision: replicaProvision ?? 'auto',
      replicaAppPath:
        this.config.get<string>('OPS_DB_REPLICA_TOGGLE') === 'on' &&
        !!this.config.get<string>('OPS_DB_INSTANCE'),
      people,
      searchOnPeople,
      shardsMode: shardsMode ?? 'auto',
      shardGrowth,
      modes,
      pickedAuto,
      serversFull: full,
      emptyServers: empty,
    };
  }

  /** Owner 2026-11-12: the extra servers that hold no data at all. */
  private async emptyServers(): Promise<string[]> {
    const moves = this.moduleRef?.get(ShardMoveService, { strict: false });
    return moves ? moves.emptyServers() : [];
  }

  /** The split threshold status of «Здоровье системы» (PartitionService). */
  /** Owner 2026-11-11: some server near the threshold and no empty extra
   * server left — the next one (third, fourth) is needed. */
  private async serversFull(): Promise<boolean> {
    const moves = this.moduleRef?.get(ShardMoveService, { strict: false });
    const partitions = this.moduleRef?.get(PartitionService, {
      strict: false,
    });
    if (!moves || !partitions || moves.extraDatabases().length === 0) {
      return false;
    }
    const g = await partitions.shardSignal();
    return serversFull(await moves.serverFill(g.thresholdGb, g.thresholdRows));
  }

  private async shardGrowth(): Promise<'green' | 'yellow' | 'red' | undefined> {
    const partitions = this.moduleRef?.get(PartitionService, {
      strict: false,
    });
    return partitions ? (await partitions.shardSignal()).status : undefined;
  }

  /**
   * G4 (2026-11-08): `events.sink` asks for the Kinesis stream (`stream`,
   * or `auto` whose day counter crossed `events.auto_ceiling_per_day`,
   * events.maintenance.ts) while this stand has none (EVENTS_STREAM_NAME
   * empty). Until the stream exists the events wait in their table
   * (published_at null) and the relay ships them once it does.
   */
  async eventsStreamWanted(): Promise<boolean> {
    if (this.config.get<string>('EVENTS_STREAM_NAME')) return false;
    const sink = (await this.settings.string('events.sink')) ?? 'db';
    if (sink === 'stream') return true;
    if (sink !== 'auto' || !this.redis) return false;
    return (await this.redis.get(AUTO_SINK_KEY)) === 'stream';
  }

  /**
   * «Авто» for `search.engine` (search-engine-auto.logic.ts): one step per
   * pass along shadow → reindex → swap → engine while the search engine
   * domain is on, postgres at once when it is off. Steps toward the engine
   * wait `infra.auto_on_minutes` of the same want (hysteresis, like the
   * cloud items); each step is logged (SEARCH_LOG_KEY) and told to the
   * on-call admins. Returns the step taken (tests).
   */
  async searchPass(now: Date = new Date()): Promise<SearchAutoAction | null> {
    const follow =
      (await this.settings.string('search.engine_follow')) ?? 'auto';
    if (follow.trim().toLowerCase() !== 'auto') return null;
    const reindex = this.reindex();
    if (!reindex) return null;
    const raw = (await this.settings.string('search.engine')) ?? 'postgres';
    const mode: SearchMode =
      raw === 'shadow' || raw === 'engine' ? raw : 'postgres';
    const live = await this.liveFn();
    const status = await reindex.status().catch(() => null);
    const action = searchAutoStep({
      follow,
      mode,
      domain: live('aws.opensearch'),
      engineConfigured: status?.engineConfigured ?? false,
      phase: (status?.state?.phase as ReindexPhaseLike | undefined) ?? null,
    });
    if (!action) {
      await this.redis?.del(SEARCH_SEEN_KEY).catch(() => 0);
      return null;
    }
    const key = searchActionKey(action);
    if (!searchActionImmediate(action)) {
      const seenRaw = await this.redis?.get(SEARCH_SEEN_KEY).catch(() => null);
      const seen = seenRaw?.startsWith(`${key}@`)
        ? Number(seenRaw.slice(key.length + 1))
        : NaN;
      const first = Number.isFinite(seen) ? seen : now.getTime();
      await this.redis
        ?.set(SEARCH_SEEN_KEY, `${key}@${first}`, 'EX', 7 * 24 * 3600)
        .catch(() => undefined);
      const onMs =
        Math.max(10, await this.settings.number('infra.auto_on_minutes')) *
        60_000;
      if (now.getTime() - first < onMs) return null;
    }
    try {
      if (action.kind === 'set_mode') {
        await writeSystemSetting(
          this.prisma,
          this.redis,
          'search.engine',
          action.to,
        );
      } else if (action.kind === 'start_reindex') {
        await reindex.start('postgres');
      } else {
        await reindex.swap();
      }
    } catch (e) {
      const why = (e as Error).message;
      this.log.warn(`search auto ${key} refused: ${why}`);
      await this.tell(
        `search:${key}:fail:${now.toISOString().slice(0, 10)}`,
        'Поиск: автоматический шаг не прошёл',
        `${action.reason} Причина: ${why}. Следующая попытка через 10 минут.`,
      );
      return null;
    }
    await this.redis?.del(SEARCH_SEEN_KEY).catch(() => 0);
    const entry = JSON.stringify({
      at: now.toISOString(),
      step: key,
      reason: action.reason,
    });
    await this.redis
      ?.multi()
      .lpush(SEARCH_LOG_KEY, entry)
      .ltrim(SEARCH_LOG_KEY, 0, 49)
      .exec()
      .catch(() => null);
    this.log.log(`search auto: ${key} — ${action.reason}`);
    await this.tell(
      `search:${key}:${now.toISOString()}`,
      action.kind === 'set_mode'
        ? `Поиск: ${action.to === 'engine' ? 'отвечает поисковый движок' : action.to === 'shadow' ? 'движок подключён, идёт сверка' : 'вернулся в базу'}`
        : action.kind === 'start_reindex'
          ? 'Поиск: строится индекс в движке'
          : 'Поиск: индекс проверен, переключение',
      `${action.reason} Само, через «Авто». Ручное управление: search.engine_follow = manual.`,
    );
    return action;
  }

  /** The search reindex through its port (common/search/search-reindex.port),
   * resolved lazily from the app: no import of the search module here. */
  private reindex(): SearchReindexPort | null {
    try {
      return (
        this.moduleRef?.get<SearchReindexPort>(SEARCH_REINDEX_PORT, {
          strict: false,
        }) ?? null
      );
    } catch {
      return null;
    }
  }

  /** People in the database: the planner's estimate (pg_class), free. */
  async people(): Promise<number> {
    const [r] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT GREATEST(c.reltuples, 0)::float8 AS n FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relname = 'users'`;
    return Number(r?.n ?? 0);
  }

  /** A table in «Вкл», or in «Авто» at 80 % of its threshold, while the
   * runner has no login. Reads pg_class estimates only (no COUNT). */
  async partitionNeedsRunner(): Promise<boolean> {
    if (partitionDatabaseUrl((k) => this.config.get<string>(k))) return false;
    const limit = await this.settings.number('partition.auto_rows');
    const rows = await this.prisma.$queryRaw<
      { t: string; rows: number; kind: string }[]
    >`SELECT c.relname AS t, c.relkind::text AS kind,
             GREATEST(c.reltuples, 0)::float8 AS rows
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY(${[...PARTITION_MODE_TABLES]}::text[])`;
    for (const table of PARTITION_MODE_TABLES) {
      const r = rows.find((x) => x.t === table);
      if (!r || r.kind === 'p') continue;
      const mode = (
        (await this.settings.string(
          `partition.${table}_mode` as 'partition.messages_mode',
        )) ?? 'off'
      )
        .trim()
        .toLowerCase();
      if (mode === 'on') return true;
      if (
        mode === 'auto' &&
        Number(r.rows) >= limit * PARTITION_PREPARE_RATIO
      ) {
        return true;
      }
    }
    return false;
  }

  private async liveFn(): Promise<(id: string) => InfraTarget | null> {
    const live = await this.infra.liveStates();
    return (id) => {
      const known = live.get(id);
      if (known) return known;
      const d = COST_REGISTRY.find((e) => e.id === id)?.defaultState;
      return d === 'on' || d === 'off' ? d : null;
    };
  }

  /** Items whose settled position is an automatic switch-on (rows 8 / 9:
   * the same rule as the live state, InfraChangeService.autoOwned). */
  private async autoOwned(): Promise<Set<string>> {
    return this.infra.autoOwned();
  }

  private async readSeen(): Promise<Record<string, number>> {
    const raw = await this.redis?.get(SEEN_KEY).catch(() => null);
    if (!raw) return {};
    try {
      const v = JSON.parse(raw) as Record<string, number>;
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }

  /** Message for every automatic request that finished since last pass. */
  private async notifyFinished(): Promise<void> {
    const rows = await this.prisma.infraChangeRequest.findMany({
      where: {
        requested_by: SYSTEM_ACTOR_ID,
        finished_at: { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
        status: { in: ['done', 'failed', 'expired'] },
      },
      select: {
        id: true,
        item_id: true,
        to_state: true,
        status: true,
        error: true,
      },
      take: 20,
    });
    for (const r of rows) {
      const name =
        COST_REGISTRY.find((e) => e.id === r.item_id)?.name ?? r.item_id;
      const ok = r.status === 'done';
      await this.tell(
        `auto:${r.id}:end`,
        ok
          ? `Облако: «${name}» ${r.to_state === 'on' ? 'включено' : 'выключено'} автоматически`
          : `Облако: не получилось ${r.to_state === 'on' ? 'включить' : 'выключить'} «${name}»`,
        ok
          ? 'Готово. Запись на странице «Масштаб».'
          : `Причина: ${r.error ?? r.status}. Автоматика попробует снова, когда сигнал снова продержится.`,
      );
    }
  }

  private async tellHeld(want: AutoWant, reason: string): Promise<void> {
    const key = HELD_PREFIX + wantKey(want);
    const fresh = await this.redis
      ?.set(key, '1', 'EX', HELD_TTL_S, 'NX')
      .catch(() => null);
    if (!fresh) return;
    const name = COST_REGISTRY.find((e) => e.id === want.id)?.name ?? want.id;
    this.log.warn(`infra auto held: ${wantKey(want)}: ${reason}`);
    await this.tell(
      `held:${wantKey(want)}:${new Date().toISOString().slice(0, 10)}`,
      `Облако: «${name}» пора ${want.to === 'on' ? 'включить' : 'выключить'}, но само не может`,
      `${want.reason} Почему не само: ${reason}`,
    );
  }

  /** Push + e-mail to the on-call admins, once per [id]. */
  private async tell(id: string, title: string, body: string): Promise<void> {
    const first = await this.redis?.sadd(NOTIFIED_KEY, id).catch(() => 0);
    if (!first) return;
    await this.redis?.expire(NOTIFIED_KEY, 30 * 24 * 3600).catch(() => 0);
    if (!this.incidents || !this.push) return;
    const people = await this.incidents.recipients();
    for (const p of people) {
      await this.push.enqueueOpsAlert({
        recipientId: p.userId,
        title,
        body,
        incidentId: id,
        event: 'infra_auto',
        seq: 0,
        email: true,
      });
    }
  }
}
