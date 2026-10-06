import type { Tone } from '@/components/ui/card';
import { money } from '@/lib/payroll';

/** Owner 2026-10-06: labels and small helpers of «Партнёры стран». */

export const PARTNER_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'работает', tone: 'success' },
  paused: { label: 'пауза выплат', tone: 'warning' },
  disabled: { label: 'отключён', tone: 'danger' },
};

export const SETTLEMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  held: { label: 'ждёт', tone: 'warning' },
  zero: { label: 'нет дохода', tone: 'neutral' },
  pending: { label: 'в зарплатах', tone: 'info' },
  paid: { label: 'выплачено', tone: 'success' },
  canceled: { label: 'снято', tone: 'neutral' },
};

export const GOAL_METRIC: Record<string, string> = {
  attorneys: 'Адвокатов в стране',
  clients: 'Клиентов в стране',
  revenue_cents: 'Чистый доход, $',
};

export const GOAL_STATE: Record<string, { label: string; tone: Tone }> = {
  on_track: { label: 'в процессе', tone: 'info' },
  met: { label: 'выполнена', tone: 'success' },
  missed: { label: 'не выполнена', tone: 'danger' },
};

/** A goal's number as people see it (revenue is stored in cents). */
export function goalValue(metric: string, value: number): string {
  return metric === 'revenue_cents' ? money(value) : String(value);
}

/** 0–100 for a progress bar. */
export function goalPercent(progress: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
}

/** "2026-10" → "октябрь 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** "2026-12-31T00:00:00.000Z" → "2026-12-31" for <input type=date>. */
export function dateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/** <input type=date> → ISO at UTC midnight, or null when empty. */
export function dateToIso(v: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : null;
}
