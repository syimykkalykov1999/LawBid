# Как устроены большие платформы и что нам взять (2026-10-23)

Только исследование и сверка с кодом, код не менялся. Ветка: main (e5ec58e8a).
Язык: простыми словами, имена файлов и технические слова по-английски.
Ссылки в Части A даны по памяти (опубликованные статьи и документация); перед цитированием в публичных текстах открыть и сверить. Номера строк в Части C проверены по рабочему дереву.

Что уже сделано и здесь не переписывается: экономия трафика (deltas, ETag, кэши) — `CLIENT_ECONOMY_*`, админка — `ADMIN_ECONOMY_2026-10-23.md`, безопасность — `SECURITY_RESEARCH_5`, видео-старт — `VIDEO_START_2026-10-23.md`. Сжатие, лимиты загрузки и сроки хранения сейчас проверяет другой работник (scale-limits audit) — здесь только ссылка.

---

## Часть C (сначала, потому что больнее всего): почему «связь пропала / восстановилась»

### Короткий вывод

1. **Главная причина, подтверждённая кодом: сервер сам рвёт сокет ровно каждые 15 минут у каждого клиента.** Токен доступа живёт 15 минут, сервер ставит таймер и в момент истечения шлёт `auth:expired` и закрывает сокет. Телефон обновляет токен только когда REST-запрос получит 401, то есть уже после истечения. Сокет в любом случае умирает, затем переподключается, затем 10+ экранов одновременно перечитывают данные через REST. Это и есть «потеряли / восстановили» раз в 15 минут у каждого пользователя.
2. **Любая перезагрузка API (деплой, scale-in, локально `nest start --watch`) рвёт все сокеты разом, и клиент превращает это в «сервер недоступен».** Один сбойный запрос без повторов (POST) или три подряд (GET) переводят приложение в offline без порога и без задержки; потом пробы с отступом 2, 4, 8… до 30 секунд.
3. **Баннер на телефоне уже убран (коммит 25c4e6238, 22 октября), но логика осталась.** Если владелец видит баннер, у него сборка старше 22 октября. А внутри приложения на `connectivityStatusProvider` по-прежнему подписаны загрузки, чат (`drain`), верификация, активные устройства: они ведут себя «как при падении связи».
4. **В админке нет ни баннера «связь потеряна», ни сокета.** Совпадающих строк в коде нет (искал «соединение», «offline», «lost», «restored», `navigator.onLine`, WebSocket). Значит эти сообщения идут не от нашего кода: вероятные источники ниже (пункт C5).

### Ранжированный список причин

