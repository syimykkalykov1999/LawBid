# API «экономного клиента» — что готово на сервере (2026-10-22)

Для MOBILE-работника. План: `docs/perf/CLIENT_ECONOMY_PLAN_2026-10-22.md`. Всё ниже — **необязательные** параметры, поля и события: старые сборки работают как раньше. Контракт перегенерирован (`packages/api-contract`, Dart-клиент `lawbid_api`), `oasdiff` без ошибок.

Порядок пакетов — как в плане: A → D → G → B → E → F → I → H → J. Внутри — «что звать», «что приходит», «когда перечитывать».

---

## 0. Общий механизм дельт (`common/sync/`)

Любой список ниже с пометкой **delta** принимает `?updatedSince=<ISO>` и отвечает:

```json
{ "data": [ …только изменённые строки… ],
  "meta": { "nextCursor": null, "deletedIds": ["…"], "syncedAt": "2026-10-22T12:00:00.000Z" } }
```

- `syncedAt` — самая новая `updated_at` из ответа (или ваш же `updatedSince`, если ничего не менялось). **Следующий раз передавайте именно его**, не часы телефона.
- `deletedIds` — id строк, которые **ушли из этого списка/вкладки** (удалены, скрыты, перешли в другую вкладку). Удаляйте их из локальной копии.
- `updatedSince` старше **7 дней** → `409 SYNC_TOO_OLD` (новый `ErrorCode`) → полная загрузка с первой страницы. Неразборчивая дата → `400 VALIDATION_ERROR` (`details.field = updatedSince`).
- С `updatedSince` курсор и постраничность не применяются (`nextCursor: null`), ответ ограничен 500 строками; `deletedIds` в `ResponseMetaDto` теперь описаны в OpenAPI.
- «Дешёвый ETag» (пакет D): у отмеченных ручек `ETag` считается **до** сборки тела по индексным колонкам; с `If-None-Match` сервер отвечает `304` без тела и без тяжёлых запросов. Формат `W/"<prefix>-…"`. Всегда шлите `If-None-Match`, если есть сохранённый `ETag`.

Чаты (`GET /conversations?updatedSince`) были сделаны раньше и остались как есть (без `deletedIds`/`syncedAt`).

---

## A. Просмотры батчем

| Ручка | Что нового |
|---|---|
| `POST /posts/events` | `events[].kind` принимает `"view"` (кроме `impression`, `profile_visit`). До 50 событий за запрос. Правило «1 просмотр на зрителя в 24 ч» и «не считать автора» — на сервере; дубли внутри батча схлопываются. Ответ `204`. |
| `POST /cases/views` | **новая**: `{ "caseIds": ["uuid", …] }` (1–50). Чужие/невидимые дела молча пропускаются. `204`. Нужна duty `cases` у ассистента. |
| `POST /posts/{id}/view`, `POST /cases/{id}/view` | остались, помечены `deprecated` (`x-sunset: 2027-06-30`). |

Правило просмотра (решение владельца): ≥ 50 % карточки на экране ≥ 1 с. Шлите через тот же `PostEventsBatcher` (flush 4 с, повтор на пост не чаще 30 мин).

---

## D. Дешёвые ETag, кэш справочников, ответ подписки

| Ручка | Что нового |
|---|---|
| `GET /config/bootstrap` | `ETag: W/"boot-<configVersion>-<5-мин корзина>"` считается из Redis-счётчика версии конфига (растёт при любой смене флагов / app_config / юрдоков / языков) → `304` без сборки. `Cache-Control: public, max-age=60, stale-while-revalidate=300`. В `app_config` всегда есть лимиты кэша (§5 плана): `cache.limit_mb.http`=32, `.messages`=50, `.feed`=8, `.images`=500, `.chat_media`=300, `.files`=200, `.video`=300, `cache.keep_media_days.default`=30 (0 = всегда). Это потолки; на телефоне можно только понижать. Админ меняет их в Настройки → app_config. |
| `GET /attorneys/{username}` | `ETag: W/"att-…"` из `attorney_profiles.updated_at`, `users.updated_at`, счётчиков (с невыгруженными дельтами), флага «я подписан», 10-минутной корзины. Совпало → `304`, 0 запросов профиля. Подходит под `swr(10 мин)`. |
| `POST /attorneys/{id}/follow`, `DELETE …/follow` | теперь `200` с `{ "following": bool, "followersCount": int }` (`FollowStateDto`) вместо `204`. Правьте профиль локально, без 4 `invalidate`. Старые сборки (void) не сломаны. |
| `GET /pricing`, `/plans`, `/legal/documents`, `/legal/documents/{type}`, `/countries` | `Cache-Control: public, max-age=300, stale-while-revalidate=3600`. |
| `GET /stickers` | `private, max-age=60, stale-while-revalidate=3600` (персональный). |
| `GET /stickers/featured`, `/stickers/packs/{ref}`, `/document-templates`, `/document-templates/{id}`, `/deadlines/rules`, `/deadlines/holidays` | `private, max-age=600, stale-while-revalidate=86400`. |

