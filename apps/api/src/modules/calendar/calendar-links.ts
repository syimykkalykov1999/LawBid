import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Owner 2026-10-28: «add to calendar» links. Google and Outlook open a
 * pre-filled "new event" page (no login on our side); the ICS link is a
 * signed URL of ours that returns a one-event .ics file, so a phone's
 * browser can hand it to the calendar app. The signature (HMAC-SHA256 over
 * the payload) stops anyone from making our server print arbitrary text.
 */
export interface LinkEvent {
  /** Stable id (consultation id, deadline key…). */
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** A timed event (both set) … */
  start?: Date;
  end?: Date;
  /** … or a whole day, YYYY-MM-DD. */
  date?: string;
}

export interface CalendarLinks {
  google: string;
  outlook: string;
  /** Null when the server has no signing secret. */
  ics: string | null;
}

interface IcsPayload {
  u: string;
  t: string;
  d?: string;
  l?: string;
  s?: string;
  e?: string;
  a?: string;
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string): string =>
  Buffer.from(s, 'base64url').toString('utf8');

/** 20261028T140000Z */
export function gcalStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function compactDay(day: string): string {
  return day.replace(/-/g, '');
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const cut = (s: string | undefined, n: number): string | undefined =>
  s ? s.slice(0, n) : undefined;

export function googleLink(e: LinkEvent): string {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title });
  if (e.start && e.end) {
    q.set('dates', `${gcalStamp(e.start)}/${gcalStamp(e.end)}`);
  } else if (e.date) {
    q.set('dates', `${compactDay(e.date)}/${compactDay(nextDay(e.date))}`);
  }
  if (e.description) q.set('details', e.description);
  if (e.location) q.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function outlookLink(e: LinkEvent): string {
  const q = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
  });
  if (e.start && e.end) {
    q.set('startdt', e.start.toISOString());
    q.set('enddt', e.end.toISOString());
  } else if (e.date) {
    q.set('startdt', e.date);
    q.set('enddt', nextDay(e.date));
    q.set('allday', 'true');
  }
  if (e.description) q.set('body', e.description);
  if (e.location) q.set('location', e.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', `calendar-ics:${secret}`)
    .update(body)
    .digest('base64url');
}

/** `<base>/calendar/event.ics?d=<payload>&sig=<hmac>` */
export function icsLink(
  e: LinkEvent,
  apiBase: string,
  secret: string | undefined,
): string | null {
  if (!secret) return null;
  const p: IcsPayload = {
    u: e.uid,
    t: e.title.slice(0, 200),
    d: cut(e.description, 500),
    l: cut(e.location, 200),
    s: e.start?.toISOString(),
    e: e.end?.toISOString(),
    a: e.date,
  };
  const body = b64(JSON.stringify(p));
  return `${apiBase}/calendar/event.ics?d=${body}&sig=${sign(secret, body)}`;
}

export function buildLinks(
  e: LinkEvent,
  apiBase: string,
  secret: string | undefined,
): CalendarLinks {
  return {
    google: googleLink(e),
    outlook: outlookLink(e),
    ics: icsLink(e, apiBase, secret),
  };
}

/** The event behind a signed ICS link, or null when it is not ours. */
export function verifyIcsLink(
  d: string,
  sig: string,
  secret: string | undefined,
): LinkEvent | null {
  if (!secret || !d || !sig || d.length > 4000) return null;
  const want = Buffer.from(sign(secret, d));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(unb64(d)) as IcsPayload;
    if (typeof p.u !== 'string' || typeof p.t !== 'string') return null;
    const start = p.s ? new Date(p.s) : undefined;
    const end = p.e ? new Date(p.e) : undefined;
    if (
      (start && Number.isNaN(start.getTime())) ||
      (end && Number.isNaN(end.getTime()))
    ) {
      return null;
    }
    if (!(start && end) && !(p.a && /^\d{4}-\d{2}-\d{2}$/.test(p.a))) {
      return null;
    }
    return {
      uid: p.u,
      title: p.t,
      description: p.d,
      location: p.l,
      start,
      end,
      date: p.a,
    };
  } catch {
    return null;
  }
}
