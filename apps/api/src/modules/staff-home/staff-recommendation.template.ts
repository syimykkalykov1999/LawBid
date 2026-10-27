/**
 * Staff package T10: the plain-Russian text of a suggestion, built from the
 * evidence the nightly rating wrote (no AI, no live queries). The owner reads
 * three things: WHAT is advised («премировать / обучить / заменить»), WHY (the
 * evidence lines, in numbers) and what the button will do. A port, so the
 * optional AI summary (T12) can replace the text later without touching the
 * pages; today the rule-based implementation is bound.
 */
export const STAFF_RECOMMENDATION_TEMPLATE = Symbol(
  'STAFF_RECOMMENDATION_TEMPLATE',
);

export type StaffAdvice = 'reward' | 'train' | 'replace';

export interface RecommendationInput {
  kind: string;
  /** staff_suggestions.evidence: { status, rating, n, flags, rankPct }. */
  evidence: Record<string, unknown>;
}

export interface Recommendation {
  advice: StaffAdvice;
  /** «Премировать», «Обучить», «Заменить». */
  adviceLabel: string;
  /** What the button does, e.g. «Снять с очереди на 7 дней». */
  actionLabel: string;
  /** One sentence: the verdict. */
  headline: string;
  /** The proof, one number per line. */
  lines: string[];
}

export interface StaffRecommendationTemplate {
  render(input: RecommendationInput): Recommendation;
}

const ADVICE: Record<string, { advice: StaffAdvice; action: string }> = {
  reward: {
    advice: 'reward',
    action: 'Наградить: запись в журнал, премия по ставке',
  },
  warn: { advice: 'train', action: 'Вынести предупреждение (запись в журнал)' },
  retrain: {
    advice: 'train',
    action: 'Отправить на обучение (запись в журнал)',
  },
  more_review: {
    advice: 'train',
    action: 'Проверять чаще: 30 % решений получат вторую проверку',
  },
  pull: { advice: 'replace', action: 'Снять с очереди на 7 дней' },
  pause: { advice: 'replace', action: 'Поставить на паузу на 7 дней' },
  replace: {
    advice: 'replace',
    action: 'Закончить работу: доступ закрывается',
  },
};

const ADVICE_LABEL: Record<StaffAdvice, string> = {
  reward: 'Премировать',
  train: 'Обучить',
  replace: 'Заменить',
};

/** Flag codes of the rating (staff-rating.formulas) in plain words. */
export const FLAG_LABEL: Record<string, string> = {
  very_low: 'рейтинг сильно ниже нормы',
  low_rating: 'рейтинг ниже нормы',
  complaints_week: 'много жалоб за неделю',
  golden_fail: 'ошибка на эталонной задаче',
  overturned_streak: 'несколько решений подряд отменены',
  rushing: 'решает слишком быстро',
};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** The default: fixed rules, no model. */
export class RuleBasedRecommendationTemplate implements StaffRecommendationTemplate {
  render({ kind, evidence }: RecommendationInput): Recommendation {
    const map = ADVICE[kind] ?? ADVICE.warn;
    const rating = num(evidence.rating);
    const n = num(evidence.n);
    const rank = num(evidence.rankPct);
    const flags = Array.isArray(evidence.flags)
      ? evidence.flags.filter((f): f is string => typeof f === 'string')
      : [];
    const lines: string[] = [];
    if (rating !== null) {
      lines.push(
        `Рейтинг ${Math.round(rating)} из 100${n !== null ? ` за ${n} решений` : ''}.`,
      );
    } else if (n !== null) {
      lines.push(`Решений за период: ${n}.`);
    }
    if (rank !== null)
      lines.push(`Место: верхние ${rank} % своего пространства.`);
    for (const f of flags) {
      const t = FLAG_LABEL[f];
      if (t) lines.push(`Замечено: ${t}.`);
    }
    if (kind === 'replace') {
      lines.push('Предупреждения уже были, а рейтинг не поднялся.');
    }
    return {
      advice: map.advice,
      adviceLabel: ADVICE_LABEL[map.advice],
      actionLabel: map.action,
      headline: HEADLINE[kind] ?? HEADLINE.warn,
      lines,
    };
  }
}

const HEADLINE: Record<string, string> = {
  reward: 'Работает лучше почти всех: стоит поощрить.',
  warn: 'Результат ниже нормы: стоит предупредить и помочь.',
  retrain: 'Нужно короткое обучение, чтобы поднять результат.',
  more_review: 'Стоит проверять решения чаще, пока рейтинг не поднимется.',
  pull: 'Результат сильно ниже нормы: стоит снять с очереди.',
  pause: 'Стоит поставить на паузу и разобраться.',
  replace: 'Предупреждения не помогли: стоит заменить человека.',
};
