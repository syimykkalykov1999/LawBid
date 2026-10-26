import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';

/**
 * Owner 2026-10-26: Cloudflare is the PRIMARY transport of every call
 * (1:1 relays through Cloudflare TURN, group calls through Cloudflare
 * Realtime SFU) as soon as its keys are in Admin -> Integrations. Our own
 * path (own coturn + device-to-device mesh) is only the backup: it takes
 * over by itself when Cloudflare keeps failing, and Cloudflare comes back by
 * itself when it answers again. Never "both equal".
 *
 * `calls.transport` (admin, 3 states, Авто default):
 *  - auto       Cloudflare while its breaker is closed, own path while open;
 *  - cloudflare Cloudflare always (when its keys exist), the breaker ignored;
 *  - own        never Cloudflare.
 *
 * The breaker (one per Cloudflare service: `turn`, `sfu`) is shared by every
 * API instance through Redis (circuit-breaker pattern, distributed so that
 * 50 API tasks neither learn an outage 50 times nor probe 50 times):
 *  - `calls:cf:fail:{part}`  INCR, expires after the window  -> N in M;
 *  - `calls:cf:open:{part}`  set once N failures happened in the window;
 *  - `calls:cf:probe:{part}` SET NX PX 60 s: one probe a minute fleet-wide,
 *    and only while open (no load at all while Cloudflare is healthy).
 * A call that is already running keeps its transport while it works (per-call
 * stickiness: no switch-back mid-call). Owner 2026-10-26 failover: a group
 * call whose Cloudflare SFU fails mid-call (or when the SFU breaker opens)
 * moves to our own path with the SAME call id (CallsService.moveCallToOwn);
 * a 1:1 call whose Cloudflare relay dies gets a fresh relay list (own TURN
 * included) and an ICE restart from the phones.
 * Without a ready Redis (unit tests, a dev box) it lives in this process.
 */
export type CallsTransport = 'cloudflare' | 'own' | 'auto';
export type CfPart = 'turn' | 'sfu';

/** Defaults of `calls.transport_fail_limit` / `calls.transport_fail_window_sec`. */
export const CF_BREAKER_FAIL_LIMIT = 5;
export const CF_BREAKER_WINDOW_SEC = 120;
/** While open, Cloudflare is asked again at most this often (fleet-wide). */
export const CF_BREAKER_PROBE_MS = 60_000;
/** An open mark is dropped after a week even if nothing probed it. */
const OPEN_TTL_SEC = 7 * 24 * 60 * 60;
/** Probe failures in a row are forgotten when no probe ran for this long. */
const CF_RELAY_PROBE_MS_FORGET = 3 * CF_BREAKER_PROBE_MS;

const failKey = (p: CfPart) => `calls:cf:fail:${p}`;
const openKey = (p: CfPart) => `calls:cf:open:${p}`;
const probeKey = (p: CfPart) => `calls:cf:probe:${p}`;
const lastProbeKey = (p: CfPart) => `calls:cf:lastprobe:${p}`;
const useKey = (p: CfPart) => `calls:cf:use:${p}`;
const reportKey = (p: CfPart) => `calls:cf:report:${p}`;
const reporterKey = (p: CfPart, u: string) => `calls:cf:reporter:${p}:${u}`;
const relayFailKey = (p: CfPart) => `calls:cf:relayfail:${p}`;
const verifyKey = (p: CfPart) => `calls:cf:verify:${p}`;

/** Owner 2026-10-26 (failover): phones report a dead Cloudflare relay; the
 * reports open the breaker when enough phones say so AND they are a real
 * share of the calls that took Cloudflare in the window. A phone that walks
 * into a lift reports a relay failure too — one bad network must never move
 * the whole fleet. Defaults of `calls.transport_report_min` (the cap of the
 * absolute minimum) and `calls.transport_report_ratio_pct`. At launch scale
 * (a few calls) the minimum shrinks with the usage: at least
 * [CF_CLIENT_REPORT_FLOOR] distinct phones and [CF_CLIENT_REPORT_SMALL_SHARE]
 * of the calls, so 2 of 3 Cloudflare calls reporting opens it (CF-6 / TS-2
 * of the 2026-10-26 audit). */
export const CF_CLIENT_REPORT_MIN = 10;
export const CF_CLIENT_REPORT_RATIO = 0.3;
export const CF_CLIENT_REPORT_FLOOR = 2;
export const CF_CLIENT_REPORT_SMALL_SHARE = 0.5;
/** One report per person per this long (a phone retrying is one voice). */
export const CF_CLIENT_REPORT_EVERY_MS = 60_000;
/** The relay probe (STUN Binding + TURN Allocate, once a minute while the
 * breaker is CLOSED too) opens the breaker after this many failures in a
 * row; one lost UDP packet from one API task is not an outage. */
