// Owner 2026-10-23 («связь пропала / восстановилась», docs/perf/
// BIG_PLATFORM_ARCHITECTURE_2026-10-23.md part C): every timing of the live
// connection lives in app_config, so a bad value is fixed in the admin
// (Config) without a release. The app reads the `client.*` ones from
// GET /config/bootstrap → `client.timings` (and GET /me/session); the
// server reads the `server.*` ones itself. The defaults are the doc's.

export interface RealtimeSettingDef {
  /** `app_config` key (English). */
  key: string;
  /** Field in `client.timings`; null = the server's own setting. */
  field: string | null;
  default: number;
  min: number;
  max: number;
  /** Russian label for the admin; the English key is appended there. */
  labelRu: string;
  /** Fractions (0.5) instead of whole numbers. */
  fraction?: boolean;
}

export const REALTIME_SETTING_DEFS: readonly RealtimeSettingDef[] = [
  {
    key: 'realtime.reconnect_min_ms',
    field: 'reconnectMinMs',
    default: 1000,
    min: 200,
    max: 60_000,
    labelRu: 'Приложение: первая пауза перед повторным подключением сокета, мс',
  },
  {
    key: 'realtime.reconnect_max_ms',
    field: 'reconnectMaxMs',
    default: 30_000,
    min: 1000,
    max: 300_000,
    labelRu:
      'Приложение: самая длинная пауза между попытками подключения сокета, мс',
  },
  {
    key: 'realtime.reconnect_jitter',
    field: 'reconnectJitter',
    default: 0.5,
    min: 0,
    max: 1,
    fraction: true,
    labelRu:
      'Приложение: случайный разброс пауз подключения, доля от паузы (0–1), чтобы все не возвращались в одну секунду',
  },
  {
    key: 'realtime.server_disconnect_min_wait_ms',
    field: 'serverDisconnectMinWaitMs',
    default: 1000,
    min: 0,
    max: 120_000,
    labelRu:
      'Приложение: после того как сервер сам закрыл сокет — минимум ждать, мс',
  },
  {
    key: 'realtime.server_disconnect_max_wait_ms',
    field: 'serverDisconnectMaxWaitMs',
    default: 15_000,
    min: 0,
    max: 300_000,
    labelRu:
      'Приложение: после того как сервер сам закрыл сокет — случайная пауза до этого значения, мс',
  },
  {
    key: 'realtime.offline_failures',
    field: 'offlineFailures',
    default: 2,
    min: 1,
    max: 10,
    labelRu:
      'Приложение: сколько сбоев подряд на разных запросах, чтобы считать сервер недоступным',
  },
  {
    key: 'realtime.offline_seconds',
    field: 'offlineSeconds',
    default: 8,
    min: 0,
    max: 120,
    labelRu:
      'Приложение: сколько секунд сбои должны длиться, прежде чем показать «нет связи»',
  },
  {
    key: 'realtime.probe_timeout_ms',
    field: 'probeTimeoutMs',
    default: 3000,
    min: 500,
    max: 30_000,
    labelRu: 'Приложение: таймаут проверки доступности сервера, мс',
  },
  {
    key: 'realtime.token_refresh_lead_seconds',
    field: 'tokenRefreshLeadSeconds',
    default: 120,
    min: 15,
    max: 600,
    labelRu:
      'Приложение: за сколько секунд до конца действия токена обновить его заранее',
  },
  {
    key: 'realtime.polling_fallback_interval_seconds',
    field: 'pollingFallbackIntervalSeconds',
    default: 30,
    min: 5,
    max: 600,
    labelRu:
      'Приложение: как часто опрашивать сервер, пока сокет не работает (запасной режим), секунд',
  },
  {
    key: 'realtime.reconnected_debounce_seconds',
    field: 'reconnectedDebounceSeconds',
    default: 5,
    min: 0,
    max: 60,
    labelRu:
      'Приложение: разрыв короче этого (секунд) не считается — списки не перечитываются',
  },
  {
    key: 'realtime.refetch_jitter_ms',
    field: 'refetchJitterMs',
    default: 3000,
    min: 0,
    max: 30_000,
    labelRu:
      'Приложение: случайная задержка перед перечитыванием каждого списка после возврата связи, мс',
  },
  {
    key: 'realtime.server.auth_expiring_lead_seconds',
    field: null,
    default: 120,
    min: 15,
    max: 600,
    labelRu:
      'Сервер: за сколько секунд до конца токена сокет получает «auth:expiring» (просьбу обновить токен)',
  },
  {
    key: 'realtime.server.auth_grace_seconds',
    field: null,
    default: 120,
    min: 0,
    max: 600,
    labelRu:
      'Сервер: сколько секунд после конца токена сокет ещё живёт, если приложение не прислало новый токен',
  },
  {
    key: 'realtime.server.going_away_spread_ms',
    field: null,
    default: 20_000,
    min: 0,
    max: 120_000,
    labelRu:
      'Сервер: при выкате и остановке — случайный разброс «server:going-away», мс (чтобы клиенты возвращались не разом)',
  },
  {
    key: 'realtime.server.ws_compression_threshold_bytes',
    field: null,
    default: 1024,
    min: 0,
    max: 1_048_576,
    labelRu:
      'Сервер: сжимать сообщения сокета не меньше этого размера, байт (меньшие — набор текста, «в сети», подтверждения — идут как есть). Работает, когда realtime.server.ws_compression_mode не «Выкл»',
  },
  {
    key: 'realtime.server.ws_compression_auto_max_sockets',
    field: null,
    default: 1000,
    min: 0,
    max: 1_000_000,
    labelRu:
      'Сервер, сжатие сокета в режиме «Авто»: сколько сжатых сокетов держит один сервер (каждый около 0,2 МБ памяти); дальше новые подключаются без сжатия',
  },
  {
    key: 'realtime.server.shed_event_loop_lag_ms',
    field: null,
    default: 500,
    min: 0,
    max: 60_000,
    labelRu:
      'Сервер, сброс нагрузки: при отставании главного цикла больше этого (мс) 503 «подождите» получают и самые важные запросы (вход, оплата, звонки, отправка сообщения); 0 = этот признак не смотреть. Работает, когда realtime.server.shed_mode не «Выкл»',
  },
  {
    key: 'realtime.server.shed_lag_start_ms',
    field: null,
    default: 200,
    min: 0,
    max: 60_000,
    labelRu:
      'Сервер, сброс нагрузки: с какого отставания главного цикла (мс) первыми получают 503 фоновые запросы (статистика), затем предзагрузка и подсказки, затем обычные; самые важные — только на пороге realtime.server.shed_event_loop_lag_ms. 0 = все на одном пороге',
  },
  {
    key: 'realtime.server.shed_cpu_start_pct',
    field: null,
    default: 75,
    min: 0,
    max: 100,
    labelRu:
      'Сервер, сброс нагрузки: с какой загрузки процессора одного сервера (%) первыми получают 503 фоновые запросы. Держите выше цели автодобавления серверов (API: процессор, % — цель, сейчас 70), чтобы сначала добавлялись серверы. 0 = все на одном пороге',
  },
  {
    key: 'realtime.server.shed_cpu_critical_pct',
    field: null,
    default: 95,
    min: 0,
    max: 100,
    labelRu:
      'Сервер, сброс нагрузки: при какой загрузке процессора (%) 503 получают и самые важные запросы; 0 = процессор не смотреть',
  },
  {
    key: 'realtime.server.shed_in_flight_start_pct',
    field: null,
    default: 70,
    min: 0,
    max: 100,
    labelRu:
      'Сервер, сброс нагрузки: при какой доле предела одновременных запросов (%) первыми получают 503 фоновые запросы; самые важные — только на самом пределе. 0 или 100 = все на пределе',
  },
  {
    key: 'realtime.server.shed_max_in_flight',
    field: null,
    default: 0,
    min: 0,
    max: 100_000,
    labelRu:
      'Сервер, сброс нагрузки: предел одновременных запросов на одном сервере. «Вкл» — этот предел; «Авто» — потолок для предела, который сервер считает сам по времени ответов; 0 = во «Вкл» не смотреть, в «Авто» без потолка',
  },
  {
    key: 'realtime.server.shed_auto_min_limit',
    field: null,
    default: 20,
    min: 1,
    max: 100_000,
    labelRu:
      'Сервер, сброс нагрузки, «Авто»: самый низкий предел одновременных запросов, который сервер может себе поставить',
  },
  {
    key: 'realtime.server.shed_auto_max_limit',
    field: null,
    default: 1000,
    min: 1,
    max: 100_000,
    labelRu:
      'Сервер, сброс нагрузки, «Авто»: самый высокий предел одновременных запросов, который сервер может себе поставить',
  },
  {
    key: 'realtime.server.shed_retry_after_max_seconds',
    field: null,
    default: 5,
    min: 1,
    max: 300,
    labelRu:
      'Сервер, сброс нагрузки: через сколько секунд самое позднее приложение повторит запрос, получивший 503 (каждому случайно от 1 до этого числа, чтобы не вернулись разом)',
  },
  {
    key: 'realtime.server.presence_offline_grace_seconds',
    field: null,
    default: 10,
    min: 0,
    max: 120,
    labelRu:
      'Сервер: сколько секунд ждать, прежде чем показать собеседникам «был(а) в сети» (телефон с плохой сетью не мигает); 0 = сразу',
  },
  {
    key: 'realtime.server.presence_permission_cache_seconds',
    field: null,
    default: 30,
    min: 0,
    max: 600,
    labelRu:
      'Сервер: на сколько секунд запоминать, кому можно видеть «онлайн» человека (меньше запросов к базе при каждом входе); 0 = не запоминать',
  },
  {
    key: 'realtime.server.calls_request_sweep_seconds',
    field: null,
    default: 0,
    min: 0,
    max: 60,
    labelRu:
      'Сервер: как часто (секунд) запросы звонков сами проверяют просроченные звонки. 0 = Авто (по умолчанию): пока звонков мало, проверка при каждом запросе; когда запросов больше 120 в минуту на одном сервере, не чаще раза в 5 секунд. Число больше 0 = всегда не чаще раза в столько секунд. Проверка по расписанию раз в минуту остаётся',
  },
  {
    key: 'realtime.server.max_sockets_per_user_global',
    field: null,
    default: 0,
    min: 0,
    max: 1000,
    labelRu:
      'Сервер: сколько живых соединений может держать один человек на ВСЕХ серверах вместе (лишние новые закрываются); 0 = без общего предела (остаётся предел на один сервер)',
  },
  {
    key: 'realtime.server.max_write_buffer_packets',
    field: null,
    default: 0,
    min: 0,
    max: 100_000,
    labelRu:
      'Сервер: если у одного соединения накопилось больше столько неотправленных пакетов (зависший телефон), оно закрывается и приложение подключается заново; 0 = не закрывать',
  },
  {
    key: 'realtime.server.typing_big_room_sockets',
    field: null,
    default: 0,
    min: 0,
    max: 100_000,
    labelRu:
      'Сервер: в открытом чате, где на этом сервере столько соединений и больше, «печатает…» показывается не всем сразу (см. следующую настройку); 0 = показывать всех',
  },
  {
    key: 'realtime.server.typing_big_room_max_typers',
    field: null,
    default: 3,
    min: 1,
    max: 100,
    labelRu:
      'Сервер: в большом открытом чате — сколько разных людей одновременно (за 5 секунд) показываются как «печатает…»',
  },
];

