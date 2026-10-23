/**
 * Load audit 6 (2026-10-23): "+1 to a statistic" must not be one database
 * write per request. Instagram / TikTok count views in a stream and write
 * totals in batches; this is the smallest version of that: increments are
 * added up in memory and one batch (a multi-row upsert) is written every
 * [intervalMs]. A crash loses at most one window of a statistic that is
 * best-effort anyway - never use it for money or anything a person sees as
 * a promise.
 *
 * Effect for a profile opened 1 000 times in 10 s: 1 write instead of 1 000,
 * no hot-row lock queue, no pool connection held per view.
 */
export class WriteBehindCounter {
  private pending = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private flushing: Promise<void> = Promise.resolve();

  constructor(
    private readonly write: (batch: Map<string, number>) => Promise<void>,
    private readonly opts: {
      intervalMs?: number;
      /** Flush at once when this many distinct keys are waiting. */
      maxKeys?: number;
      onError?: (error: unknown) => void;
    } = {},
  ) {}

  add(key: string, n = 1): void {
    this.pending.set(key, (this.pending.get(key) ?? 0) + n);
    this.start();
    if (this.pending.size >= (this.opts.maxKeys ?? 5000)) void this.flush();
  }

  /** Number of distinct keys waiting (tests, metrics). */
  size(): number {
    return this.pending.size;
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.opts.intervalMs ?? 10_000);
    this.timer.unref?.();
  }

  /** Writes what is waiting; batches never overlap. */
  flush(): Promise<void> {
    this.flushing = this.flushing.then(async () => {
      if (this.pending.size === 0) return;
      const batch = this.pending;
      this.pending = new Map();
      try {
        await this.write(batch);
      } catch (error) {
        // Put the counts back for the next window instead of losing them.
        for (const [k, v] of batch) {
          this.pending.set(k, (this.pending.get(k) ?? 0) + v);
        }
        this.opts.onError?.(error);
      }
    });
    return this.flushing;
  }

  /** Stop the timer and write the rest (application shutdown). */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
  }
}
