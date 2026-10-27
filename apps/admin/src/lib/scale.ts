import type { components } from '@/lib/api/schema';
import { incidentSpan, word, componentTitle } from '@/lib/system-health';

/**
 * Batch D (2026-10-24, item 17): the logic of the «Масштаб» page. The page
 * itself only draws; every decision (which alarm, what the system did by
 * itself, which button fits) is here so it can be tested without a browser.
 */
export type Health = components['schemas']['SystemHealthDto'];
export type Economy = components['schemas']['EconomyReportDto'];
export type ScaleExtras = components['schemas']['ScaleExtrasDto'];
type HealthItem = components['schemas']['HealthItemDto'];
type TierRow = components['schemas']['TierRowDto'];
type Tone = 'success' | 'warning' | 'danger' | 'neutral';

type D = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// --- ladders (database, Redis) ------------------------------------------

export interface Ladder {
  /** «ступень 3 из 7», or null when the current class is not on the ladder. */
  position: string | null;
  current: TierRow | null;
  next: TierRow | null;
  prev: TierRow | null;
}

export function ladder(tiers: readonly TierRow[]): Ladder {
  const i = tiers.findIndex((t) => t.current);
  if (i < 0) return { position: null, current: null, next: null, prev: null };
  return {
    position: `ступень ${i + 1} из ${tiers.length}`,
    current: tiers[i],
    next: tiers[i + 1] ?? null,
    prev: tiers[i - 1] ?? null,
  };
}

export function autoscaleWord(mode: ScaleExtras['dbAutoscale'] | undefined): { label: string; tone: Tone } {
  if (mode === 'on') return { label: 'Сам растёт и уменьшается', tone: 'success' };
  if (mode === 'off') return { label: 'Автоматика выключена: размер меняете вы', tone: 'neutral' };
  return { label: 'Режим автоматики неизвестен', tone: 'neutral' };
}

// --- containers ----------------------------------------------------------

/** A ceiling typed by the owner: a whole number from 1 to the Terraform cap. */
export function parseCeiling(raw: string, hardCap: number): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= hardCap ? n : null;
}

// --- pooler / search ----------------------------------------------------

export function poolerLine(x: ScaleExtras | undefined): { label: string; tone: Tone; line: string } {
  if (!x) return { label: '—', tone: 'neutral', line: '' };
  if (!x.poolerEnabled) {
    return {
      label: 'Выключен',
      tone: 'neutral',
      line: 'Приложение ходит в базу напрямую. Включается в Terraform (db_pooler_enabled), откат так же.',
    };
  }
  const copies =
    x.poolerMinTasks && x.poolerMaxTasks
      ? x.poolerMinTasks === x.poolerMaxTasks
        ? `${x.poolerMaxTasks} копии`
        : `от ${x.poolerMinTasks} до ${x.poolerMaxTasks} копий`
      : 'число копий неизвестно';
  return { label: 'Включён', tone: 'success', line: `Между приложением и базой стоит свой PgBouncer: ${copies}.` };
}

const SEARCH_NAMES: Record<string, string> = {
  postgres: 'Встроенный поиск (PostgreSQL)',
  opensearch: 'OpenSearch',
  meilisearch: 'Meilisearch',
};

export function searchLine(engine: string | undefined): string {
  if (!engine) return '—';
  return SEARCH_NAMES[engine] ?? engine;
}

// --- usage (Cloudflare, Bunny) -------------------------------------------

/** Batch C puts both on the health board as `cloudflare_usage` / `bunny_usage`.
 * Until it is merged the items are absent: say so instead of failing. */
