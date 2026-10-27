import type { StaffDigestNumbersDto } from './staff-home.dto';

const DAY_MS = 86_400_000;

/** Monday 00:00 UTC of the week that ended before [now] (the digest's week). */
export function lastWeekStart(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const sinceMonday = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - (sinceMonday + 7) * DAY_MS);
}

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Share of decisions that came back, one decimal; null = no decisions. */
export function returnedPct(decided: number, reopened: number): number | null {
  if (decided <= 0) return null;
  return Math.round((1000 * reopened) / decided) / 10;
}

const money = (cents: number, currency: string): string =>
  `${(cents / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency.toUpperCase() === 'USD' ? '$' : currency.toUpperCase()}`;

/**
 * The «5 чисел» as the push / e-mail text: decisions, returned share,
 * complaints about heads, worst / best, piecework pay. Plain Russian, short;
 * a number that does not exist yet says so instead of showing zero.
 */
export function digestText(
  weekStart: string,
  n: StaffDigestNumbersDto,
): { title: string; body: string } {
  const returned =
    n.returnedPct === null
      ? 'нет данных'
      : `${String(n.returnedPct).replace('.', ',')} %`;
  const worst =
    n.worstCount === 0
      ? 'слабых нет'
      : `слабых ${n.worstCount}${n.worstName ? ` (хуже всех: ${n.worstName})` : ''}`;
  const best =
    n.bestCount === 0
      ? 'лучших пока нет'
      : `лучших ${n.bestCount}${n.bestName ? ` (первый: ${n.bestName})` : ''}`;
  return {
    title: `Итоги недели с ${weekStart}: 5 чисел по команде`,
    body: [
      `1. Решений за неделю: ${n.decisions}.`,
      `2. Вернулось на доработку: ${returned}.`,
      `3. Новых жалоб на главных: ${n.appeals}.`,
      `4. Рейтинг: ${worst}; ${best}.`,
      `5. Оплата за решения: ${money(n.pieceworkCents, n.currency)}.`,
    ].join('\n'),
  };
}
