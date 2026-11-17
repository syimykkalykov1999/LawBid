import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import {
  Observable,
  catchError,
  concatMap,
  defer,
  from,
  of,
  switchMap,
  throwError,
} from 'rxjs';
import { ErrorCode } from '../common/errors/error-code.enum';
import { REDIS_CLIENT } from '../redis/redis.constants';

/** 24h replay window for a completed request. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
/** How long an in-flight claim blocks duplicates. Must comfortably
 * exceed the slowest guarded handler (an SMS provider call); if a
 * process dies mid-request the key frees itself after this, instead of
 * blocking the client's retries for the full replay window. */
export const IDEMPOTENCY_PENDING_TTL_SECONDS = 60;
const HEADER = 'idempotency-key';
/** Set on a request once an instance of the interceptor has taken it. */
const IDEMPOTENCY_SEEN = Symbol('idempotency.seen');
const MAX_KEY_LENGTH = 255;

type StoredRecord =
  | { state: 'pending'; token: string; fingerprint: string }
  | { state: 'done'; fingerprint: string; status: number; body: unknown };

// Deletes the claim only if it is still OURS (same token) and still
// pending — a completed record or someone else's newer claim is left
// alone.
const RELEASE_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local ok, rec = pcall(cjson.decode, current)
if ok and rec.state == 'pending' and rec.token == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/**
 * docs/06_PRODUCTION.md §12 (.cursorrules): "Все POST, создающие
 * ресурс/деньги: Idempotency-Key." Global for every POST that carries the
 * header (verify 17.11); a route may still name it — it then runs once.
 *
 * Key: `idempotency:<userId-or-anon>:<METHOD>:<url>:<Idempotency-Key>`.
 *
 * Protocol (atomic — the earlier GET-then-SET let two concurrent
 * duplicates both miss the cache and both run the handler, e.g. two
 * billed SMS sends):
 * 1. Claim with `SET key {pending,token,fingerprint} NX EX 60`. Exactly
 *    one request can win; only the winner runs the handler.
 * 2. Winner, on success: overwrite with `{done,status,body}` for 24h
 *    BEFORE the response is written, so any retry that arrives after the
 *    client saw the response is guaranteed a replay.
 *    Winner, on error: release the claim (compare-and-delete on its
 *    token) so the client can retry the same key — errors are not cached.
 * 3. A loser that finds `done` replays status+body byte-for-byte; one
 *    that finds `pending` gets 409 IDEMPOTENCY_KEY_CONFLICT
 *    (details.reason='in_progress', Retry-After: 1) rather than waiting:
 *    holding a request open to poll Redis would tie up a connection per
 *    duplicate for the length of the slowest provider call, and the
 *    client already retries on 409/timeout.
 * 4. The fingerprint (sha256 of method, URL and JSON body) must match:
 *    the same key with a different payload is a client bug (or an
 *    attempt to fish another caller's cached response on an anonymous
 *    route) and gets 409 IDEMPOTENCY_KEY_CONFLICT
 *    (details.reason='payload_mismatch') — never someone else's body.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  /** The global copy (see [GlobalIdempotencyInterceptor]). */
  protected readonly signedInOnly: boolean = false;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.header(HEADER);
    // Verify 17.11: registered globally AND still named on some routes —
    // the first (outer) instance owns the request, an inner one only passes
    // it on (a second claim would find its own pending record → 409).
    const marked = req as { [IDEMPOTENCY_SEEN]?: true; userId?: string };
    if (marked[IDEMPOTENCY_SEEN]) return next.handle();
    // The global copy guards signed-in requests only: webhooks (Stripe,
    // Bunny, SNS, Twilio) and other anonymous routes are left exactly as
    // before — a route that wants it names the interceptor itself.
    if (this.signedInOnly && !marked.userId) return next.handle();
    marked[IDEMPOTENCY_SEEN] = true;

    if (!key || req.method === 'GET' || req.method === 'HEAD') {
      // Enforcement (400 IDEMPOTENCY_KEY_REQUIRED) belongs to the route's
      // DTO/guard — this interceptor only handles replay when a key IS
      // present, to stay a single-purpose unit.
      return next.handle();
    }
    if (key.length > MAX_KEY_LENGTH) {
      return throwError(
        () =>
          new ConflictException({
            code: ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
            message: `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters.`,
            details: { reason: 'invalid_key' },
          }),
      );
    }

    const userId = (req as { userId?: string }).userId ?? 'anon';
    const cacheKey = `idempotency:${userId}:${req.method}:${req.originalUrl}:${key}`;
    const fingerprint = this.fingerprint(req);
    const token = randomUUID();

    return from(this.claim(cacheKey, token, fingerprint)).pipe(
      switchMap((existing) => {
        if (existing === null) {
          return this.runAndStore(next, res, cacheKey, token, fingerprint);
        }
        if (existing.fingerprint !== fingerprint) {
          // The global copy: a route that never promised replays (e.g. an
          // outbox job re-sent with its own stable key and new file ids)
          // runs as a new request instead of being refused for ever.
          if (this.signedInOnly) return next.handle();
          return throwError(() => this.conflict('payload_mismatch'));
        }
        if (existing.state === 'pending') {
          res.setHeader('Retry-After', '1');
          return throwError(() => this.conflict('in_progress'));
        }
        res.status(existing.status);
        return of(existing.body);
      }),
    );
  }

  /** null = we own the key now; otherwise the record that beat us. */
  private async claim(
    cacheKey: string,
    token: string,
    fingerprint: string,
  ): Promise<StoredRecord | null> {
    const pending: StoredRecord = { state: 'pending', token, fingerprint };
    // Two attempts: the record we lost to can expire or be released
    // between our failed SET NX and our GET.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const won = await this.redis.set(
        cacheKey,
        JSON.stringify(pending),
        'EX',
        IDEMPOTENCY_PENDING_TTL_SECONDS,
        'NX',
      );
      if (won === 'OK') return null;
      const current = await this.redis.get(cacheKey);
      if (current !== null) return JSON.parse(current) as StoredRecord;
    }
    // Still contended after a retry: treat as in flight.
    return { state: 'pending', token: '', fingerprint };
  }

  private runAndStore(
    next: CallHandler<unknown>,
    res: Response,
    cacheKey: string,
    token: string,
    fingerprint: string,
  ): Observable<unknown> {
    return next.handle().pipe(
      concatMap((body: unknown) =>
        defer(async () => {
          const done: StoredRecord = {
            state: 'done',
            fingerprint,
            status: res.statusCode,
            body,
          };
          try {
            await this.redis.set(
              cacheKey,
              JSON.stringify(done),
              'EX',
              IDEMPOTENCY_TTL_SECONDS,
            );
          } catch {
            // The side effect already happened — never turn it into a
            // 500 because the replay record couldn't be written. Free the
            // claim so a retry isn't stuck behind it for the pending TTL.
            await this.release(cacheKey, token);
          }
          return body;
        }),
      ),
      catchError((error: unknown) =>
        from(this.release(cacheKey, token)).pipe(
          switchMap(() => throwError(() => error)),
        ),
      ),
    );
  }

  private async release(cacheKey: string, token: string): Promise<void> {
    try {
      await this.redis.eval(RELEASE_LUA, 1, cacheKey, token);
    } catch {
      // Best effort: the pending TTL frees the key anyway.
    }
  }

  private fingerprint(req: Request): string {
    return createHash('sha256')
      .update(req.method)
      .update('\n')
      .update(req.originalUrl)
      .update('\n')
      .update(JSON.stringify(req.body ?? null))
      .digest('hex');
  }

  private conflict(
    reason: 'in_progress' | 'payload_mismatch',
  ): ConflictException {
    return new ConflictException({
      code: ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
      message:
        reason === 'in_progress'
          ? 'A request with this Idempotency-Key is still being processed. Retry shortly.'
          : 'This Idempotency-Key was already used with a different request payload.',
      details: { reason },
    });
  }
}

/**
 * Verify 17.11 (Stripe: an Idempotency-Key on any POST): registered as an
 * APP_INTERCEPTOR so every signed-in keyed request is applied once. Differs
 * from the route-level copy in two ways: anonymous requests (webhooks,
 * sign-in) pass untouched, and a different body under a seen key runs as a
 * new request rather than 409 (the route-level copy stays strict). The key
 * is scoped by user, method and URL, so one person's response is never
 * replayed to another.
 */
@Injectable()
export class GlobalIdempotencyInterceptor extends IdempotencyInterceptor {
  protected override readonly signedInOnly = true;

  override intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    // A route (or its controller) that names the interceptor keeps its own,
    // strict copy — the global one steps aside entirely.
    if (
      namesInterceptor(context.getHandler()) ||
      namesInterceptor(context.getClass())
    ) {
      return next.handle();
    }
    return super.intercept(context, next);
  }
}

function namesInterceptor(target: object | undefined): boolean {
  if (!target) return false;
  const list = Reflect.getMetadata(INTERCEPTORS_METADATA, target) as
    unknown[] | undefined;
  return (list ?? []).some((i) => i === IdempotencyInterceptor);
}
