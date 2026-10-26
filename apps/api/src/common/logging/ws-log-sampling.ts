import type { TriMode } from '../ops/tri-mode';

/**
 * S20-4 (2026-10-25): WebSocket connect / disconnect / reconnect lines are
 * sampled like the HTTP access log (1 %). Every line carries `weight`
 * (= 100 / sample percent) and the CloudWatch metric filters add `weight`
 * instead of 1, so the dashboards and the reconnect-storm alarm still read
 * the true rate. The exact per-minute counters live in RealtimeStatsService
 * and never depend on the log lines.
 */
export interface WsLogDecision {
  log: boolean;
  /** How many real events this line stands for. */
  weight: number;
}

/** More events than this in one minute on one instance = a spike. */
export const WS_STORM_EVENTS_PER_MIN = 300;
/** After a spike every event is written for this long (auto mode). */
export const WS_STORM_FULL_LOG_MS = 30 * 60_000;

/** Pure decision; [rand] is a number in [0, 1). */
export function wsLogDecision(input: {
  mode: TriMode;
  samplePercent: number;
  stormUntil: number;
  now: number;
  rand: number;
}): WsLogDecision {
  if (input.mode === 'on') return { log: true, weight: 1 };
  if (input.mode === 'auto' && input.now < input.stormUntil) {
    return { log: true, weight: 1 };
  }
  const pct = Math.min(100, Math.max(1, input.samplePercent));
  return { log: input.rand * 100 < pct, weight: 100 / pct };
}

/** Counts events per minute and says when a spike starts. */
export class WsStormDetector {
  private minute = -1;
  private count = 0;
  stormUntil = 0;

  /** Record one event; returns true when the spike is (still) on. */
  record(now: number): boolean {
    const minute = Math.floor(now / 60_000);
    if (minute !== this.minute) {
      this.minute = minute;
      this.count = 0;
    }
    this.count += 1;
    if (this.count > WS_STORM_EVENTS_PER_MIN) {
      this.stormUntil = now + WS_STORM_FULL_LOG_MS;
    }
    return now < this.stormUntil;
  }
}