| № | Причина | Доказательство | Вероятность | Точное исправление |
|---|---|---|---|---|
| C1 | Сервер закрывает сокет по таймеру истечения токена, клиент не успевает продлить | `apps/api/src/modules/realtime/realtime.gateway.ts:726-739` (`armExpiry`: `auth:expired` + `disconnect(true)` в момент `exp`); `apps/api/src/config/env.schema.ts:123` (`JWT_ACCESS_TTL_SECONDS` = 900); клиент продлевает токен только по 401: `apps/mobile/lib/core/network/auth_interceptor.dart:79-90`, `apps/mobile/lib/core/session/session_providers.dart:133`; других вызовов `refreshAccessToken()` нет (кроме сокета и онбординга) | Почти наверняка, 100 % клиентов, каждые 15 мин | Две стороны. Клиент: таймер «продлить токен за 60-120 секунд до `exp`» + при возврате приложения на передний план. После нового токена `tokenChanged` уже шлёт `auth:refresh` (`realtime_client.dart:155-164`), сервер его принимает (`realtime.gateway.ts:401-421`) и переставляет таймер, сокет живёт. Сервер: вместо жёсткого `disconnect` при истечении давать льготу 120 с и сначала слать мягкое `auth:expiring` (клиент отвечает `auth:refresh`), закрывать только если не ответил. Итог: сокет живёт часами, а не 15 минут |
| C2 | После любого разрыва все экраны перечитывают данные через REST одновременно | Событие `reconnected` слушают `chat_providers.dart:179,427,1662`, `groups/group_providers.dart:115,271,626`, `cases_providers.dart:97`, `notifications_providers.dart:56,201`, `consultations_providers.dart:83`, `legal_qa_providers.dart:61`, `call_history_providers.dart:165` и др. (`realtime_client.dart:134-136`) | Усиливает C1, C3; в день деплоя даёт шторм запросов | Серверный номер события на комнату (sequence) и догрузка «после номера N» одним запросом вместо перечитывания 10 списков; до этого: дребезг (не слать `reconnected`, если разрыв короче 5 с и сокет вернулся тем же `sid`/с recovery) и случайная задержка 0-3 с на каждый провайдер |
| C3 | Падение или выкат API рвёт все сокеты разом; восстановление «стадом» | `infra/modules/ecs/main.tf:477-478` (rolling 100/200), `:298` (`stopTimeout` 30 с у api), `infra/modules/alb/main.tf:114` (`deregistration_delay` 30); при остановке задачи Nest закрывает сокет-сервер без предупреждения (`apps/api/src/modules/realtime/realtime.gateway.ts:214-226`); клиент: задержка 1 с, максимум 10 с, разброс 0.5 (`realtime_client.dart:113-116`), то есть большинство возвращается в течение 1-2 с | Каждый деплой и каждый scale-in (`ecs/main.tf:600-612`, scale-in через 10 мин) | Сервер: на SIGTERM сначала выставить флаг «draining», разослать `server:going-away` с случайной задержкой 0-20 с (каждый сокет сам уходит в свой момент), и только потом закрываться; поднять `stopTimeout` api до 60-90 с и `deregistration_delay` до 60. Клиент: после `io server disconnect` ждать случайные 1-15 с; максимум backoff 30 с, разброс 0.5-1.0 |
| C4 | Приложение считает себя offline после одного сбоя; нет порога, нет гистерезиса | `apps/mobile/lib/core/connectivity/reachability.dart:54-63,74-82` (любой `connectionError`/`connectionTimeout`/`sendTimeout` = «недоступен»); `connectivity_service.dart:123-133` (сразу `_emit`), `:184-193`; в телефонной сети `connectTimeout` 15 с (`dio_client.dart:82`) | Часто: при смене Wi-Fi/LTE, в лифте, при перезапуске API | В `ConnectivityService`: объявлять offline только если N=2 подряд сбоя на разных запросах ИЛИ нет интерфейса; «серверная недоступность» показывать/реагировать не раньше 8-10 с; возврат online — сразу. Не считать сбой при `app paused`. Пробу `/health/live` слать с таймаутом 3 с, повторять 1, 2, 4 с с разбросом |
| C5 | Админка: нет собственного индикатора связи; вероятные источники сообщений | `apps/admin/src/app/providers.tsx:12-24` (retry только для не-4xx, максимум 2, без `retryDelay`/без `onlineManager`), `apps/admin/src/app/api/proxy/[...path]/route.ts:37` (`fetch` на API без `try/catch` и без таймаута: падение API = необработанная 500 HTML от Next, не `ApiError`), `apps/admin/src/lib/live.ts:31-37` (опрос раз в 60 с). Источники «потеряно/восстановлено»: (а) сторожевая штука браузера/Next dev при перезапуске `nest --watch` и dev-сервера (HMR-сокет), (б) расширения/SSO-прокси, (в) 401/redirect на `/login` при истечении сессии | Средняя; точного места в коде нет | В прокси: `try/catch` вокруг `fetch`, `AbortSignal.timeout(25_000)`, ответ `503 {error:{code:'UPSTREAM_UNAVAILABLE'}}` с `Retry-After`. В `QueryClient`: `retryDelay: attempt => min(1000*2**attempt, 15000)*(0.5+Math.random())`, `retry` и для сетевых `TypeError`, `networkMode:'offlineFirst'`. Не показывать тост об ошибке при одном провальном опросе (хранить прежние данные, отметить «обновлено N с назад», красить после 3 подряд). Если владелец увидит сообщение снова: записать точный текст и страницу, тогда место найдётся по тексту |
| C6 | `lb_cookie` stickiness на целевой группе api | `infra/modules/alb/main.tf:126-130` | Не причина разрывов (клиент только `websocket`, куки нет; адаптер Redis уже есть, `realtime.gateway.ts:165-171`) | Для телефонов липкость бесполезна и портит равномерность для веб-клиентов. Убрать на `/realtime` не нужно срочно; не ставить расчёт на неё |
| C7 | Тайминги ALB против Socket.IO | `alb/main.tf:96` (`idle_timeout` 300 с), `main.tf:34-48` (keepAlive 310 с), `realtime.gateway.ts:109-111` (ping 25 с + таймаут 20 с) | НЕ причина: ping в 12 раз чаще idle-таймаута, пара keepAlive выше ALB, всё верно | Оставить. Ping 25 с достаточно и для NAT мобильных сетей (обычно 30-60 с) |
| C8 | Только `websocket`, без запасного long-polling | `realtime_client.dart:110` (`setTransports(['websocket'])`) | Низкая; в сетях, где блокируют WS, сокет не работает вообще | Разрешить `['websocket','polling']` с повышением транспорта; включить `connectionStateRecovery` на сервере (Socket.IO 4.6+), чтобы короткие разрывы не теряли события |
| C9 | Нет реакции на смену сети и возврат из фона | В мобильном коде нет `WidgetsBindingObserver` для сокета (`rg AppLifecycleState` находит только загрузки, часы, логотип) | Средняя: после фона iOS/Android сокет «мёртвый», обнаруживается только ping-таймаутом (до 45 с) | При `resumed` и при смене интерфейса: `socket.disconnect().connect()` если последний ping старше 30 с; при `paused` долго (>30 с) тихо закрывать сокет и полагаться на push (экономит батарею, как у WhatsApp) |

