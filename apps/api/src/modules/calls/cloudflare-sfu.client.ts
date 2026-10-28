/**
 * Cloudflare Realtime SFU: the plain HTTP API (no RealtimeKit), as one
 * adapter. Every request/response shape below was read from Cloudflare's
 * OpenAPI file https://developers.cloudflare.com/realtime/static/calls-api-2024-05-21.yaml
 * (confirmed 2026-10-24); nothing else in the code base knows the wire
 * format. Base: https://rtc.live.cloudflare.com/v1, `Authorization: Bearer
 * <App Secret>`. The secret is only ever put in that header; no error or log
 * line made here contains it.
 *
 * Documented behaviours the broker relies on:
 *  - `sessions/new` -> `{ sessionId }` (one session = one PeerConnection).
 *  - `tracks/new` takes `location: "local"` (publish, with the client's
 *    offer) OR `"remote"` (pull, by publisher `sessionId` + `trackName`),
 *    never both in one request. A pull answers with an SFU *offer* and
 *    `requiresImmediateRenegotiation`.
 *  - `renegotiate` carries the client's *answer* to that offer.
 *  - `tracks/close` is addressed by `mid` (not trackName); `force: true`
 *    closes without a renegotiation round.
 *  - HTTP 200 may still hold a top-level or per-track `errorCode`.
 *
 * Failure classes (audit 2026-10-26, CF-1 / CF-3 / CF-4 / FO-3 / TS-1):
 *  - outage      5xx, timeout, network, in-body backend / transient codes:
 *                retried once with a short backoff, then counted by the
 *                breaker (N in M) and answered 503 so the call moves;
 *  - config      401 / 403 (refused key) or 404 on the APP itself (wrong or
 *                not-yet-propagated App ID): counted, never the caller's
 *                fault, admin sees «App ID не найден …»;
 *  - rate limit  429 (50 req/s per session): retried once after the
 *                backoff, never counted — one looping phone is not an outage;
 *  - session     the SFU no longer knows this session: the phone opens a
 *                fresh one (409 from the broker);
 *  - caller      anything else (a refused SDP, a bad mid …): 4xx, not counted.
 */
export const CLOUDFLARE_SFU_BASE = 'https://rtc.live.cloudflare.com/v1';
/** In-call mutations (tracks/new, renegotiate, …): one attempt waits this long. */
export const CLOUDFLARE_SFU_TIMEOUT_MS = 8_000;
/** The retry of a mutation must fit in this total budget. */
export const CLOUDFLARE_SFU_BUDGET_MS = 12_000;
/** TS-1: `sessions/new` of a NEW call has a TURN-like budget — a dead SFU
 * is found within 2.5 s, so the mesh fallback starts well inside 3 s. */
export const CLOUDFLARE_SFU_CONNECT_TIMEOUT_MS = 2_000;
export const CLOUDFLARE_SFU_CONNECT_BUDGET_MS = 2_500;
/** Backoff before the one retry: 200 ms plus up to 200 ms of jitter. */
export const CLOUDFLARE_SFU_RETRY_BACKOFF_MS = 200;
export const CLOUDFLARE_SFU_RETRY_JITTER_MS = 200;
/** A retry needs at least this much of the budget left to be worth it. */
const MIN_RETRY_WINDOW_MS = 300;
/** A 429 `Retry-After` above this is not waited for (the caller retries). */
const MAX_RETRY_AFTER_MS = 2_000;
/** Cloudflare: at most 64 tracks per request. */
export const CLOUDFLARE_SFU_MAX_TRACKS_PER_REQUEST = 64;
/** CF-1 / TS-6: what the admin reads when Cloudflare answers 404 for the
 * App — a freshly created App (or TURN key) is not served for up to 60 s. */
export const CLOUDFLARE_SFU_APP_NOT_FOUND_HINT =
  'App ID не найден: подождите до 60 с после создания App в Cloudflare и нажмите «Проверить» снова (или проверьте App ID)';

/** In-body `errorCode`s of Cloudflare's own failures (HTTP 200): CF-4. */
export const CLOUDFLARE_SFU_TRANSIENT_CODES: ReadonlySet<string> = new Set([
  'retryable_transient_error',
  'temporarily_unavailable_error',
  'transport_unavailable_error',
  'backend_error',
  'internal_error',
]);
/** The SFU forgot (or never had) this session: the phone must open a new one. */
export const CLOUDFLARE_SFU_SESSION_CODES: ReadonlySet<string> = new Set([
  'session_error',
  'session_not_found',
  'invalid_session',
]);
/** The App itself is unknown (wrong App ID, or created < 60 s ago). */
export const CLOUDFLARE_SFU_APP_CODES: ReadonlySet<string> = new Set([
  'not_found',
  'app_not_found',
  'invalid_app',
]);

