import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Stage 2 SRE (Б5, 25.11): deadline propagation and cancellation, Google SRE
 * Book ch. 22 «Addressing Cascading Failures» — «Deadline propagation» and
 * «Cancellation propagation». The app says how long it will wait
 * (`X-Request-Timeout-Ms`, the header Envoy uses for the same job:
 * `x-envoy-expected-rq-timeout-ms`, envoyproxy/envoy docs «HTTP header
 * manipulation / router filter», Apache-2.0); work the app already gave up
 * on is dropped instead of finishing for nobody:
 *
 *  - the scope below carries the deadline and an AbortSignal through the
 *    request (Node AsyncLocalStorage — the way `job-signal.ts` carries a cron
 *    job's stop signal, BullMQ «Cancelling jobs»);
 *  - the signal fires at the deadline and when the app closes the
 *    connection first (Node docs: `res.on('close')` with `!writableFinished`
 *    = the client went away);
 *  - a read sent to the database after that stops before it is sent
 *    (`requestDeadlineExtension`), an interactive transaction gets
 *    `SET LOCAL statement_timeout` = the time left, so Postgres itself
 *    cancels a query that runs past it (prisma.service.ts), and an outbound
 *    `fetch` started by the request is aborted (outbound-agent.ts);
 *  - the error answers 504 `DEADLINE_EXCEEDED` (the gRPC status name).
 *
 * Only reads (GET / HEAD) take part: a write keeps running to the end, so
 * nothing is ever half-saved (the app repeats a write with the same
 * Idempotency-Key). Without the header nothing changes; the server's own
 * ceiling (`REQUEST_TIMEOUT_MS`) is the most the header can ask for. Admin
 * switch: `client.deadline_header_enabled` (the apps stop sending the
 * header, and this server stops honouring it at once).
 */
export const DEADLINE_HEADER = 'x-request-timeout-ms';

/** The database role's own `statement_timeout` (infra/postgres/
 * role-settings.sql). `SET LOCAL` may only LOWER it, never raise it. */
export const STATEMENT_TIMEOUT_CEILING_MS = 30_000;

export type DeadlineReason = 'deadline' | 'client_closed';

export class RequestDeadlineError extends Error {
  constructor(readonly reason: DeadlineReason) {
    super(
      reason === 'deadline'
        ? 'request deadline exceeded'
        : 'client closed the request',
    );
    this.name = 'RequestDeadlineError';
  }
}

interface DeadlineScope {
  /** Epoch ms after which the client no longer waits. */
  readonly deadline: number;
  readonly controller: AbortController;
  /** False once the answer went out: a timer or a fire-and-forget task
   * that outlives the request is never stopped by it. */
  live: boolean;
}

const scopes = new AsyncLocalStorage<DeadlineScope>();

function liveScope(): DeadlineScope | undefined {
  const s = scopes.getStore();
  return s?.live ? s : undefined;
}

/** The header value as milliseconds, clamped to [1, ceilingMs]; null when
 * absent or not a whole positive number. */
export function parseDeadlineHeader(
  raw: unknown,
  ceilingMs: number,
): number | null {
  const v = Array.isArray(raw) ? (raw[0] as unknown) : raw;
  if (typeof v !== 'string' || !/^\d{1,9}$/.test(v.trim())) return null;
  const ms = Number(v.trim());
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, Math.max(1, ceilingMs));
}

/** Runs [fn] inside a deadline scope of [ms] (tests and the middleware). */
export function runWithDeadline<T>(
  ms: number,
  fn: () => T,
  now: number = Date.now(),
): { result: T; controller: AbortController; end: () => void } {
  const controller = new AbortController();
  const scope: DeadlineScope = { deadline: now + ms, controller, live: true };
  const timer = setTimeout(
    () => controller.abort(new RequestDeadlineError('deadline')),
    Math.max(0, ms),
  );
  timer.unref?.();
  const result = scopes.run(scope, fn);
  return {
    result,
    controller,
    end: () => {
      clearTimeout(timer);
      scope.live = false;
    },
  };
}

/** The current request's stop signal (undefined outside a deadline scope). */
export function currentDeadlineSignal(): AbortSignal | undefined {
  return liveScope()?.controller.signal;
}

/** Milliseconds left before the deadline; null outside a scope. */
export function deadlineRemainingMs(now: number = Date.now()): number | null {
  const s = liveScope();
  return s ? s.deadline - now : null;
}

/** True when the current request is past its deadline or was told to stop
 * (the moment Postgres' statement_timeout and our timer race). */
export function deadlinePassedNow(now: number = Date.now()): boolean {
  const s = liveScope();
  if (!s) return false;
  return s.controller.signal.aborted || now >= s.deadline;
}

/** Throws [RequestDeadlineError] when the current request was told to stop. */
export function throwIfDeadlinePassed(now: number = Date.now()): void {
  const s = liveScope();
  if (!s) return;
  if (s.controller.signal.aborted) {
    const r: unknown = s.controller.signal.reason;
    throw r instanceof RequestDeadlineError
      ? r
      : new RequestDeadlineError('deadline');
  }
  if (now >= s.deadline) throw new RequestDeadlineError('deadline');
}

/** `statement_timeout` for a transaction of the current request: the time
 * left, at most the role's own value; null when there is no deadline. */
export function deadlineStatementTimeoutMs(
  now: number = Date.now(),
): number | null {
  const left = deadlineRemainingMs(now);
  if (left === null) return null;
  return Math.max(1, Math.min(Math.floor(left), STATEMENT_TIMEOUT_CEILING_MS));
}

/** An error caused by the request's own deadline or hang-up. */
export function isDeadlineError(e: unknown): boolean {
  if (e instanceof RequestDeadlineError) return true;
  const cause = (e as { cause?: unknown } | null)?.cause;
  return cause instanceof RequestDeadlineError;
}
