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
 */
export const CLOUDFLARE_SFU_BASE = 'https://rtc.live.cloudflare.com/v1';
export const CLOUDFLARE_SFU_TIMEOUT_MS = 8_000;
/** Cloudflare: at most 64 tracks per request. */
export const CLOUDFLARE_SFU_MAX_TRACKS_PER_REQUEST = 64;

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
  constructor(
    message: string,
    /** HTTP status, 0 = network / timeout. */
    readonly status: number,
    /** Cloudflare's `errorCode`, when it sent one. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'CloudflareSfuError';
  }
  /** Worth counting against the health of Cloudflare (not the caller's fault). */
  get isOutage(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

export interface CloudflareSfuCreds {
  appId: string;
  appToken: string;
}

export class CloudflareSfuClient {
  constructor(
    private readonly creds: CloudflareSfuCreds,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = CLOUDFLARE_SFU_TIMEOUT_MS,
  ) {}

  private url(path: string): string {
    return `${CLOUDFLARE_SFU_BASE}/apps/${encodeURIComponent(this.creds.appId)}${path}`;
  }

  private sessionPath(sessionId: string, tail: string): string {
    return `/sessions/${encodeURIComponent(sessionId)}${tail}`;
  }

  private async call<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    retryOnce = false,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once<T>(method, path, body);
      } catch (e) {
        const again =
          retryOnce &&
          attempt === 0 &&
          e instanceof CloudflareSfuError &&
          (e.status === 0 || e.status >= 500);
        if (!again) throw e;
      }
    }
  }

  private async once<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
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
          );
        }
        throw new CloudflareSfuError(
          `Cloudflare SFU answered HTTP ${res.status}${code ? ` (${code})` : ''}`,
          res.status,
          code,
        );
      }
      // HTTP 200 with a top-level error: Cloudflare's own failure shape.
      if (code) {
        throw new CloudflareSfuError(`Cloudflare SFU error ${code}`, 400, code);
      }
      return json as T;
    } catch (e) {
      if (e instanceof CloudflareSfuError) throw e;
      if (e instanceof Error && e.name === 'AbortError') {
        throw new CloudflareSfuError(
          `Cloudflare SFU did not answer in ${this.timeoutMs} ms`,
          0,
        );
      }
      // Never forward the raw error: some fetch errors echo request headers.
      throw new CloudflareSfuError('Cloudflare SFU is unreachable', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  async newSession(): Promise<{ sessionId: string }> {
    const r = await this.call<{ sessionId?: string }>(
      'POST',
      '/sessions/new',
      undefined,
      true,
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
    return this.call('POST', this.sessionPath(sessionId, '/tracks/new'), {
      ...(sessionDescription ? { sessionDescription } : {}),
      tracks,
    });
  }

  /** The client's answer to an SFU offer. */
  renegotiate(
    sessionId: string,
    sessionDescription: SfuSessionDescription,
  ): Promise<SfuTracksResponse> {
    return this.call('PUT', this.sessionPath(sessionId, '/renegotiate'), {
      sessionDescription,
    });
  }

  /** Close by `mid`. With `force` and no description nothing is negotiated. */
  closeTracks(
    sessionId: string,
    mids: string[],
    opts: { force: boolean; sessionDescription?: SfuSessionDescription },
  ): Promise<SfuTracksResponse> {
    return this.call('PUT', this.sessionPath(sessionId, '/tracks/close'), {
      tracks: mids.map((mid) => ({ mid })),
      force: opts.force,
      ...(opts.sessionDescription
        ? { sessionDescription: opts.sessionDescription }
        : {}),
    });
  }

  /** Simulcast layer change: `tracks/update` with `preferredRid`. */
  updateTracks(
    sessionId: string,
    tracks: SfuTrackRequest[],
    sessionDescription?: SfuSessionDescription,
  ): Promise<SfuTracksResponse> {
    return this.call('PUT', this.sessionPath(sessionId, '/tracks/update'), {
      tracks,
      ...(sessionDescription ? { sessionDescription } : {}),
    });
  }
}