Для `/users/me` и `/subscriptions/me` дешёвого ETag нет (слишком много источников) — там остаётся обычный ETag по телу (304 экономит байты, не работу сервера). Вместо `/users/me` на старте используйте `GET /me/session` (G).

---

## G. Старт одним запросом — `GET /me/session`

Новая ручка (`AppSessionDto`), `@AssistantSelf` (ассистент получает свои уведомления и бейджи «чаты адвоката + мои уведомления», как `GET /badges`):

```json
{ "me": { …MeDto, как GET /users/me… },
  "badges": { "chatsUnread": 0, "notificationsUnread": 0, "total": 0, "iconBadge": true },
  "bootstrapVersion": "17",
  "flags": { "video_posts": true, … },
  "unreadSupport": 0,
  "hasOngoingCalls": false }
```

- `ETag: W/"sess-…"` из `users.updated_at`, `updated_at` профиля, счётчиков бейджей (Redis), версии конфига, числа непрочитанных тикетов, «идёт ли звонок в моих группах» и 2-минутной корзины. `If-None-Match` совпал → `304`.
- `bootstrapVersion` — та же версия конфига, что в ETag `/config/bootstrap`: если отличается от сохранённой → перечитайте `GET /config/bootstrap`; иначе bootstrap на старте не нужен.
- `flags` — те же гейтированные флаги, что в bootstrap.
- `hasOngoingCalls` — только при `true` звать `GET /calls/ongoing`.
- `me.pendingLegalDocuments` — как раньше внутри `MeDto`.
- `/users/me`, `/badges`, `/config/bootstrap` остались.

Рекомендация из плана: экран из Drift-копий сразу, один `GET /me/session` с `If-None-Match`, i18n-дельта через 2 с после первого кадра.

---

## B. Группы как чаты

| Ручка / событие | Что нового |
|---|---|
| `GET /groups?updatedSince` (**delta**) | строки — группы, у которых изменилась карточка (`chat_groups.updated_at` двигается на каждое сообщение, настройку, участника) **или моя запись участника** (прочитал, закрепил, архив, скрыл). `deletedIds` — вышел / удалён / скрыл / поменялся архив-статус относительно `?archived` / группа удалена. Закреплённые с `updatedSince` не повторяются. `archived` учитывается. |
| `GET /groups/{id}/messages?afterId=<messageId>` | всё **после** сообщения, от старых к новым, до **200**; больше → `409 SYNC_TOO_OLD` → грузите страницу. `topicId` работает, `cursor`/`limit` игнорируются. `afterId` не из этой группы → `404`. |
| `GET /groups/{id}/topics?updatedSince` (**delta**) | только темы с `updated_at >= since`; `deletedIds` всегда пустой (темы не удаляются). Без тем (`topicsEnabled=false`) — пустой delta-ответ. Сброс непрочитанного темы на другом устройстве `updated_at` темы не двигает — это правится локально. |
| `group:message` | к `message` добавлены `groupId` и `lastMessageAt` → правьте строку списка (lastMessage, порядок, `+1` к unread если не `mine`). |
| `group:update` | `{ groupId, kind, card? }`. `card` (`GroupCardDto`: id, title, description, avatarUrl, avatarFullUrl, memberCount, type, username, joinApproval, topicsEnabled, generalTopicId, whoCan*, showServiceMessages, disappearAfterS, protectContent, lastMessageAt, updatedAt) приходит для `kind ∈ {info, members, topics, pinned, deleted}` — подменяйте общую часть карточки без GET; личные поля (myRole, unread, rights, can*) оставляйте как есть. Для `invites`, `added`, `request`, `call` и прочих — как раньше (без `card`). Карточку/темы перечитывайте только при `kind ∈ {members, settings/info, topics}`. |
| `badge:update` | список групп **не трогает**. |

Индексы: `chat_groups(updated_at)`, `chat_group_members(user_id, updated_at)`.

---

## E. Дела, ставки, консультации

### События

