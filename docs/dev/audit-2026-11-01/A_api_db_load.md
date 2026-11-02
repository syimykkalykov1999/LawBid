# API / DB аудит под нагрузкой (read-only, main snapshot)

Метод: чтение кода apps/api/src/modules/*. Не повторено: всё из docs/perf (SCALE_LIMITS, SERVER_LOAD, LOAD_SPEED_6).
Подтверждено «уже исправлено в коде» (НЕ баги): channel fan-out ушёл в очередь (`channel-fanout.runner.ts`, батч 500, курсор); case fan-out волнами + `emitMany` (`case-fanout.service.ts`); accept ставки под `FOR UPDATE` cases+bids (`bid-acceptance.service.ts:179,198`); аренда задач staff (`work-lease/lease.service.ts` advisory lock + atomic INSERT); `admit` группы под `FOR UPDATE`; чат идемпотентен по `clientMessageId`; индексы posts (author_published, popular, trgm) есть в сырых миграциях (в schema.prisma их нет - это норма).
Метки: V = проверено чтением, P = probable.

## P1

**A-1 (V) Рассылка подписчикам нового поста: в API-процессе, последовательно, без ретрая/дедупа.**
`notifications/subscription-alerts.service.ts:30-62`, вызов `posts/posts.service.ts:422` (`alerts.later` = `setImmediate`).
`for (const r of rows) await notifications.emit(...)` до `ALERT_FANOUT_MAX=5000`: на каждого ~5-6 round-trip (blockedEitherWay, INSERT, redis badge, enqueue push). 5000 x ~8 мс = ~40 с занятого пула коннектов на ОДИН пост; 20 постов/мин - пул (10 на таск) исчерпан. Падение/деплой посреди цикла - остаток не уведомлён, никто не повторит; повторная публикация (hold -> publish, republish) шлёт заново: у `followed_post` нет `dedupe_key`.
Также: >5000 подписчиков - остальные НЕ уведомляются никогда, а `LIMIT 5000` без ORDER BY отдаёт всегда одних и тех же. Split-ветка (`followersSplit:95`) читает ВСЕХ подписчиков без take и `IN (ids)` (1M подписчиков = 1M uuid в памяти и в запросе).
Фикс: как у каналов - очередь `post-fanout` + курсор по `follows(followee_id, created_at, follower_id)` пачками 500 + `emitMany` с `dedupeKey=followed_post:${postId}`.

**A-2 (V) Лимиты ставок - check-then-act вне транзакции.** `bids/bids.service.ts:232-330` (`max_active_bids`, `trial_bids`, `bids_per_month`, затем tx на :332).
Счёт `bid.count` и `spendCredit` идут ДО tx; N параллельных POST на разные кейсы проходят все проверки -> превышение плана (платные лимиты обходятся ~20 запросами параллельно; rate-limit `bid_create` не атомарен с лимитом плана). Кредит списан до коммита - при падении процесса между consume и commit кредит теряется (refund только в catch).
Фикс: `pg_advisory_xact_lock(hashtext('bid:'||attorney_id))` в начале tx и повтор count внутри tx; credit consume внутри той же tx.

**A-3 (V) `contacts-joined.job` - O(joiners x owners) последовательных emit.** `jobs/handlers/contacts-joined.job.ts:50-141` (BATCH 200 x OWNERS_MAX 5000).
Внутри `announce` цикл `for (const w of wants) await emitOnce(redis ...) + emit` - до 1M emit за один запуск (при массовой регистрации/кампании), каждый ~6 запросов. Один запуск cron может идти часами, наложение запусков (нет lock - P) -> двойная работа; `contacts_announced_at` ставится только в конце, при падении всё повторится (спасает emitOnce, но не нагрузку). Номер телефона, который лежит в >5000 книгах, уведомит только первые 5000 (take без order).
Фикс: `emitMany` с `dedupeKey=contact_joined:${joinerId}` пачками 500; помечать joiner сразу после его announce; advisory lock на job.

**A-4 (V) Дубли и двойной декремент счётчиков при повторе удаления.**
- `comments/comments.service.ts:259-290` `remove`: `findFirst deleted_at:null` и затем `update` без guard; два параллельных DELETE (автор + автор поста, двойной тап, ретрай клиента) оба проходят -> `comment_count` и `reply_count` уменьшаются дважды (счётчик уходит в минус/дрейф; reconcile лечит позже).
- `channels/channels.service.ts:1089-1114` `removeComment`: `findFirst` вообще без `deleted_at:null` -> КАЖДОЕ повторное удаление уже удалённого комментария делает `comment_count: {decrement:1}` (воспроизводится одним ретраем).
Фикс: `updateMany({where:{id, deleted_at:null}})` и бампать счётчик только при `count===1`.

**A-5 (V) `admit` в группе: проверка членства вне блокировки.** `groups/groups.service.ts:1361-1385` (`join`), `1418-1427` (`decideRequest`), `1020-1026`; тело `admit:1445-1500`.
Проверка `existing.left_at===null` стоит ДО `FOR UPDATE`. Двойной тап «Вступить» / два админа жмут «Принять» параллельно: второй `admit` находит активную запись, `update` сбрасывает `role:'member'` (админ, добавленный между, ДЕМОТИРУЕТСЯ), `joined_at`, шлёт второе системное «joined» и `member_count = count+1` (count уже включает его) - завышение, пока кто-то не выйдет.
Фикс: внутри `admit` после `FOR UPDATE`: `if (existing && existing.left_at === null) return lastSystemOrNull`.

**A-6 (P) Лента «хвост»: `NOT IN` двух больших списков на каждую страницу.** `feed/feed.service.ts:621-650` (`latestTail`).
Каждый запрос страницы хвоста тянет ВЕСЬ snapshot `zrevrange(recoKey,0,-1)` (размер = reco-снимок, до тысяч id) + `author_id NOT IN (FOLLOWEES_MAX=2000 + blocked)` + `id NOT IN (snapshot)` -> 3-5k bind-параметров на запрос, Prisma/PG упрутся в 32767 при большом blocked-сете (`cachedBlockSet` не ограничен). Планировщик не может использовать partial index эффективно с огромным NOT IN. Объём: активный читатель дошедший до хвоста (каждый после исчерпания reco).
Фикс: исключать snapshot по `seen`-ZSET уже на уровне Redis (id->ранг) или ограничить хвост окном `created_at > now()-N дней`; blocked ограничить/тянуть через NOT EXISTS.

**A-7 (P) Поиск каналов/групп `ILIKE %term%` без trigram-индекса.** `channels/channels.service.ts:214-232` (title `contains insensitive` + `username contains`), `groups/groups.service.ts:1269-1280` (то же по `chat_groups`).
В миграциях trgm-индекса на `channels.title`/`chat_groups.title` не найдено (есть только posts/legal_questions/attorney). Seq scan всей таблицы каналов на каждый ввод символа в поиске: >100k каналов = десятки мс CPU БД на запрос, эндпоинт не кэшируется. Заодно `owner_id NOT IN (hidden)` без лимита на размер.
Фикс: `CREATE INDEX CONCURRENTLY ... USING gin (lower(title) gin_trgm_ops)` (+username), debounce/кэш 60 с по (term).

**A-8 (P) Story tray без кэша и с недетерминированным набором.** `stories/stories.service.ts:106-190`.
Каждое открытие приложения/обновление ленты: 5 запросов, два `take:2000` БЕЗ `orderBy` (follows и contactMatch с `OR owner/matched` - у кого >2000 подписок/контактов получает произвольный срез, разный при каждом вызове - «истории пропадают/появляются»), затем `author_id IN (<=4000)` + `visibleToViewer` по таблице stories, `take 1500`. Эндпоинт самый частый после feed.
Фикс: orderBy created_at desc для обеих выборок; кэш трея 20-30 с в Redis на viewer + инвалидация при новой истории подписанного (ограниченная по версии).

## P2

**A-9 (V) Горячие строки счётчиков вне `counters`.** Каналы: `channels.service.ts:416/434` (`subscriber_count` +-1 на каждый sub/unsub, строка канала = точка сериализации при вирусном канале; sub и update не в одной tx - падение между ними = дрейф), `:925` (`view_count` на строку поста `updateMany increment` для каждого просмотра пачкой), `:706` `post_count/last_post_at`, `:955`, `:1073`. Группы: КАЖДОЕ сообщение делает `UPDATE chat_groups SET last_message_*` и `bumpTopic` (`groups.service.ts:1658-1672,2232`) внутри tx - в активной группе (512 чел.) это строка-«бутылочное горлышко», все отправители выстраиваются в очередь на row-lock. Фикс: перевести channel/post views и subscriber_count на `counters.bump` (как stories/comments), `last_message_*` писать не в tx отправки (или монотонный UPDATE ... WHERE last_message_at < $1, без ожидания - `SKIP LOCKED` не нужен, достаточно коротко и после коммита).
Bids: `bids.service.ts:384-392` `bids_count: increment` на строке кейса в одной tx с journal/notifications - популярный кейс (сотни ставок за минуту) сериализуется, tx держит lock дольше (emit внутри tx на :414). Фикс: бампать `bids_count` последним шагом tx или через counters.

**A-10 (V) `channel_post_views` растёт без ретенции** (`prisma/schema.prisma:7376`, 1 строка на (пост x читатель), PK ок). `storage/data-retention.service.ts` его не чистит (чистит post_views, post_view_events, user_activity_days...). Миллион читателей x посты = миллиарды строк; также `story_views`, `channel_post_shares` - не найдено в retention (P). Фикс: добавить в nightly batched delete (viewed_at < now()-N) или партиционирование (`TABLE_PARTITIONING_READY.md`).

**A-11 (V) `emitDigest` - N+1** `notifications/notifications.service.ts:335-358`: цикл по `capped` (весь превысивший дневной лимит сегмент аудитории кейса, до 5000+) - на каждого raw INSERT + redis invalidate + push enqueue, последовательно, в воркере на волне 1 (`case-fanout.service.ts:499`). Фикс: один `INSERT ... SELECT unnest(...) ON CONFLICT` + `invalidateNotificationsMany` + `enqueueMany` (как `emitMany`).

**A-12 (V) Нет идемпотентности у создания комментариев/постов.** `comments/comments.service.ts:90-170` (`create` без client id), посты аналогично (в чате и группах `clientMessageId` есть - в этих двух нет). Ретрай мобильного клиента по таймауту (WAF/ALB 30 с) = дубль комментария + двойной `post_comment` уведомление (тут нет dedupe) + двойной бамп. Лимитер `comment` режет частоту, но не дубли. Также create + `counters.bump` + notify не атомарны (падение = комментарий без счётчика, лечит reconcile). Фикс: опциональный `clientCommentId` с UNIQUE(author_id, client_id) как в чате.

**A-13 (V) `setFindByPhone(false)`** `contacts-sync/contacts-sync.service.ts:143-158`: `take:100000` owners -> `updateMany user_id IN (100k)` и `deleteMany` по `matched_id` в одном запросе; у популярного номера (в 100k+ книгах) - длинная блокировка строк `contact_sync_settings` и всплеск WAL; Prisma режет IN по ~32k - несколько проходов без tx. Фикс: батчи по 5000 с паузой / через очередь.

**A-14 (V) `addableIds` - N+1** `groups/groups.service.ts:2284-2290`: `await this.addPolicy.allows(by, u.id)` в цикле по до 512 приглашённым (запрос на каждого). Фикс: `allowsMany(by, ids)` одним запросом privacy-настроек.

**A-15 (V) Рассылка админа без идемпотентности** `admin-content/admin-content.service.ts:573-600`: `user.count(audience)` (полный COUNT по users с фильтром) + create + fanout на каждый POST; двойной клик/ретрай = две рассылки всей аудитории. Фикс: `Idempotency-Key`/UNIQUE(admin_id, title, created_minute) либо подтверждение через draft->send.

**A-16 (V) Support `pickAgent` - read-then-assign** `support/support-desk.service.ts:214-250`: «least-loaded с cap» считается groupBy-ом без блокировки; пачка тикетов, созданных одновременно, уходит одному агенту и превышает `max_open`. Также legacy `next()` (:360-384, lease по умолчанию OFF) не проверяет cap вовсе. Фикс: `SELECT ... FOR UPDATE` на support_agents или `pg_advisory_xact_lock` вокруг выбора+назначения; включить lease (`servesQueue('support_ticket')`).

**A-17 (P) Чат-поиск по сообщениям** `chat/chat.service.ts:440-470`: LATERAL-подзапрос `messages ... textMatch ORDER BY created_at DESC LIMIT 1` на КАЖДЫЙ диалог пользователя (до LIMIT 2000 диалогов): стоимость = число диалогов x индексный поиск по токенам; у «тяжёлого» юзера с 2000 диалогов один keystroke-поиск = 2000 лукапов. Лимитер/кэш в пути не найден. Фикс: debounce + rate-limit `chat_search`, поиск сначала по токен-индексу без привязки к диалогам, затем фильтр по участию.

**A-18 (P) Fallback legal-Q&A поиск** `search/postgres-search.provider.ts:660-690`: если `fast` пуст - OR из FTS, word_similarity, `ILIKE` по title/body и `EXISTS` по legal_answers.body ILIKE: ILIKE по body без trgm-индекса = seq scan legal_questions + answers при каждом редком запросе (нулевая выдача - самый частый случай для опечаток). >200k вопросов - секунды. Фикс: убрать ILIKE-ветки для body либо trgm-индекс; кэш negative-результата 5 мин (single-flight уже есть в другом месте).

**A-19 (V) Offset-пагинация в рабочих путях:** `search/search.service.ts:526,634` (`skip: offset` для popular со старым числовым курсором и for_you по позиции в списке до PAGE...); `channels.service.ts`/`groups.service.ts` discover - offset по готовому снимку (ok, из Redis). Реально опасен только legacy popular `skip` (старые клиенты): на глубоком offset скан по `posts_popular_idx` O(offset). Низкий риск; закрыть форс-обновлением клиента (`min_app_version`) и отключить числовой курсор.

## Итого
P1: A-1 (рассылка постов), A-2 (обход лимитов ставок), A-3 (contacts-joined), A-4/A-5 (реальные баги: двойной декремент, демоут админа/overcount), A-6, A-7, A-8.
Самое дешёвое с наибольшим эффектом: A-4 (3 строки, реальный дрейф счётчиков), A-5 (ранний return), A-7 (один CREATE INDEX).
Не нашёл проблем: аренда задач staff, accept ставки, фан-аут каналов и кейсов, flush счётчиков, retention уведомлений.
