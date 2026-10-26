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
    case 'restore_drill': {
      const state = String(d.state ?? 'unknown');
      const when = typeof d.at === 'string' ? d.at.slice(0, 10) : null;
      const mins = n(d.durationMinutes);
      const line =
        state === 'ok'
          ? `Последняя проверка ${when}: база поднялась из копии${mins !== null ? ` за ${mins} мин` : ''}.`
          : state === 'failed'
            ? `Проверка ${when} не прошла${d.message ? `: ${String(d.message)}` : ''}.`
            : state === 'running'
              ? 'Проверка идёт прямо сейчас (около часа).'
              : state === 'never'
                ? 'Ещё не запускалась: первая будет 1-го числа месяца.'
                : 'Подключится после запуска на AWS.';
      return {
        title: 'Учебное восстановление базы',
        line: `${line} Раз в месяц AWS сам поднимает временную базу из свежей копии и удаляет её.`,
        todo:
          s === 'red'
            ? 'Копию нельзя считать рабочей. Напишите Claude «учебное восстановление упало» — разберёт.'
            : s === 'yellow'
              ? `Проверка не проходила дольше ${n(d.staleAfterDays) ?? 40} дней. Проверьте в AWS Backup → Restore testing, что план включён.`
              : undefined,
        runbook: 'restore-drill.md',
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
    case 'secret_rotation': {
      type Row = { name: string; state: string; lastRotatedAt: string | null; nextDueAt: string | null };
      const rows = (d.secrets as Row[] | undefined) ?? [];
      const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');
      const bad = rows.filter((r) => r.state === 'failed' || r.state === 'overdue' || r.state === 'unknown');
      return {
        title: 'Смена паролей и ключей',
        line: rows
          .map((r) => `${r.name}: ${r.state === 'off' ? 'выключена' : `последняя ${day(r.lastRotatedAt)}, следующая ${day(r.nextDueAt)}`}`)
          .join('; '),
        todo:
          s === 'green'
            ? undefined
            : `Сорвалась или просрочена смена: ${bad.map((r) => r.name).join(', ')}. Приложение работает на прежних паролях, ничего не сломано; инструкция в runbook.`,
        runbook: 'secrets-rotation.md',
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
    case 'cloudflare_turn':
      return {
        title: 'Звонки: Cloudflare TURN',
        line:
          s === 'grey'
            ? 'Cloudflare TURN не настроен: без него звонки за сложными сетями не соединятся.'
            : d.error
              ? `Cloudflare не выдаёт доступ для звонков: ${String(d.error)}.`
              : `Cloudflare TURN отвечает за ${n(d.answerMs) ?? '—'} мс.`,
        todo:
          s === 'grey'
            ? 'Добавьте ключи в Безопасность → Ключи и сервисы → cloudflare_turn.'
            : s === 'red'
              ? 'Звонки за сложными сетями могут не соединяться. Проверьте ключ в Ключи и сервисы → cloudflare_turn и cloudflarestatus.com.'
              : undefined,
        runbook: 'TURN.md',
      };
    case 'cloudflare_sfu':
      return {
        title: 'Групповые звонки: Cloudflare SFU',
        line:
          s === 'grey'
            ? 'Групповые звонки идут не через Cloudflare (или ключи не заданы).'
            : d.error
              ? 'Cloudflare SFU не открывает сессию.'
              : `Cloudflare SFU отвечает за ${n(d.answerMs) ?? '—'} мс.`,
        todo:
          s === 'red'
            ? 'Групповые звонки сами переключатся на прямое соединение (аудио). Проверьте ключи cloudflare_sfu и cloudflarestatus.com.'
            : undefined,
        runbook: 'TURN.md',
      };
    case 'r2':
      return {
        title: 'Фото и медиа (Cloudflare R2)',
        line:
          s === 'grey'
            ? 'R2 не используется: публичные фото лежат в AWS.'
            : d.error
              ? 'Публичный адрес R2 не отвечает.'
              : `Адрес медиа отвечает за ${n(d.answerMs) ?? '—'} мс.`,
        todo:
          s === 'red'
            ? 'Фото могут не открываться. Проверьте Cloudflare (cloudflarestatus.com) и адрес в Ключи и сервисы → cloudflare_r2.'
            : undefined,
        runbook: 'DNS_TO_CLOUDFLARE.md',
      };
    case 'turn':
      return {
        title: 'Свой TURN-сервер (coturn)',
        line:
          s === 'grey'
            ? 'Свой TURN не настроен — так и должно быть: звонки идут через Cloudflare.'
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
    case 'breakers': {
      const open = Array.isArray(d.open) ? (d.open as string[]) : [];
      return {
        title: 'Внешние сервисы (защитные предохранители)',
        line: open.length
          ? `Сейчас на паузе из-за сбоев: ${open.join(', ')}. Через минуту система попробует снова.`
          : 'Почта, платежи, SMS, пуши и видео отвечают, пауз нет.',
        todo: open.length
          ? 'Обычно проходит само. Если держится дольше 10 минут — проверьте статус этого сервиса.'
          : undefined,
      };
    }
    case 'cloudflare_usage':
      return {
        title: 'Звонки: трафик Cloudflare за месяц',
        line:
          s === 'grey'
            ? 'Не подключено: добавьте ID аккаунта и токен «Account Analytics: Read» в Ключи и сервисы → cloudflare_turn.'
            : d.error
              ? `Не удалось узнать трафик: ${String(d.error)}.`
              : `${n(d.egressGb) ?? 0} ГБ из бесплатных 1000 (тревога с ${n(d.warnGb) ?? 0} ГБ; считается только TURN).`,
        todo:
          s === 'red' || s === 'yellow'
            ? 'Бесплатный объём близок к концу, дальше 0,05 $ за ГБ. Если растёт быстро — напишите Claude «трафик звонков».'
            : undefined,
      };
    case 'bunny_usage':
      return {
        title: 'Видео: трафик и хранилище Bunny',
        line:
          s === 'grey'
            ? 'Не подключено: добавьте API-ключ аккаунта Bunny в Ключи и сервисы → bunny_stream.'
            : d.error
              ? `Не удалось узнать расход: ${String(d.error)}.`
              : `Трафик за месяц ${n(d.bandwidthGb) ?? 0} ГБ, хранилище ${n(d.storageGb) ?? 0} ГБ.`,
        todo:
          s === 'red' || s === 'yellow'
            ? 'Расход видео вырос. Пороги меняются в Настройки → usage.bunny_*; лимит загрузок на человека — rate_limit.video_upload_per_day.'
            : undefined,
      };
    case 'realtime':
      return {
        title: 'Живое соединение (сокеты)',
        line:
          s === 'grey'
            ? 'Нет данных.'
            : `За 5 минут: подключений ${n(d.connects5m) ?? 0}, возвратов связи ${n(d.reconnects5m) ?? 0} (${n(d.reconnectsPerMin) ?? 0} в минуту), разрывов ${n(d.disconnects5m) ?? 0}. Токенов продлено ${n(d.authRefreshed5m) ?? 0} из ${n(d.authExpiringSent5m) ?? 0} напоминаний; закрыто по истечении токена ${n(d.authExpiredDisconnects5m) ?? 0}; «уходим» разослано ${n(d.goingAwaySent5m) ?? 0}.`,
        todo:
          s === 'green'
            ? undefined
            : 'Много возвратов связи. Если только что был выкат — подождите 10 минут. Иначе смотрите причины разрывов в журнале API (ws_disconnect) и напишите Claude «сокеты красные».',
        runbook: 'REALTIME_LIFECYCLE.md',
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
