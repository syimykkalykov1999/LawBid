/**
 * Owner 2026-10-27 («Сегодня» as the owner's desk): the «Система» block —
 * every action the owner must take today, from signals the system ALREADY
 * computes (the «Масштаб» capacity reading, the cached AWS budget, the
 * «Запуск» lights, the status-board probes and incidents, the secret
 * rotation rows). Pure: it only words and orders what it is given, so the
 * service can be tested with plain objects and the admin only draws.
 */

export type SystemSeverity = 'critical' | 'high' | 'medium' | 'low';

export const SEVERITY_ORDER: readonly SystemSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
];

/** The page may be this old before a read starts a background refresh. */
export const SYSTEM_FRESH_SEC = 300;

export type SystemActionKind = 'route' | 'guide' | 'launch' | 'url';

export interface SystemAction {
  /** route = an admin page, guide = an «Инструкции» id, launch = a «Запуск»
   * step id (the admin opens its guide, else «Запуск»), url = outside. */
  kind: SystemActionKind;
  target: string;
  /** The button text (plain Russian). */
  label: string;
}

export interface SystemItem {
  /** Stable, unique: the row disappears when the signal clears. */
  code: string;
  severity: SystemSeverity;
  title: string;
  /** One line: why this is on the list today. */
  why: string;
  action: SystemAction;
}

export type Light = 'green' | 'yellow' | 'red' | 'grey';

export interface SystemSignals {
  /** Status-board probes (the extra items of «Здоровье системы»). */
  health: { key: string; status: Light; detail?: Record<string, unknown> }[];
  /** Open incidents (status board, last 24 h). */
  incidents: { component: string; openedAt: string; closedAt: string | null }[];
  /** The «Запуск» checklist. */
  launch: {
    id: string;
    status: 'green' | 'yellow' | 'red' | 'manual';
    title: string;
    hint: string | null;
    manualTick: boolean;
    ticked: boolean;
  }[];
  /** The cached AWS budget reading. */
  cost: {
    actualUsd: number;
    forecastUsd: number | null;
    limitUsd: number;
  } | null;
  /** The newest capacity reading (what «Масштаб» shows). */
  capacity: {
    dbCpuPercent: number | null;
    dbConnections: number | null;
    dbMaxConnections: number | null;
    redisMemoryPercent: number | null;
    dbNext: string | null;
  } | null;
  /** What the system did by itself (autoscaler / economy guard). */
  economyEvents: { at: string; kind: string; text: string }[];
  economyLimited: boolean;
  heavyPaused: boolean;
  scaleMode: 'min' | 'normal' | null;
  /** null = unknown (no heartbeat stored yet). */
  workerAlive: boolean | null;
  backup: { ageHours: number | null; maxHours: number } | null;
  /** Tables whose wasted space is over the line (nightly bloat check). */
  bloatOver: string[];
  rotation: { name: string; state: string }[];
}

const DAY_MS = 86_400_000;

const route = (target: string, label: string): SystemAction => ({
  kind: 'route',
  target,
  label,
});
const guide = (target: string, label = 'Открыть инструкцию'): SystemAction => ({
  kind: 'guide',
  target,
  label,
});
const launch = (target: string): SystemAction => ({
  kind: 'launch',
  target,
  label: 'Открыть инструкцию',
});

/** Status-board keys in plain words (the rest fall back to the key). */
const COMPONENT_TITLE: Record<string, string> = {
  api: 'Сервер приложения',
  worker: 'Фоновый обработчик',
  database: 'База данных',
  redis: 'Redis (быстрая память)',
  storage: 'Хранилище файлов',
  video: 'Видео (Bunny)',
  queues: 'Очереди задач',
  backup: 'Копии базы',
  cost: 'Расходы AWS',
  message_keys: 'Ключи шифрования сообщений',
  restore_drill: 'Учебное восстановление',
  secret_rotation: 'Смена паролей и ключей',
  stripe_webhooks: 'События Stripe',
  push: 'Пуш-уведомления',
  turn: 'Звонки: наш TURN',
  cloudflare_turn: 'Звонки: Cloudflare TURN',
  cloudflare_sfu: 'Групповые звонки: Cloudflare SFU',
  r2: 'Фото и медиа (R2)',
  http: 'Ответы сервера (HTTP)',
  realtime: 'Живое соединение',
  breakers: 'Предохранители внешних сервисов',
  cloudflare_usage: 'Трафик Cloudflare',
  bunny_usage: 'Трафик и хранилище Bunny',
  table_growth: 'Рост таблиц',
};

