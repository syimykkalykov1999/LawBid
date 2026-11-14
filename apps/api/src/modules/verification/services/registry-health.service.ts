import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import type { CheckOutcome } from '../providers/verification-providers';
import {
  classifyError,
  classifyOutcome,
  evaluateHealth,
  field,
  hourOf,
  keepHours,
  type HealthConfig,
  staleFields,
  type HealthKind,
  type HealthVerdict,
} from './registry-health.logic';

/** A state is re-evaluated at most this often per process. */
const EVAL_EVERY_MS = 60_000;
/** registryDegraded() answers from memory this long. */
const READ_CACHE_MS = 60_000;

/** The alert lines CloudWatch turns into the owner's e-mail
 * (infra/modules/monitoring/bar-registry.tf). */
export const BAR_REGISTRY_DEGRADED_ALERT = 'bar_registry_degraded';
export const BAR_REGISTRY_RECOVERED = 'bar_registry_recovered';

/** Reason a lookup in a degraded state gets instead of its verdict. */
export const REGISTRY_DEGRADED_REASON = 'registry_degraded';

export interface RegistryDegradedMark {
  since: string;
  kind: HealthVerdict['kind'];
  windowRate: HealthVerdict['windowRate'];
  baselineRate: HealthVerdict['baselineRate'];
  window: HealthVerdict['window'];
}

/**
 * Owner row 50 (13.11): health of each state's bar registry (the free state
 * sites, their open-data APIs, paid services) from the real lookups
 * (registry-health.logic.ts). Redis only: one hash per state with hourly
 * counters, one mark key per degraded state. Every Redis error is swallowed:
 * the health watch must never break or slow a lookup; without Redis the
 * lookups behave exactly as before (nothing marked).
 *
 * `registryDegraded(state)` is the read side for other code, e.g. the
 * automatic decision (row 60) may send every request of a degraded state to
 * a person.
 */
@Injectable()
export class RegistryHealthService {
  private readonly lastEval = new Map<string, number>();
  private readonly marks = new Map<
    string,
    { at: number; mark: RegistryDegradedMark | null }
  >();