Что реально произойдёт у пользователя после исправлений: C1 снимает периодические разрывы, C3 сглаживает деплои, C4 убирает «ложный offline». Это три правки на пару дней, их надо делать первыми.

---

## Часть A. Как делают большие (кратко)

Все ссылки по памяти, проверить при публичном цитировании.

**Edge, CDN и сжатие.** Instagram и Meta отдают картинки через собственный CDN, сразу нескольких размеров и форматов (WebP, у Meta ещё AVIF) и выбирают формат и размер по устройству и сети; видео режут на сегменты (DASH/HLS) с адаптивным битрейтом. Cloudflare и Fastly сжимают на краю brotli (текст) и gzip (запасной), статику хранят предсжатой. Правило больших: файл больше 10 МБ никогда не идёт через API, только прямая загрузка в объектное хранилище по подписанной ссылке, частями (multipart) с докачкой. Источники: engineering.fb.com (Instagram image/video delivery, AVIF), blog.cloudflare.com (brotli, HTTP/3), developer.mozilla.org (Content-Encoding).

**API-шлюз и балансировка.** Meta: Proxygen/Katran — L4 балансировщик на ядре (ECMP + консистентное хеширование) и L7 прокси с HTTP/2 и HTTP/3 (QUIC); цель — не терять соединения при выкатах: connection draining (старый процесс дообслуживает, новый принимает), «залипание» не нужно, если состояние вынесено наружу. Discord и Slack: на входе Envoy/HAProxy, стойкие HTTP/2 соединения, ретраи только идемпотентных запросов, `Retry-After`. Источники: engineering.fb.com «Katran», «Proxygen», blog.cloudflare.com, AWS Builders' Library «Timeouts, retries and backoff with jitter».

