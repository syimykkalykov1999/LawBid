/**
 * Owner 2026-10-28: the two calendar vendors behind one small interface.
 * Plain `fetch` against the documented REST endpoints (4 calls each) instead
 * of the 100 MB `googleapis` package: nothing to keep patched, easy to fake
 * in tests. Scopes are the narrowest that do the job:
 *  - Google: calendar.freebusy (busy time) + calendar.events.owned (events
 *    on calendars the person owns) — docs: developers.google.com/workspace/calendar/api/auth
 *  - Microsoft Graph: Calendars.ReadWrite + offline_access (getSchedule on
 *    /me needs it) — learn.microsoft.com/graph/api/calendar-getschedule
 */
export type CalendarProviderId = 'google' | 'microsoft';

export interface OAuthApp {
  clientId: string;
  clientSecret: string;
  /** Microsoft only: "common" (work + personal) by default. */
  tenant?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Seconds. */
  expiresIn: number;
  email?: string | null;
}

export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface ExternalEvent {
  /** Our consultation id (idempotency / lookup). */
  key: string;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  /** Write as tentative. */
  tentative?: boolean;
}

/** Thrown when the vendor refuses the token for good (user revoked access). */
export class CalendarAuthError extends Error {}
/** Thrown for any other failure of the vendor (try again later). */
export class CalendarApiError extends Error {}

export type FetchFn = typeof fetch;

export interface CalendarProviderApi {
  readonly id: CalendarProviderId;
  authUrl(app: OAuthApp, redirectUri: string, state: string): string;
  exchangeCode(
    app: OAuthApp,
    redirectUri: string,
    code: string,
  ): Promise<TokenSet>;
  refresh(app: OAuthApp, refreshToken: string): Promise<TokenSet>;
  revoke(app: OAuthApp, refreshToken: string): Promise<void>;
  freeBusy(
    token: string,
    calendarId: string,
    from: Date,
    to: Date,
    signal?: AbortSignal,
  ): Promise<BusyInterval[]>;
  /** Creates or updates; returns the vendor's event id. */
  upsertEvent(
    token: string,
    calendarId: string,
    externalId: string | null,
    event: ExternalEvent,
  ): Promise<string>;
  deleteEvent(
    token: string,
    calendarId: string,
    externalId: string,
  ): Promise<void>;
}

const TIMEOUT_MS = 10_000;