/** Literal (not derived from the list) so `AppSettingKey` stays a union of
 * real keys; realtime-settings.spec.ts checks it matches the list. */
export const OWNER_REALTIME_SETTINGS = {
  'realtime.reconnect_min_ms': 1000,
  'realtime.reconnect_max_ms': 30_000,
  'realtime.reconnect_jitter': 0.5,
  'realtime.server_disconnect_min_wait_ms': 1000,
  'realtime.server_disconnect_max_wait_ms': 15_000,
  'realtime.offline_failures': 2,
  'realtime.offline_seconds': 8,
  'realtime.probe_timeout_ms': 3000,
  'realtime.token_refresh_lead_seconds': 120,
  'realtime.polling_fallback_interval_seconds': 30,
  'realtime.reconnected_debounce_seconds': 5,
  'realtime.refetch_jitter_ms': 3000,
  'realtime.server.auth_expiring_lead_seconds': 120,
  'realtime.server.auth_grace_seconds': 120,
  'realtime.server.going_away_spread_ms': 20_000,
  'realtime.server.ws_compression_threshold_bytes': 1024,
  'realtime.server.ws_compression_auto_max_sockets': 1000,
  'realtime.server.shed_event_loop_lag_ms': 500,
  'realtime.server.shed_lag_start_ms': 200,
  'realtime.server.shed_cpu_start_pct': 75,
  'realtime.server.shed_cpu_critical_pct': 95,
  'realtime.server.shed_in_flight_start_pct': 70,
  'realtime.server.shed_max_in_flight': 0,
  'realtime.server.shed_auto_min_limit': 20,
  'realtime.server.shed_auto_max_limit': 1000,
  'realtime.server.shed_retry_after_max_seconds': 5,
  'realtime.server.presence_offline_grace_seconds': 10,
  'realtime.server.presence_permission_cache_seconds': 30,
  'realtime.server.calls_request_sweep_seconds': 0,
  'realtime.server.max_sockets_per_user_global': 0,
  'realtime.server.max_write_buffer_packets': 0,
  'realtime.server.typing_big_room_sockets': 0,
  'realtime.server.typing_big_room_max_typers': 3,
} as const;

