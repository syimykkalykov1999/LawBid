# Жизнь живого соединения (сокет): что делает сервер и что должно делать приложение

Owner 2026-10-23, «связь пропала / восстановилась». Источник: `docs/perf/BIG_PLATFORM_ARCHITECTURE_2026-10-23.md`, часть C.
Сервер сделан так, чтобы в обычной работе сокет не рвался. Всё новое **добавочное**: старое приложение работает как раньше.

## 1. События сервера (namespace `/realtime`)

| Событие | Когда | Данные | Что делать приложению |
|---|---|---|---|
| `realtime:ready` | сразу после подключения | `{seq, serverTime, authExpiresAt}` | запомнить `seq` как курсор; если до этого был разрыв — спросить пропущенное (п. 4) |
| `auth:expiring` | за 120 с до конца токена (и сразу, если осталось меньше) | `{expiresAt, expiresInMs, graceMs}` | получить новый access-токен по refresh и отправить `auth:refresh` (п. 2) |
| `auth:expired` | токен кончился и льгота (120 с) прошла без `auth:refresh` | `{}` | сокет сейчас закроется (как раньше); обновить токен и переподключиться |
| `auth:error` | отозвана сессия (`AUTH_SESSION_REVOKED`), плохой токен (`UNAUTHORIZED`), флуд (`RATE_LIMITED`) | `{code}` | как раньше: не переподключаться, пока нет валидной сессии |
| `server:going-away` | сервер выкатывается / останавливается (деплой, scale-in) | `{retryAfterMs: 0..20000, reason}` | через `retryAfterMs` тихо закрыть сокет и открыть новый (попадёт на другой экземпляр). Не показывать «нет связи». Новое подключение к останавливающемуся экземпляру получает то же событие и закрывается |

Каждое событие пользователю (`message:new`, `badge:update`, …), когда его данные — объект, содержит поле **`seq`** (число, растёт, не обязано идти подряд). События в комнаты (`channel:post`, `comment:new`, звонковые сигналы) `seq` не имеют; события для аудитории больше 1000 человек тоже.

## 2. Продление токена без разрыва

`socket.emitWithAck('auth:refresh', {accessToken: '<новый токен>'})` → `{ok: true, expiresAt}`. Старое поле `{token}` тоже принимается.
Сокет **не закрывается**. `{ok:false}` (плохой/отозванный токен) — сервер закроет сокет.
Рекомендация: продлевать токен по таймеру за `tokenRefreshLeadSeconds` (по умолчанию 120 с) до `exp`, при возврате приложения на передний план, и на `auth:expiring`. Тогда `auth:expiring` почти никогда не понадобится.

## 3. Тайминги с сервера: `client.timings`

`GET /config/bootstrap` → `client.timings` и `GET /me/session` → `client.timings` (числа; менять в админке: Config → `realtime.*`, подписи по-русски там же).

| Поле | Ключ app_config | По умолчанию | Смысл |
|---|---|---|---|
| `reconnectMinMs` | `realtime.reconnect_min_ms` | 1000 | первая пауза перед повтором |
| `reconnectMaxMs` | `realtime.reconnect_max_ms` | 30000 | максимум паузы (экспонента) |
| `reconnectJitter` | `realtime.reconnect_jitter` | 0.5 | разброс (доля паузы, 0–1) |
| `serverDisconnectMinWaitMs` / `MaxWaitMs` | `realtime.server_disconnect_min/max_wait_ms` | 1000 / 15000 | после `io server disconnect` ждать случайное время в этих пределах |
| `offlineFailures` | `realtime.offline_failures` | 2 | сбоев подряд на разных запросах, чтобы считать сервер недоступным |
| `offlineSeconds` | `realtime.offline_seconds` | 8 | сколько секунд сбои должны длиться, прежде чем показать «нет связи» |
| `probeTimeoutMs` | `realtime.probe_timeout_ms` | 3000 | таймаут пробы `/health/live` |
| `tokenRefreshLeadSeconds` | `realtime.token_refresh_lead_seconds` | 120 | за сколько продлевать токен |
| `pollingFallbackIntervalSeconds` | `realtime.polling_fallback_interval_seconds` | 30 | опрос `GET /realtime/missed` каждые N с, пока сокета нет (только на переднем плане; `MissedPoller`) |
| `reconnectedDebounceSeconds` | `realtime.reconnected_debounce_seconds` | 5 | разрыв короче — не слать `reconnected`, списки не перечитывать |
| `refetchJitterMs` | `realtime.refetch_jitter_ms` | 3000 | случайная задержка перед перечитыванием каждого списка |
| `pingIntervalMs` / `pingTimeoutMs` | (константы сервера) | 25000 / 20000 | для сторожа |

