/** Staff package T10: plain-Russian names of the codes the staff APIs send. */
import type { Tone } from '@/components/ui/card';

export const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  green: { label: 'Лучший', tone: 'success' },
  ok: { label: 'В норме', tone: 'info' },
  yellow: { label: 'Ниже нормы', tone: 'warning' },
  red: { label: 'Плохо', tone: 'danger' },
  low_data: { label: 'Мало данных', tone: 'neutral' },
};

export const WORKSPACE_NAME: Record<string, string> = {
  mass: 'Массовая работа',
  finance: 'Финансы',
  owner: 'Владелец',
};

export const SUGGESTION_KIND: Record<string, string> = {
  warn: 'Предупредить',
  more_review: 'Проверять чаще',
  pull: 'Снять с очереди',
  replace: 'Заменить',
  reward: 'Наградить',
  pause: 'Пауза',
  retrain: 'Обучить',
};

export const ADVICE_TONE: Record<string, Tone> = { reward: 'success', train: 'warning', replace: 'danger' };

export const ACTION_KIND: Record<string, string> = {
  warn: 'Предупреждение',
  more_review: 'Проверка чаще',
  pull: 'Снят с очереди',
  replace: 'Замена',
  reward: 'Награда',
  reinstate: 'Возвращён',
  offboard: 'Работа закончена',
  signal: 'Сигнал',
};

export const MEMBER_STATE: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Работает', tone: 'success' },
  paused: { label: 'На паузе', tone: 'warning' },
  hold_owner: { label: 'Ждёт вашего решения', tone: 'danger' },
  offboarded: { label: 'Работа закончена', tone: 'neutral' },
};

export const RATING_FLAG: Record<string, string> = {
  very_low: 'рейтинг сильно ниже нормы',
  low_rating: 'рейтинг ниже нормы',
  complaints_week: 'много жалоб за неделю',
  golden_fail: 'ошибка на эталонной задаче',
  overturned_streak: 'решения подряд отменены',
  rushing: 'решает слишком быстро',
};

export const APPEAL_KIND: Record<string, string> = {
  unfair_pull: 'Несправедливое снятие',
  pressure: 'Давление',
  insult: 'Оскорбления',
  rules: 'Нарушение правил',
  other: 'Другое',
};

export const APPEAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'Новая', tone: 'danger' },
  seen: { label: 'Прочитана', tone: 'warning' },
  resolved: { label: 'Решена', tone: 'neutral' },
};

export const APPEAL_DECISION: Record<string, string> = {
  none: '—',
  fire_head: 'Уволен главный',
  fire_worker: 'Уволен исполнитель',
  nothing: 'Без последствий',
};

export const RATE_KIND: Record<string, string> = {
  verification: 'Проверка документов',
  report: 'Жалоба (модерация)',
  ticket: 'Обращение в поддержку',
  appeal: 'Обжалование',
  media_report: 'Жалоба на фото и видео',
};

export const PIECE_STATUS: Record<string, { label: string; tone: Tone }> = {
  accrued: { label: 'Начислено', tone: 'success' },
  no_rating: { label: 'Без рейтинга', tone: 'info' },
  reversed: { label: 'Отменено', tone: 'neutral' },
  no_payroll: { label: 'Нет в зарплатах', tone: 'warning' },
  disputed: { label: 'Удержано', tone: 'danger' },
};

export const dayLabel = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
};

export const periodNow = (d = new Date()): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