`case:update` — в комнату `user:{id}` **получателю уведомления** (клиенту при ставке, адвокату при ответе и т. д.; инициатор получает ответ своей ручки):

```json
{ "caseId": "uuid", "kind": "bid_new", "bidId": "uuid", "source": "bid_received" }
```

`kind` ∈ `bid_new | bid_accepted | bid_declined | bid_countered | bid_withdrawn | updated | closed | task | payment | invite`. `source` — тип уведомления, из которого выведено (`bid_received`, `offer_countered`, `case_closed`, `case_workspace_activity`, `files_added`, `case_invite_received`, …). **Тел (`bid`, `case`) в событии нет** — перечитайте одну карточку (`attorneyCaseProvider`/`ownerCaseProvider` со `swr(2 мин)`), а не 5–7 списков. Событие уходит из того же места, что и уведомление (`NotificationsService.emit`), внутри транзакции — с задержкой ~300 мс после неё.

`consultation:update` — `{ "consultationId": "uuid", "kind": "confirmed" | "declined" | … }` обеим сторонам (как уведомление `consultation_update`). Тела нет — перечитайте одну консультацию.

### Списки (**delta**)

| Ручка | Строки | `deletedIds` |
|---|---|---|
| `GET /users/me/cases?filter=…&updatedSince` | мои дела с `updated_at >= since` (фильтр-вкладка применяется к результату) | дела, которые сейчас **не** в этой вкладке (статус ушёл, удалено) |
| `GET /users/me/bids?filter=…&updatedSince` | мои ставки, у которых изменилась ставка **или** её дело | ставки не из этой вкладки |
| `GET /users/me/work?filter=…&updatedSince` | принятые ставки, у которых изменилась ставка или дело | строки не из этой вкладки (дело закрыто/открыто) |
| `GET /consultations?view=…&updatedSince` | мои консультации с `updated_at >= since` | не в этом `view` |
| `GET /invites?status=pending&updatedSince` | мои приглашения с `updated_at >= since` | при `status=pending` — больше не pending / дело не открыто / удалено |

`GET /saved-items` без дельты (нет `updated_at`, это ваши же действия). `GET /cases` (лента дел) — pull, без изменений. `PUT /cases/{id}/bid-draft` — как было; клиент шлёт не чаще раза в 2 с.

Индексы: `cases(client_id, updated_at)`, `consultations(attorney_id|client_id, updated_at)`, `case_invites(attorney_id, updated_at)`; у `bids` был.

---

## F. Уведомления, каналы, комментарии, Q&A

| Ручка / событие | Что нового |
|---|---|
| `GET /notifications?updatedSince` (**delta**) | у `notifications` появилась `updated_at` (двигается при прочтении и при переагрегации «и ещё N»). Строки — созданные или прочитанные с тех пор (`group` применяется, `q`/`cursor` игнорируются), новые сверху. `deletedIds` всегда пустой (старые строки уходят по сроку хранения — чистите локально по `createdAt`). |
| `POST /notifications/read` | ответ `{ "updated": n, "readIds": ["…"] }` — правьте ровно эти строки. |
| `notification:new` | как раньше несёт строку → вставляйте, не `invalidate`. |
| `channel:post` | `{ channelId, post: ChannelPostDto }` в комнату `channel:{id}` — приходит только тем, кто сделал `channel:watch` (экран канала открыт). |
| `channel:update` | `{ channelId, postId, lastPostAt }` в `user:{id}` **каждому подписчику** (без тела; из очереди fan-out батчами по 500, немуженным). Двигайте строку списка/непрочитанное локально. |
| `GET /channels?scope=subscribed|managed&updatedSince` (**delta**) | каналы, у которых `channels.updated_at >= since` (пост, настройки). `deletedIds` — забаненные/удалённые. Своя отписка/закрепление/архив — локально. Для `scope=discover` игнорируется. |
| `comment:new` | `{ postId, comment: CommentDto, parentCommentId }` в комнату `post:{id}`. Socket: `post:watch {postId}` / `post:unwatch {postId}` (ответ `{ok}`; пост должен быть опубликован). Свой комментарий — вставляйте из ответа `POST /posts/{id}/comments`, событие по своему комментарию тоже придёт (дедуп по `comment.id`). |
| `GET /questions?filter=mine&updatedSince` (**delta**) | только для клиента: свои вопросы с `updated_at >= since`, удалённые — в `deletedIds`. Остальные вкладки — pull (параметр игнорируется). |

Миграция `20261022190200`: `notifications.updated_at` + индекс `(user_id, updated_at)`, `legal_questions(author_id, updated_at)`.