export type CloudflareSfuErrorKind =
  'outage' | 'config' | 'rate_limit' | 'session' | 'caller';

export interface SfuSessionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface SfuSimulcast {
  preferredRid?: string;
  priorityOrdering?: 'none' | 'asciibetical';
  ridNotAvailable?: 'none' | 'asciibetical';
}

export interface SfuTrackRequest {
  location: 'local' | 'remote';
  /** Local: the transceiver mid in the offer. */
  mid?: string;
  trackName?: string;
  /** Remote: the publisher's session. */
  sessionId?: string;
  simulcast?: SfuSimulcast;
}

export interface SfuTrackResult {
  location?: 'local' | 'remote';
  mid?: string;
  trackName?: string;
  sessionId?: string;
  errorCode?: string;
  errorDescription?: string;
}

export interface SfuTracksResponse {
  errorCode?: string;
  errorDescription?: string;
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: SfuSessionDescription;
  tracks?: SfuTrackResult[];
}

export class CloudflareSfuError extends Error {
  /** Which class of failure this is (see the file header). */
  readonly kind: CloudflareSfuErrorKind;
  /** 429: Cloudflare's `Retry-After`, in ms, when it sent a usable one. */
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    /** HTTP status, 0 = network / timeout. */
    readonly status: number,
    /** Cloudflare's `errorCode`, when it sent one. */
    readonly code?: string,
    opts: { kind?: CloudflareSfuErrorKind; retryAfterMs?: number | null } = {},
  ) {
    super(message);
    this.name = 'CloudflareSfuError';
    this.kind = opts.kind ?? CloudflareSfuError.classify(status, code);
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }

  /** The default class of a (status, code) pair; the constructor's `kind`
   * overrides it where the route matters (a 404 on the App vs a session). */
  static classify(status: number, code?: string): CloudflareSfuErrorKind {
    if (status === 0 || status >= 500) return 'outage';
    if (status === 429) return 'rate_limit';
    if (status === 401 || status === 403) return 'config';
    if (code && CLOUDFLARE_SFU_TRANSIENT_CODES.has(code)) return 'outage';
    if (code && CLOUDFLARE_SFU_SESSION_CODES.has(code)) return 'session';
    if (code && CLOUDFLARE_SFU_APP_CODES.has(code)) return 'config';
    return 'caller';
  }

  /** Worth counting against the health of Cloudflare (not the caller's fault). */
  get isOutage(): boolean {
    return this.kind === 'outage';
  }
  /** The keys / App ID are wrong or not yet live on Cloudflare's side:
   * counted by the breaker, shown to the admin, never blamed on the caller. */
  get isConfigFailure(): boolean {
    return this.kind === 'config';
  }
  /** HTTP 429: THIS session asks too often; not an outage, never counted. */
  get isRateLimited(): boolean {
    return this.kind === 'rate_limit';
  }
  /** The SFU no longer has the session: the phone must open a fresh one. */
  get isSessionGone(): boolean {
    return this.kind === 'session';
  }
  /** Counted by the breaker (an outage or a wrong / dead configuration). */
  get countsAgainstCloudflare(): boolean {
    return this.isOutage || this.isConfigFailure;
  }
  /** Worth one more try after a short backoff. */
  get isRetryable(): boolean {
    return this.isOutage || this.isRateLimited;
  }
}

export interface CloudflareSfuCreds {
  appId: string;
  appToken: string;
}

export interface CloudflareSfuClientOptions {
  /** One in-call mutation attempt (default [CLOUDFLARE_SFU_TIMEOUT_MS]). */
  timeoutMs?: number;
  /** Both attempts of a mutation together (default [CLOUDFLARE_SFU_BUDGET_MS]). */
  budgetMs?: number;
  /** One `sessions/new` attempt (default [CLOUDFLARE_SFU_CONNECT_TIMEOUT_MS]). */
  connectTimeoutMs?: number;
  /** Both `sessions/new` attempts together (default [CLOUDFLARE_SFU_CONNECT_BUDGET_MS]). */
  connectBudgetMs?: number;
  /** The wait before a retry (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
  /** Clock (tests). */
  now?: () => number;
}

