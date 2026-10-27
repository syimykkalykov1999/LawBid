import type {
  StaffDecisionOfDayDto,
  StaffTodayAnomaliesDto,
  StaffTodayAppealsDto,
  StaffTodayFlagsDto,
  StaffTodayPieceworkDto,
  StaffTodaySuggestionsDto,
} from './staff-home.dto';

/** The anomaly rules (staff-anomaly.service) in plain words. */
export const ANOMALY_LABEL: Record<string, string> = {
  too_fast: 'решает слишком быстро',
  identical_answers: 'одинаковые ответы подряд',
  rushing: 'гонит очередь',
  night_access: 'заходит ночью',
  bulk_views: 'открывает много карточек',
};

/** Suggestion kinds, the most serious first (what the owner reads first). */
export const SUGGESTION_ORDER = [
  'replace',
  'pull',
  'pause',
  'warn',
  'retrain',
  'more_review',
  'reward',
] as const;

export const appealKindLabel: Record<string, string> = {
  unfair_pull: 'несправедливое снятие',
  pressure: 'давление',
  insult: 'оскорбления',
  rules: 'нарушение правил',
  other: 'другое',
};

/** What the blocks hold when the decision of the day is picked. */
export interface TodayBlocks {
  appeals: StaffTodayAppealsDto | null;
  flags: StaffTodayFlagsDto | null;
  suggestions: StaffTodaySuggestionsDto | null;
  anomalies: StaffTodayAnomaliesDto | null;
  piecework: StaffTodayPieceworkDto | null;
}

/**
 * «Главное решение дня»: ONE thing, by a fixed priority — a retaliation red
 * mark (a person may be held unfairly), then a complaint against a head, then
 * a suggestion to take someone off the work, then a held pay day, then the top
 * anomaly, then any other suggestion. Nothing to decide = null. Pure.
 */
export function pickDecisionOfDay(
  b: TodayBlocks,
): StaffDecisionOfDayDto | null {
  if (b.flags && b.flags.open > 0) {
    return {
      code: 'retaliation_flag',
      title: 'Красная пометка о возможной мести',
      text: `Открытых пометок: ${b.flags.open}. Человек, подавший жалобу, мог быть снят: решите, оставить ли снятие.`,
      href: '/staff/appeals?tab=flags',
    };
  }
  if (b.appeals && b.appeals.open > 0) {
    return {
      code: 'appeal',
      title: 'Жалоба на главного ждёт ответа',
      text: `Открытых жалоб: ${b.appeals.open}. Прочитайте и решите: уволить главного, уволить исполнителя или ничего.`,
      href: '/staff/appeals',
    };
  }
  const serious = b.suggestions?.items.find((s) =>
    ['replace', 'pull', 'pause'].includes(s.kind),
  );
  if (serious) {
    return {
      code: 'suggestion_removal',
      title: `${serious.recommendation.adviceLabel}: ${serious.name}`,
      text: serious.recommendation.headline,
      href: `/staff/${serious.adminId}`,
    };
  }
  if (b.piecework && b.piecework.disputedDays > 0) {
    return {
      code: 'piecework_disputed',
      title: 'Спорные дни в оплате за решения',
      text: `Дней на удержании: ${b.piecework.disputedDays}. Пересчитайте или оставьте.`,
      href: '/staff/rates',
    };
  }
  const top = b.anomalies?.items[0];
  if (top) {
    return {
      code: 'anomaly',
      title: `Странное поведение: ${top.name}`,
      text: `${top.ruleLabel}. Откройте карточку и посмотрите.`,
      href: `/staff/${top.adminId}`,
    };
  }
  const any = b.suggestions?.items[0];
  if (any) {
    return {
      code: 'suggestion',
      title: `${any.recommendation.adviceLabel}: ${any.name}`,
      text: any.recommendation.headline,
      href: `/staff/${any.adminId}`,
    };
  }
  return null;
}

export const personName = (
  first: string | null | undefined,
  last: string | null | undefined,
): string => [first, last].filter(Boolean).join(' ').trim() || 'Admin';
