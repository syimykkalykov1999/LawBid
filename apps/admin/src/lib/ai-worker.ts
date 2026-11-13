import type { Tone } from '@/components/ui/card';

/** Owner 2026-11-12 «ИИ-сотрудник»: labels of the page (plain Russian). */
export type Lane = 'priority' | 'audit' | 'bulk';

export const LANE_LABEL: Record<Lane, string> = {
  priority: 'Сначала вам',
  audit: 'Выборочная проверка',
  bulk: 'Уверенные',
};

export const LANE_HINT: Record<Lane, string> = {
  priority: 'ИИ не уверен, видит конфликт с данными платформы или попытку обмана — посмотрите сами.',
  audit: 'Уверенные, но выбраны случайно, чтобы вы проверили: так видно, не начал ли ИИ ошибаться.',
  bulk: 'ИИ уверен и красных флагов нет — можно утвердить весь список одним нажатием.',
};

export const DECISION_LABEL: Record<string, string> = {
  approve: 'Одобрить',
  reject: 'Отклонить',
  request_info: 'Запросить данные',
  unclear: 'Неясно',
};

/** Owner 2026-11-12 (row 51): what a complaint proposal suggests. */
export const ACTION_LABEL: Record<string, string> = {
  none: 'ничего',
  dismiss: 'отклонить жалобу',
  hide: 'скрыть',
  remove: 'удалить',
  warn: 'предупредить автора',
  suspend: 'заблокировать автора',
};

export const DECISION_TONE: Record<string, Tone> = {
  approve: 'success',
  reject: 'danger',
  request_info: 'warning',
  unclear: 'neutral',
};

export const RUN_LABEL: Record<string, { text: string; tone: Tone }> = {
  queued: { text: 'В очереди', tone: 'neutral' },
  running: { text: 'Идёт', tone: 'info' },
  done: { text: 'Готово', tone: 'success' },
  failed: { text: 'Остановлен ошибкой', tone: 'danger' },
  canceled: { text: 'Остановлен', tone: 'neutral' },
};

/** «$0.12»: cents to dollars. */
export const usdFromCents = (c: number) => `$${(c / 100).toFixed(2)}`;

/** «90 % (9 из 10)» or «ещё нет решений». */
export function agreementText(r: { reviewed: number; agreed: number; agreementPct: number | null }): string {
  if (r.agreementPct === null) return 'ещё нет решений';
  return `${r.agreementPct} % (${r.agreed} из ${r.reviewed})`;
}

export const runProgress = (r: { total: number; proposed: number; failed: number }) =>
  r.total ? Math.min(100, Math.round(((r.proposed + r.failed) * 100) / r.total)) : 0;
