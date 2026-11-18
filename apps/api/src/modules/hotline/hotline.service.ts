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
import { CALL_END_SILENT } from '../../common/calls/ongoing-call';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  bandOf,
  hotlineBandsFrom,
  hotlineCounterBandsFrom,
  hotlineModeFrom,
  hotlineSettingsFrom,
  minutesBand,
  placeBand,
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
import { STATE_TIMEZONES } from '../outreach/state-timezones';
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
import {
  bucketOf,
  callbackBucket,
  HotlineKeys,
  HotlineStore,
} from './hotline.store';
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
/** Line-off reasons after which the attorney's choice is kept for
 * `POST /hotline/line/resume` (audit 17.11 #3): the network, not him. */
const RESUMABLE = new Set(['disconnected', 'lost']);
/** How long a second «Взять» waits for the first one's call, ms. */
const CALL_LOCK_MS = 10_000;
const CALL_WAIT_STEP_MS = 25;
/** The widest US night (audit 17.11 #7): an unknown zone is read on the
 * Eastern clock with the window stretched to Hawaii's morning (+6 h), so
 * a notice never lands at night anywhere in the 50 states. */
const UNKNOWN_ZONE = 'America/New_York';
const UNKNOWN_ZONE_STRETCH_MIN = 6 * 60;
const UNLOCK_LUA =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0";
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

/** The client's rough place: bands, never exact (`hotline.position_bands`). */
export function positionBand(
  rank0: number,
  ends: readonly number[] = [1, 5, 20],
): string {
  return placeBand(rank0, ends);
}

/** The rough wait (`hotline.wait_band_minutes`). */
export function waitBand(
  minutes: number,
  ends: readonly number[] = [5, 15, 30],
): string {
  return minutesBand(minutes, ends);
}

/** `beatAt = max(beatAt, ARGV[1])` in one step, only on a live request
 * hash (verify 17.11 H4). Single key: safe on Redis Cluster. */
const RAISE_BEAT_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local prev = tonumber(redis.call('HGET', KEYS[1], 'beatAt') or '0') or 0
if tonumber(ARGV[1]) > prev then
  redis.call('HSET', KEYS[1], 'beatAt', ARGV[1])
  return 1
