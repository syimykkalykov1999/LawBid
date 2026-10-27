import type { components } from '@/lib/api/schema';

/** Owner 2026-10-25 (online DDL): words and buttons for the backfill card on «Масштаб». */
export type Backfill = components['schemas']['BackfillRunDto'];
export type BackfillAction = 'pause' | 'resume' | 'abort';
type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export function backfillStatus(b: Backfill): { label: string; tone: Tone } {
  if (b.status === 'failed') return { label: 'Ошибка', tone: 'danger' };
  if (b.status === 'done') return { label: 'Готово', tone: 'success' };
  if (b.status === 'aborted') return { label: 'Остановлено', tone: 'neutral' };
  if (b.status === 'paused') return { label: 'На паузе', tone: 'warning' };
  if (b.stalled) return { label: 'Не отвечает', tone: 'danger' };
  if (b.pauseReason) return { label: 'Ждёт базу', tone: 'warning' };
  return { label: 'Идёт', tone: 'success' };
}

export function backfillLine(b: Backfill): string {
  const rows = b.processed.toLocaleString('ru-RU');
  const of = b.totalEstimate ? ` из ~${b.totalEstimate.toLocaleString('ru-RU')}` : '';
  const pct = b.percent == null ? '' : ` (${b.percent}%)`;
  return `Обработано строк: ${rows}${of}${pct}. Таблица ${b.tableName}, до ${b.maxRowsPerSec.toLocaleString('ru-RU')} строк в секунду.`;
}

export function backfillNote(b: Backfill): string | null {
  if (b.status === 'failed') return `Остановилось из-за ошибки: ${b.lastError ?? 'неизвестно'}. Запустите ту же команду снова: продолжит с места остановки.`;
  if (b.stalled) return 'Процесс не подаёт признаков жизни больше 2 минут. Запустите команду снова: продолжит с места остановки.';
  if (b.status === 'paused') return 'Вы поставили на паузу. Процесс ждёт и продолжит сразу после «Продолжить».';
  if (b.pauseReason) return `Само притормозило: ${b.pauseReason}. Продолжит, когда база успокоится.`;
  return null;
}

/** Which buttons fit the state (the server checks again). */
export function backfillButtons(b: Backfill): BackfillAction[] {
  switch (b.status) {
    case 'running':
      return ['pause', 'abort'];
    case 'paused':
      return ['resume', 'abort'];
    case 'failed':
      return ['resume', 'abort'];
    default:
      return [];
  }
}

export const BACKFILL_ACTION_TEXT: Record<BackfillAction, { button: string; done: string }> = {
  pause: { button: 'Пауза', done: 'Перенос данных на паузе' },
  resume: { button: 'Продолжить', done: 'Перенос данных продолжается' },
  abort: { button: 'Остановить', done: 'Перенос данных остановлен' },
};