interface Budget {
  timeoutMs: number;
  budgetMs: number;
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class CloudflareSfuClient {
  private readonly mutation: Budget;
  private readonly connect: Budget;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly creds: CloudflareSfuCreds,
    private readonly fetchImpl: typeof fetch = fetch,
    opts: CloudflareSfuClientOptions | number = {},
  ) {
    // The third argument used to be the mutation timeout alone.
    const o: CloudflareSfuClientOptions =
      typeof opts === 'number' ? { timeoutMs: opts } : opts;
    const timeoutMs = o.timeoutMs ?? CLOUDFLARE_SFU_TIMEOUT_MS;
    this.mutation = {
      timeoutMs,
      budgetMs: Math.max(
        timeoutMs,
        o.budgetMs ??
          (o.timeoutMs === undefined
            ? CLOUDFLARE_SFU_BUDGET_MS
            : Math.round(timeoutMs * 1.5)),
      ),
    };
    const connectTimeoutMs =
      o.connectTimeoutMs ?? CLOUDFLARE_SFU_CONNECT_TIMEOUT_MS;
    this.connect = {
      timeoutMs: connectTimeoutMs,
      budgetMs: Math.max(
        connectTimeoutMs,
        o.connectBudgetMs ?? CLOUDFLARE_SFU_CONNECT_BUDGET_MS,
      ),
    };
    this.sleep = o.sleep ?? realSleep;
    this.now = o.now ?? Date.now;
  }

  private url(path: string): string {
    return `${CLOUDFLARE_SFU_BASE}/apps/${encodeURIComponent(this.creds.appId)}${path}`;
  }

  private sessionPath(sessionId: string, tail: string): string {
    return `/sessions/${encodeURIComponent(sessionId)}${tail}`;
  }

