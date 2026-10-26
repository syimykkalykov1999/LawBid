import type { components } from '@/lib/api/schema';

/**
 * Owner 2026-10-25: the words and decisions of the «Индекс поиска» card on
 * the «Масштаб» page (zero-downtime reindex). The card only draws.
 */
export type SearchIndexStatus = components['schemas']['SearchIndexStatusDto'];
type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export const ENTITY_RU: Record<string, string> = {
  person: 'Люди',
  case: 'Дела',
  post: 'Посты',
  question: 'Вопросы юристу',
  tag: 'Темы',
};

const ROLE_RU: Record<string, string> = {
  read: 'читают',
  write: 'пишут',
  'read+write': 'читают и пишут',
  building: 'строится',
  rollback: 'запас для отката',
  idle: 'не используется',
};
export const roleWord = (role: string): string => ROLE_RU[role] ?? role;

export function phaseWord(s: SearchIndexStatus): {
  label: string;
  tone: Tone;
  line: string;
} {
  if (!s.engineConfigured) {
    return {
      label: 'Не подключён',
      tone: 'neutral',
      line: 'Адрес поискового движка не задан: пересборка недоступна.',
    };
  }
  switch (s.phase) {
    case 'building': {
      const e = s.progressEntity ? (ENTITY_RU[s.progressEntity] ?? s.progressEntity) : '';
      const n = s.source === 'engine' ? `${s.progressDone} из ${s.progressTotal || '…'}` : `${s.progressIndexed} записей`;
      return {
        label: 'Строится',
        tone: 'warning',
        line: `Новый индекс наполняется${e ? ` (${e})` : ''}: ${n}. Поиск работает по старому, изменения пишутся в оба.`,
      };
    }
    case 'built':
      return {
        label: 'Готов к переключению',
        tone: 'success',
        line:
          s.verifyOk === false
            ? 'Проверка не прошла: кнопка «Переключить» проверит ещё раз.'
            : 'Новый индекс наполнен. «Переключить» сверит счётчики и образцы с базой и переведёт чтение.',
      };
    case 'read_swapped':
      return {
        label: 'Читают с нового',
        tone: 'warning',
        line: 'Поиск уже читает новый индекс, запись ещё идёт в старый. Следующий шаг: «Переключить» переведёт и запись.',
      };
    case 'write_swapped':
      return {
        label: 'Переключено',
        tone: 'success',
        line: `Всё на новом индексе. Старый хранится для отката${s.retainUntil ? ` до ${s.retainUntil.slice(0, 10)}` : ''}.`,
      };
    case 'completed':
      return {
        label: 'Завершено',
        tone: 'success',
        line: 'Пересборка закончена, старый индекс удалён.',
      };
    case 'rolled_back':
      return {
        label: 'Откат выполнен',
        tone: 'neutral',
        line: 'Вернулись на старый индекс. Новый удалится по истечении срока хранения.',
      };
    case 'cancelled':
      return {
        label: 'Отменено',
        tone: 'neutral',
        line: 'Пересборка отменена, новый индекс удалён.',
      };
    default:
      return {
        label: s.entities.some((e) => e.mappingOutdated) ? 'Схема устарела' : 'Актуален',
        tone: s.entities.some((e) => e.mappingOutdated) ? 'warning' : 'success',
        line: s.entities.some((e) => e.mappingOutdated)
          ? 'В коде новая схема индекса. Нажмите «Начать пересборку»: поиск не остановится.'
          : 'Пересборка не идёт. Нужна она только после смены схемы индекса.',
      };
  }
}

export function sizeWord(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} ГБ`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} МБ`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} КБ`;
  return `${bytes} Б`;
}

export function swapLabel(s: SearchIndexStatus): string {
  return s.nextSwap === 'write' ? 'Переключить запись' : 'Переключить чтение';
}