**Реальное время.** WhatsApp держит миллионы соединений на сервер (Erlang/FreeBSD), протокол на базе XMPP-подобных бинарных кадров (Noise-handshake), у каждого сообщения номер и подтверждение; Telegram MTProto: каждое сообщение имеет `msg_id` и `seq_no`, сервер хранит состояние `updates` (`pts`, `qts`, `seq`, `date`) и по `getDifference` клиент догружает ровно пропущенное. Discord Gateway: heartbeat, `session_id` + `sequence`, `RESUME` повторяет пропущенные события без полной перезагрузки; при невозможности — «invalid session», только тогда полный запрос. Переподключение всегда с backoff и jitter (AWS Builders' Library). Присутствие (online) у больших — отдельная лёгкая служба с TTL, не запись в БД. Источники: core.telegram.org/mtproto, core.telegram.org/api/updates, discord.com/developers/docs/topics/gateway, engineering.fb.com / highscalability.com (WhatsApp).

**Мобильная сеть.** NAT мобильных операторов забывает неактивное соединение за 30-120 с, поэтому keep-alive 25-30 с (у нас так и есть). Фон: iOS/Android убивают сокеты, поэтому в фоне доставляет push (APNs/FCM), а сокет открывается при выходе на передний план; радио «будят» редко, запросы группируют (batching), данные тянут дельтами (delta sync, `since=` курсор). Источники: developer.android.com (Doze, battery), developer.apple.com (Background execution), Telegram `getDifference`.

**Кэши.** Слои: CDN → краевой KV → Redis → БД. Защита от «лавины» (cache stampede): единый запрос на ключ (single-flight/request coalescing), jitter в TTL, stale-while-revalidate, предварительный прогрев. Meta «TAO» и «Memcache at Facebook» (leases) — классика. Источники: usenix.org (Scaling Memcache at Facebook), engineering.fb.com (TAO).

**Очереди и разветвление.** Любая тяжёлая или внешняя работа (пуши, письма, проверка файлов, ленты) уходит в очередь; ленты у Instagram/Twitter строятся смешанно (fan-out при записи для обычных, при чтении для «больших» аккаунтов). Источники: instagram-engineering.com, highscalability.com.

**БД.** Чтение с реплик, пул соединений через прокси (PgBouncer/RDS Proxy), потому что тысячи задач×10 соединений убивают Postgres; Instagram и Notion шардировали Postgres по пользователю/рабочему пространству; старые данные архивируют (партиции по времени, потом в объектное хранилище). Источники: instagram-engineering.com («Sharding & IDs»), notion.so/blog (sharding Postgres), stripe.com/blog (online migrations), AWS RDS Proxy docs.

**Хранилище.** Жизненный цикл объектов (горячее → редкое → архив), дедупликация по хэшу, миниатюры создаются один раз при загрузке, а не на каждый запрос. Источники: AWS S3 Lifecycle docs, engineering.fb.com «Haystack/f4».

**Наблюдаемость.** SLO и «бюджет ошибок», трассировка запроса (OpenTelemetry), синтетические проверки (canary) из внешнего региона, алерты по симптомам пользователя, а не по загрузке CPU. Источники: sre.google/workbook, AWS Well-Architected (Operational Excellence, Reliability).

**Ёмкость.** Predictive (по расписанию/истории) плюс reactive (по метрике), «тёплые» запасные экземпляры, scale-out быстро, scale-in медленно и с draining. Источники: AWS Auto Scaling predictive docs, Netflix tech blog (Scryer).

**Экономика.** Главные статьи расходов: исходящий трафик (egress) и CDN; снижают предсжатием, кэшем, форматами, ценовыми классами; резервирование базовой нагрузки (Savings Plans), Spot для фоновых задач, tiering хранилища. Источники: AWS Well-Architected (Cost Optimization), blog.cloudflare.com (egress), Discord «How Discord stores trillions of messages».

**Устойчивость.** Circuit breaker, bulkhead (изоляция пулов), деградация (показать старое вместо ошибки), «выключатели» функций (kill switch) без выката. Источники: AWS Builders' Library «Using load shedding to avoid overload», Stripe «Scaling your API with rate limiters» (rate limiter + load shedder), Slack engineering «Slack's incident on...».

**Защита на краю.** WAF (OWASP-наборы), bot management, rate limit по IP/ключу/пользователю, на самом краю, до приложения. Источники: Cloudflare WAF/Bot docs, AWS WAF docs, Stripe rate-limit статья.

**Безопасные релизы.** Canary и blue-green с авто-откатом по метрике; feature flags; server-driven config/UI: исправления и эксперименты приходят с сервера без обновления приложения (Instagram/Meta «Gatekeeper/QuickExperiment», Airbnb «Ghost Platform»). Источники: engineering.fb.com («Rapid release at massive scale»), medium.com/airbnb-engineering (Ghost Platform), AWS CodeDeploy blue/green docs.

---

## Часть B. Наш проект против больших

Приоритеты: P0 до релиза, P1 первый месяц, P2 позже.

| Тема | Как у больших | Как у нас (файл) | Разрыв | Что делать | Приоритет |
|---|---|---|---|---|---|
| Сжатие JSON | brotli/gzip на краю | `apps/api/src/app.setup.ts:41-52` (compression для ответов >1 КБ); API не за CloudFront | Работает; brotli на Node-стороне дорог по CPU | Оставить; детали у работника scale-limits | P2 |
| CDN и статика | Всё через CDN, предсжатая статика | CloudFront для web (`infra/modules/web/main.tf:399-446`, http2and3, compress) и медиа (`infra/modules/s3/main.tf:344-363`) | Документы без compress (`s3/main.tf:485`, нормально для PDF) | Ничего срочного | P2 |
| Картинки AVIF/WebP | Несколько размеров и форматов | Нашёл упоминания только в лимитах загрузки (`files.policy.ts`, `upload-limits.ts`) | Нет серверных миниатюр WebP/AVIF и выбора размера по устройству | Один раз при загрузке делать 3 размера WebP (потом AVIF), отдавать по `?w=`/заголовку; ссылка на работника scale-limits | P1 |
| Видео ABR/HLS | HLS, короткие первые сегменты | Есть HLS, префетч, нижняя ступень (`docs/perf/VIDEO_START_2026-10-23.md`) | Сделано | Ничего | Сделано |
| Файлы >10 МБ | Только прямо в хранилище по подписи | Presigned POST в S3 (CSP в `infra/modules/web/main.tf:70-88`), очередь загрузок в приложении `core/uploads/upload_queue.dart` | Докачка частями (multipart) не подтверждена | Проверить multipart/докачку для видео; референс scale-limits | P1 |
| API-шлюз / L7 | Envoy/Proxygen, HTTP/2-3, draining | ALB (`infra/modules/alb/main.tf`), keepAlive 310 vs idle 300 верно (`main.ts:34-48`), draining 30 с | Нет HTTP/3 для API, draining короткий, нет «going-away» для сокетов (Часть C3) | Поднять `deregistration_delay`/`stopTimeout`; mobile-API за CloudFront с HTTP/3 — идея P2 | P0 (draining), P2 (HTTP/3) |
| Липкость | Без состояния, липкость не нужна | `lb_cookie` 24 ч (`alb/main.tf:126`) при Redis-адаптере | Лишнее, перекашивает нагрузку | Отключить после проверки веб-клиентов | P2 |
| Реальное время: разрыв и возобновление | Sequence + resume (Discord, Telegram `getDifference`) | Нет номеров; после разрыва перечитывают через REST (`realtime_client.dart:134`) | Нет возобновления, шторм запросов | Часть C1/C2: `connectionStateRecovery` + номер события | P1 |
| Реальное время: токены | Токен продлевается заранее | Только по 401 (`auth_interceptor.dart:79`); сервер рвёт при `exp` (`realtime.gateway.ts:726`) | Разрыв каждые 15 мин | Часть C1 | P0 |
| Реальное время: переподключение | Backoff + jitter | 1-10 с, jitter 0.5 (`realtime_client.dart:113-116`); при rate limit хорошо (`:176`) | Максимум мал для массового падения | Макс. 30 с, jitter 0.5-1 | P0 |
| Присутствие | Лёгкий сервис с TTL | `modules/presence`, `presence:update` (Redis) | Нормально | — | Сделано |
| Масштаб сокетов | Redis/шардированный pub/sub | Sharded adapter (`realtime.gateway.ts:165-171`), метрика `ws_connections` (`:140-143`) | Хорошо; нет лимита соединений на задачу | Алерт и потолок на задачу | P1 |
| Мобильная сеть | Фон: push; на переднем плане сокет; batching | Нет обработки `paused/resumed` для сокета; ping 25 с верно | Лишние разрывы и батарея | Часть C9 | P1 |
| Offline-логика | Порог и гистерезис | `connectivity_service.dart:123-193` без порога; баннер скрыт | «Ложный offline» влияет на загрузки/чат | Часть C4 | P0 |
| Кэши | CDN→KV→Redis→БД, single-flight | ETag/deltas/кэши (`CLIENT_ECONOMY_*`); CloudFront KV уже для SEO (`web/main.tf:279`) | Проверить single-flight на горячих ключах (лента, счётчики) | Взять защиту от «лавины» (single-flight + jitter TTL + stale-while-revalidate) в общий helper кэша | P1 |
| Очереди | Асинхронность, backlog-scaling | BullMQ-подобные jobs, scale по `QueueWaitingTotal` (`ecs/main.tf:~650-680`) | Сделано | — | Сделано |
| БД: пулы | PgBouncer/RDS Proxy, реплики | Prisma `connection_limit=10` (`prisma/pool-defaults.spec.ts`), в `infra/modules/postgres` нет proxy/реплики | При 20+ задачах × 10 = упрёмся в `max_connections` | RDS Proxy; одна read replica под аналитику/поиск; ссылка `SERVER_LOAD_AUDIT` | P1 |
| БД: партиции/архив | Партиции по времени, архив | Сроки хранения у scale-limits | — | Ссылка, не дублировать | P2 |
| Хранилище | Lifecycle, миниатюры, дедуп | Lifecycle на web-бакете (`web/main.tf:168`); медиа — у scale-limits | Дедуп по хэшу не подтверждён | Проверить после отчёта scale-limits | P2 |
| Наблюдаемость | SLO, трассировка, canary | OTEL (`telemetry/otel`), SLO + uptime canary (`monitoring/slo.tf:1`), Sentry | Нет SLO на «долю живых сокетов» и «частоту переподключений» | Метрики `ws_reconnect_rate`, `ws_disconnect_reason{auth_expired}`; алерт | P0 |
| Ёмкость | Predictive + reactive, прогретые | CPU 60 %, requests/task, ночной минимум (`ecs/main.tf:555-612`), min 2 | Нет прогрева перед пиками; scale-in убивает сокеты | Draining (C3), запрет scale-in в часы пик (scheduled min) | P1 |
| Экономика | Предсжатие, кэш, Spot для фона | Бюджеты, cost-guard (`common/cost-guard`), Fargate Spot доступен (`ecs/main.tf:178-180`), max задач по выручке | Spot для worker не включён по умолчанию (default FARGATE) | Spot для worker (идемпотентные jobs) | P2 |
| Устойчивость | Breaker, bulkhead, kill switch | `common/resilience/resilience.ts`, `feature-flags`, `app-settings` | Нет «аварийного режима» для API (режим «только чтение»/сброс нагрузки) | Load shedding: при перегрузке отвечать 503+`Retry-After` на неважные ручки; kill switch на тяжёлые функции из админки | P1 |
| Край: WAF/боты | WAF, bot mgmt, rate limit | WAF на ALB и CDN (`alb/main.tf:216-300`, `cdn-waf/main.tf`), Bot Control переключаемый (`alb/main.tf:29-33`) | Включён ли Bot Control — по тфвар | Включить в «count» режиме сначала | P1 |
| Релизы | Canary/blue-green + авто-откат | Rolling с `deployment_circuit_breaker` + rollback (`ecs/main.tf:540-544`) | Нет canary на малой доле, нет blue-green | CodeDeploy blue/green или ALB weighted target groups 5 % → 100 % | P1 |
| Server-driven config | Исправления без обновления приложения | `app-settings`, feature flags, `X-App-Version` проверка на API | Нет «минимальной версии клиента» с мягким принуждением и удалённой настройки таймингов сокета/backoff | Отдавать клиенту `GET /config` с таймингами (backoff, пороги offline, включение recovery), ETag-кэш | P1 |
| Админка: связь | Опрос с backoff, без тоста на единичный сбой | Часть C5 | См. C5 | См. C5 | P0 |

---

## Топ-10 разрывов

1. Токен 15 мин против реактивного обновления: разрыв сокета каждые 15 минут (C1).
2. Нет номера события и возобновления; после разрыва шторм REST-перечитываний (C2).
3. Деплой и scale-in рвут сокеты разом, draining 30 с, нет «going-away» (C3).
4. «Ложный offline»: нет порога и гистерезиса (C4).
5. Нет реакции сокета на фон/возврат/смену сети (C9).
6. Админка: прокси без таймаута и обработки ошибок, повторы без backoff (C5).
7. Нет RDS Proxy и реплики чтения, пул 10 × число задач (БД).
8. Нет canary/blue-green и серверного конфига таймингов клиента (релизы).
9. Нет метрик «переподключения/причины разрывов» и SLO по ним (наблюдаемость).
10. Нет load shedding и аварийных выключателей для перегрузки (устойчивость).

---

## План работ на двух исполнителей

### Работник 1: API и инфраструктура

P0
1. `realtime.gateway.ts`: заменить жёсткий `disconnect` при истечении на `auth:expiring` за 90 с + льготу 120 с; тест: сокет живёт после `auth:refresh`.
2. Graceful shutdown: флаг draining, `server:going-away` с разбросом 0-20 с, затем закрытие; `stopTimeout` api 60-90 с, `deregistration_delay` 60 (`ecs/main.tf:298`, `alb/main.tf:114`, `:140`).
3. Метрики: `ws_disconnect_reason`, `ws_reconnect_total`, `ws_connections` по задачам; алерты в `infra/modules/monitoring`.
4. Админ-прокси `route.ts`: `try/catch`, `AbortSignal.timeout(25000)`, 503 + `Retry-After`.

P1
5. `connectionStateRecovery` в Socket.IO (с Redis-адаптером; проверить совместимость с sharded-адаптером) + монотонный номер события на пользователя для догрузки «после N».
6. `GET /config` для клиентов (тайминги, пороги, kill switch), ETag.
7. RDS Proxy и read replica (Terraform `infra/modules/postgres`).
8. Load shedding + kill switch в админке; Bot Control в режиме count.
9. Canary/blue-green (ALB weighted groups) и запрет scale-in в часы пик (scheduled min).

P2
10. Spot для worker; HTTP/3 для API через CloudFront; убрать stickiness; AVIF/WebP-миниатюры (вместе с работником scale-limits).

### Работник 2: мобильное приложение и админка

P0
1. Проактивное продление токена: таймер за 60-120 с до `exp`, при `resumed`; после этого `tokenChanged` (уже есть).
2. `ConnectivityService`: порог 2 сбоя / 8 с, быстрый возврат, не считать в фоне (`connectivity_service.dart`, `reachability.dart`).
3. Реконнект сокета: макс. 30 с, jitter 0.5-1, случайная пауза после `io server disconnect`; не слать `reconnected` при коротком разрыве; разброс 0-3 с у провайдеров, слушающих `reconnected`.
4. Админка `providers.tsx`: `retryDelay` с jitter, retry для сетевых ошибок, `networkMode`, без тоста на единичный сбой (серый «обновлено N с назад»).

P1
5. `AppLifecycleState` для сокета: `resumed` — проверка и переподключение, долгий `paused` — тихо закрыть.
6. Транспорты `websocket` + `polling`; использовать `recovery` и номер события для догрузки вместо REST-перечитывания.
7. Читать тайминги из `GET /config`.
8. Старый баннер: удалить мёртвые строки `connectivity.*` или оставить как есть (решение владельца), убрать подписки, которым не нужен «offline».

### Что проверить сразу после правок (простая проверка)

- Открыть приложение на 40 минут без касаний: в логе API не должно быть `auth:expired`, `ws_connections` не падает каждые 15 минут.
- Перезапустить API (`nest start --watch` и деплой): телефон не показывает «недоступно», события догоняются без полной перезагрузки списков.
- Админка: остановить API на 20 секунд, открыть страницу: данные остаются, без красных тостов; через минуту всё обновилось.