  /**
   * One request with ONE bounded retry (FO-3 / CF-3): an outage (5xx,
   * timeout, network, Cloudflare's transient in-body codes) or a 429 is
   * tried again after 200–400 ms, as long as the budget of this route still
   * allows a real second attempt (≥ 300 ms left). The retry runs inside
   * the caller's per-session queue (the broker holds the lock around the
   * whole call), so a session never has two requests in flight. Nothing
   * else is retried: a refused key, an unknown App, a bad SDP are final.
   */
  private async call<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body: unknown,
    budget: Budget,
  ): Promise<T> {
    const deadline = this.now() + budget.budgetMs;
    for (let attempt = 0; ; attempt++) {
      const left = deadline - this.now();
      const timeoutMs = Math.max(1, Math.min(budget.timeoutMs, left));
      try {
        return await this.once<T>(method, path, body, timeoutMs);
      } catch (e) {
        if (
          attempt > 0 ||
          !(e instanceof CloudflareSfuError) ||
          !e.isRetryable
        ) {
          throw e;
        }
        const wait = this.backoffMs(e);
        // A retry that could not even get 300 ms on the wire is noise.
        if (deadline - this.now() - wait < MIN_RETRY_WINDOW_MS) throw e;
        await this.sleep(wait);
      }
    }
  }

  private backoffMs(e: CloudflareSfuError): number {
    if (e.isRateLimited && e.retryAfterMs !== null) {
      return Math.min(e.retryAfterMs, MAX_RETRY_AFTER_MS);
    }
    return (
      CLOUDFLARE_SFU_RETRY_BACKOFF_MS +
      Math.floor(Math.random() * CLOUDFLARE_SFU_RETRY_JITTER_MS)
    );
  }

  private async once<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    // A 404 on the App route is the App ID; on a session route it is the
    // session (the phone re-opens one), never the configuration.
    const onApp = path === '/sessions/new';
    try {
      const res = await this.fetchImpl(this.url(path), {
        method,
        headers: {
          authorization: `Bearer ${this.creds.appToken}`,
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      let json: Record<string, unknown> = {};
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        json = {};
      }
      const code =
        typeof json.errorCode === 'string' ? json.errorCode : undefined;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new CloudflareSfuError(
            `Cloudflare rejected the App ID / App Secret (HTTP ${res.status})`,
            res.status,
            code,
            { kind: 'config' },
          );
        }
        if (res.status === 404) {
          if (onApp) {
            throw new CloudflareSfuError(
              `Cloudflare does not know this App ID (HTTP 404${code ? ` ${code}` : ''}): wrong App ID, or the App was created less than 60 s ago`,
              404,
              code ?? 'not_found',
              { kind: 'config' },
            );
          }
          throw new CloudflareSfuError(
            `Cloudflare SFU no longer has this session (HTTP 404${code ? ` ${code}` : ''})`,
            404,
            code ?? 'session_not_found',
            { kind: 'session' },
          );
        }
        if (res.status === 429) {
          throw new CloudflareSfuError(
            'Cloudflare SFU rate limit for this session (HTTP 429)',
            429,
            code,
            { kind: 'rate_limit', retryAfterMs: retryAfterMs(res) },
          );
        }
        throw new CloudflareSfuError(
          `Cloudflare SFU answered HTTP ${res.status}${code ? ` (${code})` : ''}`,
          res.status,
          code,
        );
      }
      // HTTP 200 with a top-level error: Cloudflare's own failure shape,
      // mapped per code (CF-4), not blanket "the caller's fault".
      if (code) {
        let kind = CloudflareSfuError.classify(200, code);
        if (kind === 'config' && !onApp) kind = 'session';
        const status =
          kind === 'outage'
            ? 503
            : kind === 'session' || kind === 'config'
              ? 404
              : 400;
        throw new CloudflareSfuError(
          `Cloudflare SFU error ${code}`,
          status,
          code,
          {
            kind,
          },
        );
      }
      return json as T;
    } catch (e) {
      if (e instanceof CloudflareSfuError) throw e;
      if (e instanceof Error && e.name === 'AbortError') {
        throw new CloudflareSfuError(
          `Cloudflare SFU did not answer in ${timeoutMs} ms`,
          0,
        );
      }
      // Never forward the raw error: some fetch errors echo request headers.
      throw new CloudflareSfuError('Cloudflare SFU is unreachable', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  /** A NEW session: the short connect budget (TS-1), one retry inside it. */
  async newSession(): Promise<{ sessionId: string }> {
    const r = await this.call<{ sessionId?: string }>(
      'POST',
      '/sessions/new',
      undefined,
      this.connect,
    );
    if (!r.sessionId) {
      throw new CloudflareSfuError('Cloudflare returned no sessionId', 502);
    }
    return { sessionId: r.sessionId };
  }

  /** Publish (`local`, with `sessionDescription` offer) or pull (`remote`). */
  newTracks(
    sessionId: string,
    tracks: SfuTrackRequest[],
    sessionDescription?: SfuSessionDescription,
  ): Promise<SfuTracksResponse> {
    return this.call(
      'POST',
      this.sessionPath(sessionId, '/tracks/new'),
      {
        ...(sessionDescription ? { sessionDescription } : {}),
        tracks,
      },
      this.mutation,
    );
  }

  /** The client's answer to an SFU offer. */
  renegotiate(
    sessionId: string,
    sessionDescription: SfuSessionDescription,
  ): Promise<SfuTracksResponse> {
    return this.call(
      'PUT',
      this.sessionPath(sessionId, '/renegotiate'),
      { sessionDescription },
      this.mutation,
    );
  }

  /** Close by `mid`. With `force` and no description nothing is negotiated. */
  closeTracks(
    sessionId: string,
    mids: string[],
    opts: { force: boolean; sessionDescription?: SfuSessionDescription },
  ): Promise<SfuTracksResponse> {
    return this.call(
      'PUT',
      this.sessionPath(sessionId, '/tracks/close'),
      {
        tracks: mids.map((mid) => ({ mid })),
        force: opts.force,
        ...(opts.sessionDescription
          ? { sessionDescription: opts.sessionDescription }
          : {}),
      },
      this.mutation,
    );
  }

  /** Simulcast layer change: `tracks/update` with `preferredRid`. */
  updateTracks(
    sessionId: string,
    tracks: SfuTrackRequest[],
    sessionDescription?: SfuSessionDescription,
  ): Promise<SfuTracksResponse> {
    return this.call(
      'PUT',
      this.sessionPath(sessionId, '/tracks/update'),
      {
        tracks,
        ...(sessionDescription ? { sessionDescription } : {}),
      },
      this.mutation,
    );
  }
}

/** `Retry-After` of a 429 as ms (seconds or an HTTP date), else null. */
function retryAfterMs(res: Response): number | null {
  let raw: string | null = null;
  try {
    raw = res.headers?.get?.('retry-after') ?? null;
  } catch {
    raw = null;
  }
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return null;
}
