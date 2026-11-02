import type Redis from 'ioredis';

/**
 * Load test 2026-11-02 (docs/perf/LOAD_RESILIENCE_2026-11-02.md, §2): with
 * Redis away for 40 s every request that touched it waited for ioredis'
 * `commandTimeout` (2 s, twice per request) and then failed with a 500.
 * ioredis queues commands while it reconnects («offline queue») and only
 * the timeout ends the wait.
 *
 * The big look-aside caches do the opposite: Facebook's memcache clients
 * («Scaling Memcache at Facebook», NSDI 2013) and Netflix's Hystrix
 * («fail fast, fail silent, fallback») give up on an unreachable node at
 * once and let the caller fall back, so a cache outage costs latency of a
 * miss, not of a timeout. This gate does that for the ONE shared Redis
 * client of the request path:
 *
 *  - while the connection is lost (`status` reconnecting / close / end)
 *    every command is refused immediately with [RedisUnavailableError]
 *    (boot — status `connecting` / `wait` — still queues as before);
 *  - after `timeoutThreshold` command timeouts in a row (Redis reachable
 *    but hung) commands are refused for `pauseMs`, then one gets through.
 *
 * Callers that fall back (throttler, cost guard, badges, caches …) keep
 * their fallback and get it in microseconds; the rest surface through
 * AllExceptionsFilter as 503 SERVER_BUSY + Retry-After instead of a 500
 * after seconds (see [isRedisInfraError]).
 */
export class RedisUnavailableError extends Error {
  constructor(readonly reason: 'disconnected' | 'timeouts') {
    super(
      reason === 'disconnected'
        ? 'Redis is reconnecting; command refused at once'
        : 'Redis keeps timing out; commands paused for a short while',
    );
    this.name = 'RedisUnavailableError';
  }
}

export interface FailFastOptions {
  /** Command timeouts in a row that pause commands (default 5). */
  timeoutThreshold?: number;
  /** How long commands are refused after the threshold (default 5000 ms). */
  pauseMs?: number;
  now?: () => number;
}

/** The part of ioredis' Command the gate touches (public since ioredis 4). */
interface CommandLike {
  name: string;
  promise: Promise<unknown>;
  reject(error: Error): void;
}

/** ioredis connection states in which a command would only wait. */
const LOST = new Set(['reconnecting', 'close', 'end']);

export function isCommandTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === 'Command timed out';
}

/** An error that means «Redis itself is unavailable right now» (not a
 * wrong command): the gate's own error, ioredis' timeout, its retry limit
 * and its closed-connection errors. */
export function isRedisInfraError(error: unknown): boolean {
  if (error instanceof RedisUnavailableError) return true;
  if (!(error instanceof Error)) return false;
  return (
    isCommandTimeout(error) ||
    error.name === 'MaxRetriesPerRequestError' ||
    error.message.startsWith("Stream isn't writeable") ||
    error.message === 'Connection is closed.'
  );
}

export interface FailFastGate {
  /** True while commands are being refused (lost connection or pause). */
  readonly refusing: boolean;
}

/** Installs the gate on [client] (in place; returns the client). */
export function attachFailFast(
  client: Redis,
  options: FailFastOptions = {},
): FailFastGate {
  const threshold = options.timeoutThreshold ?? 5;
  const pauseMs = options.pauseMs ?? 5000;
  const now = options.now ?? Date.now;
  let timeouts = 0;
  let pausedUntil = 0;
  const original = client.sendCommand.bind(client) as (
    ...args: unknown[]
  ) => unknown;
  const statusOf = () => (client as unknown as { status?: string }).status;

  client.sendCommand = (command: CommandLike, ...rest: unknown[]) => {
    if (LOST.has(statusOf() ?? '')) {
      command.reject(new RedisUnavailableError('disconnected'));
      return command.promise;
    }
    if (pausedUntil > now()) {
      command.reject(new RedisUnavailableError('timeouts'));
      return command.promise;
    }
    const result = original(command, ...rest);
    // Watch the outcome without changing it: timeouts in a row open the
    // pause, any success closes it. (The caller still gets the rejection.)
    command.promise.then(
      () => {
        timeouts = 0;
      },
      (error: unknown) => {
        if (!isCommandTimeout(error)) {
          timeouts = 0;
          return;
        }
        timeouts += 1;
        if (timeouts >= threshold) {
          pausedUntil = now() + pauseMs;
          timeouts = 0;
        }
      },
    );
    return result;
  };

  client.on('ready', () => {
    timeouts = 0;
    pausedUntil = 0;
  });

  return {
    get refusing() {
      return LOST.has(statusOf() ?? '') || pausedUntil > now();
    },
  };
}