export const componentTitle = (key: string): string =>
  COMPONENT_TITLE[key] ?? key;

const pct = (n: number) => `${Math.round(n)} %`;
const usd = (n: number) => `$${Math.round(n).toLocaleString('ru-RU')}`;

function costItems(c: SystemSignals['cost']): SystemItem[] {
  if (!c || c.limitUsd <= 0) return [];
  const ratio = c.actualUsd / c.limitUsd;
  const out: SystemItem[] = [];
  if (ratio >= 1) {
    out.push({
      code: 'cost_over',
      severity: 'critical',
      title: 'Расходы AWS достигли месячного потолка',
      why: `Потрачено ${usd(c.actualUsd)} из ${usd(c.limitUsd)}. Автоснижение уже держит серверы на минимуме; решите, поднять потолок или ждать нового месяца.`,
      action: route('/spend', 'Открыть «Расходы»'),
    });
  } else if (c.forecastUsd !== null && c.forecastUsd > c.limitUsd) {
    out.push({
      code: 'cost_forecast',
      severity: 'high',
      title: 'Прогноз расходов выше потолка',
      why: `К концу месяца выйдет около ${usd(c.forecastUsd)} при потолке ${usd(c.limitUsd)}. Посмотрите, что растёт, и выключите лишнее или поднимите потолок.`,
      action: route('/spend', 'Открыть «Расходы»'),
    });
  } else if (ratio >= 0.8) {
    out.push({
      code: 'cost_80',
      severity: 'medium',
      title: 'Потрачено больше 80 % месячного бюджета',
      why: `Потрачено ${usd(c.actualUsd)} из ${usd(c.limitUsd)} (${pct(ratio * 100)}). Дневной тормоз включится сам на 100 %; проверьте потолок заранее.`,
      action: guide('aws-budget-ceiling'),
    });
  }
  return out;
}

function capacityItems(cap: SystemSignals['capacity']): SystemItem[] {
  if (!cap) return [];
  const out: SystemItem[] = [];
  const cpu = cap.dbCpuPercent;
  if (cpu !== null && cpu >= 80) {
    out.push({
      code: 'db_cpu',
      severity: 'high',
      title: 'База данных почти на пределе по процессору',
      why: `Процессор базы ${pct(cpu)}. Автоувеличение сработает само, если включено; иначе нажмите «Увеличить» на «Масштабе».`,
      action: route('/scale', 'Открыть «Масштаб»'),
    });
  } else if (cpu !== null && cpu >= 60) {
    out.push({
      code: 'db_cpu',
      severity: 'medium',
      title: 'База данных приближается к потолку',
      why: `Процессор базы ${pct(cpu)}. Пока не страшно; посмотрите, не растёт ли это день за днём.`,
      action: route('/scale', 'Открыть «Масштаб»'),
    });
  }
  if (
    cap.dbConnections !== null &&
    cap.dbMaxConnections !== null &&
    cap.dbMaxConnections > 0 &&
    cap.dbConnections / cap.dbMaxConnections >= 0.8
  ) {
    out.push({
      code: 'db_connections',
      severity: 'high',
      title: 'Соединений с базой почти максимум',
      why: `${cap.dbConnections} из ${cap.dbMaxConnections}. Включите пулер соединений (PgBouncer), он снимает это ограничение.`,
      action: guide('db-pooler'),
    });
  }
  if (cap.redisMemoryPercent !== null && cap.redisMemoryPercent >= 80) {
    out.push({
      code: 'redis_memory',
      severity: cap.redisMemoryPercent >= 95 ? 'critical' : 'high',
      title: 'Redis почти заполнен',
      why: `Память Redis ${pct(cap.redisMemoryPercent)}. Автоувеличение сработает само, если включено; иначе «Увеличить» на «Масштабе».`,
      action: route('/scale', 'Открыть «Масштаб»'),
    });
  }
  if (cpu !== null && cpu >= 60 && cap.dbNext === null) {
    out.push({
      code: 'db_split_ready',
      severity: 'medium',
      title:
        'База на самом большом размере и загружена: пора готовить разделение',
      why: `Процессор ${pct(cpu)}, увеличивать больше некуда. Разделение базы на два сервера делается заранее, по инструкции.`,
      action: guide('db-split'),
    });
  }
  return out;
}