async function call(
  f: FetchFn,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await f(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new CalendarApiError(
      e instanceof Error && e.name === 'AbortError'
        ? 'The calendar did not answer in time'
        : `Network error: ${String(e)}`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function json<T>(res: Response, what: string): Promise<T> {
  if (res.status === 401) throw new CalendarAuthError(`${what}: 401`);
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200);
    if (res.status === 400 && /invalid_grant/.test(text)) {
      throw new CalendarAuthError(`${what}: invalid_grant`);
    }
    throw new CalendarApiError(`${what}: HTTP ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

function form(data: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
  };
}

/** The e-mail in an id_token (it comes straight from the vendor over TLS). */
function emailOfIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const p = JSON.parse(
      Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const v = p.email ?? p.preferred_username;
    return typeof v === 'string' ? v.slice(0, 254) : null;
  } catch {
    return null;
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

function tokenSet(r: TokenResponse): TokenSet {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresIn: r.expires_in ?? 3000,
    email: emailOfIdToken(r.id_token),
  };
}

// --- Google ------------------------------------------------------------------

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events.owned',
];

/** A Google event id: base32hex (0-9 a-v), 5..1024 chars. */
export function googleEventId(key: string): string {
  return `lb${key.replace(/[^0-9a-f]/gi, '').toLowerCase()}`;
}

export class GoogleCalendarApi implements CalendarProviderApi {
  readonly id = 'google' as const;
  constructor(private readonly f: FetchFn = fetch) {}

  authUrl(app: OAuthApp, redirectUri: string, state: string): string {
    const q = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
  }

  async exchangeCode(
    app: OAuthApp,
    redirectUri: string,
    code: string,
  ): Promise<TokenSet> {
    const res = await call(
      this.f,
      'https://oauth2.googleapis.com/token',
      form({
        code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    );
    return tokenSet(await json<TokenResponse>(res, 'google token'));
  }

  async refresh(app: OAuthApp, refreshToken: string): Promise<TokenSet> {
    const res = await call(
      this.f,
      'https://oauth2.googleapis.com/token',
      form({
        refresh_token: refreshToken,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        grant_type: 'refresh_token',
      }),
    );
    return tokenSet(await json<TokenResponse>(res, 'google refresh'));
  }

  async revoke(_app: OAuthApp, refreshToken: string): Promise<void> {
    await call(
      this.f,
      'https://oauth2.googleapis.com/revoke',
      form({ token: refreshToken }),
    ).catch(() => undefined);
  }

  async freeBusy(
    token: string,
    calendarId: string,
    from: Date,
    to: Date,
    signal?: AbortSignal,
  ): Promise<BusyInterval[]> {
    const res = await call(
      this.f,
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: [{ id: calendarId }],
        }),
      },
      signal,
    );
    const body = await json<{
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    }>(res, 'google freeBusy');
    const busy = body.calendars?.[calendarId]?.busy ?? [];
    return busy.map((b) => ({
      startsAt: new Date(b.start),
      endsAt: new Date(b.end),
    }));
  }

  async upsertEvent(
    token: string,
    calendarId: string,
    externalId: string | null,
    e: ExternalEvent,
  ): Promise<string> {
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const id = externalId ?? googleEventId(e.key);
    const body = {
      id,
      summary: e.title,
      description: e.description,
      status: e.tentative ? 'tentative' : 'confirmed',
      start: { dateTime: e.startsAt.toISOString(), timeZone: 'UTC' },
      end: { dateTime: e.endsAt.toISOString(), timeZone: 'UTC' },
      transparency: 'opaque',
      reminders: { useDefault: true },
      extendedProperties: { private: { lawbidConsultationId: e.key } },
    };
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (externalId) {
      const res = await call(this.f, `${base}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      if (res.status !== 404) {
        await json<unknown>(res, 'google event update');
        return id;
      }
    }
    const res = await call(this.f, base, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      // Created before and the answer was lost: update it instead.
      const upd = await call(this.f, `${base}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      await json<unknown>(upd, 'google event update');
      return id;
    }
    await json<unknown>(res, 'google event create');
    return id;
  }

  async deleteEvent(
    token: string,
    calendarId: string,
    externalId: string,
  ): Promise<void> {
    const res = await call(
      this.f,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    // Already gone (404/410) is the goal reached.
    if (res.status === 404 || res.status === 410 || res.ok) return;
    await json<unknown>(res, 'google event delete');
  }
}

// --- Microsoft ---------------------------------------------------------------

export const MICROSOFT_SCOPES = [
  'openid',
  'email',
  'offline_access',
  'Calendars.ReadWrite',
];

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** "2026-10-28T14:00:00.0000000" (UTC, no zone mark) → Date. */
export function graphUtc(v: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`);
}

export class MicrosoftCalendarApi implements CalendarProviderApi {
  readonly id = 'microsoft' as const;
  constructor(private readonly f: FetchFn = fetch) {}

  private authority(app: OAuthApp): string {
    return `https://login.microsoftonline.com/${encodeURIComponent(app.tenant || 'common')}/oauth2/v2.0`;
  }

  authUrl(app: OAuthApp, redirectUri: string, state: string): string {
    const q = new URLSearchParams({
      client_id: app.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: MICROSOFT_SCOPES.join(' '),
      prompt: 'select_account',
      state,
    });
    return `${this.authority(app)}/authorize?${q.toString()}`;
  }

  async exchangeCode(
    app: OAuthApp,
    redirectUri: string,
    code: string,
  ): Promise<TokenSet> {
    const res = await call(
      this.f,
      `${this.authority(app)}/token`,
      form({
        code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: MICROSOFT_SCOPES.join(' '),
      }),
    );
    return tokenSet(await json<TokenResponse>(res, 'microsoft token'));
  }

  async refresh(app: OAuthApp, refreshToken: string): Promise<TokenSet> {
    const res = await call(
      this.f,
      `${this.authority(app)}/token`,
      form({
        refresh_token: refreshToken,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        grant_type: 'refresh_token',
        scope: MICROSOFT_SCOPES.join(' '),
      }),
    );
    return tokenSet(await json<TokenResponse>(res, 'microsoft refresh'));
  }

  /** Microsoft has no token revocation endpoint for users; the person
   * removes the app at myaccount.microsoft.com. Dropping our copy is it. */
  revoke(): Promise<void> {
    return Promise.resolve();
  }

  async freeBusy(
    token: string,
    calendarId: string,
    from: Date,
    to: Date,
    signal?: AbortSignal,
  ): Promise<BusyInterval[]> {
    const me = await call(
      this.f,
      `${GRAPH}/me?$select=mail,userPrincipalName`,
      { headers: { Authorization: `Bearer ${token}` } },
      signal,
    );
    const who = await json<{ mail?: string; userPrincipalName?: string }>(
      me,
      'graph me',
    );
    const address = who.mail ?? who.userPrincipalName;
    if (!address) throw new CalendarApiError('graph me: no address');
    const res = await call(
      this.f,
      `${GRAPH}/me/calendar/getSchedule`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'outlook.timezone="UTC"',
        },
        body: JSON.stringify({
          schedules: [address],
          startTime: {
            dateTime: from.toISOString().replace('Z', ''),
            timeZone: 'UTC',
          },
          endTime: {
            dateTime: to.toISOString().replace('Z', ''),
            timeZone: 'UTC',
          },
          availabilityViewInterval: 15,
        }),
      },
      signal,
    );
    void calendarId;
    const body = await json<{
      value?: {
        scheduleItems?: {
          status: string;
          start: { dateTime: string };
          end: { dateTime: string };
        }[];
      }[];
    }>(res, 'graph getSchedule');
    const items = body.value?.[0]?.scheduleItems ?? [];
    return items
      .filter((i) => i.status !== 'free' && i.status !== 'workingElsewhere')
      .map((i) => ({
        startsAt: graphUtc(i.start.dateTime),
        endsAt: graphUtc(i.end.dateTime),
      }));
  }

  async upsertEvent(
    token: string,
    calendarId: string,
    externalId: string | null,
    e: ExternalEvent,
  ): Promise<string> {
    const body = {
      subject: e.title,
      body: { contentType: 'text', content: e.description ?? '' },
      start: {
        dateTime: e.startsAt.toISOString().replace('Z', ''),
        timeZone: 'UTC',
      },
      end: {
        dateTime: e.endsAt.toISOString().replace('Z', ''),
        timeZone: 'UTC',
      },
      showAs: e.tentative ? 'tentative' : 'busy',
      isReminderOn: true,
      transactionId: e.key,
    };
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (externalId) {
      const res = await call(
        this.f,
        `${GRAPH}/me/events/${encodeURIComponent(externalId)}`,
        { method: 'PATCH', headers, body: JSON.stringify(body) },
      );
      if (res.status !== 404) {
        await json<unknown>(res, 'graph event update');
        return externalId;
      }
    }
    const path =
      calendarId && calendarId !== 'primary'
        ? `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/events`
        : `${GRAPH}/me/events`;
    const res = await call(this.f, path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const created = await json<{ id: string }>(res, 'graph event create');
    return created.id;
  }

  async deleteEvent(
    token: string,
    _calendarId: string,
    externalId: string,
  ): Promise<void> {
    const res = await call(
      this.f,
      `${GRAPH}/me/events/${encodeURIComponent(externalId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 404 || res.ok) return;
    await json<unknown>(res, 'graph event delete');
  }
}

export function providerApi(
  id: CalendarProviderId,
  f?: FetchFn,
): CalendarProviderApi {
  return id === 'google'
    ? new GoogleCalendarApi(f)
    : new MicrosoftCalendarApi(f);
}
