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
    key: 'realtime.server.shed_event_loop_lag_ms',
    field: null,
    default: 500,
    min: 0,
    max: 60_000,
    labelRu:
      'Сервер: при отставании главного цикла больше этого (мс) новые запросы получают 503 «подождите»; 0 = защита выключена',
  },
  {
    key: 'realtime.server.shed_max_in_flight',
    field: null,
    default: 0,
    min: 0,
    max: 100_000,
    labelRu:
      'Сервер: при стольких одновременных запросах на одном экземпляре новые получают 503 «подождите»; 0 = защита выключена',
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
  'realtime.server.shed_event_loop_lag_ms': 500,
  'realtime.server.shed_max_in_flight': 0,
} as const;

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
    out[d.field] =
      typeof v === 'number' && Number.isFinite(v) && v >= d.min && v <= d.max
        ? v
        : d.default;
  }
  // The server's own keepalive, so the app can size its watchdog.
  out.pingIntervalMs = 25_000;
  out.pingTimeoutMs = 20_000;
  return out;
}