export function usageLine(
  items: readonly { key: string; status: HealthItem['status']; detail: unknown }[] | undefined,
  which: 'cloudflare_usage' | 'bunny_usage',
): { tone: Tone; line: string } {
  const item = items?.find((i) => i.key === which);
  if (!item) return { tone: 'neutral', line: 'Данных пока нет: расход читается раз в сутки.' };
  const d = item.detail as D;
  if (item.status === 'grey') {
    return {
      tone: 'neutral',
      line:
        which === 'cloudflare_usage'
          ? 'Не подключено: добавьте ID аккаунта и токен в Ключи и сервисы → cloudflare_turn.'
          : 'Не подключено: добавьте API-ключ аккаунта в Ключи и сервисы → bunny_stream.',
    };
  }
  if (typeof d.error === 'string' && d.error) {
    return { tone: 'warning', line: `Не удалось узнать расход: ${d.error}.` };
  }
  const tone: Tone = item.status === 'red' ? 'danger' : item.status === 'yellow' ? 'warning' : 'success';
  if (which === 'cloudflare_usage') {
    return { tone, line: `Трафик звонков за месяц: ${num(d.egressGb) ?? 0} ГБ из бесплатных 1000.` };
  }
  return {
    tone,
    line: `Видео: трафик ${num(d.bandwidthGb) ?? 0} ГБ за месяц, хранилище ${num(d.storageGb) ?? 0} ГБ.`,
  };
}

// --- alarms ---------------------------------------------------------------

export type AlarmAction =
  | { kind: 'restart' }
  | { kind: 'pause'; paused: boolean }
  | { kind: 'scale'; mode: 'min' | 'normal' }
  | { kind: 'increase'; target: 'db' | 'redis' }
  | { kind: 'ceiling' };

export interface Alarm {
  id: string;
  component: string;
  title: string;
  tone: Tone;
  /** What happened, in plain words. */
  what: string;
  /** What the system already did by itself (can be empty). */
  auto: string[];
  /** The one recommended button, only when an API call exists for it. */
  action: { action: AlarmAction; label: string } | null;
  /** «с 12:00, идёт 5 мин», for open incidents. */
  span: string | null;
}

const DAY_MS = 86_400_000;

/** The economy events of the last day that belong to a component. */
function eventsFor(component: string, e: Economy | undefined, now: number): string[] {
  if (!e) return [];
  const kinds: Record<string, string[]> = {
    database: ['db_cpu', 'db_connections', 'scaled_up', 'scaled_down'],
    redis: ['redis_memory', 'scaled_up', 'scaled_down'],
    cost: ['guard_on', 'guard_off', 'ceiling'],
  };
  const want = kinds[component];
  if (!want) return [];
  return e.events
    .filter((ev) => want.includes(ev.kind) && now - Date.parse(ev.at) < DAY_MS)
    .filter((ev) => {
      // scaled_up / scaled_down are shared: pick the one about this part.
      if (ev.kind !== 'scaled_up' && ev.kind !== 'scaled_down') return true;
      return component === 'database' ? ev.text.startsWith('База') : ev.text.startsWith('Redis');
    })
    .slice(0, 3)
    .map((ev) => ev.text);
}

function autoActions(component: string, h: Health, e: Economy | undefined, now: number): string[] {
  const out = eventsFor(component, e, now);
  if (component === 'worker') out.push('AWS сам запускает упавшие фоновые задачи (обычно за 1–2 минуты).');
  if (component === 'api') out.push('AWS сам заменяет упавшие серверы и откатывает неудачное обновление.');
  if (h.heavyPause?.by === 'auto' && ['database', 'queues', 'http'].includes(component)) {
    out.push('Тяжёлые задачи поставлены на паузу системой: они разгружают базу. Снимутся сами.');
  }
  if (component === 'cost' && h.scaleMode?.by === 'auto' && h.scaleMode.mode === 'min') {
    out.push('Сервер удержан на минимуме системой: бюджет месяца исчерпан. В новом месяце вернётся.');
  }
  return out;
}

function recommended(component: string, h: Health, e: Economy | undefined): Alarm['action'] {
  const onAws = h.actions.onAws;
  switch (component) {
    case 'worker':
    case 'queues':
    case 'stripe_webhooks':
      return onAws ? { action: { kind: 'restart' }, label: 'Перезапустить фоновые задачи (в «Здоровье системы»)' } : null;
    case 'database': {
      if (!h.heavyPause) return { action: { kind: 'pause', paused: true }, label: 'Поставить тяжёлые задачи на паузу (в «Здоровье системы»)' };
      return e?.capacity.onAws && e.capacity.dbNext
        ? { action: { kind: 'increase', target: 'db' }, label: `Увеличить базу до ${e.capacity.dbNext}` }
        : null;
    }
    case 'redis':
      return e?.capacity.onAws && e.capacity.redisNext
        ? { action: { kind: 'increase', target: 'redis' }, label: `Увеличить Redis до ${e.capacity.redisNext}` }
        : null;
    case 'cost':
      return onAws
        ? h.scaleMode?.mode === 'min'
          ? { action: { kind: 'scale', mode: 'normal' }, label: 'Вернуть обычный режим' }
          : { action: { kind: 'scale', mode: 'min' }, label: 'Держать сервер на минимуме' }
        : null;
    case 'http':
      return { action: { kind: 'ceiling' }, label: 'Поднять потолок серверов' };
    default:
      return null;
  }
}