Нет `client` в ответе (старый сервер) — брать значения по умолчанию из таблицы. Значения вне допустимого диапазона сервер заменяет на умолчание.

## 4. Догрузка пропущенного вместо перечитывания всех списков

Socket.IO `connectionStateRecovery` с Redis-адаптером (обычным и sharded) **не поддерживается**, поэтому сделано своё: у каждого события `seq`, события хранятся 5 минут (до 200 на человека).

- Сокет: `emitWithAck('sync:since', {seq: <последний виденный>})`
- HTTP: `GET /api/v1/realtime/missed?since=<seq>`

Ответ: `{seq, events: [{seq, event, data?, truncated?}], complete}`.
- Применить `events` по порядку теми же обработчиками, что и живые события (повтор по `seq` отбрасывать).
- `truncated: true` — тело было слишком большим: обновить только этот экран.
- `complete: false` — часть событий потеряна (разрыв дольше 5 минут или больше 200 событий; `since=0` тоже): один раз перечитать списки, дальше жить с вернувшимся `seq`.
- Сохранять наибольший `seq` из живых событий и ответов.

## 5. Что приложению сделать (список для мобильного работника)

1. Таймер продления токена + продление при `resumed` + ответ на `auth:expiring` через `auth:refresh`.
2. Обработать `server:going-away` (п. 1), `realtime:ready` и `seq`.
3. После переподключения вместо 10 «перечитать» — один `sync:since`; `reconnected` не слать при разрыве короче `reconnectedDebounceSeconds`; задержка 0..`refetchJitterMs` на каждый провайдер.
4. Реконнект: min/max/jitter из `client.timings`; после `io server disconnect` случайная пауза.
5. `ConnectivityService`: offline только после `offlineFailures` сбоев И `offlineSeconds` секунд.
6. Ответ **503 `SERVER_BUSY`** (сервер перегружен) + `Retry-After` (1–5 с): повторить GET с этой паузой, не считать «нет связи». Админка делает так же.

## 6. Для инженера: сервер

- Продление/льгота: `apps/api/src/modules/realtime/realtime.gateway.ts` (`armExpiry`, `refresh`, `syncSince`, `beforeApplicationShutdown`, `startDraining`).
- Журнал событий: `realtime-event-log.ts` (Redis `rt:log:{userId}` — sorted set с TTL; `rt:seq` — счётчик по часам Redis). Память на человека ограничена (200 записей × ≤ 8 КБ, TTL 5 минут), поэтому не растёт с числом пользователей; нагрузка — по одной записи на получателя события.
- Тайминги: `apps/api/src/common/app-settings/realtime-settings.ts`. Серверные ключи `realtime.server.*`: `auth_expiring_lead_seconds` (120), `auth_grace_seconds` (120), `going_away_spread_ms` (20000), `shed_event_loop_lag_ms` (500, 0 = выкл.), `shed_max_in_flight` (0 = выкл.).
- Выкат: SIGTERM → `server:going-away` каждому сокету со случайной задержкой, новые сокеты не принимаются, до ~35 с ждём, пока клиенты уйдут (`REALTIME_DRAIN_MAX_MS`; в dev/тестах 0). ECS `stopTimeout` 60 с и ALB `deregistration_delay` 60 с (`infra/modules/ecs`, `infra/modules/alb`).
- Метрики (минутные счётчики в Redis, плата «Состояние системы» → «Живое соединение»): подключения, возвраты, причины разрывов (`transport close`, `ping timeout`…), `auth:expiring` отправлено, токенов продлено, закрыто по истечению, `going-away` отправлено. CloudWatch: `WebSocketDisconnects`, `WebSocketReconnects`, `WebSocketGoingAway`; тревога `ws-reconnect-storm` (> 1500 возвратов за 5 мин).
- Масштаб: ничего не хранится «на соединение» в общих структурах; журнал пишется только для аудитории до 1000 получателей на событие; перегруженный экземпляр сам отвечает 503 + `Retry-After`, а клиенты возвращаются с разбросом.

## 7. Если «связь пропала» всё равно видна

1. Админка → Состояние системы → «Живое соединение»: если возвратов много — смотрите причины разрывов.
2. `auth_expired` > 0 при том, что токенов продлено мало: приложение ещё старое (не шлёт `auth:refresh`). Разрыв будет раз в 17 минут вместо 15, пока оно не обновлено.
3. Сразу после выката всплеск возвратов нормален (клиенты уходят в течение 20 с).
