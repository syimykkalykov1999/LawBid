import type Redis from 'ioredis';
import type { Logger } from '@nestjs/common';
import {
  CircuitBreaker,
  CircuitOpenError,
} from '../common/resilience/resilience';

/**
 * Load test 2026-11-02 (PR #606, docs/perf/LOAD_RESILIENCE_2026-11-02.md §2):
 * with Redis away for 40 s every request that touched it waited for ioredis'
 * `commandTimeout` (2 s, twice per request) and then failed with a 500.
 * ioredis queues commands while it reconnects («offline queue») and only
 * the timeout ends the wait.
 *
 * The big look-aside caches do the opposite: Facebook's memcache clients
 * («Scaling Memcache at Facebook», NSDI 2013) and Netflix's Hystrix
 * («fail fast, fail silent, fallback») give up on an unreachable node at
 * once and let the caller fall back, so a cache outage costs the latency of
 * a miss, not of a timeout. This gate does that for the ONE shared Redis
 * client of the request path:
 *
 *  - once the client has been ready and the connection is lost (status
 *    reconnecting / connecting / close / end) every command is refused
 *    immediately with [RedisUnavailableError]; the first boot still queues,
 *    and the handshake of a reconnect (status `connect`: auth, select, the
 *    ready-check `info`) always passes, or `ready` would never come;
 *  - a connected but hung node is handled by the project's CircuitBreaker:
 *    `timeoutThreshold` command timeouts in a row pause commands for
 *    `pauseMs`, then exactly one trial command gets through (the breaker
 *    shows up in the system-health snapshot as `redis_main`).
 *
 * A pipeline / MULTI gets ONE verdict for all its commands (ioredis writes
 * a pipeline only once every command passed `sendCommand`; refusing some of
 * them would desynchronise the reply stream).
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

/** ioredis connection states after a loss in which a command would only
 * wait: `connecting` is included because a dropped SYN keeps it for up to
 * `connectTimeout` (10 s). `connect` (TCP up, handshake running) is not. */
const LOST = new Set(['reconnecting', 'connecting', 'close', 'end']);

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

/** Installs the gate on [client] (in place). */
export function attachFailFast(
  client: Redis,
  options: FailFastOptions = {},
): FailFastGate {
  const breaker = new CircuitBreaker('redis_main', {
    threshold: options.timeoutThreshold ?? 5,
    openMs: options.pauseMs ?? 5000,
    now: options.now,
  });
  const original = client.sendCommand.bind(client) as (
    ...args: unknown[]
  ) => unknown;
  const statusOf = () => (client as unknown as { status?: string }).status;
  let everReady = statusOf() === 'ready';
  // One verdict per pipeline: ioredis hands every command of a pipeline the
  // same `stream` object (`isPipeline: true`).
  const pipelineVerdicts = new WeakMap<object, RedisUnavailableError | null>();

  const lost = () => everReady && LOST.has(statusOf() ?? '');

  const refuse = (command: CommandLike, error: RedisUnavailableError) => {
    command.reject(error);
    return command.promise;
  };

  client.sendCommand = (command: CommandLike, ...rest: unknown[]) => {
    const stream = rest[0] as { isPipeline?: boolean } | undefined;
    const pipe = stream && stream.isPipeline ? stream : undefined;
    if (pipe && pipelineVerdicts.has(pipe)) {
      const verdict = pipelineVerdicts.get(pipe);
      return verdict ? refuse(command, verdict) : original(command, ...rest);
    }
    let verdict: RedisUnavailableError | null = null;
    if (lost()) verdict = new RedisUnavailableError('disconnected');
    if (pipe) pipelineVerdicts.set(pipe, verdict);
    if (verdict) return refuse(command, verdict);
    // The breaker only guards a connected-but-hung node; while ioredis is
    // handshaking its own commands must pass.
    if (statusOf() !== 'ready') return original(command, ...rest);
    // `run` calls `fn` synchronously (ioredis needs that for pipelines) and
    // watches the outcome; only `Command timed out` counts as a failure.
    const guarded = breaker.run(
      () => original(command, ...rest) as Promise<unknown>,
      isCommandTimeout,
    );
    guarded.catch((error: unknown) => {
      if (error instanceof CircuitOpenError) {
        command.reject(new RedisUnavailableError('timeouts'));
      }
    });
    return command.promise;
  };

  client.on('ready', () => {
    everReady = true;
    breaker.reset();
  });

  return {
    get refusing() {
      return lost() || (statusOf() === 'ready' && breaker.isOpen);
    },
  };
}

/** A warning that may fire at most once per [everyMs] (the Redis fallbacks
 * log one line a minute during an outage, not one per request). */
export function throttledWarn(
  logger: Pick<Logger, 'warn'>,
  everyMs = 60_000,
  now: () => number = Date.now,
): (context: Record<string, unknown>, message: string) => void {
  let last = -Infinity;
  return (context, message) => {
    const t = now();
    if (t - last < everyMs) return;
    last = t;
    logger.warn(context, message);
  };
}