end
return 0
`;

/** How long one request's / attorney's keys live: the admin's
 * `hotline.key_ttl_hours`, never shorter than the waits they serve. */
export function hotlineKeyTtlSec(s: HotlineSettings): number {
  return Math.max(
    s['hotline.key_ttl_hours'] * 3600,
    s['hotline.queue_max_wait_sec'] + 3600,
    s['hotline.notify_max_wait_sec'] + 3600,
  );
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
      disclosure: await this.disclosure(user.sub, role),
    };
  }

  /** The one-time disclosure for this person and role. It counts as seen
   * only after the person tapped «Понятно» (`ackDisclosure`, audit 17.11
   * #11) — a lost answer or an offer never opened shows it again. */
  async disclosure(
    userId: string,
    role: HotlineRole,
  ): Promise<HotlineDisclosure> {
    const { s, raw } = await this.cfg();
    const version = s['hotline.disclosure_version'];
    const seen =
      (await this.redis.hexists(
        this.k.ack(userId),
        ackField(userId, role, version),
      )) === 1;
    return disclosureFor(
      role,
      seen,
      version,
      raw['hotline.short_notice_enabled'] === true,
    );
  }

  /** POST /hotline/disclosure/ack — the person tapped «Понятно» under the
   * disclosure of this text version (idempotent). */
  async ackDisclosure(
    user: RequestUser,
    version?: number,
  ): Promise<HotlineDisclosure> {
    const role: HotlineRole = user.role === 'attorney' ? 'attorney' : 'client';
    const { s } = await this.cfg();
    const current = s['hotline.disclosure_version'];
    // an older text's «Понятно» (the app had a stale config) is not this one
    if (version === undefined || version === current) {
      const key = this.k.ack(user.sub);
      await this.redis.hset(
        key,
        ackField(user.sub, role, current),
        String(this.now()),
      );
      await this.redis.expire(key, s['hotline.ack_ttl_days'] * DAY_SEC);
    }
    return this.disclosure(user.sub, role);
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
    // his own queue: a client's «Перезвонить» reaches only him (audit #6)
    buckets.push(callbackBucket(lw));
    const via = await this.access(lw, s, raw);
    const now = this.now();
    const ttl = hotlineKeyTtlSec(s);
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
    await this.redis.expire(dk, ttl);
    await this.redis.hsetnx(this.k.trial(lw), 'first', String(now));
    await this.redis.expire(
      this.k.trial(lw),
      s['hotline.trial_memory_days'] * DAY_SEC,
    );
    await this.redis.del(this.k.saved(lw));
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
    const decision = await this.accessDecision(lw, s, raw);
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'The hotline is not part of your plan.',
        details: { entitlement: HOTLINE_ENTITLEMENT, reason: decision.reason },
      });
    }
    return decision.via;
  }

  private async accessDecision(
    lw: string,
    s: HotlineSettings,
    raw: Readonly<Record<string, unknown>>,
  ) {
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
    return decision;
  }

  /** Audit 17.11 #4 (TaskRouter re-checks a worker's attributes at every
   * reservation): is the attorney on the line still allowed there — the
   * switch, the mode, his plan / add-on / trial, the licences of his
   * states? Not allowed → off the line with the reason. Called after each
   * call and every `hotline.access_check_beats` heartbeats. */
  async recheckAccess(lw: string): Promise<boolean> {
    const d = await this.lawyerDetail(lw);
    if (!d) return true;
    let reason: string | null = null;
    if (!(await this.enabled())) reason = 'switched_off';
    if (!reason) {
      const { s, raw } = await this.cfg();
      const decision = await this.accessDecision(lw, s, raw);
      if (!decision.allowed) reason = decision.reason;
    }
    if (!reason) {
      const states = d.states ? d.states.split(',') : [];
      const licences = await this.prisma.attorneyLicense.findMany({
        where: { attorney_id: lw, license_status: 'verified' },
        select: { state_code: true },
      });
      const ok = new Set(licences.map((l) => l.state_code));
      if (states.some((st) => !ok.has(st))) reason = 'licence';
    }
    if (!reason) return true;
    await this.goOffline(lw, 'access', reason);
    return false;
  }

  /** DELETE /hotline/line, `hotline:away`, missed offers, lost access: off
   * the line AT ONCE (owner 16.11 ~18:20). A lost heartbeat (`lost`) keeps
   * his choice for `POST /hotline/line/resume` (audit 17.11 #3). */
  async goOffline(lw: string, reason: string, detail?: string): Promise<void> {
    const [kind, req] = await this.store.lawyerOff(lw);
    await this.redis.del(this.k.lineSocks(lw));
    const d = await this.lawyerDetail(lw);
    const { s } = await this.cfg();
    const keep = s['hotline.line_resume_sec'];
    if (d && RESUMABLE.has(reason) && keep > 0) {
      await this.redis.hset(this.k.saved(lw), {
        states: d.states ?? '',
        practices: d.practices ?? '',
        langs: d.langs ?? '',
        accepting: d.accepting ?? '1',
        reason,
        at: String(this.now()),
      });
      await this.redis.expire(this.k.saved(lw), keep);
    } else if (!RESUMABLE.has(reason)) {
      await this.redis.del(this.k.saved(lw));
    }
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
    this.realtime.toUsers([lw], 'hotline:line', {
      online: false,
      reason,
      ...(detail ? { detail } : {}),
      resumable: RESUMABLE.has(reason) && keep > 0,
    });
  }

  /** POST /hotline/line/resume (socket `hotline:resume`) — the app, after it
   * reconnected while the hotline screen is still open, puts the attorney
   * back with the choice he had (audit 17.11 #3). The same checks as
   * «Ожидать звонки» (licences, access). Already on the line = a heartbeat;
   * nothing kept (he switched off, or too long ago) = `online: false`. */
  async resumeLine(user: RequestUser, socketId?: string): Promise<LineView> {
    await assertHotlineOn(this.flags);
    this.assertAttorney(user);
    const lw = user.sub;
    const d = await this.lawyerDetail(lw);
    const alive = await this.redis.zscore(this.k.alive, lw);
    if (d && d.leaving !== '1' && alive !== null) {
      await this.heartbeat(lw, socketId);
      return this.lineView(lw, null);
    }
    const saved = await this.redis.hgetall(this.k.saved(lw));
    const source = d?.leaving === '1' ? d : saved;
    if (!source?.states || !source.practices || !source.langs) {
      return this.lineView(lw, null);
    }
    const view = await this.goOnline(user, {
      states: source.states.split(','),
      practiceAreas: source.practices.split(','),
      languages: source.langs.split(','),
      accepting: source.accepting !== '0',
    });
    if (socketId) await this.redis.hset(this.k.lawyer(lw), 'sock', socketId);
    return view;
  }

  async goOfflineByUser(user: RequestUser): Promise<LineView> {
    this.assertAttorney(user);
    await this.goOffline(user.sub, 'off');
    await this.redis.del(this.k.saved(user.sub));
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
  ): Promise<{
    line: boolean | null;
    requestId: string | null;
    resumable?: boolean;
  }> {
    const { s } = await this.cfg();
    const now = this.now();
    let line: boolean | null = null;
    let resumable: boolean | undefined;
    if (await this.lawyerDetail(userId)) {
      line = await this.store.touchLawyer(
        userId,
        now + s['hotline.presence_ttl_sec'] * 1000,
      );
      if (socketId) {
        await this.redis.hset(this.k.lawyer(userId), 'sock', socketId);
        if (line) {
          const ttlMs = s['hotline.presence_ttl_sec'] * 1000;
          await this.redis.zadd(
            this.k.lineSocks(userId),
            now + ttlMs,
            socketId,
          );
          await this.redis.pexpire(this.k.lineSocks(userId), 2 * ttlMs);
        }
      }
      const st = await this.store.lawyerState(userId);
      if (st?.startsWith('b|')) await this.touchCall(st.slice(2), s, now);
      const every = s['hotline.access_check_beats'];
      if (line && every > 0) {
        const beats = await this.redis.hincrby(
          this.k.lawyer(userId),
          'beats',
          1,
        );
        if (beats % every === 0 && !(await this.recheckAccess(userId))) {
          line = false;
        }
      }
    } else if ((await this.redis.exists(this.k.saved(userId))) === 1) {
      // off the line by the network: the app may call POST /hotline/line/resume
      line = false;
      resumable = true;
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
    return {
      line,
      requestId: req,
      ...(resumable ? { resumable } : {}),
    };
  }

  /** A sign of life of a connected call; `beatAt` is where a LOST call ends
   * for billing (audit 17.11 #2), not when the sweeper noticed. */
  private async touchCall(
    req: string,
    s: HotlineSettings,
    now: number,
    beatAt = now,
  ) {
    await this.redis.zadd(
      this.k.conn,
      'XX',
      now + s['hotline.presence_ttl_sec'] * 1000,
      req,
    );
    if ((await this.redis.zscore(this.k.conn, req)) !== null) {
      await this.raiseBeat(req, beatAt);
      // Verify 17.11 H6: a busy attorney stays alive while his call does
      // (a long call must not drop him as «lost» between his own beats).
      const st = await this.store.requestState(req);
      if (st?.startsWith('c|')) {
        await this.redis.zadd(
          this.k.alive,
          'XX',
          'GT',
          now + s['hotline.presence_ttl_sec'] * 1000,
          st.slice(2),
        );
      }
    }
  }

  /** Verify 17.11 H4: one atomic max-set (two beats racing could lower
   * it with get-then-set); never recreates an expired request hash. */
  private async raiseBeat(req: string, at: number): Promise<void> {
    await this.redis.eval(RAISE_BEAT_LUA, 1, this.k.request(req), String(at));
  }

  /** The request hash expired under a connected call (verify 17.11 H1):
   * drop its sweep entries and state, free the attorney. */
  private async dropExpiredCall(req: string, lw: string): Promise<void> {
    await this.redis.zrem(this.k.conn, req);
    await this.redis.zrem(`${this.k.p}:connmax`, req);
    await this.redis.zrem(this.k.callsync, req);
    if (!lw) {
      await this.redis.hdel(this.k.rst, req);
      return;
    }
    const d = await this.lawyerDetail(lw);
    const next =
      !d || d.leaving === '1' ? 'x' : d.accepting === '0' ? 'n' : 'i';
    if ((await this.store.endCall(req, lw, next)) !== 'ok') return;
    if (next === 'x') await this.redis.del(this.k.lawyer(lw));
    else if (next === 'i' && (await this.recheckAccess(lw))) {
      await this.freeLawyer(lw);
    }
  }

  /** The attorney's line socket closed (network change, app killed, a
   * deploy closing every socket): NOT off at once (audit 17.11 #3, Uber
   * keeps a driver through a short network loss) — he has
   * `hotline.presence_ttl_sec` from now to come back on any socket (a new
   * socket's heartbeat, or `POST /hotline/line/resume`). Off at once only by
   * `hotline:away` (left the section) and «Выключить линию». */
  async lineSocketClosed(userId: string, socketId: string): Promise<void> {
    await this.redis.zrem(this.k.lineSocks(userId), socketId);
    const d = await this.lawyerDetail(userId);
    if (!d || d.sock !== socketId) return;
    const { s } = await this.cfg();
    await this.redis.hdel(this.k.lawyer(userId), 'sock');
    await this.redis.zadd(
      this.k.alive,
      'XX',
      'GT',
      this.now() + s['hotline.presence_ttl_sec'] * 1000,
      userId,
    );
  }

  /** `hotline:away` from one socket (the app went to the background / left
   * the section): off the line at once — unless another device of his still
   * holds a live line socket (verify 17.11 H5). True when he went off. */
  async lineAway(userId: string, socketId: string): Promise<boolean> {
    const key = this.k.lineSocks(userId);
    await this.redis.zrem(key, socketId);
    await this.redis.zremrangebyscore(key, '-inf', this.now());
    if ((await this.redis.zcard(key)) > 0) return false;
    await this.goOffline(userId, 'away');
    return true;
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
        s['hotline.conflict_cases_max'],
      )
    ) {
      const rqdExpiry = this.now() + s['hotline.skip_memory_sec'] * 1000;
      if ((await this.store.release(req, lw, 'conflict', rqdExpiry)) === 'ok') {
        await this.freeLawyer(lw, depth + 1);
        await this.matchRequest(req, depth + 1);
      }
      return;
    }
    await this.bumpAgg('offers');
    const waiting = await this.waitingFor(d);
    const { raw } = await this.cfg();
    this.realtime.toUsers([lw], 'hotline:offer', {
      requestId: req,
      topic: r.topic,
      state: r.state,
      practiceArea: r.practice,
      languages: r.langs.split(','),
      clientName: r.clientName,
      waitingMore: bandOf(
        waiting,
        hotlineBandsFrom(raw, 'hotline.waiting_more_bands'),
      ),
      expiresAt: this.now() + s['hotline.offer_timeout_sec'] * 1000,
      disclosure: await this.disclosure(lw, 'attorney'),
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
        beatAt: String(now),
      });
      // Verify 17.11 H1: the request / client keys were given their TTL at
      // creation; a call answered late in it must not lose them mid-call.
      const ttl = hotlineKeyTtlSec(s);
      await this.redis.expire(this.k.request(req), ttl);
      const client = await this.redis.hget(this.k.request(req), 'client');
      if (client) await this.redis.expire(this.k.client(client), ttl);
      await this.redis.zrem(this.k.calive, req);
      await this.redis.zrem(this.k.qwait, req);
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
    // Audit 17.11 #5: two «Взять» in the same instant — one opens the call,
    // the other waits for its id (the lock lives at most CALL_LOCK_MS).
    const token = randomUUID();
    const lockKey = this.k.callLock(req);
    if (
      (await this.redis.set(lockKey, token, 'PX', CALL_LOCK_MS, 'NX')) !== 'OK'
    ) {
      const until = Date.now() + CALL_LOCK_MS;
      while (Date.now() < until) {
        await new Promise((ok) => setTimeout(ok, CALL_WAIT_STEP_MS));
        const id = await this.redis.hget(this.k.request(req), 'callId');
        if (id) return id;
        if ((await this.redis.exists(lockKey)) === 0) break;
      }
      return this.redis.hget(this.k.request(req), 'callId');
    }
    try {
      const again = await this.redis.hget(this.k.request(req), 'callId');
      if (again) return again;
      return await this.openCall(req, r, st, s);
    } finally {
      await this.redis.eval(UNLOCK_LUA, 1, lockKey, token);
    }
  }

  private async openCall(
    req: string,
    r: Record<string, string>,
    st: string,
    s: HotlineSettings,
  ): Promise<string> {
    const { callId } = await this.bridge!.open({
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
  async syncCalls(reqs: string[], afterOff = false): Promise<void> {
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
          afterOff,
        );
        continue;
      }
      if (c && c.heartbeatAt > now - s['hotline.presence_ttl_sec'] * 1000) {
        await this.touchCall(req, s, now, c.heartbeatAt);
      } else if (c) {
        // the call screens' last sign of life also bounds a lost call
        await this.raiseBeat(req, c.heartbeatAt);
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
    const { s } = await this.cfg();
    const res = await this.store.release(
      req,
      lw,
      'declined',
      this.now() + s['hotline.skip_memory_sec'] * 1000,
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
      this.now() + s['hotline.skip_memory_sec'] * 1000,
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
    /** The hotline heard no beats meanwhile (its switch was off): the 1:1
     * call's own seconds are the only measure. */
    trustCallSeconds = false,
  ) {
    const st = await this.store.requestState(req);
    const r = await this.requestDetail(req);
    if (!r) {
      // Verify 17.11 H1: the request hash expired under a running call.
      // Clean what still points at it (else the sweeper meets it first on
      // every tick forever) and free the attorney.
      const gone = st?.startsWith('c|') ? st.slice(2) : '';
      if (byUser && byUser !== gone) {
        throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
      }
      await this.dropExpiredCall(req, gone);
      return { ok: true, seconds: 0 };
    }
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
    const max = s['hotline.max_no_answer'];
    // Verify 17.11 H3: the miss is COUNTED only by the one caller that wins
    // the atomic end below (two racing ends counted one failed call twice);
    // here it is only foreseen, to pick his next state.
    const willMissOut =
      !!d && failed && max > 0 && Number(d.misses ?? 0) + 1 >= max;
    const next =
      !d || d.leaving === '1'
        ? 'x'
        : d.accepting === '0' || willMissOut
          ? 'n'
          : 'i';
    if ((await this.store.endCall(req, lw, next)) !== 'ok') {
      return {
        ok: true,
        seconds: 0,
        ...(this.bridge ? { conversationId: r.conversationId ?? null } : {}),
      };
    }
    let missedOut = false;
    if (d && failed) {
      const misses = await this.redis.hincrby(this.k.lawyer(lw), 'misses', 1);
      missedOut = max > 0 && misses >= max;
    } else if (d) {
      await this.redis.hset(this.k.lawyer(lw), 'misses', '0');
    }
    const now = this.now();
    const answeredAt = Number(r.answeredAt ?? now);
    // Audit 17.11 #2: a LOST call ends at its last sign of life (a
    // heartbeat of either side or of the call screens), not when the sweeper
    // noticed (+ the whole presence window, or + the hours the switch was
    // off); a time-limited one at the limit.
    let endAt = now;
    if (reason === 'lost') {
      endAt = Math.min(now, Number(r.beatAt ?? answeredAt));
    } else if (reason === 'time_limit' && s['hotline.call_max_minutes'] > 0) {
      endAt = Math.min(
        now,
        answeredAt + s['hotline.call_max_minutes'] * 60_000,
      );
    }
    // Verify 17.11 H2: when the 1:1 call ended because its link died
    // (`link_lost`, or the calls sweep closing it for silence), its own
    // seconds include the dead air: bill no further than the last sign of
    // life. A hang-up is billed in full (fix 17.11, #1235: beats come every
    // few seconds, so capping a hang-up at the last beat under-billed it),
    // and nothing when the voice never came up.
    const beatSec = Math.max(
      0,
      Math.round((Number(r.beatAt ?? answeredAt) - answeredAt) / 1000),
    );
    const seconds = fromCall
      ? !callVoiceUp(fromCall)
        ? 0
        : fromCall.durationSec == null
          ? beatSec
          : trustCallSeconds
            ? Math.max(0, fromCall.durationSec)
            : fromCall.endReason === 'link_lost' ||
                fromCall.endReason === CALL_END_SILENT
              ? Math.max(0, Math.min(fromCall.durationSec, beatSec))
              : Math.max(0, fromCall.durationSec)
      : Math.max(0, Math.round((endAt - answeredAt) / 1000));
    await this.redis.hincrby(this.k.trial(lw), 'seconds', seconds);
    await this.redis.expire(
      this.k.trial(lw),
      s['hotline.trial_memory_days'] * DAY_SEC,
    );
    await this.redis.hset(this.k.request(req), {
      status: 'ended',
      endedAt: String(endAt),
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
        endedAt: endAt,
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
    if (next === 'x') await this.redis.del(this.k.lawyer(lw));
    if (missedOut) await this.goOffline(lw, 'missed');
    // Audit 17.11 #4: after every call — is he still allowed on the line?
    else if (next !== 'x' && (await this.recheckAccess(lw)) && next === 'i') {
      await this.freeLawyer(lw);
    }
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
    return this.openRequest(user, s, {
      state,
      practice,
      langs,
      topic: input.topic,
      buckets: langs.map((l) => bucketOf(state, practice, l)),
      callbackOf: null,
    });
  }

  /** Audit 17.11 #6 — POST /hotline/call-back: the CLIENT calls the same
   * attorney again after a hotline call (Uber / Lyft: after the ride only
   * the rider reaches the driver, through the app, for a while; the driver
   * never gets the rider's number). It is an ordinary hotline request whose
   * only queue is that attorney's private one (`cb~<attorney>`, every
   * attorney on the line is in his own): he gets the usual offer with
   * «Взять» / «Пропустить» while on the line; until then the client waits
   * in that queue like any other («Сообщите мне» works too). The attorney
   * has no way to start a call to the client. */
  async callBack(
    user: RequestUser,
    input: { attorneyId: string; languages: string[]; topic: string },
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
    const hours = s['hotline.callback_window_hours'];
    const last = await this.prisma.hotlineCall.findFirst({
      where: {
        client_id: user.sub,
        attorney_id: String(input.attorneyId ?? ''),
        ended_at:
          hours > 0
            ? { gte: new Date(this.now() - hours * 3_600_000) }
            : { not: null },
      },
      orderBy: { ended_at: 'desc' },
      select: { state_code: true, practice_area: true },
    });
    if (!last) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You can call back only an attorney you talked to recently.',
        details: { reason: 'no_recent_hotline_call', hours },
      });
    }
    return this.openRequest(user, s, {
      state: last.state_code,
      practice: last.practice_area,
      langs,
      topic: input.topic,
      buckets: [callbackBucket(input.attorneyId)],
      callbackOf: input.attorneyId,
    });
  }

  private async openRequest(
    user: RequestUser,
    s: HotlineSettings,
    o: {
      state: string;
      practice: string;
      langs: string[];
      topic: string;
      buckets: string[];
      callbackOf: string | null;
    },
  ): Promise<RequestView> {
    const { state, practice, langs, buckets } = o;
    const topic = String(o.topic ?? '').trim();
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
    const ttl = hotlineKeyTtlSec(s);
    if (!(await this.redis.set(this.k.client(user.sub), id, 'EX', ttl, 'NX'))) {
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
      ...(o.callbackOf ? { callbackOf: o.callbackOf } : {}),
    });
    await this.redis.expire(this.k.request(id), ttl);
    await this.redis.hset(this.k.rcl, id, user.sub);
    await this.redis.hset(this.k.rst, id, 's');
    await this.redis.zadd(
      this.k.calive,
      now + s['hotline.client_ttl_sec'] * 1000,
      id,
    );
    await this.redis.zadd(this.k.qwait, now, id);
    await this.store.setClientLangs(id, langs, true);
    const sp = pipeline(this.redis);
    for (const b of buckets) {
      if (!b.startsWith('cb~')) sp.sadd(this.k.buckets, b);
    }
    await sp.exec();
    await this.bumpAgg('requests');
    await this.matchRequest(id);
    return this.view(id, user.sub);
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
    await this.redis.zrem(this.k.qwait, req);
    await this.redis.del(this.k.tokens(req));
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
    await this.redis.zrem(this.k.qwait, req);
    const max = s['hotline.notify_max_wait_sec'];
    // «0 — без предела» lives as long as the request's keys do (they expire
    // after `hotline.key_ttl_hours`; closed a minute before, never orphaned)
    const bound = Number(r.created) + (hotlineKeyTtlSec(s) - 60) * 1000;
    const until =
      max > 0 ? Number(r.created) + max * 1000 : Math.min(FAR, bound);
    await this.redis.zadd(this.k.calive, until, req);
    // No night notices (plan PR 5): the night is the client's own — the
    // phone's zone, else the one in his account; unknown (audit 17.11 #7) =
    // the zone of the request's state; nothing at all = the widest US night.
    if (!allowNight) {
      const start = s['hotline.notify_quiet_start_hour'] * 60;
      const end = s['hotline.notify_quiet_end_hour'] * 60;
      let off = this.offsetOf(timeZone);
      off ??= this.offsetOf(await this.clientTimeZone(user.sub));
      off ??= this.offsetOf(STATE_TIMEZONES[r.state]);
      const window =
        off !== null
          ? `${off},${start},${end}`
          : `${this.offsetOf(UNKNOWN_ZONE) ?? -300},${start},${
              start === end ? end : (end + UNKNOWN_ZONE_STRETCH_MIN) % 1440
            }`;
      await this.redis.hset(this.k.nq, req, window);
    }
    await this.redis.hset(this.k.request(req), {
      status: 'offline',
      notifyUntil: String(until),
    });
    await this.markDirty(this.parseList(r.buckets), this.now());
    return this.view(req, user.sub);
  }

  private offsetOf(zone: string | null | undefined): number | null {
    return zone ? utcOffsetMinutes(zone, this.now()) : null;
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
    // any notice of THIS request works, an older one too (audit 17.11 #10)
    if (
      token !== undefined &&
      token !== r.notifyToken &&
      (await this.redis.sismember(this.k.tokens(req), token)) !== 1
    ) {
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
      await this.redis.zadd(this.k.qwait, this.now(), req);
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
    const { s } = await this.cfg();
    await this.redis.sadd(this.k.tokens(req), token);
    await this.redis.expire(this.k.tokens(req), hotlineKeyTtlSec(s));
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

  async view(req: string, clientId: string): Promise<RequestView> {
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
      ({ pos, wait } = await this.bands(req, this.parseList(r.buckets)));
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
          ? await this.disclosure(clientId, 'client')
          : null,
    };
  }

  /** The rough place and wait of a waiting request (one pipeline). */
  private async bands(
    req: string,
    buckets: string[],
  ): Promise<{ pos: string | null; wait: string | null }> {
    if (buckets.length === 0) return { pos: null, wait: null };
    const p = pipeline(this.redis);
    for (const b of buckets) {
      p.zrank(this.k.queue(b), req);
      p.scard(this.k.bucketLawyers(b));
    }
    const res = (await p.exec()) ?? [];
    const ranks: number[] = [];
    let lawyers = 0;
    buckets.forEach((_, i) => {
      const rank = res[2 * i]?.[1];
      if (rank !== null && rank !== undefined) ranks.push(Number(rank));
      lawyers += Number(res[2 * i + 1]?.[1] ?? 0);
    });
    if (ranks.length === 0) return { pos: null, wait: null };
    const { raw } = await this.cfg();
    const best = Math.min(...ranks);
    const avgSec = await this.avgTalkSeconds();
    return {
      pos: positionBand(best, hotlineBandsFrom(raw, 'hotline.position_bands')),
      wait: waitBand(
        ((best + 1) * avgSec) / 60 / Math.max(1, lawyers),
        hotlineBandsFrom(raw, 'hotline.wait_band_minutes'),
      ),
    };
  }

  /** A version tag of the client's view (ETag of GET /hotline/requests/:id).
   * Audit 17.11 (P12): the 304 path no longer builds the whole view — one
   * pipeline of the fields the view is made of, plus the place / wait only
   * while waiting; the disclosure is in the tag as «seen or not». */
  async requestTag(user: RequestUser, req: string): Promise<string | null> {
    const { s } = await this.cfg();
    const p = pipeline(this.redis);
    p.hmget(
      this.k.request(req),
      'client',
      'status',
      'endReason',
      'callId',
      'conversationId',
      'buckets',
    );
    p.hget(this.k.rst, req);
    p.sismember(this.k.off, req);
    p.hexists(
      this.k.ack(user.sub),
      ackField(user.sub, 'client', s['hotline.disclosure_version']),
    );
    const res = (await p.exec()) ?? [];
    const [client, status, endReason, callId, conversationId, buckets] =
      (res[0]?.[1] as (string | null)[] | undefined) ?? [];
    if (!client || client !== user.sub) return null;
    const st = (res[1]?.[1] as string | null) ?? '';
    const offline = Number(res[2]?.[1] ?? 0) === 1;
    let pos: string | null = null;
    let wait: string | null = null;
    if (st === 'q')
      ({ pos, wait } = await this.bands(req, this.parseList(buckets)));
    return [
      st || status,
      offline ? 'off' : 'on',
      pos,
      wait,
      endReason,
      st.startsWith('c|') ? callId : '',
      conversationId,
      Number(res[3]?.[1] ?? 0),
    ].join('.');
  }

  private avgCache?: { at: number; sec: number };

  private async avgTalkSeconds(): Promise<number> {
    if (this.avgCache && this.now() - this.avgCache.at < 30_000) {
      return this.avgCache.sec;
    }
    const a = await this.redis.hmget(
      this.k.agg(this.hour(this.now() - 3_600_000)),
      'ended',
      'talkSeconds',
    );
    const ended = Number(a[0] ?? 0);
    const sec = ended > 0 ? Number(a[1] ?? 0) / ended : 300;
    this.avgCache = { at: this.now(), sec };
    return sec;
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
