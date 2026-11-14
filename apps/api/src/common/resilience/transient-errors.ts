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
/** SQLSTATE classes/codes of a restarting or failing-over server. */
const PG_TRANSIENT_STATES = new Set([
  '57P01', // admin_shutdown (terminating connection due to administrator command)
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now (starting up)
  '25006', // read_only_sql_transaction (old writer after a failover)
  '53300', // too_many_connections
]);

/** OS-level socket errors. Prisma 7 (driver adapter) puts them in `code`
 * (`ECONNREFUSED` …) where Prisma 6 said P1001 / P1017. */
const SOCKET_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

/** node-pg's pool when no connection frees up within
 * `connectionTimeoutMillis` (Prisma 7's P2024; Prisma passes this plain
 * Error through, measured 13.11 with @prisma/adapter-pg 7.10.1). */
export const PG_POOL_TIMEOUT = /timeout exceeded when trying to connect/i;

const MESSAGE_PATTERNS =
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|terminating connection|server closed the connection|connection (?:terminated|reset|closed)|can't reach database server|Connection is closed|Command timed out|Stream isn't writeable|read-only transaction|the database system is (?:starting up|shutting down)|Timed out fetching a new connection|timeout exceeded when trying to connect/i;

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  meta?: {
    code?: unknown;
    driverAdapterError?: { cause?: { originalCode?: unknown } };
  } | null;
  cause?: unknown;
}

/**
 * The PostgreSQL SQLSTATE behind a Prisma error. Prisma 6 put it in
 * `meta.code`; Prisma 7 (driver adapter) in
 * `meta.driverAdapterError.cause.originalCode` (P2010 raw queries) or, for a
 * `DriverAdapterError` it passes through unwrapped (a failed COMMIT), in
 * `cause.originalCode`. Measured 13.11 with @prisma/adapter-pg 7.10.1.
 */
export function sqlStateOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as ErrorLike;
  const fromMeta =
    e.meta?.code ?? e.meta?.driverAdapterError?.cause?.originalCode;
  if (typeof fromMeta === 'string') return fromMeta;
  const cause = e.cause as { originalCode?: unknown } | undefined;
  if (
    (error as { name?: unknown }).name === 'DriverAdapterError' &&
    typeof cause?.originalCode === 'string'
  ) {
    return cause.originalCode;
  }
  return undefined;
}

/** The error's own code and, behind a Prisma code such as P2010, the
 * SQLSTATE it wraps (Prisma 7 nests it; see sqlStateOf). */
function codesOf(e: ErrorLike): string[] {
  const out: string[] = [];
  if (typeof e.code === 'string') out.push(e.code);
  const state = sqlStateOf(e);
  if (state) out.push(state);
  return out;
}

/** A code that means the database / network connection was lost. */
function isConnectionCode(e: ErrorLike): boolean {
  return codesOf(e).some(
    (code) =>
      PRISMA_CONNECTION.has(code) ||
      PG_TRANSIENT_STATES.has(code) ||
      SOCKET_CODES.has(code) ||
      /^08/.test(code), // SQLSTATE class 08: connection exception
  );
}

/** A failed call that is worth repeating a moment later: the database,
 * Redis or the network was briefly unavailable. Never true for a plain
 * validation, constraint or logic error. */
export function isTransientInfraError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 3) return false;
  // A paused circuit (database or partner service) heals by itself.
  if ((error as { name?: unknown }).name === 'CircuitOpenError') return true;
  const e = error as ErrorLike;
  if (isConnectionCode(e)) return true;
  if (typeof e.message === 'string' && MESSAGE_PATTERNS.test(e.message)) {
    return true;
  }
  return e.cause ? isTransientInfraError(e.cause, depth + 1) : false;
}

/** The request never reached the server (safe to repeat even a write). */
export function isUnreachableBeforeSend(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as ErrorLike;
  // Only the OS-level «no connection could be made» errors. Prisma's P1001
  // is NOT trusted: the engine can also raise it for a connection that
  // dropped mid-query, and repeating a write that may have run doubles it.
  // Prisma 7 puts the OS code in `code` (its message is empty).
  if (
    typeof e.code === 'string' &&
    /^(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN)$/.test(e.code)
  ) {
    return true;
  }
  return (
    typeof e.message === 'string' &&
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(e.message)
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

/** The DATABASE was briefly away (Prisma connection codes, PostgreSQL
 * shutdown/failover states, a paused `database#…` circuit). Narrower than
 * [isTransientInfraError] on purpose: used to repeat a whole job body, so
 * it must not match a timeout of a partner HTTP call (FCM, Stripe, SES…)
 * whose side effect may already have happened, nor a Redis outage (the
 * job's lock is lost with it and another worker takes the job over). */
export function isDatabaseOutageError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 3) return false;
  const e = error as ErrorLike & { name?: unknown; service?: unknown };
  if (e.name === 'CircuitOpenError') {
    return typeof e.service === 'string' && e.service.startsWith('database');
  }
  if (isConnectionCode(e)) return true;
  if (
    typeof e.message === 'string' &&
    /terminating connection|server closed the connection|can't reach database server|read-only transaction|the database system is (?:starting up|shutting down)|Timed out fetching a new connection|timeout exceeded when trying to connect/i.test(
      e.message,
    )
  ) {
    return true;
  }
  return e.cause ? isDatabaseOutageError(e.cause, depth + 1) : false;
}
