import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  bandOf,
  hotlineCounterBandsFrom,
  hotlineModeFrom,
  hotlineSettingsFrom,
  type HotlineSettings,
} from '../../common/app-settings/hotline-settings';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { pipeline } from '../../redis/redis-cluster-safe';
import { incrWithTtl } from '../../redis/incr-with-ttl';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { KNOWN_LANGUAGE_NATIVE_NAMES } from '../i18n/language-names';
import {
  EntitlementsService,
  hotlineAddonActive,
} from '../plans/entitlements.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import {
  assertHotlineOn,
  decideHotlineAccess,
  HOTLINE_ADDON_PRICE_ENTITLEMENT,
  HOTLINE_ENTITLEMENT,
  HOTLINE_FLAG,
} from './hotline-access';
import {
  ackField,
  disclosureFor,
  type HotlineDisclosure,
  type HotlineRole,
} from './hotline-disclosures';
import { HotlineConflictService } from './hotline-conflict.service';
import { bucketOf, HotlineKeys, HotlineStore } from './hotline.store';
import {
  HOTLINE_CLOCK,
  HOTLINE_KEYS,
  HOTLINE_NOTIFIER,
  type HotlineNotifier,
  RealtimeHotlineNotifier,
} from './hotline-notifier';
import {
  HOTLINE_CALL_BRIDGE,
  type HotlineCallBridge,
  type HotlineCallState,
} from './hotline-call-bridge';

const CODE = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;
const STATE = /^[A-Z]{2}$/;
const DAY_SEC = 24 * 3600;
const FAR = 8.64e15;
/** How deep one event may chain re-offers (a conflict, then the next…). */
const MAX_CHAIN = 25;

export type RequestStatus =
  'searching' | 'queued' | 'offline' | 'connected' | 'ended' | 'cancelled';

export interface LineInput {
  states: string[];
  practiceAreas: string[];
  languages: string[];
  accepting?: boolean;
}

export interface RequestInput {
  state: string;
  practiceArea: string;
  languages: string[];
  topic: string;
}

export interface LineView {
  online: boolean;
  state: 'idle' | 'offered' | 'busy' | 'not_accepting' | 'paused' | 'off';
  accepting: boolean;
  states: string[];
  practiceAreas: string[];
  languages: string[];
  heartbeatSec: number;
  offerTimeoutSec: number;
  via: 'free' | 'plan' | 'addon' | 'trial' | null;
}

export interface RequestView {
  id: string;
  status: RequestStatus;
  /** Rough place («1», «2–5», «6–20», «20+»), never exact. */
  positionBand: string | null;
  /** Rough wait: lt5 | 5to15 | 15to30 | gt30, null while not queued. */
  waitBand: string | null;
  endReason: string | null;
  lawyer: {
    id: string;
    name: string;
    state: string;
    barNumber: string | null;
  } | null;
  notifyUntil: number | null;
  disclosure: HotlineDisclosure | null;
  /** The 1:1 call carrying the voice (GET /calls/:id), while connected. */
  callId: string | null;
  /** The direct chat of the two, once the call is over (WhatsApp-style). */
  conversationId: string | null;
}

/** «Ещё звонят: N» and the counters: bands, never exact. */
export function positionBand(rank0: number): string {
  const p = rank0 + 1;
  if (p <= 1) return '1';
  if (p <= 5) return '2-5';
  if (p <= 20) return '6-20';
  return '20+';
}

export function waitBand(minutes: number): string {
  if (minutes < 5) return 'lt5';
  if (minutes < 15) return '5to15';
  if (minutes < 30) return '15to30';
  return 'gt30';
}

/** Whether the voice of an ended 1:1 call ever came up. The calls API
 * records an answered call whose link died as `ended` / `link_lost`; one
 * that died this soon after the answer never had media (R-404: the calls'
 * CALL_NEVER_UP_WITHIN_MS, 60 s — the app gives up after 45 s). */
export function callVoiceUp(c: HotlineCallState): boolean {
  if (c.status === 'failed') return false;
  if (c.endReason === 'link_lost' && (c.durationSec ?? 0) < 60) return false;
  return true;
}

/** The client's UTC offset now, minutes (DST of today). */
export function utcOffsetMinutes(timeZone: string, at: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(at));
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const local = Date.UTC(
      n('year'),
      n('month') - 1,
      n('day'),
      n('hour'),
      n('minute'),
    );
    return Math.round((local - Math.floor(at / 60000) * 60000) / 60000);
  } catch {
    return null;
  }
}

/**
 * Owner row 87: the call hotline engine. Everything live is in Valkey (the
 * scripts in hotline-match.lua.ts, keys in hotline.store.ts); the database
 * is read only when an attorney joins (his verified licences, once), when a
 * client asks (his name and verified phone, once) and for the conflict hook
 * (cached per pair). The 1:1 call itself is the existing calls API — this
 * service never touches it.
 */
@Injectable()
export class HotlineService {
  readonly store: HotlineStore;
  readonly k: HotlineKeys;
  private readonly now: () => number;
  private readonly notifier: HotlineNotifier;
  private practiceCache?: { at: number; codes: Set<string> };
  private stateCache?: { at: number; codes: Set<string> };

  constructor(
    @Inject(REDIS_CLIENT) readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly settings: AppSettingsService,
    private readonly realtime: RealtimePublisher,
    private readonly conflict: HotlineConflictService,
    @Optional() private readonly entitlements?: EntitlementsService,
    @Optional() @Inject(HOTLINE_NOTIFIER) notifier?: HotlineNotifier,
    @Optional() @Inject(HOTLINE_KEYS) keys?: HotlineKeys,
    @Optional() @Inject(HOTLINE_CLOCK) clock?: () => number,
    /** Plan PR 4: the real 1:1 voice call behind «Взять» (absent in the
     * engine's unit tests — then the hotline runs on its own state). */
    @Optional()
    @Inject(HOTLINE_CALL_BRIDGE)
    readonly bridge?: HotlineCallBridge,
  ) {
    this.k = keys ?? new HotlineKeys();
    this.store = new HotlineStore(redis, this.k);
    this.now = clock ?? Date.now;
    this.notifier = notifier ?? new RealtimeHotlineNotifier(realtime);
  }

