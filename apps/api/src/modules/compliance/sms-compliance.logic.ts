import { createHash } from 'node:crypto';

/**
 * 2026-10-25 (TCPA, 47 CFR 64.1200; FCC revocation rule): pure helpers for
 * non-code text messages. A sign-in code is transactional and never goes
 * through these checks; everything else does.
 */

export type SmsKeyword = 'stop' | 'start' | 'help';

/** FCC (47 CFR 64.1200(a)(10), eff. April 2025): "stop", "quit", "end",
 * "revoke", "opt out", "cancel", "unsubscribe" (and CTIA's STOPALL) by any
 * reasonable means. START / UNSTOP / YES re-subscribe; HELP / INFO ask
 * for help. Compared case-insensitively on the whole trimmed message. */
const STOP_WORDS = new Set([
  'stop',
  'stopall',
  'quit',
  'end',
  'revoke',
  'opt out',
  'optout',
  'opt-out',
  'cancel',
  'unsubscribe',
]);
const START_WORDS = new Set(['start', 'unstop', 'yes']);
const HELP_WORDS = new Set(['help', 'info']);

export function classifyKeyword(
  body: string | undefined | null,
): SmsKeyword | null {
  const t = (body ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.!\s]+$/g, '')
    .replace(/\s+/g, ' ');
  if (STOP_WORDS.has(t)) return 'stop';
  if (START_WORDS.has(t)) return 'start';
  if (HELP_WORDS.has(t)) return 'help';
  return null;
}

/** Twilio sets OptOutType = STOP | START | HELP on inbound messages it
 * already handled (Advanced Opt-Out); it wins over our own word list. */
export function keywordFromTwilio(
  optOutType: string | undefined,
  body: string | undefined,
): SmsKeyword | null {
  switch ((optOutType ?? '').toUpperCase()) {
    case 'STOP':
      return 'stop';
    case 'START':
      return 'start';
    case 'HELP':
      return 'help';
    default:
      return classifyKeyword(body);
  }
}

/** E.164 digits only (+ and 8-15 digits), else null. Twilio sends `From`
 * as E.164 already. */
export function normalizeE164(raw: string | undefined | null): string | null {
  const s = (raw ?? '').trim().replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export function disclosureHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Zones whose local clock must ALL be inside the window when the
 * person's own zone is unknown (continental US; Alaska/Hawaii/territories
 * are ignored: a text sent in this window is lawful there too, except
 * Hawaii mornings which a US-wide marketer does not target). */
export const UNKNOWN_ZONE_SET = ['America/New_York', 'America/Los_Angeles'];

function hourIn(zone: string, now: Date): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .find((p) => p.type === 'hour')?.value;
  return Number(h);
}

export interface QuietHours {
  /** First quiet hour of the evening (21 = from 21:00). */
  startHour: number;
  /** First allowed hour of the morning (8 = from 08:00). */
  endHour: number;
}

/** True when [hour] is inside quiet hours (a window that may wrap
 * midnight). Equal start/end = no quiet hours. */
export function hourIsQuiet(hour: number, q: QuietHours): boolean {
  if (q.startHour === q.endHour) return false;
  return q.startHour > q.endHour
    ? hour >= q.startHour || hour < q.endHour
    : hour >= q.startHour && hour < q.endHour;
}

/** Quiet hours at [now] for a person in [zone]; an unknown or invalid zone
 * is quiet when ANY of the continental zones is quiet. */
export function inQuietHours(
  now: Date,
  zone: string | null | undefined,
  q: QuietHours,
): boolean {
  const zones = zone ? [zone] : UNKNOWN_ZONE_SET;
  for (const z of zones) {
    try {
      if (hourIsQuiet(hourIn(z, now), q)) return true;
    } catch {
      // Invalid zone name: fall back to the strict set.
      return UNKNOWN_ZONE_SET.some((u) => hourIsQuiet(hourIn(u, now), q));
    }
  }
  return false;
}

/** Every marketing text must tell how to stop (CTIA / TCPA practice). */
export function withStopNotice(body: string): string {
  return /\bSTOP\b/i.test(body) ? body : `${body} Reply STOP to opt out.`;
}

export function twiml(message?: string): string {
  const esc = (message ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}
