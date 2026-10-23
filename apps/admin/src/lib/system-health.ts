import type { components } from '@/lib/api/schema';

export type SystemHealth = components['schemas']['SystemHealthDto'];
type HealthItem = components['schemas']['HealthItemDto'];
type Light = HealthItem['status'];

type D = Record<string, unknown>;
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Seconds → «2 мин», «3 ч», «5 дн». */
function ago(sec: number | null): string {
  if (sec === null) return 'давно';
  if (sec < 90) return `${Math.max(1, Math.round(sec))} с`;
  if (sec < 5400) return `${Math.round(sec / 60)} мин`;
  if (sec < 172_800) return `${Math.round(sec / 3600)} ч`;
  return `${Math.round(sec / 86_400)} дн`;
}

function usd(v: number | null): string {
  return v === null ? '—' : `$${v.toFixed(v >= 100 ? 0 : 2)}`;
}

interface Worded {
  title: string;
  /** What is there now, one short line. */
  line: string;
  /** What to do — only when not green. */
  todo?: string;
  /** Runbook file in docs/runbooks. */
  runbook?: string;
}

/**
 * Owner 2026-10-05: one plain line per part of the system, written for an
 * owner who doesn't do servers. The server decides the colour; this only
 * words it.
 */
export function word(item: HealthItem): Worded {
  const d = item.detail as D;
  const s = item.status;
  switch (item.key) {
    case 'api':
      return {
        title: 'Сервер приложения',
        line: `Работает ${ago(n(d.uptimeSec))} без перезапуска, память ${n(d.memoryMb) ?? '—'} МБ.`,
      };
    case 'worker':
      return {
        title: 'Фоновые задачи',
        line:
          n(d.lastBeatSec) === null
            ? 'Обработчик фоновых задач не отзывается.'
            : `Последний сигнал ${ago(n(d.lastBeatSec))} назад.`,
        todo:
          s === 'green'
            ? undefined
            : 'Обычно AWS перезапускает его сам за пару минут. Не прошло за 10 минут — нажмите «Перезапустить фоновые задачи».',
        runbook: 'queues.md',
      };
    case 'database':
      return {
        title: 'База данных',
        line: d.error ? 'База не отвечает.' : `Отвечает за ${n(d.latencyMs)} мс.`,
        todo:
          s === 'green'
            ? undefined
            : s === 'yellow'
              ? 'База медленная. Тяжёлые задачи уже ставятся на паузу сами, ничего делать не нужно.'
              : 'Откройте кабинет хостинга базы данных: если там авария, она чинится провайдером сама. Приложение переподключится само.',
        runbook: 'db-redis-unavailable.md',
      };
    case 'redis':
      return {
        title: 'Быстрая память (Redis)',
        line: d.error
          ? 'Redis не отвечает.'
          : `Занято ${n(d.usedMb) ?? '—'} МБ${n(d.usedPct) !== null ? ` (${n(d.usedPct)} %)` : ''}.`,
        todo:
          s === 'green'
            ? undefined
            : s === 'yellow'
              ? 'Память заполняется. Если держится больше суток — увеличьте размер Redis при следующем «ставь на AWS».'
              : 'AWS заменяет упавший Redis сам. Не прошло за 15 минут — напишите Claude «Redis красный».',
        runbook: 'redis.md',
      };
    case 'storage':
      return {
        title: 'Файлы и фото (S3)',
        line: s === 'grey' ? 'Хранилище ещё не подключено.' : d.error ? 'Хранилище не отвечает.' : 'Файлы открываются.',
        todo: s === 'red' ? 'Проверьте Безопасность → Ключи и сервисы → File storage, кнопка «Проверить».' : undefined,
      };
    case 'video':
      return {
        title: 'Видео (Bunny)',
        line: !d.enabled ? 'Рилсы выключены (флаг video_posts).' : d.keys ? 'Рилсы включены, ключи есть.' : 'Рилсы включены, но ключей Bunny нет.',
        todo: s === 'red' ? 'Добавьте ключи Bunny в Безопасность → Ключи и сервисы или выключите флаг video_posts.' : undefined,
      };
    case 'queues': {
      const paused = Array.isArray(d.paused) ? (d.paused as string[]) : [];
      return {
        title: 'Очереди задач',
        line: d.error
          ? 'Очереди недоступны.'
          : `Ждут ${n(d.waiting) ?? 0}, самая старая ${ago(n(d.oldestSec) ?? 0)}${n(d.dlq) ? `, оплат Stripe не обработано: ${n(d.dlq)}` : ''}${paused.length ? ', выгрузки на паузе' : ''}.`,
        todo:
          s === 'green'
            ? undefined
            : n(d.dlq)
              ? 'Есть события Stripe, которые не прошли. Напишите Claude «Stripe DLQ» — разберёт.'
              : 'Задачи копятся. Если не рассосётся за 15 минут — «Перезапустить фоновые задачи».',
        runbook: n(d.dlq) ? 'stripe-webhooks.md' : 'queues.md',
      };
    }
    case 'backup': {
      const age = n(d.ageHours);
      return {
        title: 'Резервные копии базы',
        line:
          s === 'grey'
            ? 'Проверка подключится после запуска на AWS (ключ хостинга базы данных).'
            : age === null
              ? 'Свежий бэкап ещё не найден.'
              : `Последний бэкап ${age} ч назад (норма — не старше ${n(d.maxHours)} ч).`,
        todo:
          s === 'green' || s === 'grey'
            ? undefined
            : 'Бэкапы делает хостинг базы данных сам. Откройте его кабинет → Backups; если там ошибка — напишите в их поддержку или Claude.',
        runbook: 'backup-failed.md',
      };
    }
    case 'message_keys': {
      const byKid = (d.byKid ?? {}) as Record<string, { rewritten?: number; failed?: number }>;
      const retired = (d.retiredKids as string[] | undefined) ?? [];
      const stuck = Object.entries(byKid)
        .filter(([, v]) => (v.failed ?? 0) > 0)
        .map(([k, v]) => `${k}: ${v.failed}`)
        .join(', ');
      const removable = (d.removableKids as string[] | undefined) ?? [];
      return {
        title: 'Ключи сообщений',
        line:
          s === 'grey'
            ? 'Шифрование чатов выключено (нет MESSAGE_ENC_KEYS).'
            : d.phase === null
              ? `Активный ключ ${String(d.activeKid)}${retired.length ? `, старые: ${retired.join(', ')}` : ''}. Перешифровка ещё не запускалась.`
              : `Активный ключ ${String(d.activeKid)}. ${d.phase === 'done' ? 'Проход завершён' : `Идёт проход (${d.phase === 'messages' ? 'сообщения' : 'правки'})`}: просмотрено ${n(d.scanned) ?? 0}, переписано ${n(d.rewritten) ?? 0}, ошибок ${n(d.failed) ?? 0}.`,
        todo:
          s === 'red'
            ? `Строки, которые не открываются (${stuck}). Ключ с такими строками удалять нельзя; проверьте, что все старые ключи ещё в MESSAGE_ENC_KEYS, и нажмите «Перешифровать заново».`
            : s === 'yellow'
              ? 'Идёт постепенная перешифровка по 500 строк; ничего делать не нужно. Старый ключ убирайте из MESSAGE_ENC_KEYS только когда здесь станет зелёным.'
              : removable.length
                ? `Старые ключи ${removable.join(', ')} больше не нужны — их можно убрать из MESSAGE_ENC_KEYS (DEPLOY_PROD.md).`
                : undefined,
      };
    }
    case 'stripe_webhooks':
      return {
        title: 'Платежи Stripe (вебхуки)',
        line:
          d.error
            ? 'Очередь платежей недоступна.'
            : `Самое старое событие ждёт ${ago(n(d.lagSec) ?? 0)}, в очереди ${n(d.waiting) ?? 0}, сбойных ${n(d.failed) ?? 0}, в «мёртвой» очереди ${n(d.dlq) ?? 0}.`,
        todo:
          s === 'green'
            ? undefined
            : 'Платежи Stripe обрабатываются с задержкой. Обычно рассасывается само; если не прошло за 15 минут — «Перезапустить фоновые задачи».',
        runbook: 'stripe-webhooks.md',
      };
    case 'push':
      return {
        title: 'Доставка пушей',
        line: d.error
          ? 'Не удалось проверить пуши.'
          : n(d.ok) === 0 && n(d.failed) === 0
            ? `За 15 минут пушей не было; очередь ждёт ${ago(n(d.queueOldestSec) ?? 0)}.`
            : `За 15 минут доставлено ${n(d.ok) ?? 0}, не доставлено ${n(d.failed) ?? 0} (${n(d.failedPct) ?? 0} %); очередь ждёт ${ago(n(d.queueOldestSec) ?? 0)}.`,
        todo:
          s === 'green'
            ? undefined
            : 'Много пушей не доходит. Проверьте Безопасность → Ключи и сервисы → Firebase Cloud Messaging, кнопка «Проверить».',
      };
    case 'turn':
      return {
        title: 'Сервер звонков (TURN)',
        line:
          s === 'grey'
            ? 'TURN не настроен: звонки идут напрямую, за NAT могут не соединяться.'
            : d.error
              ? `TURN-сервер ${String(d.host ?? '')} не отвечает.`
              : `Отвечает, соединение за ${n(d.connectMs) ?? '—'} мс.`,
        todo:
          s === 'red'
            ? 'Звонки через сложные сети не соединятся. Проверьте, что сервер coturn запущен и порт открыт, а адрес в Ключи и сервисы → TURN верный.'
            : undefined,
        runbook: 'TURN.md',
      };
    case 'http':
      return {
        title: 'Ошибки и скорость API',
        line:
          n(d.requests5m) === 0
            ? 'За 5 минут запросов не было.'
            : `За 5 минут ${n(d.requests5m) ?? 0} запросов, ошибок сервера ${n(d.errorRatePct) ?? 0} %, медленнейшие 5 % дольше ${n(d.p95Ms) ?? '—'} мс. За час: ${n(d.errorRate1hPct) ?? 0} % ошибок, p95 ${n(d.p95Ms1h) ?? '—'} мс.`,
        todo:
          s === 'green'
            ? undefined
            : 'Растёт доля ошибок или ответы замедлились. Посмотрите «Здоровье» базы и очередей выше; если всё зелёное — напишите Claude «API красный».',
        runbook: 'api-5xx.md',
      };
    case 'cost': {
      return {
        title: 'Расходы AWS за месяц',
        line:
          s === 'grey'
            ? 'Появится после запуска на AWS (бюджет создаётся автоматически).'
            : `Потрачено ${usd(n(d.actualUsd))} из ${usd(n(d.limitUsd))}, прогноз на месяц ${usd(n(d.forecastUsd))}.`,
        todo:
          s === 'red'
            ? 'Бюджет исчерпан: система уже держит сервер на минимуме до конца месяца. Хотите больше — нажмите «Обычный режим».'
            : s === 'yellow'
              ? 'По прогнозу месяц выйдет дороже бюджета. Ничего не ломается; на 100 % система сама включит минимум.'
              : undefined,
        runbook: 'cost.md',
      };
    }
    default:
      return { title: item.key, line: d.error ? String(d.error) : '' };
  }
}

/** Component key → the plain name used in the incident list. */
export function componentTitle(key: string): string {
  return word({ key, status: 'green', detail: {} } as HealthItem).title;
}

/** «длился 12 мин» / «идёт 3 ч». */
export function incidentSpan(openedAt: string, closedAt: string | null, now = Date.now()): string {
  const end = closedAt ? Date.parse(closedAt) : now;
  const sec = Math.max(0, Math.round((end - Date.parse(openedAt)) / 1000));
  return `${closedAt ? 'длился' : 'идёт'} ${ago(sec)}`;
}

export const LIGHT_TONE: Record<Light, 'success' | 'warning' | 'danger' | 'neutral'> = {
  green: 'success',
  yellow: 'warning',
  red: 'danger',
  grey: 'neutral',
};

export const LIGHT_LABEL: Record<Light, string> = {
  green: 'Всё хорошо',
  yellow: 'Внимание',
  red: 'Проблема',
  grey: 'Не подключено',
};

export const RUNBOOK_BASE = 'https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/';
