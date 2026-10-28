/**
 * An in-memory stand-in for Cloudflare's SFU HTTP API, shaped after the
 * OpenAPI file (see cloudflare-sfu.client.ts). Used by the unit tests as the
 * `fetch` of CloudflareSfuClient; it also records every request so tests can
 * check what we sent (and that the App Secret only travels in the header).
 */
export interface FakeCall {
  method: string;
  path: string;
  auth: string | null;
  body: Record<string, unknown> | null;
}

interface FakeSession {
  published: Map<string, string>; // trackName -> mid
  nextMid: number;
  pulled: Map<string, string>; // mid -> `${session}:${trackName}`
  closed: string[];
}

export class FakeCloudflare {
  readonly calls: FakeCall[] = [];
  readonly sessions = new Map<string, FakeSession>();
  private n = 0;
  /** When set, every request answers with this HTTP status (outage test). */
  failStatus: number | null = null;
  /** When set with [failStatus]: only the next N requests fail (a blip). */
  failTimes: number | null = null;
  /** When set, every HTTP 200 carries this top-level `errorCode` (CF-4). */
  bodyErrorCode: string | null = null;
  /** Headers of a failing answer (e.g. Retry-After of a 429). */
  failHeaders: Record<string, string> = {};
  /** Track names (published) that the SFU refuses to pull. */
  refusePull = new Set<string>();

  readonly fetch: typeof fetch = (input, init) =>
    Promise.resolve(
      this.handle(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        init ?? {},
      ),
    );

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  private handle(url: string, init: RequestInit): Response {
    const path = url.replace('https://rtc.live.cloudflare.com/v1', '');
    const headers = init.headers as Record<string, string>;
    const body = init.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : null;
    this.calls.push({
      method: init.method ?? 'GET',
      path,
      auth: headers?.authorization ?? null,
      body,
    });
    if (this.failStatus && (this.failTimes === null || this.failTimes > 0)) {
      if (this.failTimes !== null) this.failTimes -= 1;
      return new Response(JSON.stringify({}), {
        status: this.failStatus,
        headers: { 'content-type': 'application/json', ...this.failHeaders },
      });
    }
    if (this.bodyErrorCode) {
      return this.json(200, {
        errorCode: this.bodyErrorCode,
        errorDescription: 'from the fake',
      });
    }
    if (headers?.authorization !== 'Bearer good-secret') {
      return this.json(401, {});
    }
    if (path.endsWith('/sessions/new')) {
      const id = `sess-${++this.n}`;
      this.sessions.set(id, {
        published: new Map(),
        nextMid: 0,
        pulled: new Map(),
        closed: [],
      });
      return this.json(201, { sessionId: id });
    }
    const m =
      /\/sessions\/([^/]+)\/(tracks\/new|renegotiate|tracks\/close|tracks\/update)$/.exec(
        path,
      );
    const sess = m ? this.sessions.get(m[1]) : undefined;
    if (!m || !sess) return this.json(404, { errorCode: 'session_not_found' });
    const tracks = (body?.tracks ?? []) as Array<{
      location?: string;
      mid?: string;
      trackName?: string;
      sessionId?: string;
    }>;
    if (m[2] === 'tracks/new') {
      if (tracks.every((t) => t.location === 'local')) {
        for (const t of tracks) sess.published.set(t.trackName!, t.mid!);
        return this.json(200, {
          sessionDescription: { type: 'answer', sdp: 'v=0\r\nanswer' },
          tracks: tracks.map((t) => ({
            location: 'local',
            mid: t.mid,
            trackName: t.trackName,
          })),
        });
      }
      return this.json(200, {
        requiresImmediateRenegotiation: true,
        sessionDescription: { type: 'offer', sdp: 'v=0\r\noffer' },
        tracks: tracks.map((t) => {
          const pub = this.sessions.get(t.sessionId ?? '');
          if (
            !pub?.published.has(t.trackName!) ||
            this.refusePull.has(t.trackName!)
          ) {
            return {
              location: 'remote',
              sessionId: t.sessionId,
              trackName: t.trackName,
              errorCode: 'track_not_found',
              errorDescription: 'no such track',
            };
          }
          const mid = String(sess.nextMid++);
          sess.pulled.set(mid, `${t.sessionId}:${t.trackName}`);
          return {
            location: 'remote',
            mid,
            sessionId: t.sessionId,
            trackName: t.trackName,
          };
        }),
      });
    }
    if (m[2] === 'tracks/close') {
      const mids = tracks.map((t) => t.mid!);
      sess.closed.push(...mids);
      for (const [name, mid] of [...sess.published]) {
        if (mids.includes(mid)) sess.published.delete(name);
      }
      return this.json(200, {
        ...(body?.force === false
          ? { sessionDescription: { type: 'answer', sdp: 'v=0\r\nclose' } }
          : {}),
        tracks: mids.map((mid) => ({ mid })),
      });
    }
    return this.json(200, {});
  }

  /** Requests of one kind, e.g. `closeMids('sess-1')`. */
  closedMids(sessionId: string): string[] {
    return this.sessions.get(sessionId)?.closed ?? [];
  }
}