function economyItems(s: SystemSignals, now: number): SystemItem[] {
  const out: SystemItem[] = [];
  if (s.workerAlive === false) {
    out.push({
      code: 'worker_down',
      severity: 'critical',
      title: 'Фоновый обработчик молчит',
      why: 'Нет сердцебиения больше 3 минут: письма, пуши и ночные пересчёты стоят. Нажмите «Заменить фоновый обработчик» на «Здоровье системы».',
      action: route('/system-health', 'Открыть «Здоровье системы»'),
    });
  }
  if (s.economyLimited) {
    out.push({
      code: 'economy_limited',
      severity: 'medium',
      title: 'Экономный режим держит серверы на минимуме',
      why: 'Сработала защита бюджета: серверы не растут под нагрузкой. Снимите ограничение, когда разберётесь с расходами.',
      action: route('/scale', 'Открыть «Масштаб»'),
    });
  }
  if (s.scaleMode === 'min') {
    out.push({
      code: 'scale_min',
      severity: 'medium',
      title: 'Автомасштабирование зажато вручную на минимум',
      why: 'Кто-то нажал «Держать минимум». Под нагрузкой приложение будет медленным; верните «Как обычно», когда можно.',
      action: route('/scale', 'Открыть «Масштаб»'),
    });
  }
  if (s.heavyPaused) {
    out.push({
      code: 'heavy_paused',
      severity: 'low',
      title: 'Тяжёлые фоновые задачи на паузе',
      why: 'База отвечала медленно, и задачи встали сами на 15 минут. Делать ничего не нужно, если пауза не повторяется часами.',
      action: route('/system-health', 'Открыть «Здоровье системы»'),
    });
  }
  const recent = s.economyEvents.filter(
    (e) =>
      ['scaled_up', 'scaled_down', 'ceiling'].includes(e.kind) &&
      now - Date.parse(e.at) < DAY_MS,
  );
  if (recent.length > 0) {
    out.push({
      code: 'autoscale_events',
      severity: 'low',
      title: `Система сама меняла размер: ${recent.length} раз за сутки`,
      why: `Последнее: ${recent[0].text}. Посмотрите, не качается ли размер туда-обратно (тогда поднимите нижнюю ступень).`,
      action: route('/scale', 'Открыть «Масштаб»'),
    });
  }
  return out;
}

