/** Owner 2026-10-05 — «Лучший сотрудник»: periods, departments and the
 * score (pure, unit-tested in rewards.rules.spec.ts). */

export type RewardPeriodKind = 'month' | 'week';

export const REWARD_DEPARTMENTS = [
  'verification',
  'moderation',
  'support',
  'finance',
] as const;
export type RewardDepartment = (typeof REWARD_DEPARTMENTS)[number];

export const DEPARTMENT_LABEL: Record<RewardDepartment, string> = {
  verification: 'Проверка',
  moderation: 'Модерация',
  support: 'Поддержка',
  finance: 'Бухгалтерия',
};

/** The admin area that makes someone a member of a department. */
export const DEPARTMENT_AREA: Record<RewardDepartment, string> = {
  verification: 'verification',
  moderation: 'moderation',
  support: 'support',
  finance: 'payroll',
};

/** What a department's numbers mean, in the order they are shown. */
export const METRIC_LABEL: Record<string, string> = {
  decisions: 'Решений',
  medianMinutes: 'Медиана, мин',
  reports: 'Жалоб разобрано',
  actions: 'Мер принято',
  resolved: 'Решено обращений',
  firstResponses: 'Первых ответов',
  slaBreaches: 'Просрочено',
  payouts: 'Выплат проведено',
  moneyActions: 'Денежных операций',
};

export interface Metrics {
  [key: string]: number | null;
}

/** Points for the ranking: plain counts of finished work; a late support
 * answer costs one point. Ties go to the faster median, then the name. */
export function score(dept: RewardDepartment, m: Metrics): number {
  const n = (k: string) => m[k] ?? 0;
  switch (dept) {
    case 'verification':
      return n('decisions');
    case 'moderation':
      return n('reports') + n('actions');
    case 'support':
      return Math.max(
        0,
        n('resolved') + n('firstResponses') - n('slaBreaches'),
      );
    case 'finance':
      return n('payouts') + n('moneyActions');
  }
}

/** "2026-10" or "2026-W41" for the period that contains [at] (UTC). */
export function periodOf(kind: RewardPeriodKind, at: Date): string {
  if (kind === 'month') {
    return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const { year, week } = isoWeek(at);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The period before the one that contains [at]. */
export function previousPeriod(kind: RewardPeriodKind, at: Date): string {
  const { from } = periodRange(periodOf(kind, at));
  return periodOf(kind, new Date(from.getTime() - 1));
}

/** [from, to) of a period label; null for a malformed one. */
export function periodRange(period: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    return {
      from: new Date(Date.UTC(y, mo, 1)),
      to: new Date(Date.UTC(y, mo + 1, 1)),
    };
  }
  const w = /^(\d{4})-W(\d{2})$/.exec(period);
  if (w) {
    const from = isoWeekStart(Number(w[1]), Number(w[2]));
    return { from, to: new Date(from.getTime() + 7 * 86_400_000) };
  }
  throw new RangeError(`Bad period: ${period}`);
}

export function isPeriod(s: string): boolean {
  if (!/^\d{4}-(\d{2}|W\d{2})$/.test(s)) return false;
  const m = /^\d{4}-(\d{2})$/.exec(s);
  if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12;
  const w = Number(s.slice(6));
  return w >= 1 && w <= 53;
}

function isoWeek(at: Date): { year: number; week: number } {
  const d = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { year: d.getUTCFullYear(), week };
}

function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (day - 1) * 86_400_000);
  return new Date(monday.getTime() + (week - 1) * 7 * 86_400_000);
}

export interface Ranked<T> {
  item: T;
  rank: number;
}

/** Highest score first; equal scores share a rank; zero scores are out. */
export function rank<
  T extends { score: number; tiebreak: number; name: string },
>(rows: T[]): Ranked<T>[] {
  const sorted = rows
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.tiebreak - b.tiebreak ||
        a.name.localeCompare(b.name),
    );
  const out: Ranked<T>[] = [];
  sorted.forEach((item, i) => {
    const prev = out[i - 1];
    const same =
      prev &&
      prev.item.score === item.score &&
      prev.item.tiebreak === item.tiebreak;
    out.push({ item, rank: same ? prev.rank : i + 1 });
  });
  return out;
}