  // ── settings ────────────────────────────────────────────────────────

  async cfg(): Promise<{
    s: HotlineSettings;
    raw: Readonly<Record<string, unknown>>;
  }> {
    const raw = await this.settings.all();
    return { s: hotlineSettingsFrom(raw), raw };
  }

  async enabled(): Promise<boolean> {
    return this.flags.isEnabled(HOTLINE_FLAG, false);
  }

  /** GET /hotline/config — what the app needs to draw the screens. */
  async config(user: RequestUser) {
    const { s, raw } = await this.cfg();
    const role: HotlineRole = user.role === 'attorney' ? 'attorney' : 'client';
    return {
      enabled: await this.enabled(),
      heartbeatSec: s['hotline.heartbeat_sec'],
      offerTimeoutSec: s['hotline.offer_timeout_sec'],
      maxLanguages: s['hotline.max_languages'],
      topicMaxChars: s['hotline.topic_max_chars'],
      countersIntervalSec: s['hotline.counters_interval_sec'],
      notifyClaimSec: s['hotline.notify_claim_sec'],
      reviewEnabled: raw['hotline.review_enabled'] !== false,
      clientStepsEnabled: raw['hotline.client_steps_enabled'] !== false,
      disclosure: await this.disclosure(user.sub, role, false),
    };
  }

  /** The one-time disclosure for this person and role; [ack] marks it seen. */
  async disclosure(
    userId: string,
    role: HotlineRole,
    ack: boolean,
  ): Promise<HotlineDisclosure> {
    const { s, raw } = await this.cfg();
    const version = s['hotline.disclosure_version'];
    const field = ackField(userId, role, version);
    const seen = (await this.redis.hexists(this.ackKey(), field)) === 1;
    if (ack && !seen) await this.redis.hset(this.ackKey(), field, this.now());
    return disclosureFor(
      role,
      seen,
      version,
      raw['hotline.short_notice_enabled'] === true,
    );
  }

  private ackKey() {
    return `${this.k.p}:ack`;
  }

  // ── validation helpers ─────────────────────────────────────────────

  private async practiceCodes(): Promise<Set<string>> {
    if (this.practiceCache && this.now() - this.practiceCache.at < 300_000) {
      return this.practiceCache.codes;
    }
    const rows = await this.prisma.practiceArea.findMany({
      where: { is_active: true },
      select: { code: true },
    });
    this.practiceCache = {
      at: this.now(),
      codes: new Set(rows.map((r) => r.code)),
    };
    return this.practiceCache.codes;
  }

  private async stateCodes(): Promise<Set<string>> {
    if (this.stateCache && this.now() - this.stateCache.at < 300_000) {
      return this.stateCache.codes;
    }
    const rows = await this.prisma.state.findMany({
      where: { is_active: true },
      select: { code: true },
    });
    this.stateCache = {
      at: this.now(),
      codes: new Set(rows.map((r) => r.code)),
    };
    return this.stateCache.codes;
  }

  private bad(reason: string, extra: Record<string, unknown> = {}): never {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Hotline: ${reason}`,
      details: { reason, ...extra },
    });
  }

  private cleanList(list: unknown, max: number, what: string): string[] {
    if (!Array.isArray(list) || list.length === 0) this.bad(`${what}_required`);
    const out = [...new Set(list.map((x) => String(x).trim()))];
    if (out.length > max) this.bad(`${what}_too_many`, { max });
    return out;
  }

  private validLanguages(list: unknown, max: number): string[] {
    const langs = this.cleanList(list, max, 'languages').map((l) =>
      l.toLowerCase(),
    );
    const unknown = langs.filter(
      (l) => !CODE.test(l) || !(l in KNOWN_LANGUAGE_NATIVE_NAMES),
    );
    if (unknown.length) this.bad('unknown_language', { languages: unknown });
    return langs;
  }

  private async validPractices(list: unknown, max: number): Promise<string[]> {
    const codes = this.cleanList(list, max, 'practice_areas');
    const known = await this.practiceCodes();
    const unknown = codes.filter((c) => !CODE.test(c) || !known.has(c));
    if (unknown.length) {
      this.bad('unknown_practice_area', { practiceAreas: unknown });
    }
    return codes;
  }

  // ── attorney: the line ────────────────────────────────────────────

  private assertAttorney(user: RequestUser): void {
    if (user.role !== 'attorney' || user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the attorney himself can wait for hotline calls.',
      });
    }
  }

  private assertClient(user: RequestUser): void {
    if (user.role !== 'client' || user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only a client can call the hotline.',
      });
    }
  }

  /** PUT /hotline/line — «Ожидать звонки» on (or new filters). The attorney
   * opts in himself; only states of his VERIFIED licences (UPL). */
  async goOnline(user: RequestUser, input: LineInput): Promise<LineView> {
    await assertHotlineOn(this.flags);
    this.assertAttorney(user);
    const { s, raw } = await this.cfg();
    const lw = user.sub;
    const langs = this.validLanguages(input.languages, 50);
    const practices = await this.validPractices(input.practiceAreas, 500);
    const states = this.cleanList(input.states, 100, 'states').map((x) =>
      x.toUpperCase(),
    );
    const licences = await this.prisma.attorneyLicense.findMany({
      where: { attorney_id: lw, license_status: 'verified' },
      select: { state_code: true, bar_number: true },
    });
    const licensed = new Map(licences.map((l) => [l.state_code, l.bar_number]));
    const missing = states.filter((x) => !licensed.has(x));
    if (missing.length) {
      throw new ForbiddenException({
        code: ErrorCode.ATTORNEY_NOT_VERIFIED,
        message: 'Hotline calls only in the states of your verified licences.',
        details: { states: missing },
      });
    }
    const buckets: string[] = [];
    for (const st of states)
      for (const p of practices)
        for (const l of langs) buckets.push(bucketOf(st, p, l));
    if (buckets.length > s['hotline.max_buckets_per_attorney']) {
      this.bad('too_many_combinations', {
        max: s['hotline.max_buckets_per_attorney'],
      });
    }
    const via = await this.access(lw, s, raw);
    const now = this.now();
    const accepting = input.accepting !== false;
    const prev = await this.lawyerDetail(lw);
    const me = await this.prisma.user.findUnique({
      where: { id: lw },
      select: { first_name: true, last_name: true },
    });
    const name = `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim();
    const dk = this.k.lawyer(lw);
    await this.redis.hset(dk, {
      buckets: JSON.stringify(buckets),
      states: states.join(','),
      practices: practices.join(','),
      langs: langs.join(','),
      name,
      bars: JSON.stringify(Object.fromEntries(licensed)),
      accepting: accepting ? '1' : '0',
      leaving: '0',
      misses: prev?.misses ?? '0',
    });
    await this.redis.expire(dk, 2 * DAY_SEC);
    await this.redis.hsetnx(this.k.trial(lw), 'first', String(now));
    const state = await this.store.lawyerOn(
      lw,
      now + s['hotline.presence_ttl_sec'] * 1000,
      accepting,
    );
    const oldBuckets = prev ? this.parseList(prev.buckets) : [];
    const oldLangs = prev?.langs ? prev.langs.split(',') : [];
    await this.store.setLawyerMembership(
      lw,
      { buckets, langs },
      {
        buckets: oldBuckets.filter((b) => !buckets.includes(b)),
        langs: oldLangs.filter((l) => !langs.includes(l)),
      },
    );
    if (accepting && state === 'n') await this.store.cas(lw, 'n', 'i');
    if (!accepting && state === 'i') await this.store.cas(lw, 'i', 'n');
    if (accepting && (state === 'new' || state === 'i' || state === 'n')) {
      await this.freeLawyer(lw);
    }
    return this.lineView(lw, via);
  }