  /** Clock (tests replace it). */
  now: () => number = Date.now;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly settings: AppSettingsService,
    @Optional() private readonly logger?: PinoLogger,
  ) {
    this.logger?.setContext(RegistryHealthService.name);
  }

  static countsKey(state: string): string {
    return `bar:health:${state.toUpperCase()}`;
  }

  static markKey(state: string): string {
    return `bar:health:degraded:${state.toUpperCase()}`;
  }

  private async enabled(): Promise<boolean> {
    return this.settings
      .boolean('verification.registry_health.enabled')
      .catch(() => true);
  }

  /** True while [state]'s registry is marked degraded. Never throws. */
  async registryDegraded(state: string): Promise<boolean> {
    return (await this.mark(state)) !== null;
  }

  /** The mark of [state], or null. Never throws. */
  async mark(state: string): Promise<RegistryDegradedMark | null> {
    const code = state.toUpperCase();
    const hit = this.marks.get(code);
    const now = this.now();
    if (hit && now - hit.at < READ_CACHE_MS) return hit.mark;
    let mark: RegistryDegradedMark | null = null;
    try {
      if (await this.enabled()) {
        const raw = await this.redis.get(RegistryHealthService.markKey(code));
        mark = raw ? (JSON.parse(raw) as RegistryDegradedMark) : null;
      }
    } catch (err) {
      this.logger?.warn({ err, state: code }, 'registry health read failed');
      mark = null;
    }
    this.marks.set(code, { at: now, mark });
    return mark;
  }

  /**
   * Wraps one real lookup of [state]: counts what the registry answered
   * (BEFORE any change below, so the mark never hides its own cause), and
   * while the state is degraded turns a «fail» into `manual_review` with
   * reason `registry_degraded` (a person decides; the registry's own reason
   * stays in `registryReason`). Errors are counted and rethrown unchanged.
   */
  async observe(
    state: string,
    call: Promise<CheckOutcome>,
  ): Promise<CheckOutcome> {
    let out: CheckOutcome;
    try {
      out = await call;
    } catch (err) {
      await this.record(state, classifyError(err));
      throw err;
    }
    await this.record(state, classifyOutcome(out));
    const mark = await this.mark(state);
    if (!mark) return out;
    if (out.result === 'fail') {
      return {
        result: 'manual_review',
        details: {
          ...out.details,
          reason: REGISTRY_DEGRADED_REASON,
          registryReason: out.details?.reason ?? null,
          registryDegraded: true,
        },
      };
    }
    return { ...out, details: { ...out.details, registryDegraded: true } };
  }

  /** Counts one answer and re-evaluates the state. Never throws. */
  async record(state: string, kind: HealthKind | null): Promise<void> {
    if (!kind) return;
    const code = state.toUpperCase();
    try {
      if (!(await this.enabled())) return;
      const key = RegistryHealthService.countsKey(code);
      const hour = hourOf(this.now());
      const cfg = await this.config();
      await this.redis.hincrby(key, field(hour, kind), 1);
      await this.redis.expire(key, keepHours(cfg) * 3600);
      await this.evaluate(code, hour, cfg);
    } catch (err) {
      this.logger?.warn({ err, state: code }, 'registry health write failed');
    }
  }

  /** At most once a minute per state and process: compare the window with
   * the baseline and set or clear the mark. The alert line is logged only
   * by the process whose SET NX / DEL changed the mark (one e-mail). */
  /** The admin's numbers, read on every call (no restart needed). */
  private async config(): Promise<HealthConfig> {
    return {
      windowHours: await this.settings.number(
        'verification.registry_health.window_hours',
      ),
      baselineDays: await this.settings.number(
        'verification.registry_health.baseline_days',
      ),
      minChecks: await this.settings.number(
        'verification.registry_health.min_checks',
      ),
      jumpPoints: await this.settings.number(
        'verification.registry_health.jump_points',
      ),
    };
  }

  /** The mark lapses by itself when no check refreshes it: one day past
   * the history the admin keeps. */
  private markTtlSec(cfg: HealthConfig): number {
    return keepHours(cfg) * 3600;
  }

  private async evaluate(
    state: string,
    hour: number,
    cfg: HealthConfig,
  ): Promise<void> {
    const now = this.now();
    const last = this.lastEval.get(state);
    if (last !== undefined && now - last < EVAL_EVERY_MS) return;
    this.lastEval.set(state, now);
    const key = RegistryHealthService.countsKey(state);
    const hash = (await this.redis.hgetall(key)) ?? {};
    const stale = staleFields(hash, hour, keepHours(cfg));
    if (stale.length > 0) await this.redis.hdel(key, ...stale);
    const markKey = RegistryHealthService.markKey(state);
    const current = await this.redis.get(markKey);
    const since = current
      ? Date.parse((JSON.parse(current) as RegistryDegradedMark).since)
      : NaN;
    const v = evaluateHealth(
      hash,
      hour,
      cfg,
      Number.isFinite(since) ? hourOf(since) : null,
    );
    if (v.degraded === true) {
      const mark: RegistryDegradedMark = {
        since: new Date(now).toISOString(),
        kind: v.kind,
        windowRate: v.windowRate,
        baselineRate: v.baselineRate,
        window: v.window,
      };
      const set = await this.redis.set(
        markKey,
        JSON.stringify(mark),
        'EX',
        this.markTtlSec(cfg),
        'NX',
      );
      if (set === 'OK') {
        this.marks.set(state, { at: now, mark });
        this.logger?.error(
          {
            alert: BAR_REGISTRY_DEGRADED_ALERT,
            state,
            kind: v.kind,
            window: v.window,
            windowRate: v.windowRate,
            baselineRate: v.baselineRate,
            windowHours: cfg.windowHours,
          },
          `State bar registry ${state} degraded: lookups go to a person`,
        );
      } else {
        // Still degraded: keep the mark alive while checks keep coming.
        await this.redis.expire(markKey, this.markTtlSec(cfg));
      }
    } else if (v.degraded === false) {
      const removed = await this.redis.del(markKey);
      this.marks.set(state, { at: now, mark: null });
      if (removed > 0) {
        this.logger?.info(
          {
            event: BAR_REGISTRY_RECOVERED,
            state,
            window: v.window,
            windowRate: v.windowRate,
          },
          `State bar registry ${state} healthy again`,
        );
      }
    }
  }
}