function toneOf(status: HealthItem['status']): Tone {
  return status === 'red' ? 'danger' : status === 'yellow' ? 'warning' : 'neutral';
}

/**
 * One card per trouble spot: every incident still open, plus every red or
 * yellow light that has no incident yet (yellow never opens one), plus the
 * economy guard when it is holding the limits. Red first.
 */
export function buildAlarms(h: Health, e: Economy | undefined, now = Date.now()): Alarm[] {
  const alarms: Alarm[] = [];
  const seen = new Set<string>();

  for (const i of h.incidents ?? []) {
    if (i.closedAt || seen.has(i.component)) continue;
    seen.add(i.component);
    const item = h.items.find((x) => x.key === i.component);
    alarms.push({
      id: `incident:${i.id}`,
      component: i.component,
      title: componentTitle(i.component),
      tone: 'danger',
      what: item ? word(item).line : 'Проверка не прошла дважды подряд.',
      auto: autoActions(i.component, h, e, now),
      action: recommended(i.component, h, e),
      span: `с ${new Date(i.openedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}, ${incidentSpan(i.openedAt, null, now)}`,
    });
  }

  for (const item of h.items) {
    if (item.status !== 'red' && item.status !== 'yellow') continue;
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    const w = word(item);
    alarms.push({
      id: `item:${item.key}`,
      component: item.key,
      title: w.title,
      tone: toneOf(item.status),
      what: w.line,
      auto: autoActions(item.key, h, e, now),
      action: recommended(item.key, h, e),
      span: null,
    });
  }

  if (e?.guard === 'limited' && !seen.has('cost')) {
    alarms.push({
      id: 'economy:limited',
      component: 'cost',
      title: 'Расходы на сторонние сервисы',
      tone: 'warning',
      what: 'Прогноз расходов выше правила экономики: включены ограничения.',
      auto: [
        'Лимиты сервисов опущены до минимума, новые видео на паузе, SMS только для входа и сброса пароля, потолок серверов на минимуме.',
      ],
      action: null,
      span: null,
    });
  }

  const rank = { danger: 0, warning: 1, neutral: 2, success: 3 } as const;
  return alarms.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// --- heavy users (WP-G) ---------------------------------------------------

export type HeavyHitters = components['schemas']['HeavyHittersDto'];
export type HeavyMetric = HeavyHitters['metrics'][number]['metric'];

export const HEAVY_METRIC_TITLES: Record<HeavyMetric, string> = {
  requests: 'Запросы',
  db_ms: 'Время базы',
  upload_bytes: 'Загрузки',
  messages: 'Сообщения',
};

/** A score in the unit of its metric: «1 200 запр.», «3,4 мин», «12 МБ». */
export function heavyScore(metric: HeavyMetric, score: number): string {
  const num = (v: number, digits = 0) => v.toLocaleString('ru-RU', { maximumFractionDigits: digits });
  switch (metric) {
    case 'requests':
      return `${num(score)} запр.`;
    case 'db_ms':
      return score >= 60_000 ? `${num(score / 60_000, 1)} мин` : `${num(score / 1000, 1)} с`;
    case 'upload_bytes':
      return score >= 1_073_741_824 ? `${num(score / 1_073_741_824, 1)} ГБ` : `${num(score / 1_048_576, 1)} МБ`;
    case 'messages':
      return `${num(score)} сообщ.`;
  }
}

/** Share of the list's leader, for the bar behind a row (0-100). */
export function heavyShare(score: number, top: number): number {
  return top > 0 ? Math.max(2, Math.min(100, Math.round((score / top) * 100))) : 0;
}
