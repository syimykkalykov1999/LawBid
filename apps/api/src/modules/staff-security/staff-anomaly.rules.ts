import type { DayCounters } from './staff-card-watch';

/**
 * Staff package T11: the rules of the daily snooping report (plan C4).
 * Pure: the job feeds yesterday's counters in and writes the rows out.
 * "From the median" = a person is compared with their own group of that
 * day, so a busy day for everybody flags nobody.
 */
export const ANOMALY_RULES = [
  'outside_lease',
  'cards_burst',
  'cards_volume',
  'reveal_cap',
] as const;
export type AnomalyRule = (typeof ANOMALY_RULES)[number];

export interface AnomalyRow {
  adminId: string;
  rule: AnomalyRule;
  score: number;
  detail: Record<string, number>;
}

/** Cards a person must have opened outside the queue before it is news. */
export const MIN_OUTSIDE = 3;
/** Cards a day before "many more than the others" is considered. */
export const MIN_VOLUME = 50;
/** "Many more" = more than this many times the group median. */
export const MEDIAN_FACTOR = 3;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function scoreAnomalies(
  day: ReadonlyMap<string, DayCounters>,
  opts: { revealCap: number; topN: number },
): AnomalyRow[] {
  const rows: AnomalyRow[] = [];
  const all = [...day.entries()];
  const medOpened = median(all.map(([, c]) => c.opened));
  const medOutside = median(all.map(([, c]) => c.outside));
  for (const [adminId, c] of all) {
    if (c.outside >= MIN_OUTSIDE && c.outside > MEDIAN_FACTOR * medOutside) {
      rows.push({
        adminId,
        rule: 'outside_lease',
        score: Math.min(100, c.outside),
        detail: { outside: c.outside, opened: c.opened, median: medOutside },
      });
    }
    if (c.burst >= 1) {
      rows.push({
        adminId,
        rule: 'cards_burst',
        score: Math.min(100, c.burst * 10),
        detail: { minutesOverLimit: c.burst, opened: c.opened },
      });
    }
    if (c.opened >= MIN_VOLUME && c.opened > MEDIAN_FACTOR * medOpened) {
      rows.push({
        adminId,
        rule: 'cards_volume',
        score: Math.min(100, Math.round(c.opened / Math.max(medOpened, 1))),
        detail: { opened: c.opened, median: medOpened },
      });
    }
    if (opts.revealCap > 0 && c.reveals >= opts.revealCap) {
      rows.push({
        adminId,
        rule: 'reveal_cap',
        score: Math.min(100, c.reveals),
        detail: { reveals: c.reveals, cap: opts.revealCap },
      });
    }
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, opts.topN);
}

const RULE_RU: Readonly<Record<AnomalyRule, string>> = {
  outside_lease: 'открывал карточки вне своей очереди',
  cards_burst: 'открывал карточки слишком быстро',
  cards_volume: 'открыл карточек намного больше других',
  reveal_cap: 'выбрал весь дневной лимит «Показать полностью»',
};

/** One plain-Russian line for the owner's digest (T10 shows it). */
export function anomalyDigestLine(
  day: string,
  rows: readonly Pick<AnomalyRow, 'adminId' | 'rule'>[],
): string {
  if (rows.length === 0) return `Подозрительного за ${day} нет.`;
  const people = new Set(rows.map((r) => r.adminId)).size;
  const top = rows[0];
  return `За ${day}: ${people} сотр. с необычной работой с карточками (${rows.length} сигн.). Первым в списке: ${RULE_RU[top.rule]}.`;
}
