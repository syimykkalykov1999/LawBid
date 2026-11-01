# Аудит apps/api realtime + infra + media (read-only), 2026-11-01
Охват: realtime.gateway/publisher/event-log, redis/*, jobs/*, push/*, files/*, videos/*, throttler, infra/modules (ecs, alb, pgbouncer, redis, s3, postgres, network).
Код зрелый: sharded adapter, drain на SIGTERM, ALB idle=300 < keepAlive 310, deregistration=stopTimeout=60, отдельная TG для /socket.io со sticky, PgBouncer transaction, job-lock с heartbeat, BullMQ scheduler (дубли cron исключены), Lua-счётчики, FCM 429-pause + dedupe, NAT per-AZ + endpoints. Ниже только НОВОЕ (в docs/perf, docs/architecture не сверял пункт-в-пункт: просмотрены заголовки).

## P1

### B-1 (P1) Ключ "чат открыт" живёт до 1 ч после падения сокета -> пропущенные push
- realtime.gateway.ts:62 (VIEW_TTL_SEC=3600), :969-971 (sadd+expire только при `conversation:join`), :859-863 (srem только в disconnect), heartbeat :640-668 не обновляет; realtime-publisher.service.ts:265 (`isViewing` = SCARD>0, без проверки жив ли socket id).
- Ломается: при SIGKILL/OOM/Spot-reclaim таска, ECS stopTimeout-обрыве, потере Redis в момент disconnect запись `viewing:{u}:{conv}` остаётся до 60 мин -> push на новое сообщение подавляется, а сокета уже нет. На ~20 тасках и деплоях 5-10 раз/день затронуты все, у кого был открыт чат на убитом таске (каждый деплой = тысячи юзеров, потерявших push на час). Обратный эффект: чат открыт >1 ч (ночью на планшете) -> TTL истёк, push снова летят в открытый экран.
- Фикс (малый): TTL 120 с; в heartbeat (HEARTBEAT_MS=45 s) для `state.viewing` делать `pexpire(viewingKey, 120000)` пайплайном (1 команда/чат/45 с). Либо хранить ZSET socketId->expiry как в presence.touchCount и считать только живые.

### B-2 (P1, probable) ClamAV INSTREAM лимит 25 МБ против потолка файла 50 МБ
- apps/api/src/modules/files/scanning/virus-scanner.ts:78-92 (стримит весь файл, ответ парсится строго `stream: OK|FOUND`, иначе throw); upload-limits.ts:144,156 (ceiling.fileMb=50); infra/modules/ecs/main.tf:604-617 (официальный образ clamav без своего clamd.conf; дефолт StreamMaxLength=25M, MaxFileSize=25M).
- Ломается: любой документ/видео-файл 25-50 МБ -> clamd отвечает `INSTREAM size limit exceeded. ERROR` -> parseClamdReply кидает -> 3 попытки (exp. backoff 5 с) -> файл `failed` навсегда; юзер не может прикрепить PDF-скан 30 МБ. Воспроизведение = 1 файл >25 МБ (проверить на staging).
- Фикс: смонтировать clamd.conf (StreamMaxLength 55M, MaxFileSize 55M, MaxScanSize 110M) либо снизить ceiling до 24 МБ; в parseClamdReply `size limit exceeded` -> отдельный verdict `too_large` без ретраев. Заодно: scan грузит файл целиком в Buffer (file-scan.processor.ts:80) x concurrency 2 x 50 МБ - ок, но при росте concurrency память worker (-clamav 1.2 ГБ) упрётся.

## P2

### B-3 (P2) FCM: INVALID_ARGUMENT / NOT_FOUND токены не удаляются, считаются "temporary" и ретраят весь job
- push/fcm-push.sender.ts:367-372 (удаляется только `UNREGISTERED`), :373-385 (всё остальное -> temporary++ -> `FcmTemporaryError` -> повтор job целиком).
- Ломается: токен с HTTP 400 INVALID_ARGUMENT ("not a valid FCM registration token", обрезанный/подделанный) или 404 NOT_FOUND остаётся в push_tokens навсегда; каждый push этому юзеру = лишний HTTP + ретрай BullMQ (attempts*delay) + `pushFailed` в SLO. Для группового fan-out (1000 участников, 3% мёртвых) каждое сообщение даёт ретрай-петлю.
- Фикс: `code==='INVALID_ARGUMENT' && message ~ /registration token/i || res.status===404 && code==='NOT_FOUND'` -> `tokens.remove(device)`; ещё sessions-cleanup уже чистит по давности (sessions-cleanup.job.ts:103) - проверить порог (должен быть <=60 дней, FCM сам считает токен stale через 270 дней).

### B-4 (P2) Неатомарные INCR + EXPIRE -> счётчик без TTL навсегда
- auth/services/otp.service.ts:553-554 (email-domain, 2h), attorney-trust/firm-email.service.ts:92-94 (24h, лимит кодов -> вечный "Too many codes today"), translation/translation.service.ts:142-144 (квота 26h), calls/calls.service.ts:262-263, work-lease/lease.service.ts:543-544, files/jobs/file-scan.runner.ts:136-137 (fair-priority), verification/services/bar-attempts.service.ts:56-57 (хотя бы expire всегда).
- Ломается: падение процесса/разрыв Redis (failover, ~1 раз на деплой Redis) между двумя командами -> ключ без TTL, при noeviction это ещё и вечная утечка памяти; для firm-email/otp-domain - постоянная блокировка домена/адвоката. Редко, но нулевая цена исправления.
- Фикс: единый хелпер `incrWithTtl(key, ttl)` = Lua `local n=INCR; if n==1 then EXPIRE end` (в redis/ уже есть Lua-хелперы, RateLimitService.consumeFixedWindow атомарен - переиспользовать его).

### B-5 (P2) IP-лимит WS-подключений 120/мин ломает реконнект-шторм за NAT
- realtime.gateway.ts:84 (DEFAULT 120), :497-519 (`overIpConnectLimit`, INCR по IP, при превышении `RATE_LIMITED` + disconnect).
- Ломается: CGNAT оператора / офис юридической фирмы / вуз (200-500 юзеров за одним IPv4) при деплое или `server:going-away` (рандом-спред 0..N сек) делают >120 коннектов/мин с одного IP -> часть клиентов получает auth:error RATE_LIMITED; если клиент не ретраит на этот код - остаётся без realtime до перезапуска приложения. Каждое подключение при этом идёт через INCR+EXPIRE (ещё B-4).
- Фикс: лимит по (IP) считать только для НЕаутентифицированных/невалидных токенов (после verify уже есть per-user cap 10), либо поднять до 600/мин и учитывать /64 для IPv6; в клиенте RATE_LIMITED на connect = backoff+jitter, не терминальная ошибка (проверить в apps/mobile).

### B-6 (P2) Все события с несколькими получателями идут через ОДИН pub/sub канал/слот в sharded-режиме
- realtime-publisher.service.ts:60-77 (`rooms.length===1 ? base+room : base`), :158-175 (`toUsers`: multi-user -> общий канал `base`).
- Ломается: в cluster-mode Redis (REDIS_CLUSTER_READY.md) все групповые/мульти-получательские события (group:message, typing с peers, case:update на несколько юзеров) хэшируются в один слот -> один shard держит весь multi-room трафик и каждый API-инстанс его читает. 1:1 чат (2 получателя) тоже multi-room (userRoom(a), userRoom(b)) -> практически ВЕСЬ чат трафик в одном слоте. ~5-10k msg/s -> 1 шард упрётся (single-thread, N подписчиков = N копий). Масштабирование шардами не помогает.
- Фикс: для 2-3 комнат делать N отдельных `spublish` по одной комнате (канал на комнату), общий канал только для >8 комнат; сообщение мелкое, publish дешёвый.

### B-7 (P2) На каждое realtime-событие 1 + N Lua-вызовов, один горячий ключ `rt:seq`
- realtime-event-log.ts:31-41 (NEXT_SEQ_LUA на один ключ, `TIME`+GET+SET), :128-145 (`append`: EVAL на каждого получателя), realtime-publisher.service.ts:166-176 (асинхронно: seq -> append -> send).
- Ломается: ~3 Redis-операции на 1:1 сообщение + публикация; ~5k msg/s = 15k+ EVAL/s, из них 5k/s на ОДНОМ ключе (в cluster - один шард, Lua не распараллеливается) + рост задержки доставки на RTT*3 (send ждёт append). Плюс порядок: два события одному юзеру могут уйти в порядке, отличном от seq (append разной длительности) -> клиентский курсор перескочит пропущенное при обрыве.
- Фикс: отправлять `send` сразу после nextSeq (append в фоне, он нужен только для реплея), seq брать блоками (INCRBY 100 в памяти инстанса, нужна только монотонность по юзеру - TIME-вариант заменить на per-instance hi/lo). Минимум: объединить nextSeq+append в один EVAL при одном получателе.

### B-8 (P2, probable) `announce` делает fetchSockets() по всему кластеру на каждое online/offline
- realtime.gateway.ts:758-781 (`this.nsp.in(room).fetchSockets()` + mayWatch на каждого watcher + per-socket emit).
- Ломается: fetchSockets через redis-adapter = request/response по pub/sub ко всем инстансам (таймаут 5 с). Популярный юзер (юрист с 2-5k открытых чатов), флап сети/мобилки (каждые 30-120 с) -> шторм таких запросов на 20 инстансов; медленный ответ одного инстанса держит промис до 5 с. + `presence:watch` (:1060) = 2 Prisma-запроса на каждый вызов без лимита комнат на сокет.
- Фикс: `nsp.to(room).emit('presence:update')` (adapter сам разошлёт), mayWatch-проверку делать при watch, а не при каждом announce (или кэш с версией аудитории); лимит `rooms.size` на сокет (напр. 200 presence-комнат) в watchPresence/conversation:join/channel:watch.

### B-9 (P2) Нет лимита числа комнат/viewing на сокет
- realtime.gateway.ts:936-975 (`conversation:join`: `viewing` Set + `peers` Map + redis sadd без потолка), :1011 (`channel:watch`), :1031 (post), :1095 (presence).
- Ломается: бакет событий (socket-event-bucket.ts) ограничивает частоту, но не количество; клиент за ~10 мин копит десятки тысяч комнат/ключей `viewing:*` (каждый с TTL 1 ч, B-1) -> память инстанса, adapter-подписки в dynamic-sharded режиме (каждая комната = SSUBSCRIBE на канал).
- Фикс: `if (viewing.size >= 50) return {ok:false}` (в join), отдельный потолок для channel/post/presence.

### B-10 (P2, probable) ClamAV-sidecar в КАЖДОМ worker-таске: freshclam с общего NAT-IP
- infra/modules/ecs/main.tf:603-617 (clamav essential, ~1.2 ГБ сигнатур на старте каждого таска), worker max=10 (envs/prod/variables.tf:83) + autoscale по очереди.
- Ломается: каждый scale-out/деплой воркера = скачивание ~300 МБ через NAT (NAT $0.045/ГБ + data) и обращение к ClamAV CDN; при 10 таск/деплой подряд CDN отдаёт 429 "cool-down" -> clamd не стартует -> `essential` валит ВЕСЬ worker-таск (включая push, cron) -> цикл рестартов. startPeriod 300 с.
- Фикс: вынести clamd в отдельный сервис (2 таска, NLB/Service Connect) либо свой образ с запечёнными сигнатурами (nightly build в ECR) + `essential=false`, worker health не зависит от clamd; метрика "scan backlog" уже есть в queue-depth.

### B-11 (P2) Cost-guard fail-CLOSED на Redis-blip блокирует загрузки/OTP/email целиком
- common/cost-guard/cost-guard.service.ts:243,476 (при ошибке Redis - отказ); вызовы: files.service.ts:222 (`consume('storage')`), email x8, sms, video.
- Ломается: Redis failover (30-60 с, ElastiCache Multi-AZ) = 30-60 с полного отказа presign, регистрации по e-mail/SMS, видео. Throttler при этом fail-OPEN (throttler/redis-throttler-storage.service.ts:94-101), т.е. политика несогласованна: дешёвое открыто, платное закрыто - для OTP это допустимо, для `storage` (фактически бесплатный по деньгам лимит 120/мин глобально - seed.ts:347) - нет.
- Фикс: для `storage`, `message`, `like` и пр. не-денежных провайдеров fail-open с логом; fail-closed оставить для sms/email/id_check/video/translate.

### B-12 (P2, probable) Нет process-level `unhandledRejection` обработчика
- grep по src/ пуст (main.ts, worker.ts, app.setup.ts). Спасает только Sentry-интеграция (telemetry/sentry.ts:46 - при пустом DSN `return false`).
- Ломается: любая забытая `void promise` без catch (в gateway их много, e.g. :652-666 `.catch` есть, но новые) на Node>=15 валит процесс -> все ~10-30k сокетов таска отваливаются одновременно -> reconnect-шторм на соседние таски (B-5).
- Фикс: `process.on('unhandledRejection', (e)=>logger.error(...))` в main.ts/worker.ts (+ `uncaughtException` -> graceful exit с drain, не мгновенный).

### B-13 (P2) Видео: лимит размера/длительности доверяет клиенту
- videos/videos.service.ts:229-241 (`costGuard.consume('video', ..., seconds: dto.durationSec)` по ЗАЯВЛЕННОЙ длительности; реальная сверяется после загрузки в `refresh`), tus-подпись :270-275 без max bytes (Bunny TUS не ограничивает размер на подписи).
- Ломается: клиент заявляет 5 с, льёт 2 ч 4K -> Bunny трансcодит/хранит (деньги) до момента отбраковки; cost-guard бюджет искажён. Pending-лимит (:221-232) считается не атомарно (count -> create), параллельные запросы обходят `video.max_pending_per_user`.
- Фикс: после webhook "uploaded" сразу сверять размер/длительность и `deleteVideo` при превышении (уже есть путь :427); pending-слот брать `INCR` с TTL (атомарно, B-4 хелпер).

### B-14 (P2) videos.sweep: последовательный опрос Bunny без ORDER BY
- posts/post-videos.service.ts:6 (BATCH=100), :61-100 (for-await refresh() по одному, findMany без orderBy), jobs.constants.ts:318 (каждую минуту).
- Ломается: при сбое webhook (ротация ключа Bunny, 5xx) накопление "processing" >100: без orderBy одни и те же 100 строк, новые голодают; ~100 x 200 мс = 20 с/мин - укладывается, но при >6000 зависших видео/час очередь не рассасывается.
- Фикс: `orderBy: {created_at:'asc'}`, `Promise.all` по 10 + чанки; алерт на "processing > N min".

### B-15 (P2) Orphan-объекты S3: учёт загрузок только в Redis ZSET без TTL при noeviction
- files/storage/pending-uploads.ts, files.service.ts:249-257 (`zadd files:pending`), infra/modules/s3/main.tf:360-385 (media: нет lifecycle для неподтверждённых, комментарий "temp prefix нет").
- Ломается: потеря Redis (failover на stale-реплику, restore) -> список "ожидающих" исчез -> загруженные, но не подтверждённые объекты (до 50 МБ каждый) висят вечно; также записи ZSET растут, если cleanup-джоб не работает (нет алерта на размер). При 100k неподтверждённых загрузок/мес (отмена отправки) = десятки ГБ мусора.
- Фикс: писать `files.status='pending'` строку в БД при presign (или reconcile-джоб: S3 list по префиксу старше 2 дней без строки `files` -> delete); либо S3 key-prefix `tmp/` + lifecycle 2 дня + copy при confirm.

### B-16 (P2) Нет поддержки resumable/multipart для фото/документов до 50 МБ
- files.service.ts:229-233 (одиночный presigned POST/PUT); resumable (TUS) только для видео (Bunny).
- Ломается: мобильная сеть с обрывами (3G, лифт/суд) - загрузка 30-50 МБ PDF/скана начинается заново; повторный presign тратит `FILES_PRESIGN_LIMIT_PER_USER_PER_HOUR` и квоту (assertQuota/reserveDailyUpload резервируются, но не возвращаются при неудаче?). При 50k загрузок/день с 5% повторов - лишний трафик и 429.
- Фикс: S3 multipart (create/part-presign/complete) для >8 МБ, 5 МБ части; либо вернуть резерв дневной квоты при истёкшем intent (cleanup-джоб). Низкий приоритет, если реальные файлы <10 МБ.

### B-17 (P2) heartbeat на каждый сокет = MULTI из 4 команд каждые 45 с
- realtime.gateway.ts:89 (HEARTBEAT_MS), :660-666; presence.service.ts:46-57 (`touchCount`: zremrangebyscore+zcard+zadd+pexpire).
- Ломается: 100k сокетов = 2.2k MULTI/s (~9k команд/с) постоянно + при реконнект-шторме 100k за 10 с = 10k MULTI/s на тех же ключах; ключ на юзера, hot-key нет - терпимо до ~300k сокетов, дальше доминирует нагрузку Redis (после event-log B-7).
- Фикс: для heartbeat использовать только `zadd`+`pexpire` (zremrangebyscore/zcard нужны лишь на connect), растянуть до 90 с при PRESENCE_TTL_MS>=3x.

### B-18 (P2) Логи: строка на каждое connect/disconnect/событие
- realtime.gateway.ts:331-334 (`gauge()` - info-лог на каждый connect И disconnect), `logWsEvent` (ws_connect/ws_disconnect/ws_reconnect).
- Ломается: деплой с 50k сокетов = 3 лог-строки x 50k x 2 (disconnect+connect) ~ 300k строк x ~250 Б = 75 МБ за минуты; CloudWatch ingest $0.50/ГБ - дёшево по деньгам, но метрика `ws_connections` как сумма по инстансам шумит и маскирует реальные ошибки в лимите Logs Insights.
- Фикс: gauge раз в 30 с таймером (уже есть timingTimer), событийные ws_* лог-строки сэмплировать 1/20 при >N/с, либо EMF-метрика без строки.

## Проверено, замечаний нет (кратко)
- Cron/job overlap: BullMQ upsertJobScheduler + withJobLock c heartbeat (job-lock.ts); API с JOBS_ENABLED=false в ECS (main.tf:536). Дубликатов нет.
- DB: connection_limit=10/pod + pool_timeout 10 + PgBouncer transaction (entrypoint.sh:108-125); statement_timeout на ролях.
- ALB/WS: idle 300, keepAlive 310, sticky только на отдельной TG при ws_target_group_enabled (при выключенном флаге sticky на всей API TG - ок).
- Graceful: drain `server:going-away` + spread, worker closeWorker bounded, stopTimeout 60/120.
- Redis: noeviction осознанно (BullMQ), KEYS/SCAN в горячем пути нет, event-log с TTL и MAXLEN, redis_cache_node опция есть (по умолчанию false: кэш и очереди в одном noeviction узле -> при заполнении `OOM command not allowed` рушит и очереди, и cost-guard; алерт redis_memory_alarm_percent есть).
- Инфра-дефолты: RDS Multi-AZ, t4g.medium (не micro), Redis r7g.large + реплика, NAT per AZ, интерфейсные endpoints, ClamAV и ADOT учтены в размерах.

## Нужно проверить на staging (не верифицировано)
1. B-2: загрузить PDF 30 МБ -> статус файла.
2. B-5: мобильный клиент - поведение на `auth:error RATE_LIMITED` при connect (apps/mobile realtime client).
3. B-6/B-7: нагрузочный прогон loadtest/ с 5k msg/s в cluster-mode; смотреть CPU шарда с `rt:seq` и каналом `#/realtime#`.
4. B-10: сколько ClamAV freshclam-запросов/сутки при autoscale воркера (CloudWatch NAT BytesOutToDestination).