export const CF_RELAY_PROBE_FAIL_OPEN = 2;
/** A phone's relay report is verified from the API with one real Allocate
 * at most this often fleet-wide (CF-6). */
export const CF_VERIFY_EVERY_MS = 10_000;

/** How many phone reports count right now: the admin minimum, shrunk at
 * small scale to at least [CF_CLIENT_REPORT_FLOOR] phones and half of the
 * calls that took Cloudflare in the window. */
export function clientReportMin(uses: number, reportMin: number): number {
  return Math.min(
    Math.max(CF_CLIENT_REPORT_FLOOR, Math.floor(reportMin) || 0),
    Math.max(
      CF_CLIENT_REPORT_FLOOR,
      Math.ceil(Math.max(uses, 0) * CF_CLIENT_REPORT_SMALL_SHARE),
    ),
  );
}

export type CfDecisionReason =
  | 'cloudflare'
  | 'forced_cloudflare'
  | 'no_keys'
  | 'own_forced'
  | 'breaker_open';

export interface CfDecision {
  use: boolean;
  reason: CfDecisionReason;
}

export interface CfBreakerState {
  open: boolean;
  /** ms since epoch the breaker opened, null when closed. */
  since: number | null;
  /** Failures counted in the current window. */
  failures: number;
}

/** The last breaker probe (shown in Admin -> Integrations -> «Связь для
 * звонков»). */
export interface CfLastProbe {
  at: number;
  ok: boolean;
  ms: number;
}

export function parseTransport(raw: unknown): CallsTransport {
  return raw === 'cloudflare' || raw === 'own' ? raw : 'auto';
}

export class CloudflareTransport {
  private readonly logger = new Logger('CloudflareTransport');
  /** In-process fallback when Redis is not ready. */
  private readonly mem = {
    fail: new Map<CfPart, { count: number; until: number }>(),
    open: new Map<CfPart, number>(),
    probe: new Map<CfPart, number>(),
    last: new Map<CfPart, CfLastProbe>(),
    use: new Map<CfPart, { count: number; until: number }>(),
    report: new Map<CfPart, { count: number; until: number }>(),
    reporter: new Map<string, number>(),
    relayFail: new Map<CfPart, { count: number; until: number }>(),
    verify: new Map<CfPart, number>(),
  };
  /** Called once when THIS instance opened the breaker (the running SFU
   * calls are moved to our own path then; owner 2026-10-26 failover). */
  private readonly openListeners: Array<(part: CfPart) => void> = [];

  constructor(
    private readonly redis?: Redis,
    private readonly settings?: Pick<AppSettingsService, 'string' | 'number'>,
    private readonly now: () => number = Date.now,
  ) {}

  private get live(): Redis | null {
    return this.redis && this.redis.status === 'ready' ? this.redis : null;
  }

  /** `calls.transport` (anything unknown reads as auto). */
  async mode(): Promise<CallsTransport> {
    try {
      return parseTransport(
        this.settings ? await this.settings.string('calls.transport') : 'auto',
      );
    } catch {
      return 'auto';
    }
  }

  private async limits(): Promise<{ limit: number; windowMs: number }> {
    let limit = CF_BREAKER_FAIL_LIMIT;
    let windowSec = CF_BREAKER_WINDOW_SEC;
    try {
      if (this.settings) {
        limit = await this.settings.number('calls.transport_fail_limit');
        windowSec = await this.settings.number(
          'calls.transport_fail_window_sec',
        );
      }
    } catch {
      // Defaults.
    }
    return {
      limit: Math.max(1, Math.floor(limit) || CF_BREAKER_FAIL_LIMIT),
      windowMs:
        Math.max(10, Math.floor(windowSec) || CF_BREAKER_WINDOW_SEC) * 1000,
    };
  }

  /** `calls.transport_report_min` / `calls.transport_report_ratio_pct`
   * (the phones' report thresholds), with the built-in defaults. */
  private async reportLimits(): Promise<{ min: number; ratio: number }> {
    let min = CF_CLIENT_REPORT_MIN;
    let pct = CF_CLIENT_REPORT_RATIO * 100;
    try {
      if (this.settings) {
        min = await this.settings.number('calls.transport_report_min');
        pct = await this.settings.number('calls.transport_report_ratio_pct');
      }
    } catch {
      // Defaults.
    }
    return {
      min:
        Number.isFinite(min) && min >= 1
          ? Math.floor(min)
          : CF_CLIENT_REPORT_MIN,
      ratio:
        Number.isFinite(pct) && pct >= 0 && pct <= 100
          ? pct / 100
          : CF_CLIENT_REPORT_RATIO,
    };
  }

