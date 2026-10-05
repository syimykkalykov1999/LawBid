/** Owner 2026-10-05 — support 24/7: opening hours and SLA deadlines
 * (pure, unit-tested in support-hours.spec.ts). Hours are local to the
 * team's time zone; `to` is exclusive (9–18 = 09:00…17:59). */

export interface SupportHours {
  alwaysOpen: boolean;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  days: number[];
  fromHour: number;
  toHour: number;
  timeZone: string;
}

const WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Weekday and hour of [at] in [timeZone]; an unknown zone reads as UTC. */
export function localDayHour(
  at: Date,
  timeZone: string,
): { day: number; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    return { day: ((at.getUTCDay() + 6) % 7) + 1, hour: at.getUTCHours() };
  }
  const day = WEEKDAY[parts.find((p) => p.type === 'weekday')?.value ?? ''];
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return { day: day ?? 1, hour: Number.isFinite(hour) ? hour % 24 : 0 };
}

export function isOpen(h: SupportHours, at: Date): boolean {
  if (h.alwaysOpen) return true;
  if (h.days.length === 0 || h.fromHour >= h.toHour) return true;
  const { day, hour } = localDayHour(at, h.timeZone);
  return h.days.includes(day) && hour >= h.fromHour && hour < h.toHour;
}

/** The first moment at or after [at] when the team works (to the hour;
 * the minutes of [at] are kept when it is already open). */
export function nextOpening(h: SupportHours, at: Date): Date {
  if (isOpen(h, at)) return at;
  const start = new Date(at);
  start.setUTCMinutes(0, 0, 0);
  // At most 8 days of hours: a misconfigured week still ends the loop.
  for (let i = 1; i <= 24 * 8; i++) {
    const t = new Date(start.getTime() + i * 3_600_000);
    if (isOpen(h, t)) return t;
  }
  return at;
}

/** When the answer is due: [minutes] of working time from [at]. Outside
 * the hours the clock starts at the next opening (it never runs at night). */
export function slaDueAt(h: SupportHours, at: Date, minutes: number): Date {
  return new Date(nextOpening(h, at).getTime() + minutes * 60_000);
}

/** Urgent and high tickets get the short SLA. */
export function slaMinutesFor(
  priority: string,
  normalMinutes: number,
  urgentMinutes: number,
): number {
  return priority === 'urgent' || priority === 'high'
    ? Math.min(urgentMinutes, normalMinutes)
    : normalMinutes;
}

/** One step up on a missed SLA: low → normal → high → urgent. */
export function escalate(priority: string): string {
  const order = ['low', 'normal', 'high', 'urgent'];
  const i = order.indexOf(priority);
  return i < 0 ? 'high' : order[Math.min(i + 1, order.length - 1)];
}

/** The after-hours answer, in the user's language (en otherwise). */
export function afterHoursText(
  lang: string,
  opensAt: Date,
  timeZone: string,
): string {
  const when = formatOpening(opensAt, timeZone, lang);
  const l = lang.slice(0, 2);
  const texts: Record<string, string> = {
    ru: `Спасибо, мы получили ваше обращение. Сейчас нерабочее время поддержки — мы ответим ${when}.`,
    es: `Gracias, recibimos su solicitud. Ahora el soporte está fuera de horario: responderemos ${when}.`,
    en: `Thanks, we got your request. Support is offline right now — we'll reply ${when}.`,
  };
  return texts[l] ?? texts.en;
}

function formatOpening(at: Date, timeZone: string, lang: string): string {
  const l = lang.slice(0, 2);
  try {
    const s = new Intl.DateTimeFormat(
      l === 'ru' ? 'ru-RU' : l === 'es' ? 'es-US' : 'en-US',
      {
        timeZone,
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      },
    ).format(at);
    return l === 'ru' ? `в ${s}` : l === 'es' ? `el ${s}` : `on ${s}`;
  } catch {
    return at.toISOString();
  }
}
