/**
 * Stability sweep 2026-11-02. An RDS Multi-AZ failover takes the database
 * away for 30–60 s and leaves every pooled connection dead; Redis and the
 * network drop commands the same way. These helpers tell such a transient
 * outage from a real failure and retry it with backoff, so a process rides
 * the outage out instead of failing requests and jobs (and ECS replacing
 * the task) for something that heals by itself.
 */

/** Prisma error codes that mean "could not talk to the database". */
const PRISMA_CONNECTION = new Set([
  'P1001', // can't reach the server
  'P1002', // server reached but timed out
  'P1008', // operation timed out
  'P1017', // server closed the connection
  'P2024', // connection pool timeout
]);
/** Prisma codes where the request provably never left this process. */
const PRISMA_NEVER_SENT = new Set(['P1001', 'P1002']);

/** SQLSTATE classes/codes of a restarting or failing-over server. */
const PG_TRANSIENT_STATES = new Set([
  '57P01', // admin_shutdown (terminating connection due to administrator command)
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now (starting up)
  '25006', // read_only_sql_transaction (old writer after a failover)
  '53300', // too_many_connections
]);

const MESSAGE_PATTERNS =
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|terminating connection|server closed the connection|connection (?:terminated|reset|closed)|can't reach database server|Connection is closed|Command timed out|Stream isn't writeable|read-only transaction|the database system is (?:starting up|shutting down)|Timed out fetching a new connection/i;

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  meta?: { code?: unknown } | null;
  cause?: unknown;
}

function codeOf(e: ErrorLike): string | undefined {
  if (typeof e.code === 'string') return e.code;
  const m = e.meta?.code;
  return typeof m === 'string' ? m : undefined;
}

/** A failed call that is worth repeating a moment later: the database,
 * Redis or the network was briefly unavailable. Never true for a plain
 * validation, constraint or logic error. */
export function isTransientInfraError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 3) return false;
  const e = error as ErrorLike;
  const code = codeOf(e);
  if (code && (PRISMA_CONNECTION.has(code) || PG_TRANSIENT_STATES.has(code))) {
    return true;
  }
  if (code && /^08/.test(code)) return true; // SQLSTATE class 08: connection exception
  if (typeof e.message === 'string' && MESSAGE_PATTERNS.test(e.message)) {
    return true;
  }
  return e.cause ? isTransientInfraError(e.cause, depth + 1) : false;
}

/** The request never reached the server (safe to repeat even a write). */
export function isUnreachableBeforeSend(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as ErrorLike;
  const code = codeOf(e);
  if (code && PRISMA_NEVER_SENT.has(code)) return true;
  return (
    typeof e.message === 'string' &&
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|can't reach database server/i.test(
      e.message,
    )
  );
}

export interface RetryTransientOptions {
  /** Stop retrying after this long in total (default 60 s). */
  windowMs?: number;
  /** First delay (default 500 ms), doubled up to [maxDelayMs]. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Max attempts regardless of the window (default unlimited). */
  maxAttempts?: number;
  /** Which errors to repeat (default: [isTransientInfraError]). */
  retriable?: (error: unknown) => boolean;
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    error: unknown;
  }) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Runs [fn]; on a transient infrastructure error waits (exponential
 * backoff with jitter) and runs it again until it succeeds, the error is
 * not transient, or the window is spent — then the last error is thrown. */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  options: RetryTransientOptions = {},
): Promise<T> {
  const windowMs = options.windowMs ?? 60_000;
  const base = options.baseDelayMs ?? 500;
  const max = options.maxDelayMs ?? 8_000;
  const retriable = options.retriable ?? isTransientInfraError;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const started = now();
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const delay = Math.min(max, base * 2 ** (attempt - 1));
      const wait = delay / 2 + Math.random() * (delay / 2);
      if (
        !retriable(error) ||
        (options.maxAttempts !== undefined && attempt >= options.maxAttempts) ||
        now() - started + wait > windowMs
      ) {
        throw error;
      }
      options.onRetry?.({ attempt, delayMs: Math.round(wait), error });
      await sleep(wait);
    }
  }
}