function backupItems(s: SystemSignals): SystemItem[] {
  const out: SystemItem[] = [];
  const b = s.backup;
  if (b && b.ageHours !== null && b.ageHours > b.maxHours) {
    out.push({
      code: 'backup_old',
      severity: b.ageHours > b.maxHours * 2 ? 'critical' : 'high',
      title: 'Свежей копии базы нет',
      why: `Последняя копия сделана ${Math.round(b.ageHours)} ч назад, допустимо ${b.maxHours} ч. Проверьте AWS Backup по инструкции.`,
      action: guide('backups'),
    });
  }
  if (s.bloatOver.length > 0) {
    out.push({
      code: 'db_bloat',
      severity: 'low',
      title: 'Раздутые таблицы в базе',
      why: `Лишнее место в: ${s.bloatOver.slice(0, 3).join(', ')}. Не срочно; сжатие делается по инструкции в тихое время.`,
      action: guide('pg-repack'),
    });
  }
  if (s.rotation.some((r) => r.state === 'failed')) {
    out.push({
      code: 'rotation_failed',
      severity: 'high',
      title: 'Автоматическая смена пароля или ключа не удалась',
      why: `Не сменились: ${s.rotation
        .filter((r) => r.state === 'failed')
        .map((r) => r.name)
        .join(', ')}. Старый ключ пока работает; разберитесь по инструкции.`,
      action: guide('secrets-rotation'),
    });
  } else if (s.rotation.some((r) => r.state === 'overdue')) {
    out.push({
      code: 'rotation_overdue',
      severity: 'medium',
      title: 'Смена паролей и ключей просрочена',
      why: `Ждут смены: ${s.rotation
        .filter((r) => r.state === 'overdue')
        .map((r) => r.name)
        .join(', ')}.`,
      action: guide('secrets-rotation'),
    });
  }
  return out;
}

function healthItems(s: SystemSignals): SystemItem[] {
  const out: SystemItem[] = [];
  const seen = new Set<string>();
  for (const i of s.incidents) {
    if (i.closedAt || seen.has(i.component)) continue;
    seen.add(i.component);
    out.push({
      code: `incident_${i.component}`,
      severity: 'critical',
      title: `Авария: ${componentTitle(i.component)}`,
      why: `Проверка не проходит с ${new Date(i.openedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC. Откройте «Здоровье системы»: там написано, что система уже сделала и что нажать.`,
      action: route('/system-health', 'Открыть «Здоровье системы»'),
    });
  }
  for (const h of s.health) {
    if (h.status !== 'red' && h.status !== 'yellow') continue;
    if (seen.has(h.key)) continue;
    seen.add(h.key);
    out.push({
      code: `health_${h.key}`,
      severity: h.status === 'red' ? 'high' : 'medium',
      title: `${h.status === 'red' ? 'Проблема' : 'Есть на что посмотреть'}: ${componentTitle(h.key)}`,
      why:
        h.status === 'red'
          ? 'Лампочка красная. На «Здоровье системы» написано, что именно не так и что нажать.'
          : 'Лампочка жёлтая: пока работает, но лучше посмотреть сегодня.',
      action: route('/system-health', 'Открыть «Здоровье системы»'),
    });
  }
  return out;
}

function launchItems(s: SystemSignals): SystemItem[] {
  const out: SystemItem[] = [];
  for (const l of s.launch) {
    if (l.status === 'green') continue;
    if (l.manualTick && l.ticked) continue;
    const severity: SystemSeverity =
      l.status === 'red' ? 'high' : l.status === 'yellow' ? 'medium' : 'low';
    out.push({
      code: `launch_${l.id}`,
      severity,
      title: `Шаг запуска: ${l.title}`,
      why:
        l.hint ??
        (l.status === 'manual'
          ? 'Система не может проверить это сама: сделайте по инструкции и отметьте галочкой на «Запуске».'
          : 'Лампочка на «Запуске» не зелёная.'),
      action: launch(l.id),
    });
  }
  return out;
}

/**
 * Builds, dedupes (first row with a code wins) and orders (severity, then
 * code, so the list is stable between refreshes) the owner's system actions.
 */
export function buildSystemItems(
  s: SystemSignals,
  now: Date = new Date(),
): SystemItem[] {
  const t = now.getTime();
  const all = [
    ...costItems(s.cost),
    ...economyItems(s, t),
    ...capacityItems(s.capacity),
    ...backupItems(s),
    ...healthItems(s),
    ...launchItems(s),
  ];
  const seen = new Set<string>();
  const unique = all.filter((i) =>
    seen.has(i.code) ? false : (seen.add(i.code), true),
  );
  return unique.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
}

/** Counts per severity (the job result, the digest). */
export function countBySeverity(
  items: readonly SystemItem[],
): Record<SystemSeverity, number> {
  const out: Record<SystemSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const i of items) out[i.severity] += 1;
  return out;
}
