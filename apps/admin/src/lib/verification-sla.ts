/**
 * Scout 13.11 batch 1 (row 96): the verification queue colours how long a
 * request has waited, the way Zendesk's SLA badge turns amber, then red, and
 * Intercom marks «waiting longer than…». The two thresholds are admin
 * settings (Настройки → verification.queue_warn_hours / queue_late_hours,
 * 24 h and 48 h by default; owner rule: every threshold is a setting).
 */
export const QUEUE_WARN_KEY = 'verification.queue_warn_hours';
export const QUEUE_LATE_KEY = 'verification.queue_late_hours';
export const QUEUE_WARN_DEFAULT = 24;
export const QUEUE_LATE_DEFAULT = 48;

export type WaitTone = 'ok' | 'warn' | 'late';

export interface WaitThresholds {
  warnHours: number;
  lateHours: number;
}

/** The thresholds from the settings list (a missing or broken value = the default). */
export function waitThresholds(entries: readonly { key: string; value?: unknown; defaultValue?: unknown }[] | undefined): WaitThresholds {
  const num = (key: string, fallback: number) => {
    const e = entries?.find((x) => x.key === key);
    const v = Number(e?.value ?? e?.defaultValue);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return { warnHours: num(QUEUE_WARN_KEY, QUEUE_WARN_DEFAULT), lateHours: num(QUEUE_LATE_KEY, QUEUE_LATE_DEFAULT) };
}

/** amber at or over `warnHours`, red at or over `lateHours`. */
export function waitTone(waitedSeconds: number | null, t: WaitThresholds): WaitTone {
  if (waitedSeconds === null || !Number.isFinite(waitedSeconds)) return 'ok';
  const hours = waitedSeconds / 3600;
  if (hours >= t.lateHours) return 'late';
  if (hours >= t.warnHours) return 'warn';
  return 'ok';
}

/** The text colour of the «Ожидает» cell. */
export const WAIT_TONE_CLASS: Record<WaitTone, string> = {
  ok: '',
  warn: 'font-medium text-warning',
  late: 'font-medium text-danger',
};

/** Words for screen readers and the tooltip. */
export function waitToneTitle(tone: WaitTone, t: WaitThresholds): string | undefined {
  if (tone === 'late') return `Ждёт дольше ${t.lateHours} ч`;
  if (tone === 'warn') return `Ждёт дольше ${t.warnHours} ч`;
  return undefined;
}
