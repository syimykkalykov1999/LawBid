# План «экономного клиента» — как у Telegram / Instagram / WhatsApp (2026-10-22)

Только чтение кода, ничего не менялось. Проверено по `origin/main` = `c1e6f27e3` (после PR #238–#244). Пути — от `apps/`. Цифры — оценки при **1 млн активных в день (DAU)**, у каждого ≈ 8 запусков приложения в день, ≈ 100 просмотренных постов, ≈ 50 сообщений в чатах и группах.

Цель: каждый поток данных «телефон ↔ сервер» в приложении (`mobile`, включая веб-сборку) и в админке (`admin`) работает как у больших мессенджеров: **дельты вместо полной перезагрузки, события от сервера вместо опроса, кэш на устройстве с лимитом и кнопкой «Очистить кэш», склейка и задержка запросов, курсорная пагинация, ETag/`updatedSince` при повторном чтении списков, мгновенный (оптимистичный) отклик на лайк/подписку, и никаких «болтливых» ручек**, которые при миллионах пользователей съедают сервер и счёт AWS.

Stories в план **не входят**: функция выключена до следующего релиза (`storiesEnabled = false`), по слову владельца.

---

## 1. Инвентарь: всё, что ходит в API

Обозначения в колонке «Как грузится сейчас»:
- **full** — каждое открытие экрана = новый GET всей первой страницы (провайдер `autoDispose`, в памяти не держится);
- **keep 5m** — список живёт 5 мин после ухода с экрана (`PagedNotifier.keepAliveFor`), потом full;
- **saved p1** — первая страница лежит в Drift (`cached_pages`) и показывается до ответа сервера (`SavedJson`);
- **ETag(mem)** — GET получает 304 через `EtagCacheInterceptor` (только пока процесс жив; 120 записей / 16 МБ в памяти, `core/network/etag_cache_interceptor.dart`). **Важно:** 304 экономит байты, но **не** работу сервера — Express считает ETag уже после того, как контроллер сходил в базу и собрал ответ;
- **socket** — сервер шлёт событие (`features/chat/data/realtime_client.dart`, список событий строки 42–79);
- **poll N** — таймер опроса;
- **cursor** — курсорная пагинация (`?cursor`), есть у всех списков контракта.

| # | Функция | Ручки | Как грузится сейчас | Где в коде | Риск / цена |
|---|---|---|---|---|---|
| 1 | **Старт и сессия** | `GET /config/bootstrap`, `GET /users/me`, `GET /i18n/bundle/{lang}?since`, `GET /badges`, `POST /push-tokens`, `PUT /me/timezone`, `GET /contacts/sync` (раз в сутки) | bootstrap и i18n — параллельно при каждом холодном старте (`core/startup/app_startup.dart:43-58`); bootstrap **не хранится на диске** (комментарий в `core/feature_flags/feature_flags_providers.dart:26-34`), значит после перезапуска процесса ETag в памяти пуст → полный ответ; `/users/me` через `onboarding_repository.dart:85`; `/badges` при сборке `BadgesNotifier` и после каждого reconnect (`notifications/application/notifications_providers.dart:62-68`); timezone при resume (`timezone_sync.dart`) | см. слева | ≈ 6 запросов × 8 стартов = **~50 запр./польз./день → 50 млн/день**. Bootstrap ≈ 2–4 КБ, `/users/me` ≈ 3 КБ (32 поля с вложенными). Самое дорогое — то, что это синхронные запросы на критическом пути старта |
| 2 | **Лента (feed)** | `GET /feed?cursor,limit`, `GET /feed/preferences`, `PUT /feed/preferences`, `GET /search/latest-posts` (вкладка «Новое»), `GET /posts/{id}` | cursor; **saved p1** (`social/application/social_providers.dart:145-200`, `social_repository.cachedFeed`); сервер кэширует первую страницу в Redis 60 с (`api/src/modules/feed/feed.service.ts:45`); повторный тап по вкладке = scroll-to-top + refresh (`core/navigation/shell/main_shell.dart:70-76`); событий о новых постах нет (как у Instagram — pull) | `social_providers.dart`, `feed/application/feed_topics.dart` (темы в SharedPreferences) | ≈ 10 обновлений + 10 подгрузок = **20 запр./день**, страница ≈ 20 постов × 63 поля ≈ 30–40 КБ → ≈ 0,7 МБ/день/польз. Умеренно. Нет «N новых» без полной перезагрузки |
| 3 | **Просмотры постов** | `POST /posts/{id}/view` — **по одному запросу на каждый пост** (`social_repository.dart:676`, `social_providers.dart:751-759`, дедуп только в памяти сессии) | отдельный POST на пост | `social_providers.dart:751` | **~80–100 запр./день → 80–100 млн/день**, самая «болтливая» ручка приложения. Показы (`impression`, `profileVisit`) уже батчатся в `POST /posts/events` (4 с, повтор не чаще 30 мин, `post_insights_providers.dart:35-45`) — просмотры должны ехать там же |
| 4 | **Лайки / сохранения / репосты / шеры** | `POST/DELETE /posts/{id}/like`, `/repost`, `POST /posts/{id}/share`, `POST/DELETE /saved-items`, `GET /posts/{id}/likes`, `/reposts` | **оптимистично** через `PostOverrides` с откатом (`social_providers.dart:302-398`); репост инвалидирует 2 списка (`:343-344`) | `SocialActions` | ≈ 5–10 запр./день, по 1 на действие. Хорошо. Мелочь: `_guard` не склеивает «лайк-анлайк-лайк» за секунду в один запрос |
| 5 | **Комментарии** | `GET /posts/{id}/comments?cursor`, `GET /comments/{id}/replies?cursor`, `POST /posts/{id}/comments`, `POST/DELETE /comments/{id}/like`, `DELETE /comments/{id}` | cursor, **full** при каждом открытии; после отправки комментария — `invalidate(commentsProvider)` = полная перезагрузка страницы 1 (`social_providers.dart:455-456`); событий о новых комментариях нет | `CommentsNotifier`, `RepliesNotifier` | ≈ 10–20 запр./день. Средне: лишняя страница после каждого своего комментария; чужие комментарии видны только после повторного открытия |
| 6 | **Подписки (follows)** | `POST/DELETE /attorneys/{id}/follow`, `GET /attorneys/{id}/followers`, `/following`, `GET /users/me/following`, `GET /suggestions/attorneys` | **оптимистично** (`FollowOverrides`), но после каждой подписки — `invalidate` профиля ×2, списка подписок и рекомендаций = **до 4 повторных GET за одно нажатие** (`social_providers.dart:527-530`); `suggestionsProvider` — full при каждом показе | `SocialActions.follow` | ≈ 5 запр./день, но ×4 на действие. Низко-средне |
| 7 | **Reels** | `GET /reels?cursor,limit,practice`, `GET /videos/{id}`, `POST /videos/uploads`, `DELETE /videos/{id}` | cursor, full; видео — Bunny CDN; обложки — `AppImageCaches.feed`; просмотры через `POST /posts/{id}/view` (см. #3) | `reels/application/reels_providers.dart`, `reel_publish_job.dart` (загрузка в памяти — аудит #4 §3) | ≈ 10 запр./день + трафик видео. Главная цена — байты видео, их режет CDN, не API |
| 8 | **Вопросы-ответы (Q&A)** | `GET /questions?q,…,cursor`, `GET /questions/summary`, `GET /questions/{id}`, `POST /questions`, `PUT /questions/{id}/answer`, `/best`, `/close`, `PUT/DELETE …/answers/{id}/like` | cursor, **full** (без keepAlive: `legal_qa/application/*.dart:22-44`); 5 `invalidate` после действий; событий нет | `QuestionsNotifier`, `questionDetailProvider` | ≈ 5–10 запр./день. Низко. Каждое открытие вкладки = страница 1 + summary |
| 9 | **Профиль адвоката (чужой)** | `GET /attorneys/{username}`, `GET /attorneys/{id}/posts?kind,media` (×4 вкладки: посты/новости/фото/reels), `GET /attorneys/{id}/reviews/summary`, `/reviews`, `/reviews/mine`, `GET /trust/attorneys/{id}`, `GET /stars/users/{id}/gifts`, `POST /posts/events` (profileVisit, батч) | все **full** (`profile/application/profile_providers.dart:37-54` — `autoDispose.family`); ETag(mem) помогает только повторному открытию в той же сессии | `attorney_profile_view.dart` (1 614 строк) | **6–8 GET на одно открытие**, профиль ≈ 41 поле ≈ 4–6 КБ + посты 30 КБ. ≈ 5 открытий/день → **~35 запр./день → 35 млн/день**. Высоко по числу запросов |
| 10 | **Свой профиль** | `GET /users/me/profile`, `GET /attorneys/me/profile`, `/me/stats`, `/me/practice-areas`, `PATCH …`, аватар: `POST /files/presign` → S3 → `POST /files/{id}/confirm` + опрос скана **раз в 1 с** (`profile/application/avatar_upload_controller.dart:55,110`) | **saved p1** (`profile_providers.dart:58+`), затем full | там же | ≈ 5 запр./день. Опрос скана аватара — редко, ок |
| 11 | **Профиль клиента** | `GET /clients/{username}`, `GET /clients/{id}/reviews`, `/summary`, `/mine`, `GET /users/{id}/reposts` | full | `client_profile_view.dart`, `client_social_profile.dart` | ≈ 3 запр. на открытие. Низко |
| 12 | **Дела / ставки / предложения** | `GET /cases` (17 фильтров), `GET /cases/{id}`, `/bids`, `/updates`, `/activity`, `/workspace`, `/files`, `/tasks`, `/contacts`, `GET/PUT/DELETE /cases/{id}/bid-draft`, `POST /cases/{id}/bids`, `/bids/{id}/accept|decline|counter|withdraw`, `POST /cases/{id}/view`, `POST /cases/{id}/updates/seen`, `GET /users/me/cases`, `/bids`, `/work`, `/saved-items`, `GET /users/me/running-timer`, `GET /invites`, `/cases/{id}/invites`, `GET /cases/{caseId}/conflict-check` | списки — cursor, **keep 5m** (`cases/application/cases_providers.dart:139`); карточка дела — full (`attorneyCaseProvider`, `ownerCaseProvider` — `autoDispose.family`); **34 `invalidate`**: одна ставка перезагружает 5–7 списков (`:387-401`); **событий по делам нет** — новая ставка видна только по пушу/бейджу или повторному открытию | `cases_providers.dart`, `mine_views.dart`, `attorney_case_screen.dart`, `owner_case_screen.dart` | ≈ 20–30 запр./день у активного адвоката; карточка дела ≈ 40 полей ≈ 4 КБ + ставки. Средне-высоко: лишние перезагрузки после каждого действия, и `POST /cases/{id}/view` — отдельный запрос на просмотр |
| 13 | **Консультации** | `GET /consultations?view,cursor`, `/settings`, `/slots?attorneyId,from,days`, `/consultations/{id}`, `POST …/confirm|decline|cancel|reschedule` | cursor, full (`consultations/application/consultations_providers.dart:18-48`); 8 `invalidate`; событий нет; `ClockTicker` — только UI-часы, без сети | там же | ≈ 3–5 запр./день. Низко |
| 14 | **Уведомления и бейджи** | `GET /badges`, `GET /notifications?cursor,group,q`, `POST /notifications/read`, `GET/PUT /notification-settings*`, `GET /notification-settings/new-cases` | бейджи: один GET на старте + **socket `badge:update`** (ассистент при каждом событии делает GET — `notifications_providers.dart:53-55`); список колокольчика — **full** и `invalidate` на **каждый** `notification:new` пока он открыт (`:59-61`); настройки перечитываются при каждом reconnect (`:63`) | `notifications_providers.dart` | ≈ 5–10 запр./день; при открытом колокольчике — перезагрузка страницы (≈ 8 полей × 20 ≈ 4 КБ) на каждое событие. Низко-средне |
| 15 | **Поиск** | `GET /search/suggest?q` (150 мс), `/search/attorneys|cases|posts|people|latest-posts` (300 мс, ≥ 2 символа — `search/presentation/screens/search_screen.dart:53,151,158`), `/search/tags`, `/search/trending-tags`, `/search/practices`, `/tags/{tag}/posts`, `POST /search/clicks` | debounce есть; списки cursor, full; история — Drift `recent_searches` (локально); `trendingTagsProvider` — full при каждом открытии | `search_providers.dart` | ≈ 10–20 запр./день. Низко. Нет `CancelToken` — брошенный запрос на 3-м символе всё равно долетает до сервера |
| 16 | **Контакты** | `GET/POST/DELETE /contacts/sync`, `PUT /contacts/sync/find-by-phone`, `PUT /contacts/sync/notify-joined` | **уже дельта**: хэш-проверка, только изменения, «X зарегистрировался» с сервера (PR #238, `2df6b0da2`), повтор раз в 24 ч (`contacts_sync/application/contacts_background_sync.dart:16`) | там же | ≈ 1–2 запр./день. Сделано |
| 17 | **Чаты (список)** | `GET /conversations?cursor,updatedSince,folder,q`, `/conversations/folders/counts`, `/conversations/requests/count`, `POST /conversations/{id}/read`, `/delivered` | **уже дельта**: события применяются к строке, `updatedSince` после разрыва (`8d96abbe3`, `chat/application/chat_providers.dart:82-191`), keep 5m, saved p1 | там же | Сделано. Остаток: при открытии «Чаты» идут ещё `folders/counts` и `requests/count` + группы + каналы + приглашения (`inbox_screen.dart` смотрит ~20 провайдеров) — 4–6 GET на вкладку |
| 18 | **Чаты (сообщения)** | `GET /conversations/{id}/messages?cursor,afterId,only`, `POST …/messages`, `PATCH`, `DELETE`, `PUT …/reaction`, `/pin`, `/listened`, `/translate`, `GET /conversations/{id}/pins`, `/storage`, `POST /messages/forward` | **сообщения не хранятся на телефоне** (аудит #1, п. 6 — ещё открыт): каждое открытие чата = GET страницы 1; `messagesAfter` только после reconnect (`chat_providers.dart:1624`); текстовый outbox в Drift, медиа-outbox в памяти (аудит #4 §3); `message:*` по socket; typing/presence по socket | `chat_repository.dart:656-666`, `social_local_database.dart` | ≈ 10 открытий × 1 GET × ≈ 25 КБ (50 сообщений × 28 полей) = **10 запр., 250 КБ/день**. Средне. WhatsApp на это тратит 0 |
| 19 | **Группы** | `GET /groups?cursor,archived`, `GET /groups/{id}`, `/messages?topicId,cursor,limit` (**нет `afterId`**), `/topics`, `/requests`, `/shared`, `/discover`, `/search`, `POST /groups/{id}/messages`, `/read`, `/polls…`, `GET /groups/invites` | список **keep 5m**, но **перезагружает страницу 1 на каждый `group:message` / `group:update` / `badge:update`** (debounce 600 мс, `groups/application/group_providers.dart:44-54`) — тот же изъян, что был у списка чатов до `8d96abbe3`; карточка группы и темы перечитываются на каждый `group:update` (`:137-152`); сообщения: `group:message` применяется живьём, но **после reconnect — полная перезагрузка** (`:371-373`, нет `afterId`); fan-out на сервере уже через очередь (`4871a0099`) | `group_providers.dart` | **Самое дорогое по байтам:** участник группы с 200 сообщениями/день = 200 × GET списка (≈ 20 групп × 42 поля ≈ 40 КБ) = **~8 МБ/день и 200 запр./день на одного** |
| 20 | **Каналы** | `GET /channels?scope,archived,q,cursor`, `GET /channels/{ref}`, `/posts?cursor`, `/posts/{id}`, `/comments`, `POST /channels/{id}/views`, `PUT …/reaction`, `PUT/DELETE …/subscription` | список — full (`channels/application/channels_providers.dart:33-45`); посты cursor, full; socket-комната `channel:{id}` используется **только для звонков** (`call:ongoing`), новых постов канала сервер не шлёт; `POST /channels/{id}/views` — отдельный запрос | там же; `api/src/modules/realtime/realtime.gateway.ts:451-481` | ≈ 5–10 запр./день. Низко-средне |
| 21 | **Звонки** | `POST /conversations|groups|channels/{id}/calls`, `GET /calls/{id}` (**resync каждые 8 с во время звонка**, `calls/application/call_controller.dart:298,1536`), `GET /calls/ice-servers` (раз в 6 ч), `GET /calls/ongoing`, `GET /groups|channels/{id}/call`, `GET /calls/history?cursor`, signalling по socket | **уже события**: `call:ongoing` / `call:ongoing_ended` вместо опроса 10–30 с (`32140085a`); остался 8-секундный resync внутри живого звонка | `call_controller.dart`, `groups/application/group_call_port.dart` | Сделано, кроме resync: 10-минутный звонок = 75 GET на участника. При 1 % пользователей в звонке одновременно ≈ 1,2 тыс. rps. Низко-средне |
| 22 | **Настройки (экран)** | при открытии «Настройки»: `GET /me/promotions`, `GET /partners/me`, `GET /referrals/me`, `GET /support/tickets` (непрочитанные), плюс `GET /users/me/privacy`, `/users/me/blocks`, `/auth/sessions`, `/users/me/activity-status` на подэкранах | **4 GET при каждом открытии Настроек** (`profile/presentation/screens/settings_screen.dart` смотрит `myPromotionsProvider`, `partnerMeProvider`, `referralMeProvider`, `supportUnreadProvider` — все `autoDispose`) | `settings_screen.dart` | ≈ 8–12 запр./день. Средне: данные меняются раз в неделю, а читаются по 4 раза при каждом заходе |
| 23 | **Фичефлаги и конфиг** | `GET /config/bootstrap` (флаги + лимиты + юрдоки + языки) | см. #1: при каждом старте, компилированные значения по умолчанию, **нет копии на диске**, ETag только в памяти | `core/feature_flags/*`, `api/src/modules/feature-flags` (Redis-кэш на сервере есть) | ≈ 8 запр./день, но на критическом пути старта. Средне |
| 24 | **Переводы интерфейса (i18n)** | `GET /i18n/bundle/{lang}?since=version`, `GET /i18n/languages` | **уже дельта** и Drift (`core/l10n/l10n_database.dart`, `i18n_api_client.dart:112-118`) | там же | Сделано. Перевод контента (`POST /translations`) кэшируется на сервере 7 дней (`translation.service.ts:28`), на телефоне не хранится — повторное открытие переводит заново (дёшево, но лишний запрос) |
| 25 | **Платежи / подписка / планы / звёзды / пакеты** | `GET /subscriptions/me`, `/pricing`, `/plans?audience`, `/me/entitlements`, `/subscriptions/payments`, `/client-plans/me`, `/stars`, `/stars/gifts`, `/stars/history`, `/bid-packs`, `/verification/client/me`, `/payments/history|summary|settings`, `/payout-account` | все full; **7 экранов перечитывают при каждом `AppLifecycleState.resumed`** (subscription, stars, client_plan, client_badge, bid_packs, payout_account, case_payments_card) — нужно после возврата с веб-оплаты, но срабатывает и просто при сворачивании; `/pricing`, `/plans`, `/stars/gifts` — справочники, меняются раз в месяц | `subscription/application/subscription_providers.dart`, `*_screen.dart` | ≈ 5–15 запр./день. Низко-средне |
| 26 | **Верификация / доверие** | `GET /verification/me`, `/verification/requests/{id}`, `GET /trust/me`, `/trust/attorneys/{id}` | full; 20-секундный таймер в `license_sheet.dart:93` — только UI-отсчёт, без сети | `verification/*`, `trust/*` | ≈ 2–5 запр./день. Низко |
| 27 | **Поддержка** | `GET /support/info`, `/support/tickets?cursor`, `/support/tickets/{id}`, `POST …/messages`, `/close` | full; ответы агента приходят пушем, **socket-события для тикета нет** — экран тикета перечитывается при открытии | `support/*` | ≈ 1–3 запр./день. Низко |
| 28 | **Команда / ассистенты / задачи** | `GET /team`, `/team/activity`, `/team/requests`, `GET /assistants/me`, `GET /tasks`, `/tasks/people`, `/tasks/places`, `PATCH /tasks/{id}` | `assistantMeProvider` держится всю сессию; остальное full; 12 `invalidate` | `team/application/*` | ≈ 5–10 запр./день у адвокатов с командой. Низко |
| 29 | **Юрдокументы, страны, практики, стикеры, шаблоны, сроки** | `GET /legal/documents`, `/legal/documents/{type}`, `GET /countries`, `GET /practice-areas` (**уже ETag + `Cache-Control: public, max-age`** на сервере, `profiles/controllers/practice-areas.controller.ts:37-56`), `GET /stickers`, `/stickers/featured`, `/stickers/packs/{ref}`, `GET /document-templates?cursor`, `GET /deadlines/rules|holidays|calculate` | legal/stickers/practices — `FutureProvider` без `autoDispose` (раз за сессию); templates/deadlines — full | см. слева | ≈ 3–6 запр./день. Низко. Это справочники — им место на диске с ETag и сроком жизни |
| 30 | **Присутствие / typing** | socket `presence:watch|unwatch|update`, `typing:*`; `GET/PUT /users/me/activity-status` | socket; голосовой typing каждые 2 с только пока держится кнопка записи (`conversation_screen.dart:2181`) | `chat/application/presence_providers.dart` | Сделано |
| 31 | **Аналитика / падения** | `POST /app-events` (батч 50, каждые 60 с, очередь 200 в SharedPreferences — `core/diagnostics/app_events.dart:22-26`), `POST /crash-reports` | батч | там же | ≈ 10 запр./день. Сделано |
| 32 | **Веб-вход по QR** | `POST /auth/qr`, `POST /auth/qr/poll` **каждые 2 с** пока открыт экран QR (`auth/presentation/screens/web_qr_login_screen.dart:27,59`) | poll 2 с | там же | Только во время входа (≈ 30 запросов за минуту ожидания). Низко, но это единственный «чистый» опрос в приложении — его место в socket `auth:qr_approved` |
| 33 | **Медиа (картинки/файлы)** | S3 подписанные ссылки 1 ч (чат, голос, файлы дел), CDN для аватаров/постов | `flutter_cache_manager`: два кэша по **штукам** (2 000 / 1 000 файлов, 7 дней, `core/media/app_image_cache.dart`), лимита в **байтах** нет, экрана «Данные и память» нет; `Cache-Control` на медиа сервер не ставит (аудит #1 п. 9 — открыт) | `app_image_cache.dart`, `app_network_image.dart` | Главная статья **байтов**: лента ≈ 100 постов × 150 КБ = 15 МБ/день/польз. без учёта повторов. CDN-заголовки режут это втрое |
| 34 | **Веб-сборка (Flutter web)** | то же, что телефон | Drift через sqlite3.wasm + worker, при сбое — база в памяти вкладки (`core/persistence/drift_web.dart`); `EtagCacheInterceptor` работает и в браузере, но **браузер сам не кэширует** ответы с `Authorization` без `Cache-Control: private` — поэтому после перезагрузки страницы всё качается заново; `flutter_cache_manager` в вебе хранит мало | `drift_web.dart`, `web/` | Как телефон, но каждая перезагрузка вкладки = холодный старт |
| 35 | **Админка (Next.js)** | опрос раз в 60 с (`admin/src/lib/live.ts`): боковая панель — `/admin/dashboard`, `/admin/support/stats`, `/admin/trust/stats`, `/admin/approvals/count` (`components/shell/use-nav-counts.ts`); страницы — `/admin/economy`, `/admin/sessions`, `/admin/system-health`, `/admin/support` (список, команда, тикет), `/admin/approvals`, `/admin/workspace`, legal-workspace; TanStack Query `staleTime 30 s`, `refetchOnWindowFocus: false`, только видимая вкладка, откат до 5 мин после 429 | poll 60 с | `live.ts`, `use-nav-counts.ts`, `app/providers.tsx:17-18` | **4–10 запр./мин на открытую вкладку**; при 50 админах ≈ 0,1 rps — для AWS это ничто. Риск только один: `/admin/dashboard` — тяжёлый агрегат, который считается каждую минуту на каждую вкладку |

Итог по «болтливости» (запросов на пользователя в день, грубо): просмотры постов **~90**, старт **~50**, профили **~35**, группы (у активных) **~50–200**, дела **~25**, лента **~20**, настройки/платежи **~15**, остальное **~40**. Всего **≈ 300–400 запр./польз./день → 300–400 млн/день при 1 млн DAU**, из них **≈ 60 % можно убрать** пакетами ниже (батч просмотров, дельты списков, кэш на диске).

---

## 2. Что уже сделано — не планируем заново

Из DONE аудитов #1–#4 и журнала PR #238–#244:

- **Чаты (список)**: события применяются к строке, `updatedSince` после разрыва, keep 5 мин, первая страница в Drift (`8d96abbe3`).
- **Звонки**: `call:ongoing` / `call:ongoing_ended` по socket вместо опросов 10/30 с (`32140085a`).
- **Контакты**: Telegram-подобная дельта с хэшем, «X зарегистрировался» с сервера, один запрос, часовой лимит (`2df6b0da2`, `1044f107a`, PR #238).
- **Группы/каналы**: fan-out в BullMQ, бейджи батчами, пуши параллельно (`4871a0099`); лимиты групп/каналов восстановлены и настраиваются (`bf7c78be8`).
- **Сокеты**: отзыв сессии через publish, sharded Redis adapter (`43aba7d55`); keep-alive 310 с (`8db5079cf`).
- **Логи запросов**: только ошибки, медленные и 1 % выборка (`585a0ddd9`).
- **Картинки**: два кэша 2 000 / 1 000 файлов, 7 дней; чистка файлов дел через 7 дней (`b62e09ea9`).
- **ETag/304** на всех JSON-ответах (сервер, 2026-10-15) + `EtagCacheInterceptor` в памяти телефона; `/practice-areas` с `max-age`.
- **Лента**: первая страница в Redis 60 с, индексы (`docs/perf/2026-10-20-local-feed.md`), первая страница в Drift, оптимистичные лайки/сохранения/репосты, батч показов `POST /posts/events`.
- **Подписки** — оптимистично (`FollowOverrides`).
- **i18n** — дельта `?since=version` в Drift.
- **Аналитика** — батч 50 / 60 с с очередью на диске.
- **Текстовый outbox** чата в Drift; `Idempotency-Key` на POST; retry с backoff; reconnect с jitter.
- **Пагинация** — курсорная у всех списков контракта (895 путей, все `GET …?cursor`).
- **Поиск** — debounce 300 мс / 150 мс, ≥ 2 символа, история локально.
- **Бейджи** — Redis на сервере, `badge:update` по socket.
- **Админка** — правило «один ключ опрашивается в одном месте», 60 с, только видимая вкладка, откат после 429 (`live.ts`).
- **Инфра** — автоскейл worker по глубине очереди, Multi-AZ, VPC endpoints (`35616450c`), SLO-алармы (`ba80f5741`).

Открыто из прежних аудитов и **входит** в этот план: сообщения в Drift (аудит #1 п. 6), медиа через CloudFront + `immutable` (п. 9), экран «Данные и память» (п. 8, TODO в `app_image_cache.dart`), постоянная очередь медиа-отправки (аудит #4 §3 — здесь только как таблица кэш-системы, сама очередь — отдельная задача).

---

## 3. Как это делают другие (источники)

1. **Telegram — `pts` и `getDifference`.** У клиента есть счётчик состояния `pts`; каждое событие несёт новый `pts`. Если пришло событие с «дыркой» (pts ушёл дальше, чем ожидалось) или после разрыва, клиент зовёт `updates.getDifference(pts, date, qts)` и получает **только то, что пропустил**; при слишком большой дыре — `differenceTooLong` и полная перезагрузка (`pts_total_limit`). Каналы/чаты, открытые на экране, — отдельный `channel pts`. Это ровно наш `updatedSince` + socket-события, обобщённые на все списки. Источники: [core.telegram.org/api/updates](https://core.telegram.org/api/updates), [updates.getDifference](https://core.telegram.org/method/updates.getDifference). Для контактов — хэш и `contactsNotModified` ([api/offsets](https://core.telegram.org/api/offsets)).
2. **Telegram — «Данные и память».** Лимит кэша в байтах, «Хранить медиа» 3 дня / 1 неделя / 1 месяц / всегда, «Очистить кэш» по типам, размер по чатам; всё, что стёрли, докачивается при обращении ([telegram.org/blog/cache-and-stickers](https://telegram.org/blog/cache-and-stickers)).
3. **Instagram — cache-first лента.** Сначала показывают сохранённую ленту, потом подменяют свежей; главная ловушка — свежий ответ затирает только что поставленный лайк, поэтому локальные изменения живут поверх ответа сервера (наш `PostOverrides`). Ранжирование — на сервере, клиент тянет курсором и предзагружает следующую страницу. Нет «push ленты»: новые посты — pull при обновлении. [Making instagram.com faster, part 3: cache first](https://instagram-engineering.com/making-instagram-com-faster-part-3-cache-first-6f3f130b9669).
4. **WhatsApp — история на устройстве.** Сервер не хранит сообщения после доставки; телефон — источник истории, при входе с нового устройства состояние (архив, настройки) синхронизируется отдельным зашифрованным «app state». То есть чат открывается без единого GET. [engineering.fb.com — WhatsApp multi-device](https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/), [WhatsApp Security Whitepaper](https://www.whatsapp.com/security/WhatsApp-Security-Whitepaper.pdf).
5. **HTTP ETag / If-None-Match / 304.** Слабое сравнение, 304 без тела с теми же `Cache-Control`/`ETag`; для записи — 412. Для ответов с `Authorization` браузер кэширует только при `Cache-Control: private`. [MDN If-None-Match](https://developer.mozilla.org/docs/Web/HTTP/Headers/If-None-Match), [RFC 9110 §13](https://www.rfc-editor.org/rfc/rfc9110#section-13).
6. **Riverpod + Drift offline-first.** Экран подписан на `watch()` локальной таблицы; сеть пишет в таблицу, а не в экран; outbox для записей; `updated_at` для last-write-wins. [DEV: offline-first sync with Drift and Riverpod](https://dev.to/mohamed_haizoun_ca3869828/offline-first-sync-in-flutter-with-drift-and-riverpod-5een), [GeekyAnts blueprint](https://geekyants.com/blog/offline-first-flutter-implementation-blueprint-for-real-world-apps), [drift docs](https://drift.simonbinder.eu/), [riverpod.dev](https://riverpod.dev/).
7. **Socket.IO rooms + Redis adapter.** `io.to(room).emit` доходит только до инстансов, где есть подписчики комнаты; sharded adapter на Redis 7. У нас уже есть комнаты `user:{id}`, `conversation:{id}`, `channel:{id}`, `presence:{id}` (`realtime.gateway.ts:280-539`). [socket.io/docs/v4/rooms](https://socket.io/docs/v4/rooms/), [adapter](https://socket.io/docs/v4/adapter/), [redis adapter](https://socket.io/docs/v4/redis-adapter/).
8. **Курсорная пагинация.** Keyset-курсор (`created_at, id`) вместо offset: без пропусков и дублей при вставках, стоимость не растёт с глубиной; курсор непрозрачный и может протухать. [Stainless: offset vs cursor vs keyset](https://www.stainless.com/sdk-api-best-practices/how-to-implement-rest-api-pagination-offset-cursor-keyset), [Keyhole: cursor vs offset](https://keyholesoftware.com/cursor-based-pagination-vs-offset-pagination-preserving-user-navigation-at-scale/).
9. **flutter_cache_manager** — `Config(maxNrOfCacheObjects, stalePeriod)`; лимита в байтах нет — его считаем сами по `CacheInfoRepository` ([pub.dev/packages/flutter_cache_manager](https://pub.dev/packages/flutter_cache_manager)).

---

## 4. Целевая схема по функциям — пакеты работ

Два работника параллельно: **API** (NestJS, Prisma, Socket.IO) и **MOBILE** (Flutter, Riverpod, Drift). Пакеты упорядочены по сэкономленным деньгам. Контракт не ломаем: новые поля и query-параметры **необязательные**, новые события — только добавляются; после каждого API-пакета `sh packages/api-contract/generate.sh` и `oasdiff` без breaking.

### Общий механизм: «sync-состояние» списка (используют пакеты B, D, E, F, G)

**API (общий код, `common/sync/`):**
- Любой список, у которого есть `updated_at`, принимает `?updatedSince=<ISO>` и отвечает `{data: [изменённые], meta: {deletedIds: [...], syncedAt: <серверное время>}}`. Удалённые/скрытые строки отдаются **id-ами**, не объектами (`deletedIds` — новое необязательное поле `ResponseMetaDto`).
- `syncedAt` берётся **со строк** (`max(updated_at)` ответа), не с часов телефона, чтобы не было дыр на границе.
- Если `updatedSince` старше 7 дней — ответ `409 SYNC_TOO_OLD` → клиент делает полную загрузку (аналог `differenceTooLong`).
- Проверять `updatedSince` до запроса в базу и, если `max(updated_at)` по индексу не изменился, сразу `304` (дешёвая проверка одним индексным чтением; это и есть «настоящий» ETag, который не требует собирать тело).

**MOBILE (общий код, `core/sync/`):**
- `SyncedListNotifier<T>` поверх `PagedNotifier`: держит `syncedAt` в Drift (`sync_state(owner, list_key, synced_at, etag)`), при `build()` показывает Drift-копию, зовёт `updatedSince`, применяет upsert/delete; socket-событие нужного типа применяется к строке **без запроса**; `reconnected` → один `updatedSince`; `409` → полная загрузка.
- Правило «ни одного `ref.invalidate` после действия над одной строкой»: действие возвращает обновлённый объект, его кладём в список; `invalidate` остаётся только для чужих списков, которым нет события.

---

### Пакет A — батч просмотров (экономия ≈ 100 млн запр./день, ≈ 30 % всего трафика API)

**API:** `POST /posts/events` принимает новый `kind: "view"` (enum расширяется, старые клиенты не затронуты) и, по желанию, `kind: "case_view"`, `"channel_view"` с `caseId`/`channelId`. Правило «1 просмотр на зрителя в 24 ч» остаётся на сервере (Redis `SET NX EX 86400`), счётчики обновляются батчем `UPDATE … SET view_count = view_count + n WHERE id IN (...)`. Старые `POST /posts/{id}/view`, `/cases/{id}/view`, `/channels/{id}/views` живут, но помечаются `deprecated` в OpenAPI.
**MOBILE:** `recordPostView` → `PostEventsBatcher.add(id, view)` (тот же `post_insights_providers.dart`: flush через 4 с, не чаще 30 мин на пост, дедуп на диске в `event_dedup(owner, key, until)`), оптимистичное `+1` остаётся. Очередь событий — в Drift (сейчас только память) с лимитом 500 строк.
**Тесты:** API — e2e: 3 события в одном батче = 3 счётчика +1, повтор в тот же день не считается; mobile — `PostEventsBatcher` склеивает 20 просмотров в один POST, переживает перезапуск.

### Пакет B — группы как чаты: дельты и события (экономия ≈ 8 МБ/день у активных, −200 запр./день)

**API:**
- `GET /groups?updatedSince` по общему механизму; `group:update` несёт **изменённую карточку** (`group: GroupDto`, `kind`), а не только `groupId`, чтобы клиент правил строку без GET. `group:message` уже несёт сообщение — к нему добавить `unreadCount`/`lastMessage` группы (необязательные поля).
- `GET /groups/{id}/messages?afterId=<messageId>` (как у `conversations`): всё после id, лимит 200, иначе `409` → страница.
- `GET /groups/{id}/topics?updatedSince`.
- Индексы: `group_members(user_id, group_id)` + `groups(updated_at)` — проверить, что `updated_at` группы двигается на каждое сообщение (иначе двигать `last_message_at` и фильтровать по нему); `group_messages(group_id, id)` для `afterId`.
**MOBILE:** `GroupsNotifier` → `SyncedListNotifier`: `group:message` обновляет строку (lastMessage, unread, порядок), `group:update` подменяет карточку, `badge:update` **не трогает список**; `reconnected` → `updatedSince`. Сообщения группы: `reconnected` → `afterId`, а не `load()`. Карточка группы/темы: перечитывать только если `group:update.kind` ∈ {members, settings, topics}.
**Тесты:** API — spec на `updatedSince` c `deletedIds` (вышел из группы → id в deleted); mobile — 50 событий `group:message` = 0 GET.

### Пакет C — сообщения чатов и групп на устройстве (−10 запр. и −250 КБ/день, мгновенное открытие)

**MOBILE (основная работа):** таблица `messages(owner, conversation_id, id, created_at, json, bytes)` + `conversation_sync(owner, conversation_id, oldest_id, newest_id, complete)` в Drift. Открытие чата: `watch()` таблицы → экран; сеть: если есть `newest_id` → `messagesAfter`, иначе страница 1. Пагинация вверх — из Drift, пока `complete=false` — с сервера. Все `message:*` события пишутся в таблицу (экран обновляется потоком). Лимит: 50 МБ текста на аккаунт, LRU по чатам (см. §5); тела с `enc:` не расшифровываем на диске — храним как пришло (сервер отдаёт plaintext — хранить как есть, Drift-файл под защитой ОС; на веб-сборке — только память, см. §5).
**API:** `GET /conversations/{id}/messages?afterId` уже есть; добавить `?beforeId` для дозагрузки вверх по id (сейчас курсор). Для групп — из пакета B.
**Тесты:** mobile — открыть чат офлайн показывает историю; reconnect после 3 новых сообщений = 1 GET `afterId`; LRU стирает самый старый чат при переполнении.

### Пакет D — профили, настройки, справочники: кэш на диске с ETag и «stale-while-revalidate» (−40–50 запр./день)

**MOBILE:**
- `EtagCacheInterceptor` → **на диск**: таблица `http_cache(owner, lang, url, etag, json, bytes, fetched_at, last_used_at)` в Drift, лимит 32 МБ, LRU. Память остаётся как первый уровень. Тогда холодный старт получает 304 на bootstrap, `/users/me`, pricing, plans, legal, stickers, practice, countries, свой профиль.
- Политика `CachePolicy` на провайдер: `swr(maxAge)` — показать копию сразу, в фоне проверить (304 — бесплатно для байтов); `fresh` — как сейчас. Применить: чужой профиль адвоката `swr(10 мин)`, настройки (`/me/promotions`, `/partners/me`, `/referrals/me`, `/support/tickets`) `swr(1 ч)`, `/pricing`, `/plans`, `/stars/gifts`, `/legal/*`, `/countries`, `/document-templates`, `/deadlines/*` `swr(24 ч)`, `/stickers*` `swr(24 ч)`.
- Resume-перечитывания 7 платёжных экранов — только если с ухода в фон прошло > 30 с **или** возврат с внешней оплаты (`pendingCheckout` флаг), иначе ничего.
- Подписка: убрать 4 `invalidate` — ответ `POST /attorneys/{id}/follow` отдаёт `{following, followersCount}`, профиль правим локально; `suggestionsProvider` `swr(30 мин)`.
**API:**
- `Cache-Control: private, max-age=<N>, stale-while-revalidate=<M>` на справочниках (`/pricing`, `/plans`, `/legal/documents`, `/countries`, `/stickers*`, `/document-templates`, `/deadlines/*`, `/config/bootstrap` — 60 с) — это **включает кэш браузера** в веб-сборке и админке (с `Authorization` без `private` браузер не кэширует).
- «Дешёвый ETag» для профиля: `ETag = W/"<attorney.updated_at>-<posts_count>-<followers_count>"` считается до сборки ответа; совпал — 304 без 6 запросов в базу. То же для `/users/me` (`users.updated_at`), `/subscriptions/me`, `/config/bootstrap` (версия флагов из Redis).
- `POST /attorneys/{id}/follow` / `DELETE` отвечают счётчиками (новое необязательное поле).
**Индексы:** не нужны (ключевые `updated_at` уже есть у `users`, `attorney_profiles`, `feature_flags`, `app_config`).
**Тесты:** API — spec: 2-й `GET /attorneys/{u}` с `If-None-Match` = 304 и 0 запросов Prisma (считать через `$on('query')`); mobile — после перезапуска процесса bootstrap получает 304; «Очистить кэш» обнуляет `http_cache`.

### Пакет E — дела, ставки, консультации: события вместо инвалидаций (−15–20 запр./день у адвокатов)

**API:**
- Новые события в `RealtimePublisher`: `case:update {caseId, kind: bid_new|bid_accepted|bid_declined|bid_countered|bid_withdrawn|updated|closed|task|payment, bid?: BidDto, case?: CaseCardDto}` — шлётся участникам дела (`toUsers`) из тех же мест, где сейчас создаётся `notifications.emit`; `consultation:update {consultation: ConsultationDto}`.
- `?updatedSince` на `GET /users/me/cases|bids|work`, `GET /saved-items`, `GET /consultations`, `GET /invites` (общий механизм). Индексы: `cases(client_id, updated_at desc)`, `cases(attorney_id, updated_at desc)` (проверить — у `bids` есть `(attorney_id, updated_at desc)`, у `cases` — нет), `consultations(attorney_id, updated_at)`, `consultations(client_id, updated_at)`, `saved_items(user_id, created_at)`.
- `PUT /cases/{id}/bid-draft` — принимать как есть, но клиент шлёт не чаще раза в 2 с (debounce) и только при изменении.
- `POST /cases/{id}/view` → пакет A.
**MOBILE:** `mine*`/`my*` списки → `SyncedListNotifier`; действие над ставкой возвращает `BidDto` и правится локально (убрать `invalidate` ×5–7 в `cases_providers.dart:387-401`); карточка дела (`attorneyCaseProvider`) `swr(2 мин)` + обновление по `case:update`; `GET /cases` (лента дел) — без изменений (это как лента, pull).
**Тесты:** API — e2e: ставка → `case:update` у клиента и у адвоката; `updatedSince` отдаёт только изменённые дела; mobile — принятие ставки = 1 POST, 0 GET.

### Пакет F — уведомления, каналы, Q&A, комментарии: применить событие, не перечитывать (−10 запр./день)

**API:**
- `notification:new` уже несёт строку → ничего; добавить `GET /notifications?updatedSince` — у `notifications` **нет `updated_at`**: добавить колонку (меняется при `read_at`) и индекс `(user_id, updated_at desc)`; `POST /notifications/read` отвечать `{readIds}`.
- Каналы: `channel:post {channelId, post: ChannelPostDto}` в комнату `channel:{id}` (клиент уже делает `channel:watch` при открытии) + в `user:{id}` подписчиков **только** `channel:update {channelId, unread, lastPostAt}` (без тела, чтобы fan-out был лёгким; он уже в очереди). `GET /channels?updatedSince` — индекс `channel_subscriptions(user_id, channel_id)` + `channels(updated_at)`.
- Комментарии: `comment:new {postId, comment: CommentDto}` в комнату `post:{id}` (новая комната, `post:watch`/`post:unwatch` по образцу `channel:*`); `POST /posts/{id}/comments` отвечает комментарием (уже) — клиент вставляет его, без `invalidate`.
- Q&A: `GET /questions?updatedSince` для вкладки «Мои» (`questions(author_id, updated_at)`), остальные вкладки — pull.
**MOBILE:** `NotificationsNotifier` → вставка строки из `notification:new` (сейчас `invalidate`); ассистент на `badge:update` получает готовые числа — сервер шлёт ему **его** бейджи (`toUsers([assistant])` с объединённым объектом), чтобы не было GET на каждое событие; `channelListProvider` → `SyncedListNotifier`; экран поста подписывается на `post:watch`; комментарий после отправки вставляется локально.
**Тесты:** API — spec комнаты `post:{id}` (не-участнику ничего), `updatedSince` для уведомлений; mobile — 10 `notification:new` при открытом колокольчике = 0 GET.

### Пакет G — старт приложения: один запрос вместо шести (−30–40 запр./день, быстрее старт)

**API:** `GET /me/session` (новый, необязательный для старых клиентов) = `{me, badges, bootstrapVersion, pendingLegal, unreadSupport, flags}` — одним ответом, с ETag из `users.updated_at + badges hash + flags version`; `/config/bootstrap` остаётся для веб/гостей. `PUT /me/timezone` — только при изменении (сервер уже хранит, клиент сравнивает с сохранённым).
**MOBILE:** `app_startup.dart`: показать UI из Drift-копий (флаги, `me`, бейджи) сразу; один `GET /me/session` с `If-None-Match`; i18n-дельта — в фоне через 2 с после первого кадра, не на критическом пути; `GET /calls/ongoing` — только если в `me/session` пришёл `hasOngoingCalls`.
**Тесты:** API — spec 304 при неизменном состоянии; mobile — холодный старт в офлайне открывает ленту и чаты из копий.

### Пакет H — звонки: resync по подтверждению, QR по socket (мелко, но «чисто»)

**API:** на каждое `call:*` событие сервер добавляет `seq`; клиент resync'ает `GET /calls/{id}` только при пропуске `seq` или раз в 30 с (вместо 8); `auth:qr_approved` в комнату `qr:{qrId}` (socket без входа — отдельный namespace `/qr` с ограничением 1 комната), `POST /auth/qr/poll` остаётся как запасной путь раз в 10 с.
**MOBILE:** `kCallSyncInterval = 30 с` + проверка `seq`; экран QR слушает socket.
**Тесты:** пропущенный `seq` → один GET; QR-подтверждение приходит за < 1 с без опроса.

### Пакет I — медиа: CDN-заголовки и меньше байт (−40 % байтов медиа; из аудита #1 п. 9, ещё открыт)

**API/infra:** CloudFront signed URLs для чат/голос/файлов дел вместо прямого S3; `Cache-Control: public, max-age=31536000, immutable` на всех медиа-ключах (ключ уникален — безопасно); чат-фото 1600 px / q82 по умолчанию, HD — по кнопке. **MOBILE:** `attachment_widgets.dart:133-140` — 1600 px; `AppImageCaches` — лимиты в байтах (см. §5); на веб-сборке положиться на кэш браузера (заголовки с сервера).
**Тесты:** e2e на заголовки; mobile — golden не нужен; unit на выбор размера.

### Пакет J — админка (копейки по AWS, но порядок)

**API:** `GET /admin/counts` = `{dashboardBadges, supportUnread, trustQueue, approvalsPending}` одним лёгким запросом (4 `COUNT` по индексам, без агрегатов `/admin/dashboard`), ETag по сумме; `/admin/dashboard` отдавать с `Cache-Control: private, max-age=30`. Позже — SSE `GET /admin/events` (счётчики по изменению) вместо опроса; для 50 админов это не срочно.
**ADMIN:** `use-nav-counts.ts` → один `counts`-запрос; `livePoll` 60 с → 120 с, когда окно не в фокусе (сейчас только «вкладка скрыта»); страницы со своим `refetchInterval` (economy, sessions, system-health, support ×3, approvals, legal-workspace, workspace) — оставить, но `staleTime` = интервалу.
**Тесты:** vitest на `useNavCounts` (один запрос вместо четырёх).

### Пакет K — мелкие «болтуны»

- Поиск: `CancelToken` на suggest/списки (брошенный ввод не долетает до сервера); `trending-tags` `swr(10 мин)`.
- Лайк: склейка «лайк → анлайк» в окне 700 мс в ноль запросов (`_guard` с отложенной отправкой).
- `POST /notifications/read`, `POST /conversations/{id}/read|delivered` — батч раз в 1 с, если за секунду пришло несколько (уже частично есть для read — проверить `delivered`).
- Перевод контента: локальная таблица `translations(owner, kind, id, target, text)` 2 МБ, чтобы повторное открытие не ходило на сервер.
- Веб-сборка: `drift_web` на OPFS уже; `http_cache` и `messages` в вебе — **только память** (приватность общего компьютера), размер отображать через `navigator.storage.estimate()`.

### Порядок и оценка

| Очередь | Пакет | Работник | Эконом. (запр./день при 1 млн DAU) | Размер |
|---|---|---|---|---|
| 1 | A просмотры батчем | API 1 д, MOBILE 1 д | ≈ 100 млн | S |
| 2 | D кэш на диске + дешёвый ETag + справочники | MOBILE 3 д, API 2 д | ≈ 50 млн + байты | M |
| 3 | G старт одним запросом | API 1 д, MOBILE 2 д | ≈ 35 млн | M |
| 4 | B группы-дельты | API 2 д, MOBILE 2 д | ≈ 20–50 млн (у активных) + 8 МБ/день | M |
| 5 | E дела/ставки события | API 2 д, MOBILE 2 д | ≈ 15 млн | M |
| 6 | C сообщения в Drift | MOBILE 4 д, API 0,5 д | ≈ 10 млн + 250 МБ трафика на тыс. польз. | L |
| 7 | F уведомления/каналы/Q&A/комменты | API 2 д, MOBILE 2 д | ≈ 10 млн | M |
| 8 | I медиа CDN | API/infra 2 д, MOBILE 1 д | −40 % байтов медиа ≈ самая большая экономия **в долларах** за трафик | M |
| 9 | H звонки/QR | API 1 д, MOBILE 1 д | ≈ 1–2 млн | S |
| 10 | K мелочи | по 0,5 д | ≈ 5 млн | S |
| 11 | J админка | API 0,5 д, ADMIN 0,5 д | ≈ 0 (порядок) | S |

Параллельность: API-работник идёт A → D → G → B → E → F; MOBILE-работник — A → D(кэш-слой, §5) → C → B → G → E → F; стыки только через необязательные поля контракта, поэтому ветки сливаются в любом порядке.

---

## 5. Единая система кэша на устройстве

Сейчас: одна Drift-база `lawbid_social` (`cached_pages`, `chat_outbox`, `recent_searches`), отдельная `l10n`, два файловых кэша картинок по штукам, ETag в памяти, очередь аналитики в SharedPreferences. Ни у чего нет лимита в байтах, нет общего экрана и кнопки.

**Цель — как Telegram «Данные и память».**

### 5.1 Хранилища (по одному Drift-store на подсистему, у каждого — свой лимит в байтах и LRU)

| Store | Таблицы | Лимит по умолчанию | Выселение | Чистится кнопкой |
|---|---|---|---|---|
| `http_cache` | `http_cache(owner, lang, url, etag, json, bytes, fetched_at, last_used_at)`, `sync_state(owner, list_key, synced_at)` | 32 МБ | LRU по `last_used_at` | «Кэш запросов» |
| `messages` | `messages`, `conversation_sync`, `group_messages` | 50 МБ (текст) | LRU **по чатам** (целиком самый давно открытый) | «Сообщения» (с подтверждением; история докачается) |
| `feed_cache` | `cached_pages` (лента, список чатов, профиль — уже есть) | 8 МБ | по `updated_at` | «Лента» |
| `media_images` | `flutter_cache_manager` `lawbid_images` | 500 МБ, 7 дней | свой LRU + наш байтовый порог (сканируем `CacheInfoRepository`, удаляем старые, пока > лимита) | «Фото» |
| `media_chat` | `lawbid_chat_media` | 300 МБ, «Хранить медиа»: 3 дня / 1 нед / 1 мес / всегда | то же | «Медиа чатов» |
| `media_files` | файлы дел/вложения (`core/files`) | 200 МБ, 7 дней (уже чистятся) | по дате | «Файлы» |
| `video` | превью/кусочки reels (если плеер кэширует) | 300 МБ | LRU | «Видео» |
| `outbox` | `chat_outbox` + новая `media_outbox` (путь к файлу, прогресс) | без лимита, но не кэш | — | **не чистится** |
| `l10n`, `recent_searches`, `event_dedup`, `events_queue` | служебные | 5 МБ | — | «Прочее» |

Все лимиты — в `app_config` (ключи `cache.limit_mb.http`, `.messages`, `.images`, `.chat_media`, `.files`, `.video`, `cache.keep_media_days.default`) и приходят в `GET /config/bootstrap` → `BootstrapDto.limits` (новое необязательное поле). Пользователь может **понизить** лимит на экране, выше потолка админки — нельзя. На веб-сборке `messages`/`http_cache` живут в памяти вкладки (приватный режим и общие компьютеры), медиа — кэш браузера.

### 5.2 Экран «Настройки → Данные и память» (`features/settings/storage/`)

- Сверху — кольцо/полоса: занято всего, по категориям (цвета как у Telegram).
- Список категорий с размером и переключателем лимита (слайдер 100 МБ … «Без лимита» в пределах админского потолка).
- «Хранить медиа чатов»: 3 дня / 1 неделя / 1 месяц / Всегда.
- Кнопка **«Очистить кэш»** (всё, кроме outbox и настроек) с подтверждением «Фото и файлы загрузятся заново при открытии» + кнопка на каждой категории.
- Внизу: «Использование сети» за сессию/день (считает `ReachabilityInterceptor`-уровень: байты, запросы, 304-попадания) — как у Telegram «Сетевой трафик». Нужен для проверки, что пакеты из §4 дали эффект.
- Размеры считаются фоновой задачей `CacheSizer` (isolate, раз при открытии экрана и раз в сутки), результат кэшируется в SharedPreferences.

### 5.3 Правила инвалидации

- Ключ любой записи включает `owner` (userId или attorneyId для ассистента) и `lang` → выход из аккаунта и смена языка не требуют чистки, просто другие ключи; при `DELETE /users/me` и `logout-all` — полная очистка.
- `http_cache`: запись живёт, пока сервер не ответил 200 с новым телом; 304 обновляет `last_used_at`; `swr(maxAge)` решает, нужен ли сетевой запрос вообще.
- `messages`: источник истины между открытиями; события пишут в таблицу; `409 SYNC_TOO_OLD` → чат стирается и грузится страницей.
- Списки `sync_state`: при `409` или смене фильтров — сброс `synced_at` и полная загрузка.
- Картинки: ключ — URL без подписи (уже так, `app_network_image.dart`); переподписанный S3-URL не ломает кэш.

### 5.4 Тесты

Unit: LRU-выселение каждого store при переполнении; `owner`-изоляция (второй аккаунт не видит записей первого); «Очистить кэш» не трогает outbox. Widget: экран показывает суммы и после «Очистить» — нули. Integration (`integration_test/`): лента, список чатов, один чат открываются в режиме полёта из копий.

---

## 6. Вопросы владельцу (только продуктовые решения)

1. **Сколько держать сообщений на телефоне?** Telegram — всё, WhatsApp — всё. Предлагаю 50 МБ текста (≈ 200–300 тыс. сообщений), старые чаты выселяются и докачиваются. Да / другой лимит?
2. **Лимиты медиа по умолчанию:** фото ленты 500 МБ, медиа чатов 300 МБ и «Хранить медиа» = 1 месяц. Согласны? (Админка сможет менять.)
3. **Сообщения на веб-сборке** хранить только в памяти вкладки (безопаснее на чужом компьютере) или тоже на диске (быстрее)?
4. **«N новых постов» в ленте** (кнопка сверху, как в Twitter/Instagram при pull) — хотите, или оставить обновление только по свайпу/тапу вкладки?
5. **Комментарии живьём** (новые комментарии появляются, пока открыт пост) — нужно сейчас или это «косметика» на потом? Стоит отдельную комнату на пост.
6. **Чужие просмотры**: считать просмотр поста, когда он был на экране ≥ 1 с (как Instagram), или при любом появлении в ленте (как сейчас)? Влияет на числа в статистике авторов.
7. **Экран «Сетевой трафик»** (байты за день, как у Telegram) показывать пользователям или только в dev-сборке?