  async state(part: CfPart): Promise<CfBreakerState> {
    const r = this.live;
    if (r) {
      try {
        // Two plain GETs, not one MGET: the keys may live on different
        // slots of a Redis cluster (redis-cluster-scan.spec.ts).
        const [open, fails] = await Promise.all([
          r.get(openKey(part)),
          r.get(failKey(part)),
        ]);
        const since = open ? Number(open) : NaN;
        return {
          open: Boolean(open),
          since: Number.isFinite(since) ? since : null,
          failures: Number(fails ?? 0) || 0,
        };
      } catch {
        // Redis hiccup: read as closed (Cloudflare stays primary).
        return { open: false, since: null, failures: 0 };
      }
    }
    const f = this.mem.fail.get(part);
    const since = this.mem.open.get(part) ?? null;
    return {
      open: since !== null,
      since,
      failures: f && f.until > this.now() ? f.count : 0,
    };
  }

  async isOpen(part: CfPart): Promise<boolean> {
    return (await this.state(part)).open;
  }

  /**
   * A real Cloudflare failure (TURN login error / timeout, SFU 5xx /
   * timeout / 429 / refused key). Returns true when this one opened the
   * breaker. Never throws.
   */
  async recordFailure(part: CfPart, why: string): Promise<boolean> {
    const { limit, windowMs } = await this.limits();
    let count: number;
    const r = this.live;
    if (r) {
      try {
        count = await r.incr(failKey(part));
        if (count === 1) await r.pexpire(failKey(part), windowMs);
      } catch {
        return false;
      }
    } else {
      const t = this.now();
      const f = this.mem.fail.get(part);
      const cur = f && f.until > t ? f : { count: 0, until: t + windowMs };
      cur.count += 1;
      this.mem.fail.set(part, cur);
      count = cur.count;
    }
    if (count < limit) return false;
    return this.open(
      part,
      `failed ${count} times in ${Math.round(windowMs / 1000)} s`,
      why,
    );
  }

  /** Opens the breaker now (SET NX: only the first caller opens it).
   * Returns true when THIS call opened it. Never throws. */
  private async open(
    part: CfPart,
    what: string,
    why: string,
  ): Promise<boolean> {
    let opened = false;
    const r = this.live;
    if (r) {
      try {
        opened =
          (await r.set(
            openKey(part),
            String(this.now()),
            'EX',
            OPEN_TTL_SEC,
            'NX',
          )) === 'OK';
      } catch {
        return false;
      }
    } else if (!this.mem.open.has(part)) {
      this.mem.open.set(part, this.now());
      opened = true;
    }
    if (opened) {
      this.logger.warn(
        `alert=cloudflare_calls_fallback Cloudflare ${part.toUpperCase()} ${what}: NEW calls use our own path, running group calls move to it; Cloudflare is probed every ${CF_BREAKER_PROBE_MS / 1000} s (${why})`,
      );
      for (const l of this.openListeners) {
        try {
          l(part);
        } catch {
          // A listener never breaks the counting.
        }
      }
    }
    return opened;
  }

  /** Runs [fn] whenever THIS instance opens the breaker of a part. */
  onOpen(fn: (part: CfPart) => void): void {
    this.openListeners.push(fn);
  }

  /** A windowed counter (Redis INCR + PEXPIRE, or in memory). */
  private async bump(
    key: string,
    mem: Map<CfPart, { count: number; until: number }>,
    part: CfPart,
    windowMs: number,
  ): Promise<number> {
    const r = this.live;
    if (r) {
      try {
        const n = await r.incr(key);
        if (n === 1) await r.pexpire(key, windowMs);
        return n;
      } catch {
        return 0;
      }
    }
    const t = this.now();
    const f = mem.get(part);
    const cur = f && f.until > t ? f : { count: 0, until: t + windowMs };
    cur.count += 1;
    mem.set(part, cur);
    return cur.count;
  }

  private async peek(
    key: string,
    mem: Map<CfPart, { count: number; until: number }>,
    part: CfPart,
  ): Promise<number> {
    const r = this.live;
    if (r) {
      try {
        return Number((await r.get(key)) ?? 0) || 0;
      } catch {
        return 0;
      }
    }
    const f = mem.get(part);
    return f && f.until > this.now() ? f.count : 0;
  }

