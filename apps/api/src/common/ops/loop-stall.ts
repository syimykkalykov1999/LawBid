import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import {
  constants,
  monitorEventLoopDelay,
  PerformanceObserver,
  type IntervalHistogram,
} from 'node:perf_hooks';
import { AppSettingsService } from '../app-settings/app-settings.service';

/**
 * 14.11 (detective F3, owner row 154): the api tasks freeze for 0.7-1.7 s
 * (EMF `EventLoopMaxMs`), and the per-minute number cannot say WHAT was
 * running. This logs one line per stall above `ops.loop_stall_log_ms`
 * (admin setting, 0 = off) with:
 *  - the stall length (event-loop delay max of the last second),
 *  - the V8 garbage collections that ended in that second (kind + ms, from
 *    the Node `gc` performance entries: Node docs, perf_hooks
 *    "Garbage Collection (gc) Details"),
 *  - the requests / jobs that were open at that moment (route template or
 *    path without the query, how long they had been open).
 *
 * The sampler is the one @fastify/under-pressure uses (MIT): a
 * `monitorEventLoopDelay` histogram read and reset on a fixed interval. The
 * "what was running" part follows blocked-at (MIT) in spirit, but without
 * async_hooks (blocked-at's README: not for production, it slows every
 * callback): a request / job registers itself while it is open, which costs
 * one Map insert and delete.
 */

/** Work that is open right now (an HTTP request or a job). */
interface OpenWork {
  label: () => string;
  startedAt: number;
}

const open = new Map<number, OpenWork>();
let seq = 0;

/** Registers open work; the returned function ends it (safe to call twice). */
export function trackWork(label: string | (() => string)): () => void {
  const id = ++seq;
  open.set(id, {
    label: typeof label === 'string' ? () => label : label,
    startedAt: Date.now(),
  });
  return () => {
    open.delete(id);
  };
}

/** Runs [fn] as tracked work (jobs). */
export async function withWork<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const end = trackWork(label);
  try {
    return await fn();
  } finally {
    end();
  }
}

/** The open work, longest first, at most [limit] entries. */
export function openWork(
  now = Date.now(),
  limit = 10,
): { work: string; openMs: number }[] {
  const list: { work: string; openMs: number }[] = [];
  for (const w of open.values()) {
    let name: string;
    try {
      name = w.label();
    } catch {
      name = '?';
    }
    list.push({ work: name, openMs: now - w.startedAt });
  }
  list.sort((a, b) => b.openMs - a.openMs);
  return list.slice(0, limit);
}

/** Test hook: forget all open work. */
export function resetOpenWork(): void {
  open.clear();
}

const GC_KIND: Record<number, string> = {
  [constants.NODE_PERFORMANCE_GC_MAJOR]: 'major',
  [constants.NODE_PERFORMANCE_GC_MINOR]: 'minor',
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental',
  [constants.NODE_PERFORMANCE_GC_WEAKCB]: 'weakcb',
};

export interface StallReport {
  stallMs: number;
  /** GCs that ended since the last sample (ms each, longest first). */
  gc: { kind: string; ms: number }[];
  /** Sum of the GC times above. */
  gcMs: number;
  open: { work: string; openMs: number }[];
  heapUsedMb: number;
}

/** Pure: the report for one sample, or null below the threshold / off. */
export function stallReport(
  thresholdMs: number,
  stallMs: number,
  gc: { kind: string; ms: number }[],
  openList: { work: string; openMs: number }[],
  heapUsedMb: number,
): StallReport | null {
  if (!(thresholdMs > 0) || !(stallMs >= thresholdMs)) return null;
  const sorted = [...gc].sort((a, b) => b.ms - a.ms).slice(0, 5);
  const gcMs = Math.round(gc.reduce((s, g) => s + g.ms, 0));
  return { stallMs, gc: sorted, gcMs, open: openList, heapUsedMb };
}

/** How often the histogram is read (under-pressure's `sampleInterval`). */
const SAMPLE_MS = 1000;
/** How often the admin setting is re-read. */
const SETTINGS_MS = 30_000;

@Injectable()
export class LoopStallService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly log = new Logger('LoopStall');
  private histogram?: IntervalHistogram;
  private observer?: PerformanceObserver;
  private timers: NodeJS.Timeout[] = [];
  private thresholdMs = 0;
  private gcSince: { kind: string; ms: number }[] = [];
  /** Stalls logged since start (tests / debugging). */
  logged = 0;

  constructor(@Optional() private readonly settings?: AppSettingsService) {}

  onApplicationBootstrap(): void {
    if (process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test') return;
    void this.loadThreshold();
    const cfg = setInterval(() => void this.loadThreshold(), SETTINGS_MS);
    cfg.unref();
    const sample = setInterval(() => this.sample(), SAMPLE_MS);
    sample.unref();
    this.timers = [cfg, sample];
  }

  async loadThreshold(): Promise<void> {
    if (!this.settings) return;
    try {
      const v = await this.settings.number('ops.loop_stall_log_ms');
      this.apply(Number.isFinite(v) && v > 0 ? v : 0);
    } catch {
      // keep the previous value
    }
  }

  /** Switches the sampler on (threshold > 0) or off (0). */
  apply(thresholdMs: number): void {
    this.thresholdMs = thresholdMs;
    if (thresholdMs > 0 && !this.histogram) {
      this.histogram = monitorEventLoopDelay({ resolution: 20 });
      this.histogram.enable();
      this.observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const kind = (e as unknown as { detail?: { kind?: number } }).detail
            ?.kind;
          this.gcSince.push({
            kind: GC_KIND[kind ?? -1] ?? String(kind),
            ms: Math.round(e.duration),
          });
          if (this.gcSince.length > 200) this.gcSince.shift();
        }
      });
      this.observer.observe({ entryTypes: ['gc'] });
    } else if (thresholdMs <= 0 && this.histogram) {
      this.histogram.disable();
      this.histogram = undefined;
      this.observer?.disconnect();
      this.observer = undefined;
      this.gcSince = [];
    }
  }

  sample(): StallReport | null {
    const h = this.histogram;
    if (!h) return null;
    const stallMs = Math.round(h.max / 1e6);
    h.reset();
    const gc = this.gcSince;
    this.gcSince = [];
    const r = stallReport(
      this.thresholdMs,
      stallMs,
      gc,
      openWork(),
      Math.round(process.memoryUsage().heapUsed / 1048576),
    );
    if (r) {
      this.logged += 1;
      this.log.warn(r, 'event loop stall');
    }
    return r;
  }

  onApplicationShutdown(): void {
    for (const t of this.timers) clearInterval(t);
    this.apply(0);
  }
}
