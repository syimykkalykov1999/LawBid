/**
 * Owner 2026-10-28: the RFC 5545 writer (hand-written, dependency-free:
 * escaping 3.3.11, 75-octet folding 3.1, CRLF, UIDs). Timed events are written in UTC (`Z`), the
 * one form every calendar app converts to the viewer's own zone correctly —
 * no VTIMEZONE database to go stale. Whole-day events (case deadlines) are
 * `VALUE=DATE`, so they never slide to the neighbouring day in any zone.
 * The output is deterministic (DTSTAMP = the row's last change), so a feed
 * that did not change has the same ETag and the app answers 304.
 */
export type IcsCategory = 'consultation' | 'task' | 'court' | 'deadline';

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  category: IcsCategory;
  /** Timed … */
  start?: Date;
  end?: Date;
  /** … or a whole day (YYYY-MM-DD). */
  date?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  /** Last change of the underlying row (DTSTAMP / LAST-MODIFIED). */
  updatedAt: Date;
  /** Seconds before the start for a display alarm; omit for none. */
  alarmSeconds?: number;
}

export interface IcsCalendarOptions {
  name: string;
  /** The viewer's zone, only a display hint (X-WR-TIMEZONE). */
  timezone?: string | null;
  /** How often clients may re-poll, seconds. */
  refreshSeconds?: number;
}

const CATEGORY_NAME: Record<IcsCategory, string> = {
  consultation: 'Consultation',
  task: 'Task',
  court: 'Court date',
  deadline: 'Deadline',
};

const STATUS = {
  confirmed: 'CONFIRMED',
  tentative: 'TENTATIVE',
  cancelled: 'CANCELLED',
} as const;

/** RFC 5545 section 3.3.11 TEXT escaping. */
export function icsEscape(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** RFC 5545 section 3.1: lines longer than 75 octets are folded with
 * CRLF + space (never inside a multi-byte UTF-8 character). */
export function icsFold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
      limit = 74; // the leading space counts
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function utc(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function ymd(day: string): string {
  return day.replace(/-/g, '');
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function eventLines(e: IcsEvent): string[] {
  const l: string[] = ['BEGIN:VEVENT'];
  l.push(`UID:${icsEscape(e.uid)}`);
  l.push(`DTSTAMP:${utc(e.updatedAt)}`);
  if (e.start && e.end) {
    l.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`);
  } else {
    const day = e.date ?? '1970-01-01';
    l.push(
      `DTSTART;VALUE=DATE:${ymd(day)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(day))}`,
    );
  }
  l.push(`SUMMARY:${icsEscape(e.title)}`);
  if (e.description) l.push(`DESCRIPTION:${icsEscape(e.description)}`);
  if (e.location) l.push(`LOCATION:${icsEscape(e.location)}`);
  l.push(`STATUS:${STATUS[e.status ?? 'confirmed']}`);
  l.push(`CATEGORIES:${CATEGORY_NAME[e.category]}`);
  l.push(`LAST-MODIFIED:${utc(e.updatedAt)}`);
  l.push(`SEQUENCE:${Math.floor(e.updatedAt.getTime() / 60_000)}`);
  if (e.alarmSeconds && e.status !== 'cancelled') {
    l.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(e.title)}`,
      `TRIGGER:-PT${Math.round(e.alarmSeconds)}S`,
      'END:VALARM',
    );
  }
  l.push('END:VEVENT');
  return l;
}

export function buildIcs(events: IcsEvent[], opts: IcsCalendarOptions): string {
  const ttl = Math.round((opts.refreshSeconds ?? 3600) / 60);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LawBid//calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.name)}`,
    `NAME:${icsEscape(opts.name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${ttl}M`,
    `X-PUBLISHED-TTL:PT${ttl}M`,
  ];
  if (opts.timezone) lines.push(`X-WR-TIMEZONE:${icsEscape(opts.timezone)}`);
  for (const e of events) lines.push(...eventLines(e));
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