  /** A call took Cloudflare (the denominator of the phones' reports). One
   * INCR per call start; nothing at all while the admin chose our own path. */
  async noteUse(part: CfPart): Promise<void> {
    const { windowMs } = await this.limits();
    await this.bump(useKey(part), this.mem.use, part, windowMs);
  }

  /**
   * A phone says the Cloudflare relay of its running call died (ICE failed
   * through it). The breaker opens when enough DISTINCT phones say so in
   * the window and they are a real share of the calls on Cloudflare (see
   * [clientReportMin] / `calls.transport_report_ratio_pct`): at launch
   * scale 2 phones out of 3 calls, at scale the admin minimum and ratio;
   * one report per person a minute. Returns true when the reports opened
   * (or confirmed) the breaker. Never throws.
   */
  async recordClientFailure(
    part: CfPart,
    userId: string,
    why: string,
  ): Promise<boolean> {
    try {
      const { windowMs } = await this.limits();
      const r = this.live;
      if (r) {
        const first = await r.set(
          reporterKey(part, userId),
          '1',
          'PX',
          CF_CLIENT_REPORT_EVERY_MS,
          'NX',
        );
        if (first !== 'OK') return false;
      } else {
        const k = `${part}:${userId}`;
        const t = this.now();
        const last = this.mem.reporter.get(k);
        if (last !== undefined && t - last < CF_CLIENT_REPORT_EVERY_MS) {
          return false;
        }
        this.mem.reporter.set(k, t);
      }
      const reports = await this.bump(
        reportKey(part),
        this.mem.report,
        part,
        windowMs,
      );
      const uses = await this.peek(useKey(part), this.mem.use, part);
      const { min, ratio } = await this.reportLimits();
      if (
        reports < clientReportMin(uses, min) ||
        reports < ratio * Math.max(uses, 1)
      ) {
        return false;
      }
      // Enough phones agree: that IS the outage, whatever the API says.
      await this.open(
        part,
        `${reports} phones report a dead relay (${uses} calls took Cloudflare in the window)`,
        why,
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * CF-6: a phone's relay report is checked from the API with one real
   * STUN Binding + TURN Allocate ([probe] throws when the relay is dead),
   * at most once per [CF_VERIFY_EVERY_MS] fleet-wide and only while the
   * breaker is closed. A failed check counts as a real Cloudflare failure.
   * Resolves true when the relay was found dead. Never throws.
   */
  async verify(part: CfPart, probe: () => Promise<unknown>): Promise<boolean> {
    try {
      if (await this.isOpen(part)) return false;
      if (
        !(await this.takeSlot(
          verifyKey(part),
          this.mem.verify,
          part,
          CF_VERIFY_EVERY_MS,
        ))
      ) {
        return false;
      }
      try {
        await probe();
        return false;
      } catch (e) {
        await this.recordFailure(
          part,
          `relay check after a phone report: ${(e as Error).message}`,
        );
        return true;
      }
    } catch {
      return false;
    }
  }

  /** The last breaker probe, for the admin card (null: none yet). */
  async lastProbe(part: CfPart): Promise<CfLastProbe | null> {
    const r = this.live;
    if (r) {
      try {
        const raw = await r.get(lastProbeKey(part));
        return raw ? (JSON.parse(raw) as CfLastProbe) : null;
      } catch {
        return null;
      }
    }
    return this.mem.last.get(part) ?? null;
  }

  private async saveProbe(part: CfPart, p: CfLastProbe): Promise<void> {
    const r = this.live;
    if (r) {
      try {
        await r.set(lastProbeKey(part), JSON.stringify(p), 'EX', OPEN_TTL_SEC);
      } catch {
        // Display only.
      }
      return;
    }
    this.mem.last.set(part, p);
  }

  /** Back to Cloudflare: the open mark and the failure count are dropped. */
  async close(part: CfPart): Promise<void> {
    const r = this.live;
    if (r) {
      try {
        await Promise.all([r.del(openKey(part)), r.del(failKey(part))]);
      } catch {
        // The next probe tries again.
      }
      return;
    }
    this.mem.open.delete(part);
    this.mem.fail.delete(part);
  }

  /** One slot per [everyMs] fleet-wide (SET NX PX), or in memory. */
  private async takeSlot(
    key: string,
    mem: Map<CfPart, number>,
    part: CfPart,
    everyMs: number,
  ): Promise<boolean> {
    const r = this.live;
    if (r) {
      try {
        return (
          (await r.set(key, String(this.now()), 'PX', everyMs, 'NX')) === 'OK'
        );
      } catch {
        return false;
      }
    }
    const t = this.now();
    const last = mem.get(part);
    if (last !== undefined && t - last < everyMs) return false;
    mem.set(part, t);
    return true;
  }

  /** One probe a minute fleet-wide (SET NX PX). */
  private takeProbeSlot(part: CfPart): Promise<boolean> {
    return this.takeSlot(
      probeKey(part),
      this.mem.probe,
      part,
      CF_BREAKER_PROBE_MS,
    );
  }

  /** Probe failures in a row (reset by a good probe; forgotten when no
   * probe ran for three slots). */
  private async bumpRelayFail(part: CfPart): Promise<number> {
    return this.bump(
      relayFailKey(part),
      this.mem.relayFail,
      part,
      CF_RELAY_PROBE_MS_FORGET,
    );
  }

  private async clearRelayFail(part: CfPart): Promise<void> {
    const r = this.live;
    if (r) {
      try {
        await r.del(relayFailKey(part));
      } catch {
        // The next good probe clears it.
      }
      return;
    }
    this.mem.relayFail.delete(part);
  }

  /**
   * While open: asks Cloudflare once (at most every 60 s across all API
   * instances). Success closes the breaker, so the next NEW call is on
   * Cloudflare again. Resolves true when it closed. Never throws.
   */
  async maybeProbe(
    part: CfPart,
    probe: () => Promise<unknown>,
    onFail?: (e: unknown) => void,
  ): Promise<boolean> {
    if (!(await this.isOpen(part))) return false;
    return this.probe(part, probe, onFail);
  }

  /**
   * FO-2 (audit 2026-10-26): the health probe, once a minute fleet-wide
   * whatever the breaker state. [probe] must do what a call does — for
   * `turn` a login AND a real STUN Binding + TURN Allocate on the relay
   * (probeCloudflareRelay), so a dead data plane behind a live credential
   * API is seen. While open: success closes the breaker. While closed: a
   * failure counts as a Cloudflare failure (N in M) and
   * [CF_RELAY_PROBE_FAIL_OPEN] failures in a row open the breaker by
   * themselves. Resolves true when this probe closed the breaker. Never
   * throws.
   */
  async probe(
    part: CfPart,
    probe: () => Promise<unknown>,
    onFail?: (e: unknown) => void,
  ): Promise<boolean> {
    const wasOpen = await this.isOpen(part);
    if (!(await this.takeProbeSlot(part))) return false;
    const started = this.now();
    try {
      await probe();
    } catch (e) {
      await this.saveProbe(part, {
        at: started,
        ok: false,
        ms: this.now() - started,
      });
      try {
        onFail?.(e);
      } catch {
        // Counting only.
      }
      if (!wasOpen) {
        const why = `relay probe: ${(e as Error)?.message ?? 'failed'}`;
        const inARow = await this.bumpRelayFail(part);
        const opened = await this.recordFailure(part, why);
        if (!opened && inARow >= CF_RELAY_PROBE_FAIL_OPEN) {
          await this.open(
            part,
            `relay probe failed ${inARow} times in a row`,
            why,
          );
        }
      }
      return false;
    }
    await this.saveProbe(part, {
      at: started,
      ok: true,
      ms: this.now() - started,
    });
    await this.clearRelayFail(part);
    if (!wasOpen) return false;
    await this.close(part);
    this.logger.log(
      `Cloudflare ${part.toUpperCase()} answers again: new calls use Cloudflare`,
    );
    return true;
  }

  /**
   * Should a NEW call use Cloudflare for [part]? While the breaker is open,
   * [probe] runs in the background (a call never waits for it).
   */
  async decide(
    part: CfPart,
    configured: boolean,
    probe?: () => Promise<unknown>,
    onProbeFail?: (e: unknown) => void,
  ): Promise<CfDecision> {
    if (!configured) return { use: false, reason: 'no_keys' };
    const mode = await this.mode();
    if (mode === 'own') return { use: false, reason: 'own_forced' };
    const open = await this.isOpen(part);
    if (open && probe) {
      void this.maybeProbe(part, probe, onProbeFail).catch(() => undefined);
    }
    if (mode === 'cloudflare') {
      return { use: true, reason: 'forced_cloudflare' };
    }
    return open
      ? { use: false, reason: 'breaker_open' }
      : { use: true, reason: 'cloudflare' };
  }
}
