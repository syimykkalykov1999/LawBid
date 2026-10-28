import type { components } from '@/lib/api/schema';

/**
 * Owner 2026-10-27 («Сегодня» as the owner's desk): the «Система» block —
 * what the server computed from its cached signals (StaffTodaySystemDto) plus
 * the few LIVE lights the page already loads for the health line (queues,
 * database, Redis, worker…), merged into ONE list by urgency. The page only
 * draws; the words and the ordering live here so they can be tested.
 */
export type SystemItem = components['schemas']['StaffSystemItemDto'];
export type SystemAction = components['schemas']['StaffSystemActionDto'];
export type TodaySystem = components['schemas']['StaffTodaySystemDto'];
export type SentrySummary = components['schemas']['StaffSentrySummaryDto'];
/** Structural, so the page's lite health query and the typed report both fit. */
type HealthItem = { key: string; status: string; detail?: unknown };
type Health = { items: readonly HealthItem[] };

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;

export const SEVERITY_WORD: Record<string, { label: string; tone: Tone }> = {
  critical: { label: 'Срочно', tone: 'danger' },
  high: { label: 'Сегодня', tone: 'danger' },
  medium: { label: 'На этой неделе', tone: 'warning' },
  low: { label: 'Когда будет время', tone: 'neutral' },
};

/** The core lights the server cannot read from its snapshot (they are live). */
const LIVE_TITLE: Record<string, string> = {
  queues: 'Очереди задач',
  database: 'База данных',
  redis: 'Redis (быстрая память)',
  worker: 'Фоновый обработчик',
  storage: 'Хранилище файлов',
  backup: 'Копии базы',
  message_keys: 'Ключи шифрования сообщений',
  secret_rotation: 'Смена паролей и ключей',
  table_growth: 'Рост таблиц',
};

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Items from the live «Здоровье системы» report (red / yellow core lights). */
export function healthToItems(h: Health | undefined): SystemItem[] {
  if (!h) return [];
  const out: SystemItem[] = [];
  for (const i of h.items) {
    if (!(i.key in LIVE_TITLE)) continue;
    if (i.status !== 'red' && i.status !== 'yellow') continue;
    const d = (i.detail ?? {}) as Record<string, unknown>;
    let why =
      i.status === 'red'
        ? 'Лампочка красная. На «Здоровье системы» написано, что именно не так и что нажать.'
        : 'Лампочка жёлтая: пока работает, но лучше посмотреть сегодня.';
    if (i.key === 'queues') {
      const failed = n(d.failed) ?? 0;
      const dlq = n(d.dlq) ?? 0;
      const oldest = n(d.oldestSec) ?? 0;
      const parts: string[] = [];
      if (failed > 0) parts.push(`упавших задач: ${failed}`);
      if (dlq > 0) parts.push(`событий Stripe в отстойнике: ${dlq}`);
      if (oldest > 60) parts.push(`самая старая ждёт ${Math.round(oldest / 60)} мин`);
      if (parts.length > 0) why = `${parts.join(', ')}. Откройте очереди на «Здоровье системы» и нажмите «Повторить».`;
    }
    out.push({
      code: `live_${i.key}`,
      severity: i.status === 'red' ? 'high' : 'medium',
      title: `${i.status === 'red' ? 'Проблема' : 'Есть на что посмотреть'}: ${LIVE_TITLE[i.key]}`,
      why,
      action: { kind: 'route', target: '/system-health', label: 'Открыть «Здоровье системы»' },
    });
  }
  return out;
}

/** One list: server items first, live lights added, deduped by code, by urgency. */
export function mergeSystemItems(server: readonly SystemItem[] | undefined, health: Health | undefined): SystemItem[] {
  const seen = new Set<string>();
  const all = [...(server ?? []), ...healthToItems(health)].filter((i) => (seen.has(i.code) ? false : (seen.add(i.code), true)));
  return all.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity as never) - SEVERITY_ORDER.indexOf(b.severity as never) || a.code.localeCompare(b.code),
  );
}

/** Where the action button goes (an admin route; `launch` opens the step's guide). */
export function actionHref(a: SystemAction): string {
  switch (a.kind) {
    case 'route':
      return a.target;
    case 'guide':
      return `/guides/${a.target}`;
    case 'launch':
      return `/guides?step=${encodeURIComponent(a.target)}`;
    default:
      return a.target;
  }
}

/** «Ошибки в приложении: 3 новых / 12 нерешённых», or why there is no number. */
export function sentryLine(s: SentrySummary | undefined): { text: string; tone: Tone; link: boolean } {
  if (!s || s.state === 'off') {
    return { text: 'Сейчас выключено: ошибки из Sentry. Переключатель today.sentry_enabled — в «Настройки».', tone: 'neutral', link: false };
  }
  if (s.state === 'unconfigured') {
    return { text: 'Ключи Sentry не заполнены: откройте «Ключи и сервисы» → Sentry и добавьте проект и токен event:read/event:write.', tone: 'neutral', link: false };
  }
  if (s.state === 'error') {
    return { text: `Sentry не ответил: ${s.error ?? 'ошибка'}. Следующая попытка через 5 минут.`, tone: 'warning', link: !!s.url };
  }
  const more = s.unresolvedAtLeast ? '+' : '';
  return {
    text: `Ошибки в приложении: ${s.newCount} новых / ${s.unresolved}${more} нерешённых`,
    tone: s.newCount > 0 ? 'danger' : s.unresolved > 0 ? 'warning' : 'success',
    link: !!s.url,
  };
}