  /** «Вкл для всех» / «По подписке» (plan, add-on, trial) / «Выкл для всех»
   * (hotline-access.ts). */
  private async access(
    lw: string,
    s: HotlineSettings,
    raw: Readonly<Record<string, unknown>>,
  ): Promise<'free' | 'plan' | 'addon' | 'trial'> {
    const trial = await this.redis.hgetall(this.k.trial(lw));
    let included = false;
    let addonPrice: number | null = null;
    let addonActive = false;
    const mode = hotlineModeFrom(raw);
    if (mode === 'by_subscription' && this.entitlements) {
      const resolved = await this.entitlements.forUser(lw);
      const e = resolved.values;
      // Plan PR 8: the add-on bought on the subscription card.
      addonActive = hotlineAddonActive(resolved, this.now());
      included = e[HOTLINE_ENTITLEMENT] === true;
      const p = e[HOTLINE_ADDON_PRICE_ENTITLEMENT];
      addonPrice = typeof p === 'number' ? p : null;
    }
    const decision = decideHotlineAccess({
      mode,
      included,
      addonPriceCents: addonPrice,
      addonActive,
      trialDays: s['hotline.trial_days'],
      trialMinutes: s['hotline.trial_minutes'],
      firstOnlineAt: trial.first ? Number(trial.first) : null,
      minutesUsed: Math.floor(Number(trial.seconds ?? 0) / 60),
      now: this.now(),
    });
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'The hotline is not part of your plan.',
        details: { entitlement: HOTLINE_ENTITLEMENT, reason: decision.reason },
      });
    }
    return decision.via;
  }

  /** DELETE /hotline/line, `hotline:away`, a closed line socket, a missed
   * heartbeat: off the line AT ONCE (owner 16.11 ~18:20). */
  async goOffline(lw: string, reason: string): Promise<void> {
    const [kind, req] = await this.store.lawyerOff(lw);
    const d = await this.lawyerDetail(lw);
    if (kind === 'o|') {
      if ((await this.store.release(req, lw, 'offline', 0)) === 'ok') {
        this.realtime.toUsers([lw], 'hotline:offer_ended', {
          requestId: req,
          reason: 'offline',
        });
        await this.matchRequest(req);
      }
    }
    if (d) {
      await this.store.setLawyerMembership(
        lw,
        { buckets: [], langs: [] },
        {
          buckets: this.parseList(d.buckets),
          langs: d.langs ? d.langs.split(',') : [],
        },
      );
      if (kind === 'b|') {
        // the call goes on; at its end the attorney is not put back
        await this.redis.hset(this.k.lawyer(lw), 'leaving', '1');
      } else {
        await this.redis.del(this.k.lawyer(lw));
      }
    }
    this.realtime.toUsers([lw], 'hotline:line', { online: false, reason });
  }

  async goOfflineByUser(user: RequestUser): Promise<LineView> {
    this.assertAttorney(user);
    await this.goOffline(user.sub, 'off');
    return this.lineView(user.sub, null);
  }

  /** «Принимать звонки» in the ⋯ menu: off = this call goes on, no new. */
  async setAccepting(user: RequestUser, on: boolean): Promise<LineView> {
    await assertHotlineOn(this.flags);
    this.assertAttorney(user);
    const lw = user.sub;
    if (!(await this.lawyerDetail(lw))) return this.lineView(lw, null);
    await this.redis.hset(this.k.lawyer(lw), 'accepting', on ? '1' : '0');
    if (on && (await this.store.cas(lw, 'n', 'i'))) await this.freeLawyer(lw);
    if (!on) {
      if (await this.store.cas(lw, 'i', 'n')) {
        const d = await this.lawyerDetail(lw);
        await this.store.dropLawyerFromBuckets(lw, this.parseList(d?.buckets));
      }
    }
    return this.lineView(lw, null);
  }

  /** Socket / REST heartbeat of whoever is on the hotline screen. */
  async heartbeat(
    userId: string,
    socketId?: string,
  ): Promise<{ line: boolean | null; requestId: string | null }> {
    const { s } = await this.cfg();
    const now = this.now();
    let line: boolean | null = null;
    if (await this.lawyerDetail(userId)) {
      line = await this.store.touchLawyer(
        userId,
        now + s['hotline.presence_ttl_sec'] * 1000,
      );
      if (socketId) {
        await this.redis.hset(this.k.lawyer(userId), 'sock', socketId);
      }
      const st = await this.store.lawyerState(userId);
      if (st?.startsWith('b|')) await this.touchCall(st.slice(2), s, now);
    }
    const req = await this.redis.get(this.k.client(userId));
    if (req) {
      const st = await this.store.requestState(req);
      if (st?.startsWith('c|')) await this.touchCall(req, s, now);
      else if (st && !(await this.store.isOffline(req))) {
        await this.redis.zadd(
          this.k.calive,
          'XX',
          now + s['hotline.client_ttl_sec'] * 1000,
          req,
        );
      }
    }
    return { line, requestId: req };
  }

  private async touchCall(req: string, s: HotlineSettings, now: number) {
    await this.redis.zadd(
      this.k.conn,
      'XX',
      now + s['hotline.presence_ttl_sec'] * 1000,
      req,
    );
  }

  /** The attorney's line socket closed (screen off, network gone). */
  async lineSocketClosed(userId: string, socketId: string): Promise<void> {
    const d = await this.lawyerDetail(userId);
    if (d && d.sock === socketId) await this.goOffline(userId, 'disconnected');
  }

  // ── matching (each step one atomic script) ─────────────────────────

  /** The attorney is free: oldest ONLINE waiter first, else idle and the
   * sweeper may notify offline subscribers of his buckets. */
  async freeLawyer(lw: string, depth = 0): Promise<void> {
    if (depth > MAX_CHAIN) return;
    const d = await this.lawyerDetail(lw);
    if (!d) return;
    const { s } = await this.cfg();
    const now = this.now();
    const buckets = this.parseList(d.buckets);
    const [kind, req] = await this.store.free(
      lw,
      buckets,
      now,
      now + s['hotline.offer_timeout_sec'] * 1000,
      now,
    );
    if (kind === 'offer') {
      await this.afterReserve(req, lw, depth);
      return;
    }
    if (kind === 'idle') await this.markDirty(buckets, now);
  }

  /** Buckets with somebody waiting get a sweep pass (pair + notify). */
  private async markDirty(buckets: string[], now: number): Promise<void> {
    if (buckets.length === 0) return;
    const p = pipeline(this.redis);
    for (const b of buckets) p.zcard(this.k.queue(b));
    const res = (await p.exec()) ?? [];
    const due = buckets.filter((_, i) => Number(res[i]?.[1] ?? 0) > 0);
    if (due.length === 0) return;
    const q = pipeline(this.redis);
    for (const b of due) q.zadd(this.k.dirty, 'NX', now, b);
    await q.exec();
  }

  /** A request looks for an attorney (new, re-searching, claimed). */
  async matchRequest(req: string, depth = 0): Promise<void> {
    if (depth > MAX_CHAIN) return;
    const r = await this.requestDetail(req);
    if (!r) return;
    const { s } = await this.cfg();
    const now = this.now();
    const buckets = this.parseList(r.buckets);
    const [kind, lw] = await this.store.match(
      req,
      buckets,
      now,
      now + s['hotline.offer_timeout_sec'] * 1000,
      Number(r.created),
      s['hotline.max_queue_per_bucket'],
    );
    if (kind === 'offer') {
      await this.afterReserve(req, lw, depth);
    } else if (kind === 'full') {
      await this.closeRequest(req, 'queue_full');
    } else if (kind === 'queued') {
      await this.pushRequest(req);
    }
  }

  /** After a reservation: cleanup, the conflict hook, the offer event. */
  async afterReserve(req: string, lw: string, depth: number): Promise<void> {
    const r = await this.requestDetail(req);
    const d = await this.lawyerDetail(lw);
    const { s } = await this.cfg();
    if (!r || !d) {
      await this.store.release(req, lw, 'offline', 0);
      return;
    }
    await this.store.dropLawyerFromBuckets(lw, this.parseList(d.buckets));
    await this.store.dropRequestFromQueues(req, this.parseList(r.buckets));
    await this.store.setClientLangs(req, r.langs.split(','), false);
    if (
      await this.conflict.blocks(
        this.k,
        lw,
        r.client,
        s['hotline.conflict_cache_sec'],
      )
    ) {
      const rqdExpiry = this.now() + DAY_SEC * 1000;
      if ((await this.store.release(req, lw, 'conflict', rqdExpiry)) === 'ok') {
        await this.freeLawyer(lw, depth + 1);
        await this.matchRequest(req, depth + 1);
      }
      return;
    }
    await this.bumpAgg('offers');
    const waiting = await this.waitingFor(d);
    this.realtime.toUsers([lw], 'hotline:offer', {
      requestId: req,
      topic: r.topic,
      state: r.state,
      practiceArea: r.practice,
      languages: r.langs.split(','),
      clientName: r.clientName,
      waitingMore: bandOf(waiting, [1, 2, 5, 10, 50]),
      expiresAt: this.now() + s['hotline.offer_timeout_sec'] * 1000,
      disclosure: await this.disclosure(lw, 'attorney', true),
    });
  }

  /** «Ещё звонят: N» — clients waiting in the attorney's queues (bounded). */
  private async waitingFor(d: Record<string, string>): Promise<number> {
    const buckets = this.parseList(d.buckets).slice(0, 200);
    if (buckets.length === 0) return 0;
    const p = pipeline(this.redis);
    for (const b of buckets) p.zcard(this.k.queue(b));
    const res = (await p.exec()) ?? [];
    return res.reduce((sum, x) => sum + Number(x?.[1] ?? 0), 0);
  }

  // ── attorney: offers and calls ─────────────────────────────────────

  /** «Взять». Idempotent; billing starts only here (answeredAt). */
  async accept(user: RequestUser, req: string) {
    await assertHotlineOn(this.flags);
    this.assertAttorney(user);
    const lw = user.sub;
    const res = await this.store.accept(req, lw, this.now());
    if (res === 'late') {
      await this.offerTimedOut(req, lw);
      return { ok: false, state: 'late' as const };
    }
    if (res === 'gone') return { ok: false, state: 'gone' as const };
    let callId: string | null;
    if (res === 'ok') {
      const { s } = await this.cfg();
      const now = this.now();
      // The «no answer» row is broken by a real conversation (endCall), not
      // by «Взять» alone: a call whose voice never comes up is a miss too.
      await this.redis.hset(this.k.request(req), {
        lawyer: lw,
        answeredAt: String(now),
      });
      await this.redis.zrem(this.k.calive, req);
      await this.redis.zadd(
        this.k.conn,
        now + s['hotline.presence_ttl_sec'] * 1000,
        req,
      );
      if (s['hotline.call_max_minutes'] > 0) {
        await this.redis.zadd(
          `${this.k.p}:connmax`,
          now + s['hotline.call_max_minutes'] * 60_000,
          req,
        );
      }
      await this.bumpAgg('accepted');
      callId = await this.ensureCall(req, s);
      const r = await this.requestDetail(req);
      if (r) {
        this.realtime.toUsers([r.client, lw], 'hotline:connected', {
          requestId: req,
          clientId: r.client,
          lawyerId: lw,
          callId,
          video: false,
        });
      }
    } else {
      // a repeated «Взять»: the same call (opened now if the first try
      // could not reach the database)
      callId = await this.ensureCall(req, (await this.cfg()).s);
    }
    return {
      ok: true,
      state: 'connected' as const,
      ...(this.bridge ? { callId } : {}),
    };
  }

  /** Plan PR 4: the real voice call of a connected request, opened once
   * (idempotent); the sweeper then follows the call's own state. */
  private async ensureCall(
    req: string,
    s: HotlineSettings,
  ): Promise<string | null> {
    if (!this.bridge) return null;
    const r = await this.requestDetail(req);
    const st = await this.store.requestState(req);
    if (!r || !st?.startsWith('c|')) return null;
    if (r.callId) return r.callId;
    const { callId } = await this.bridge.open({
      requestId: req,
      clientId: r.client,
      attorneyId: st.slice(2),
      state: r.state,
      practiceArea: r.practice,
      answeredAt: Number(r.answeredAt ?? this.now()),
    });
    await this.redis.hset(this.k.request(req), 'callId', callId);
    await this.redis.zadd(
      this.k.callsync,
      this.now() + s['hotline.call_sync_sec'] * 1000,
      req,
    );
    return callId;
  }

  /** The sweeper's sync with the 1:1 calls: a call the phones hung up
   * (`POST /calls/:id/end`) or the calls sweep closed ends the hotline call;
   * a live call whose screens still beat keeps the hotline call alive. */
  async syncCalls(reqs: string[]): Promise<void> {
    if (!this.bridge || reqs.length === 0) return;
    const { s } = await this.cfg();
    const now = this.now();
    const ids = new Map<string, string>();
    for (const req of reqs) {
      const callId = await this.redis.hget(this.k.request(req), 'callId');
      if (callId) ids.set(req, callId);
      else await this.redis.zrem(this.k.callsync, req);
    }
    const states = await this.bridge.states([...ids.values()]);
    for (const [req, callId] of ids) {
      const c = states.get(callId);
      const st = await this.store.requestState(req);
      if (!st?.startsWith('c|')) {
        await this.redis.zrem(this.k.callsync, req);
        continue;
      }
      if (c && !c.live) {
        await this.endCall(
          req,
          callVoiceUp(c) ? 'ended' : 'failed',
          undefined,
          c,
        );
        continue;
      }
      if (c && c.heartbeatAt > now - s['hotline.presence_ttl_sec'] * 1000) {
        await this.touchCall(req, s, now);
      }
      await this.redis.zadd(
        this.k.callsync,
        now + s['hotline.call_sync_sec'] * 1000,
        req,
      );
    }
  }

  /** «Пропустить»: next attorney; the request keeps its original time. */
  async decline(user: RequestUser, req: string) {
    await assertHotlineOn(this.flags);
    this.assertAttorney(user);
    const lw = user.sub;
    const res = await this.store.release(
      req,
      lw,
      'declined',
      this.now() + DAY_SEC * 1000,
    );
    if (res === 'ok') {
      await this.bumpAgg('declined');
      await this.freeLawyer(lw);
      await this.matchRequest(req);
    }
    return { ok: res === 'ok' };
  }

  /** The 10 s are over (sweeper, or a late «Взять»). */
  async offerTimedOut(req: string, lw: string): Promise<void> {
    const { s } = await this.cfg();
    const res = await this.store.release(
      req,
      lw,
      'timeout',
      this.now() + DAY_SEC * 1000,
    );
    if (res !== 'ok') return;
    await this.bumpAgg('timeouts');
    this.realtime.toUsers([lw], 'hotline:offer_ended', {
      requestId: req,
      reason: 'timeout',
    });
    const misses = await this.redis.hincrby(this.k.lawyer(lw), 'misses', 1);
    const max = s['hotline.max_no_answer'];
    if (max > 0 && misses >= max) {
      await this.goOffline(lw, 'missed');
    } else if (s['hotline.no_answer_pause_sec'] > 0) {
      if (await this.store.cas(lw, 'i', 'p')) {
        await this.redis.zadd(
          this.k.pause,
          this.now() + s['hotline.no_answer_pause_sec'] * 1000,
          lw,
        );
      }
    } else {
      await this.freeLawyer(lw);
    }
    await this.matchRequest(req);
  }

  async unpause(lw: string): Promise<void> {
    await this.redis.zrem(this.k.pause, lw);
    if (await this.store.cas(lw, 'p', 'i')) await this.freeLawyer(lw);
  }

  /** The red button (either side) or a lost / over-long call; [fromCall]
   * = the 1:1 call ended first (its state, read by the sync). */
  async endCall(
    req: string,
    reason: string,
    byUser?: string,
    fromCall?: HotlineCallState,
  ) {
    const st = await this.store.requestState(req);
    const r = await this.requestDetail(req);
    if (!r) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    const lw = st?.startsWith('c|') ? st.slice(2) : (r.lawyer ?? '');
    if (byUser && byUser !== r.client && byUser !== lw) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    if (!st?.startsWith('c|')) return { ok: true, seconds: 0 };
    const d = await this.lawyerDetail(lw);
    const { s } = await this.cfg();
    // Wired to the real call (plan PR 4): the voice never came up → a miss
    // like an unanswered offer; `hotline.max_no_answer` in a row → off the
    // line. A real conversation breaks the row.
    const failed = reason === 'failed';
    let missedOut = false;
    if (d && failed) {
      const misses = await this.redis.hincrby(this.k.lawyer(lw), 'misses', 1);
      const max = s['hotline.max_no_answer'];
      missedOut = max > 0 && misses >= max;
    } else if (d) {
      await this.redis.hset(this.k.lawyer(lw), 'misses', '0');
    }
    const next =
      !d || d.leaving === '1'
        ? 'x'
        : d.accepting === '0' || missedOut
          ? 'n'
          : 'i';
    if ((await this.store.endCall(req, lw, next)) !== 'ok') {
      return {
        ok: true,
        seconds: 0,
        ...(this.bridge ? { conversationId: r.conversationId ?? null } : {}),
      };
    }
    const now = this.now();
    const seconds =
      fromCall?.durationSec ??
      Math.max(0, Math.round((now - Number(r.answeredAt ?? now)) / 1000));
    await this.redis.hincrby(this.k.trial(lw), 'seconds', seconds);
    await this.redis.hset(this.k.request(req), {
      status: 'ended',
      endedAt: String(now),
      endReason: reason,
      seconds: String(seconds),
    });
    await this.redis.zrem(this.k.conn, req);
    await this.redis.zrem(`${this.k.p}:connmax`, req);
    await this.redis.zrem(this.k.callsync, req);
    await this.redis.del(this.k.client(r.client));
    await this.bumpAgg('ended');
    await this.bumpAgg('talkSeconds', seconds);
    let conversationId: string | null = null;
    if (this.bridge && r.callId) {
      // the hotline ended it first: the 1:1 call ends too (both screens
      // close on `call:ended`)
      if (!fromCall) {
        await this.bridge.hangUp(
          r.callId,
          byUser ?? r.client,
          failed ? 'failed' : 'hangup',
        );
      }
      ({ conversationId } = await this.bridge.finish({
        requestId: req,
        clientId: r.client,
        attorneyId: lw,
        endedAt: now,
        reason,
        durationSec: seconds,
      }));
      if (conversationId) {
        await this.redis.hset(
          this.k.request(req),
          'conversationId',
          conversationId,
        );
      }
    }
    const raw = await this.settings.all();
    this.realtime.toUsers([r.client, lw], 'hotline:ended', {
      requestId: req,
      seconds,
      reason,
      callId: r.callId ?? null,
      conversationId,
      review: raw['hotline.review_enabled'] !== false,
    });
    if (next === 'i') await this.freeLawyer(lw);
    if (next === 'x') await this.redis.del(this.k.lawyer(lw));
    if (missedOut) await this.goOffline(lw, 'missed');
    return {
      ok: true,
      seconds,
      ...(this.bridge ? { conversationId } : {}),
    };
  }

  // ── client ─────────────────────────────────────────────────────────

  /** POST /hotline/requests — «Связаться с адвокатом». One active request
   * per client (asking again returns it); SMS-verified phone (owner q. 10). */
  async createRequest(
    user: RequestUser,
    input: RequestInput,
  ): Promise<RequestView> {
    await assertHotlineOn(this.flags);
    this.assertClient(user);
    const { s } = await this.cfg();
    const existing = await this.redis.get(this.k.client(user.sub));
    if (existing && (await this.store.requestState(existing))) {
      return this.view(existing, user.sub);
    }
    const langs = this.validLanguages(
      input.languages,
      s['hotline.max_languages'],
    );
    const [practice] = await this.validPractices([input.practiceArea], 1);
    const state = String(input.state ?? '').toUpperCase();
    if (!STATE.test(state) || !(await this.stateCodes()).has(state)) {
      this.bad('unknown_state');
    }
    const topic = String(input.topic ?? '').trim();
    if (!topic) this.bad('topic_required');
    if (topic.length > s['hotline.topic_max_chars']) {
      this.bad('topic_too_long', { max: s['hotline.topic_max_chars'] });
    }
    const limit = s['hotline.client_requests_per_hour'];
    const now = this.now();
    if (limit > 0) {
      const n = await incrWithTtl(
        this.redis,
        this.k.rate(user.sub, Math.floor(now / 3_600_000)),
        3600,
      );
      if (n > limit) {
        throw new HttpException(
          {
            code: ErrorCode.RATE_LIMITED,
            message: 'Too many hotline requests, try again later.',
            details: { reason: 'hotline_requests_per_hour', limit },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const me = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { first_name: true, last_name: true, phone_verified_at: true },
    });
    if (!me?.phone_verified_at) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Confirm your phone number by SMS to call the hotline.',
        details: { reason: 'phone_not_verified' },
      });
    }
    const id = randomUUID();
    const clientName = [me.first_name, me.last_name?.slice(0, 1)]
      .filter(Boolean)
      .join(' ')
      .trim();
    const buckets = langs.map((l) => bucketOf(state, practice, l));
    if (
      !(await this.redis.set(
        this.k.client(user.sub),
        id,
        'EX',
        2 * DAY_SEC,
        'NX',
      ))
    ) {
      // a double tap raced us: the other request wins
      const other = await this.redis.get(this.k.client(user.sub));
      if (other) return this.view(other, user.sub);
    }
    await this.redis.hset(this.k.request(id), {
      client: user.sub,
      clientName,
      state,
      practice,
      langs: langs.join(','),
      buckets: JSON.stringify(buckets),
      topic,
      created: String(now),
      status: 'searching',
    });
    await this.redis.expire(this.k.request(id), 2 * DAY_SEC);
    await this.redis.hset(this.k.rcl, id, user.sub);
    await this.redis.hset(this.k.rst, id, 's');
    await this.redis.zadd(
      this.k.calive,
      now + s['hotline.client_ttl_sec'] * 1000,
      id,
    );
    await this.store.setClientLangs(id, langs, true);
    const sp = pipeline(this.redis);
    for (const b of buckets) sp.sadd(this.k.buckets, b);
    await sp.exec();
    await this.bumpAgg('requests');
    await this.matchRequest(id);
    return this.view(id, user.sub, true);
  }

  private async ownRequest(user: RequestUser, req: string) {
    const r = await this.requestDetail(req);
    if (!r || r.client !== user.sub) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    return r;
  }

  async getRequest(user: RequestUser, req: string): Promise<RequestView> {
    await this.ownRequest(user, req);
    return this.view(req, user.sub);
  }

  /** «Выйти из очереди» / cancel while an attorney is being offered. */
  async cancelRequest(user: RequestUser, req: string): Promise<RequestView> {
    await this.ownRequest(user, req);
    await this.closeRequest(req, 'cancelled');
    return this.view(req, user.sub);
  }

  /** Ends a request that is not a running call (cancel, lost, expired,
   * full, notices exhausted). A running call is ended instead. */
  async closeRequest(req: string, reason: string): Promise<void> {
    const r = await this.requestDetail(req);
    if (!r) return;
    const [kind, who] = await this.store.cancel(req, this.parseList(r.buckets));
    if (kind === 'connected') {
      await this.endCall(req, reason);
      return;
    }
    if (kind === 'gone') return;
    await this.redis.hset(this.k.request(req), {
      status: 'cancelled',
      endReason: reason,
      endedAt: String(this.now()),
    });
    await this.redis.zrem(this.k.calive, req);
    await this.redis.hdel(this.k.nq, req);
    await this.redis.hdel(this.k.natt, req);
    await this.redis.hdel(this.k.rcl, req);
    await this.store.setClientLangs(req, r.langs.split(','), false);
    if ((await this.redis.get(this.k.client(r.client))) === req) {
      await this.redis.del(this.k.client(r.client));
    }
    await this.pushRequest(req);
    if (who) {
      this.realtime.toUsers([who], 'hotline:offer_ended', {
        requestId: req,
        reason: 'cancelled',
      });
      await this.freeLawyer(who);
    }
  }

  /** «Поменять язык» while waiting: same place (original time). */
  async changeLanguages(
    user: RequestUser,
    req: string,
    languages: string[],
  ): Promise<RequestView> {
    await assertHotlineOn(this.flags);
    const r = await this.ownRequest(user, req);
    const { s } = await this.cfg();
    const langs = this.validLanguages(languages, s['hotline.max_languages']);
    const st = await this.store.requestState(req);
    if (st !== 'q' && st !== 's') return this.view(req, user.sub);
    const old = this.parseList(r.buckets);
    const buckets = langs.map((l) => bucketOf(r.state, r.practice, l));
    if (st === 'q') {
      const [kind] = await this.store.cancel(req, old);
      if (kind !== 'cancelled') return this.view(req, user.sub);
      await this.redis.hset(this.k.rst, req, 's');
      await this.redis.hset(this.k.rcl, req, r.client);
    }
    await this.store.setClientLangs(req, r.langs.split(','), false);
    await this.redis.hset(this.k.request(req), {
      langs: langs.join(','),
      buckets: JSON.stringify(buckets),
    });
    await this.store.setClientLangs(req, langs, true);
    await this.matchRequest(req);
    return this.view(req, user.sub);
  }

  /** «Сообщите, когда появится адвокат»: leave, keep the place (offline). */
  async notifyMe(
    user: RequestUser,
    req: string,
    timeZone: string | undefined,
    allowNight: boolean,
  ): Promise<RequestView> {
    await assertHotlineOn(this.flags);
    const r = await this.ownRequest(user, req);
    const { s } = await this.cfg();
    if (!(await this.store.goOffline(req))) return this.view(req, user.sub);
    const max = s['hotline.notify_max_wait_sec'];
    const until = max > 0 ? Number(r.created) + max * 1000 : FAR;
    await this.redis.zadd(this.k.calive, until, req);
    // No night notices (plan PR 5): the night is the client's own — the
    // phone's zone, else the one the app keeps in his account (users.timezone,
    // else his quiet-hours zone). `hotline.notify_quiet_*` say which hours.
    const zone = timeZone ?? (await this.clientTimeZone(user.sub));
    const off = zone ? utcOffsetMinutes(zone, this.now()) : null;
    if (!allowNight && off !== null) {
      await this.redis.hset(
        this.k.nq,
        req,
        `${off},${s['hotline.notify_quiet_start_hour'] * 60},${s['hotline.notify_quiet_end_hour'] * 60}`,
      );
    }
    await this.redis.hset(this.k.request(req), {
      status: 'offline',
      notifyUntil: String(until),
    });
    await this.markDirty(this.parseList(r.buckets), this.now());
    return this.view(req, user.sub);
  }

  /** The client's own time zone from his account (the app sends it at
   * sign-in): users.timezone, else his quiet-hours zone; null = unknown. */
  private async clientTimeZone(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    if (u?.timezone) return u.timezone;
    const qh = await this.prisma.notificationQuietHours?.findUnique({
      where: { user_id: userId },
      select: { timezone: true },
    });
    return qh?.timezone ?? null;
  }

  /** «Позвонить сейчас» (the notice, or the app): ONLINE again with the
   * ORIGINAL time — before newer live callers; the next free attorney.
   * From the notice the app echoes its [token]: a token that is not this
   * request's notice is refused (a late tap on the right notice is fine —
   * the place is kept). */
  async claim(
    user: RequestUser,
    req: string,
    token?: string,
  ): Promise<RequestView> {
    await assertHotlineOn(this.flags);
    const r = await this.ownRequest(user, req);
    if (token !== undefined && token !== r.notifyToken) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'This notice is not for this hotline request.',
        details: { reason: 'claim_token' },
      });
    }
    const { s } = await this.cfg();
    if (await this.store.claim(req)) {
      await this.redis.zadd(
        this.k.calive,
        this.now() + s['hotline.client_ttl_sec'] * 1000,
        req,
      );
      await this.redis.hdel(this.k.nq, req);
      await this.redis.hset(this.k.request(req), 'status', 'searching');
      await this.matchRequest(req);
    }
    return this.view(req, user.sub);
  }

  /** A notice for an offline subscriber (sweeper). */
  async notify(req: string, claimSec: number): Promise<void> {
    const r = await this.requestDetail(req);
    if (!r) return;
    const token = randomUUID();
    const expiresAt = this.now() + claimSec * 1000;
    await this.redis.hset(this.k.request(req), {
      notifyToken: token,
      notifyExpires: String(expiresAt),
    });
    await this.bumpAgg('notices');
    await this.notifier.lawyerAvailable({
      userId: r.client,
      requestId: req,
      token,
      expiresAt,
    });
  }

  /** The client's status after a change (the app also polls with ETag). */
  private async pushRequest(req: string): Promise<void> {
    const r = await this.requestDetail(req);
    if (!r) return;
    this.realtime.toUsers(
      [r.client],
      'hotline:request',
      await this.view(req, r.client),
    );
  }

  async view(
    req: string,
    clientId: string,
    ackDisclosure = false,
  ): Promise<RequestView> {
    const r = await this.requestDetail(req);
    if (!r) throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    const st = await this.store.requestState(req);
    const offline = st === 'q' && (await this.store.isOffline(req));
    const status: RequestStatus = !st
      ? r.status === 'ended'
        ? 'ended'
        : 'cancelled'
      : st.startsWith('c|')
        ? 'connected'
        : offline
          ? 'offline'
          : st === 'q'
            ? 'queued'
            : 'searching';
    let pos: string | null = null;
    let wait: string | null = null;
    if (status === 'queued' || status === 'offline') {
      const ranks: number[] = [];
      let lawyers = 0;
      for (const b of this.parseList(r.buckets)) {
        const rank = await this.store.queueRank(b, req);
        if (rank !== null) ranks.push(rank);
        lawyers += await this.redis.scard(this.k.bucketLawyers(b));
      }
      if (ranks.length) {
        const best = Math.min(...ranks);
        pos = positionBand(best);
        const avgSec = await this.avgTalkSeconds();
        wait = waitBand(((best + 1) * avgSec) / 60 / Math.max(1, lawyers));
      }
    }
    let lawyer: RequestView['lawyer'] = null;
    if (status === 'connected') {
      const lw = st!.slice(2);
      const d = await this.lawyerDetail(lw);
      const bars = d?.bars
        ? (JSON.parse(d.bars) as Record<string, string>)
        : {};
      lawyer = {
        id: lw,
        name: d?.name ?? '',
        state: r.state,
        barNumber: bars[r.state] ?? null,
      };
    }
    return {
      id: req,
      status,
      positionBand: pos,
      waitBand: wait,
      endReason: r.endReason ?? null,
      lawyer,
      notifyUntil: r.notifyUntil ? Number(r.notifyUntil) : null,
      callId: status === 'connected' ? (r.callId ?? null) : null,
      conversationId: r.conversationId ?? null,
      disclosure:
        status === 'searching' || status === 'queued'
          ? await this.disclosure(clientId, 'client', ackDisclosure)
          : null,
    };
  }

  /** A version tag of the client's view (ETag of GET /hotline/requests/:id). */
  async requestTag(user: RequestUser, req: string): Promise<string | null> {
    const r = await this.requestDetail(req);
    if (!r || r.client !== user.sub) return null;
    const v = await this.view(req, user.sub);
    return [
      v.status,
      v.positionBand,
      v.waitBand,
      v.lawyer?.id,
      v.endReason,
      v.callId,
      v.conversationId,
    ].join('.');
  }

  private async avgTalkSeconds(): Promise<number> {
    const a = await this.redis.hgetall(
      this.k.agg(this.hour(this.now() - 3_600_000)),
    );
    const ended = Number(a.ended ?? 0);
    return ended > 0 ? Number(a.talkSeconds ?? 0) / ended : 300;
  }

  // ── counters (Valkey only, banded) ────────────────────────────────

  /** `b:<bucket>` or `l:<lang>` → banded {lawyers, clients}. */
  async counters(
    keys: string[],
  ): Promise<Record<string, { lawyers: string; clients: string }>> {
    const { raw } = await this.cfg();
    const bands = hotlineCounterBandsFrom(raw);
    const clean = [...new Set(keys)]
      .filter((x) => /^[bl]:[A-Za-z0-9_.~-]{1,200}$/.test(x))
      .slice(0, 20);
    if (clean.length === 0) return {};
    const p = pipeline(this.redis);
    for (const key of clean) {
      const id = key.slice(2);
      if (key.startsWith('b:')) {
        p.scard(this.k.bucketLawyers(id));
        p.zcard(this.k.queue(id));
      } else {
        p.scard(this.k.langLawyers(id));
        p.scard(this.k.langClients(id));
      }
    }
    const res = (await p.exec()) ?? [];
    const out: Record<string, { lawyers: string; clients: string }> = {};
    clean.forEach((key, i) => {
      out[key] = {
        lawyers: bandOf(Number(res[2 * i]?.[1] ?? 0), bands),
        clients: bandOf(Number(res[2 * i + 1]?.[1] ?? 0), bands),
      };
    });
    return out;
  }

  // ── bookkeeping ────────────────────────────────────────────────────

  /** The service clock (tests pass their own). */
  nowMs(): number {
    return this.now();
  }

  hour(at: number): string {
    return new Date(at).toISOString().slice(0, 13);
  }

  async bumpAgg(field: string, by = 1): Promise<void> {
    const k = this.k.agg(this.hour(this.now()));
    await this.redis.hincrby(k, field, by);
    await this.redis.expire(k, 3 * DAY_SEC);
  }

  parseList(json: string | undefined | null): string[] {
    if (!json) return [];
    try {
      const v = JSON.parse(json) as unknown;
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }

  async lawyerDetail(lw: string): Promise<Record<string, string> | null> {
    const d = await this.redis.hgetall(this.k.lawyer(lw));
    return d && Object.keys(d).length ? d : null;
  }

  async requestDetail(req: string): Promise<Record<string, string> | null> {
    const d = await this.redis.hgetall(this.k.request(req));
    return d && Object.keys(d).length ? d : null;
  }

  async lineView(lw: string, via: LineView['via']): Promise<LineView> {
    const { s } = await this.cfg();
    const d = await this.lawyerDetail(lw);
    const st = await this.store.lawyerState(lw);
    const alive = Number((await this.redis.zscore(this.k.alive, lw)) ?? 0);
    const online = !!st && alive > this.now() && d?.leaving !== '1';
    const state: LineView['state'] = !online
      ? 'off'
      : st === 'i'
        ? 'idle'
        : st === 'n'
          ? 'not_accepting'
          : st === 'p'
            ? 'paused'
            : st.startsWith('o|')
              ? 'offered'
              : 'busy';
    return {
      online,
      state,
      accepting: d?.accepting !== '0',
      states: d?.states ? d.states.split(',') : [],
      practiceAreas: d?.practices ? d.practices.split(',') : [],
      languages: d?.langs ? d.langs.split(',') : [],
      heartbeatSec: s['hotline.heartbeat_sec'],
      offerTimeoutSec: s['hotline.offer_timeout_sec'],
      via,
    };
  }
}
