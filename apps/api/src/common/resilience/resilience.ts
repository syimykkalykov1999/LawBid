/**
 * Owner 2026-10-15: small guards for calls to outside services (SMS, push,
 * video): a time limit, a retry for brief failures, and a "circuit breaker"
 * that stops calling a service that keeps failing for a minute, so one
 * broken partner cannot tie up every connection of the API.
 */

export class CircuitOpenError extends Error {
  constructor(readonly service: string) {
    super(`${service} is failing; calls are paused for a short while`);
    this.name = 'CircuitOpenError';
  }
}

export class CallTimeoutError extends Error {
  constructor(
    readonly service: string,
    readonly ms: number,
  ) {
    super(`${service} did not answer in ${ms} ms`);
    this.name = 'CallTimeoutError';
  }
}

/** Runs [fn]; rejects with CallTimeoutError when it takes longer than [ms]. */
export async function withTimeout<T>(
  service: string,
  ms: number,
  fn: () => Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CallTimeoutError(service, ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  /** Total tries, the first included. */
  attempts?: number;
  baseDelayMs?: number;
  /** Which failures are worth another try (default: all but CircuitOpen). */
  retryable?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Tries [fn] again after brief failures, waiting longer each time. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 2;
  const base = options.baseDelayMs ?? 300;
  const retryable =
    options.retryable ?? ((e: unknown) => !(e instanceof CircuitOpenError));
  const sleep = options.sleep ?? defaultSleep;
  let last: unknown;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i === attempts || !retryable(error)) throw error;
      await sleep(base * 2 ** (i - 1));
    }
  }
  throw last;
}

export interface BreakerOptions {
  /** Failures in a row that open the circuit. */
  threshold?: number;
  /** How long the circuit stays open before one trial call. */
  openMs?: number;
  now?: () => number;
}

/**
 * Closed → (threshold failures in a row) → open for openMs → one trial
 * call: success closes it, failure opens it again. In memory per process:
 * good enough, every task protects itself.
 */
export class CircuitBreaker {
  /** Every breaker of the process by service name (system-health reads it). */
  private static readonly registry = new Map<string, CircuitBreaker>();

  /** Snapshot of all breakers: closed, open, or half_open (one trial due). */
  static snapshot(): {
    service: string;
    state: 'closed' | 'open' | 'half_open';
  }[] {
    return [...CircuitBreaker.registry.values()].map((b) => ({
      service: b.service,
      state: b.state,
    }));
  }

  private failures = 0;
  private openUntil = 0;
  private trial = false;
  private readonly threshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  constructor(
    readonly service: string,
    options: BreakerOptions = {},
  ) {
    this.threshold = options.threshold ?? 5;
    this.openMs = options.openMs ?? 60_000;
    this.now = options.now ?? Date.now;
    CircuitBreaker.registry.set(service, this);
  }

  get state(): 'closed' | 'open' | 'half_open' {
    if (this.isOpen) return 'open';
    return this.openUntil !== 0 ? 'half_open' : 'closed';
  }

  get isOpen(): boolean {
    return this.openUntil > this.now();
  }

  /** Back to closed with no failures counted (tests, manual recovery). */
  reset(): void {
    this.failures = 0;
    this.openUntil = 0;
    this.trial = false;
  }

  /** [countsAsFailure] lets callers ignore errors that are the caller's
   * fault (a bad phone number is not Twilio being down). */
  async run<T>(
    fn: () => Promise<T>,
    countsAsFailure: (error: unknown) => boolean = () => true,
  ): Promise<T> {
    if (this.isOpen) throw new CircuitOpenError(this.service);
    if (this.openUntil !== 0) {
      // The pause is over: let exactly one call through to test the service.
      if (this.trial) throw new CircuitOpenError(this.service);
      this.trial = true;
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.openUntil = 0;
      this.trial = false;
      return result;
    } catch (error) {
      this.trial = false;
      if (countsAsFailure(error)) {
        this.failures += 1;
        if (this.failures >= this.threshold || this.openUntil !== 0) {
          this.openUntil = this.now() + this.openMs;
        }
      } else if (this.openUntil !== 0) {
        // The trial reached the service (the error is ours): it is up.
        this.failures = 0;
        this.openUntil = 0;
      }
      throw error;
    }
  }
}