Ассистент и `badge:update`: как раньше (сервер шлёт числа в `badge:update`; GET не нужен).

---

## I. Медиа

- Каждый объект S3 пишется с `Cache-Control: public, max-age=31536000, immutable`: в presigned POST (`POST /files/presign` → `upload.fields['Cache-Control']` — приложение и так пересылает все `fields`) и при серверных загрузках. Подписанные GET-ссылки тоже отдают этот заголовок (`response-cache-control`). Ключи уникальны, содержимое по ключу не меняется — кэшируйте по URL **без подписи** (так уже сделано в `app_network_image.dart`).
- На веб-сборке и в админке браузер теперь кэширует медиа сам.
- **Не сделано (нужны ключи/инфра владельца):** CloudFront signed URLs для чат/голос/файлов дел вместо прямого S3 (`cdnBaseUrl` в Админ → Интеграции → Хранилище уже используется для аватаров/постов). Размер чат-фото 1600 px / q82 — на стороне приложения.

---

## H. Звонки

- Каждое `call:*` событие (`call:incoming`, `call:accepted`, `call:ended`, `call:invite`, `call:participants`, `call:muted`, `call:removed`, `call:vote`, `call:ongoing`, `call:ongoing_ended`) несёт `seq` — растущий счётчик **на звонок** (Redis, живёт сутки). Правило клиента: resync `GET /calls/{id}` только при пропуске номера (`seq` > последний + 1) или раз в 30 с вместо 8. `seq = 0` означает «сервер без Redis» — тогда держите таймер.
- **Не сделано:** `auth:qr_approved` по socket (отдельный namespace `/qr` без входа — это зона безопасности, параллельный работник правит gateway/rate-limit). `POST /auth/qr/poll` остаётся; опрашивайте раз в 10 с вместо 2.

---

## J. Админка

- `GET /admin/counts` → `{ verificationQueue, openReports, supportUnread, trustQueue, approvalsPending }`, `ETag: W/"adm-…"` (= сами числа → `304`), `Cache-Control: private, max-age=30`. Все роли.
- `GET /admin/dashboard` → `Cache-Control: private, max-age=30`.
- В `apps/admin`: боковая панель опрашивает только `/admin/counts` (60 с; 120 с, когда окно не в фокусе); дашборд/поддержка/траст опрашивают свои `stats` только пока открыты.

---

## K. Мелочи (всё на стороне приложения)

`CancelToken` на suggest/поиск, склейка «лайк→анлайк», батч `read`/`delivered` раз в 1 с, локальная таблица переводов, `http_cache`/`messages` в вебе только в памяти — сервер менять не требовалось.

---

## Правила инвалидации (сводка для `SyncedListNotifier`)

| Список | Событие → правка строки | После reconnect |
|---|---|---|
| группы | `group:message` (lastMessage, order, unread+1), `group:update.card` | `GET /groups?updatedSince=syncedAt` |
| сообщения группы | `group:message` | `GET /groups/{id}/messages?afterId=<newestId>` (409 → страница) |
| темы группы | `group:update kind=topics` → `GET …/topics?updatedSince` | то же |
| мои дела / ставки / работа | `case:update` → перечитать одну карточку | `?updatedSince` |
| консультации | `consultation:update` → одну | `?updatedSince` |
| приглашения | `case:update kind=invite` | `?updatedSince` |
| уведомления | `notification:new` (вставить), ответ `read` (`readIds`) | `GET /notifications?updatedSince` |
| каналы | `channel:update` (строка), `channel:post` (открытый канал) | `GET /channels?scope=subscribed&updatedSince` |
| комментарии поста | `comment:new` (`post:watch`) | перечитать страницу 1 |
| мои вопросы | — | `GET /questions?filter=mine&updatedSince` |
| профиль адвоката | ответ `follow` (`followersCount`, `following`) | `If-None-Match` (304) |
| старт | — | `GET /me/session` с `If-None-Match`; bootstrap только при смене `bootstrapVersion` |

Все `409 SYNC_TOO_OLD` → сброс `synced_at` и полная загрузка.

---

## Что осталось владельцу / другим работникам

1. CloudFront signed URLs для приватных бакетов (чат, голос, файлы дел) — infra + ключи (пакет I).
2. `auth:qr_approved` по socket — после того как security-работник закончит gateway/rate-limit (пакет H).
3. Миграции `20261022190000`, `…190100`, `…190200` применяются обычным `prisma migrate deploy` (только индексы и одна колонка с default — без простоя).