/**
 * Dedup D-11: `client.realtime_reconnect_min_ms` / `_max_ms` were a second
 * knob for the same pause (defaults 1 s / 10 s against these 1 s / 30 s) and
 * the phone let `client.timings` win, so editing them changed nothing. They
 * are gone from the admin. A value already stored under the old name is still
 * honoured, read-only, for one release while the new key is not stored.
 * Remove this table (and the phone's flat-key fallback) after that release.
 */
const LEGACY_ALIASES: Readonly<Record<string, string>> = {
  'realtime.reconnect_min_ms': 'client.realtime_reconnect_min_ms',
  'realtime.reconnect_max_ms': 'client.realtime_reconnect_max_ms',
};

const inRange = (v: unknown, d: RealtimeSettingDef): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= d.min && v <= d.max;

/** `client.timings` as the apps read it. */
export type ClientTimings = Record<string, number>;

/** Reads the client timings out of the stored app_config; a missing,
 * non-numeric or out-of-range value falls back to the default. */
export function clientTimingsFrom(
  appConfig: Record<string, unknown>,
): ClientTimings {
  const out: ClientTimings = {};
  for (const d of REALTIME_SETTING_DEFS) {
    if (d.field === null) continue;
    const v = appConfig[d.key];
    const legacy = appConfig[LEGACY_ALIASES[d.key] ?? ''];
    out[d.field] = inRange(v, d)
      ? v
      : v === undefined && inRange(legacy, d)
        ? legacy
        : d.default;
  }
  // The server's own keepalive, so the app can size its watchdog.
  out.pingIntervalMs = 25_000;
  out.pingTimeoutMs = 20_000;
  return out;
}
