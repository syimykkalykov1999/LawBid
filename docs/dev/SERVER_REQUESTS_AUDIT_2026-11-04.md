# Аудит запросов к серверу: админка, приложение/веб, API (R-385, 2026-11-04)

Владелец 04.11 05:40–06:15: «найди всё, что не так часто обновляется, но каждый раз грузит сервер… только по изменению идти на сервер… профили, аватарки и т.д. — всё до последнего».

Правило №1: только готовые приёмы. Админка — TanStack Query (`staleTime` / `gcTime` / `setQueryDefaults` / `placeholderData: keepPreviousData`). API — условный GET по RFC 9110/9111 (`ETag`, `If-None-Match` → 304, `Cache-Control: …, stale-while-revalidate` по RFC 5861), «дешёвый ETag» до сборки ответа (уже есть: `common/sync/cheap-etag.ts`). Приложение — HTTP-кэш с ETag и копией на диске (уже есть: `core/cache/http_cache_interceptor.dart`, `cacheFor(...)`), Riverpod `keepAlive` + таймер (приём `cacheFor` из документации Riverpod, «Auto Dispose & State Disposal»).

Три PR (каждый самостоятельный):
- **PR-A (админка)**, ветка `claude/fewer-server-requests` — этот документ + классы данных в QueryClient.
- **PR-B (API)**, ветка `claude/fewer-server-requests-api` — дешёвые ETag/304 и `Cache-Control` на справочниках, подписчиках, истории звонков.
- **PR-C (приложение и веб)**, ветка `claude/fewer-server-requests-app` — окна свежести для экранов кейса, профиля, справочников, рилсов.

Что уже было сделано раньше и проверено как «ok as is», перечислено в таблицах, чтобы ничего не потерялось.

## Как считали

- **Админка:** `apps/admin/src/app/request-budget.test.tsx` монтирует каждую из 104 страниц `(app)/**/page.tsx` с настоящим QueryClient панели; сервер не отвечает, поэтому каждый запрос считается один раз. Повторный заход через 45 с и через 10 мин воспроизводится логикой самого TanStack (`QueryObserver.subscribe` с теми же опциями), так что `staleTime`, `refetchOnMount` и `gcTime` решают ровно как на живой странице. «До» — старые настройки (`staleTime` 30 с, `gcTime` 5 мин по умолчанию). Таблица генерируется: `REQUEST_AUDIT=out.md npx vitest run src/app/request-budget.test.tsx`. Считаются запросы, которые уходят при открытии (без ответа сервера); вкладки, которые грузятся после первого ответа, сюда не входят.
- **Приложение:** чтение провайдеров (`autoDispose` или `keepAlive`), вызовов `cacheFor`, слушателей realtime. Любой GET без `cacheFor` уходит на сервер с `If-None-Match`: при 304 тела нет, но обработчик и запросы в базу на сервере всё равно выполняются.
- **API:** чтение контроллеров. Express ставит ETag по телу на каждый JSON-ответ (`app.setup.ts:148`). Такой 304 экономит трафик, но не работу базы. Дешёвый ETag отвечает 304 до сборки ответа.

## 1. Админка (каждая страница `apps/admin/src/app/(app)`)

**Причина жалобы.** Общий `staleTime` был 30 с (`providers.tsx:56`), а `gcTime` 5 мин (значение TanStack по умолчанию). Каждая страница, открытая повторно позже чем через 30 с, заново спрашивала сервер всё. После 5 минут кэш страницы стирался: пустой экран и полная загрузка.

**Исправление (PR-A), `apps/admin/src/lib/query-client.ts`:**
- для всех запросов: свежесть 60 с, страница хранится в памяти 30 мин после закрытия;
- справочники и настройки (40 ключей: `me`, `config`, `flags`, `countries`, `languages`, `plan-prices`, `legal-documents`, `email-templates`, все `*-settings` и т.д.): свежесть 15 мин. Каждое сохранение в админке уже сбрасывает свой ключ (`invalidateQueries`);
- агрегаты, которые сервер пересчитывает сам (`dashboard`, `trust-stats`, `fraud-stats`, `economy`): 2 мин, как период пересчёта;
- списки с фильтрами и страницами (41 ключ): `keepPreviousData`, старые строки остаются на экране, пока грузится новый фильтр;
- живые очереди (`livePoll()`, `lib/live.ts`): без изменений, опрос раз в 60 с только при видимой вкладке;
- `useMe` (`lib/hooks.ts`): 5 → 15 мин.

**Оболочка** (меню, верхняя панель; монтируется один раз за загрузку вкладки браузера):

| Запрос | Где | Как часто | Сейчас | Итог |
|---|---|---|---|---|
| `GET /admin/auth/me` | `lib/hooks.ts:44` | один раз, потом при устаревании | 5 мин | 15 мин (PR-A) |
| `GET /admin/counts` (бейджи меню) | `components/shell/use-nav-counts.ts:17` | раз в 60 с при видимой вкладке, без фокуса раз в 120 с, 304 по ETag | — | ok as is (живые счётчики) |
| `GET /admin/feature-flags` | `components/shell/use-off-flags.ts:29` | один раз | 30 с | 15 мин (PR-A) |
| `GET /admin/staff/settings` | `lib/staff-data.ts:77` | один раз | 5 мин | ok as is |
| `GET /admin/pii/watermark` | `components/security/staff-watermark.tsx:18` | один раз | 15 мин | ok as is |
| `GET /admin/workspace/desk-settings` | `lib/desk-data.ts:100` | один раз | 5 мин | ok as is |

**Страницы.** Сколько запросов уходит при открытии; сколько при возврате (до → после). «Живые» — доски с опросом раз в 60 с, они не меняются. Исправлено всё в PR-A. Строки, где после исправления через 10 мин остаётся запрос, — это списки и очереди: им положено обновиться через минуту.

| Страница | Открытие (запросов) | из них живые (опрос 60 с) | Возврат через 45 с: до → после | Возврат через 10 мин: до → после |
|---|---|---|---|---|
| /admins | 4 | 0 | 4 → 0 | 4 → 1 |
| /analytics | 1 | 0 | 1 → 0 | 1 → 1 |
| /attorney-ads | 3 | 0 | 3 → 0 | 3 → 1 |
| /audit-log | 2 | 0 | 2 → 0 | 2 → 1 |
| /bids | 2 | 0 | 2 → 0 | 2 → 1 |
| /broadcasts | 1 | 0 | 1 → 0 | 1 → 1 |
| /case-payments | 3 | 0 | 3 → 0 | 3 → 2 |
| /cases/[id] | 1 | 0 | 1 → 0 | 1 → 0 |
| /cases/contact-issues/[id] | 1 | 0 | 1 → 0 | 1 → 0 |
| /cases/disputes/[id] | 1 | 0 | 1 → 0 | 1 → 0 |
| /cases | 2 | 0 | 2 → 0 | 2 → 1 |
| /client-badges | 2 | 0 | 2 → 0 | 2 → 1 |
| /config | 1 | 0 | 1 → 0 | 1 → 0 |
| /content | 2 | 0 | 2 → 0 | 2 → 1 |
| /contracts | 2 | 0 | 2 → 0 | 2 → 1 |
| /countries | 1 | 0 | 1 → 0 | 1 → 0 |
| /country-partners | 1 | 0 | 1 → 0 | 1 → 1 |
| /crashes | 2 | 0 | 2 → 0 | 2 → 1 |
| /data-requests/[id] | 1 | 0 | 1 → 0 | 1 → 1 |
| /data-requests | 1 | 0 | 1 → 0 | 1 → 1 |
| /data-requests/transparency | 1 | 0 | 1 → 0 | 1 → 1 |
| /deadlines | 2 | 0 | 2 → 0 | 2 → 0 |
| /deal-record | 3 | 0 | 3 → 0 | 3 → 0 |
| /desk/[role] | 1 | 0 | 1 → 0 | 1 → 0 |
| /desk | 1 | 0 | 1 → 0 | 1 → 0 |
| /document-templates | 2 | 0 | 2 → 0 | 2 → 0 |
| /economy | 1 | 0 | 1 → 0 | 1 → 1 |
| /email-templates/[key] | 2 | 0 | 2 → 0 | 2 → 1 |
| /email-templates | 2 | 0 | 2 → 0 | 2 → 0 |
| /experiments | 1 | 0 | 1 → 0 | 1 → 1 |
| /exports | 1 | 0 | 1 → 0 | 1 → 0 |
| /flags | 1 | 0 | 1 → 0 | 1 → 0 |
| /form-templates | 3 | 0 | 3 → 0 | 3 → 1 |
| /group-chats | 1 | 0 | 1 → 0 | 1 → 1 |
| /i18n | 1 | 0 | 1 → 0 | 1 → 0 |
| /integrations | 2 | 0 | 2 → 0 | 2 → 0 |
| /launch | 2 | 2 | 0 → 0 | 0 → 0 |
| /legal-documents | 1 | 0 | 1 → 0 | 1 → 0 |
| /legal-qa | 2 | 0 | 2 → 0 | 2 → 1 |
| /legal-settings | 2 | 0 | 2 → 0 | 2 → 1 |
| /legal | 0 | 0 | 0 → 0 | 0 → 0 |
| /media-moderation | 1 | 0 | 1 → 0 | 1 → 1 |
| /media | 3 | 0 | 3 → 0 | 3 → 2 |
| /moderation-appeals | 1 | 0 | 1 → 0 | 1 → 1 |
| /moderation-auto | 3 | 0 | 3 → 0 | 3 → 2 |
| /moderation-journal | 1 | 0 | 1 → 0 | 1 → 1 |
| /moderation/[type]/[id] | 1 | 0 | 1 → 0 | 1 → 1 |
| /moderation | 2 | 0 | 2 → 0 | 2 → 1 |
| /moderation/review | 2 | 0 | 2 → 1 | 2 → 1 |
| /outreach/[id] | 2 | 0 | 2 → 0 | 2 → 2 |
| /outreach | 2 | 0 | 2 → 0 | 2 → 1 |
| / | 2 | 0 | 2 → 0 | 2 → 1 |
| /partner | 1 | 0 | 1 → 0 | 1 → 1 |
| /partners/[id] | 3 | 0 | 3 → 0 | 3 → 1 |
| /partners | 4 | 0 | 4 → 0 | 4 → 2 |
| /payments | 2 | 0 | 2 → 0 | 2 → 1 |
| /payroll | 4 | 0 | 4 → 0 | 4 → 3 |
| /plans | 2 | 0 | 2 → 0 | 2 → 1 |
| /pnl | 1 | 0 | 1 → 0 | 1 → 1 |
| /practice-areas | 1 | 0 | 1 → 0 | 1 → 0 |
| /prices | 2 | 0 | 2 → 0 | 2 → 0 |
| /private-content | 1 | 0 | 1 → 0 | 1 → 1 |
| /profile | 1 | 0 | 1 → 0 | 1 → 0 |
| /promo-codes | 2 | 0 | 2 → 0 | 2 → 1 |
| /promotion | 2 | 0 | 2 → 0 | 2 → 1 |
| /promotions | 4 | 0 | 4 → 0 | 4 → 2 |
| /referrals | 3 | 0 | 3 → 0 | 3 → 2 |
| /review-appeals | 1 | 0 | 1 → 0 | 1 → 1 |
| /rewards | 1 | 0 | 1 → 0 | 1 → 0 |
| /sanctions | 2 | 0 | 2 → 0 | 2 → 1 |
| /scale | 6 | 3 | 3 → 0 | 3 → 3 |
| /search | 3 | 0 | 3 → 0 | 3 → 2 |
| /sessions | 1 | 0 | 1 → 0 | 1 → 1 |
| /spend | 1 | 1 | 0 → 0 | 0 → 0 |
| /staff/[adminId] | 1 | 0 | 1 → 0 | 1 → 0 |
| /staff/appeals | 1 | 0 | 1 → 0 | 1 → 0 |
| /staff | 1 | 0 | 1 → 0 | 1 → 0 |
| /staff/rates | 1 | 0 | 1 → 0 | 1 → 0 |
| /stars | 2 | 0 | 2 → 0 | 2 → 1 |
| /status-page | 1 | 0 | 1 → 0 | 1 → 1 |
| /storage | 2 | 0 | 2 → 0 | 2 → 1 |
| /stripe-review | 2 | 0 | 2 → 0 | 2 → 2 |
| /subscriptions | 3 | 0 | 3 → 0 | 3 → 2 |
| /support/[id] | 2 | 1 | 1 → 0 | 1 → 0 |
| /support/macros | 2 | 0 | 2 → 0 | 2 → 0 |
| /support | 3 | 2 | 1 → 0 | 1 → 0 |
| /support/review | 3 | 0 | 2 → 1 | 2 → 1 |
| /support/settings | 2 | 0 | 2 → 0 | 2 → 0 |
| /support/team | 3 | 0 | 3 → 0 | 3 → 2 |
| /system-health | 1 | 1 | 0 → 0 | 0 → 0 |
| /teams | 2 | 0 | 2 → 0 | 2 → 1 |
| /today | 4 | 1 | 1 → 0 | 3 → 2 |
| /today/review | 1 | 0 | 1 → 0 | 1 → 0 |
| /treasury | 2 | 0 | 2 → 0 | 2 → 1 |
| /uploads | 2 | 0 | 2 → 0 | 2 → 1 |
| /users/[id] | 2 | 0 | 2 → 0 | 2 → 1 |
| /users | 2 | 0 | 2 → 0 | 2 → 1 |
| /verification/[id] | 2 | 0 | 2 → 0 | 2 → 1 |
| /verification | 1 | 0 | 1 → 0 | 1 → 1 |
| /verification/review | 2 | 0 | 2 → 1 | 2 → 1 |
| /verification/trust/[attorneyId] | 2 | 0 | 2 → 0 | 2 → 1 |
| /verification/trust/clients/[userId] | 2 | 0 | 2 → 0 | 2 → 1 |
| /verification/trust | 4 | 0 | 4 → 0 | 4 → 3 |
| /workspace | 2 | 1 | 0 → 0 | 1 → 1 |
| **Итого (104 стр.)** | 194 | 12 | 178 → 3 | 181 → 89 |

Через 45 с остаются 3 запроса: очереди проверки «подряд» (`/moderation/review`, `/support/review`, `/verification/review`). У них `staleTime: 0` стоит намеренно: кандидатов на проверку нужно брать свежими, иначе два сотрудника получат одну карточку. Ok as is.

API для админки: каждый `GET /admin/*` уже `private, no-cache` с ETag (`common/middleware/admin-cache-headers.middleware.ts`); прокси панели передаёт `If-None-Match` (`app/api/proxy/[...path]/route.ts`). Ok as is.

## 2. API (публичные и справочные GET)

| Эндпоинт | Кто зовёт | Как часто меняется | Было | Итог |
|---|---|---|---|---|
| `GET /config/bootstrap` | приложение/веб при старте | при смене флагов/конфига/юр. текстов | дешёвый ETag (версия конфига + 5 мин), `public, max-age=60, swr=300` | ok as is |
| `GET /me/session` | приложение при старте и после долгого фона | при изменении меня/бейджей | дешёвый ETag | ok as is |
| `GET /i18n/bundle/:lang` | приложение после старта | при импорте переводов | ETag по версии, 304 без базы | ok as is |
| `GET /i18n/languages` | приложение на каждом старте и при открытии выбора языка | редко (админка, импорт) | запрос в базу на каждый вызов, `max-age=60`, ETag по телу | дешёвый ETag (версия конфига + 5 мин) и `public, max-age=300, swr=3600` (PR-B); импорт нового языка теперь тоже сдвигает версию конфига |
| `GET /legal/documents`, `/legal/documents/:type` | сайт, приложение (согласия, тексты) | при публикации | запрос в базу на каждый вызов, ETag по телу | дешёвый ETag (версия конфига + тип + язык + 5 мин) (PR-B) |
| `GET /countries` | приложение (онбординг, адреса) | редко | кэш в памяти процесса, `public, max-age=300, swr=3600`, ETag по телу | ok as is |
| `GET /practice-areas` | приложение (темы поиска, фильтры) | несколько раз в год | ETag дерева, 304 без тела, `public` | ok as is |
| `GET /plans` | приложение, сайт | редко | дешёвый ETag, `public, max-age=300, swr=3600` | ok as is |
| `GET /stickers*`, `/document-templates*`, `/deadlines/rules|holidays` | приложение | редко | `private, max-age=600, swr=86400`, ETag | ok as is |
| `GET /config/flags` | приложение его не зовёт (флаги приходят в `/me/session`) | — | `private, no-store` | ok as is (не используется) |
| `GET /attorneys/:id/followers`, `/attorneys/:id/following`, `/users/me/following` | вкладка «Чаты» (#728), профиль | при подписке/отписке | список строится целиком; `updatedSince` нет | дешёвый ETag первой страницы: (число, последняя `created_at`, 5 мин) → 304 без сборки (PR-B). Удаление подписки двигает счётчик, новая подписка двигает время |
| `GET /calls/history` | вкладка «Звонки» (#728) | при новом звонке | список строится целиком; `updatedSince` нет | дешёвый ETag первой страницы: (последний звонок, его обновление, скрытые/очищенные, 5 мин) (PR-B) |
| `GET /users/:id`, `/attorneys/:username`, `/clients/:username` | профили | часто (счётчики) | ETag по телу (304 без тела) | ok as is; на телефоне — окна свежести (PR-C) |
| Медиа (аватарки, фото, превью видео, стикеры) | всё приложение | никогда (ключ файла неизменен) | `public, max-age=31536000, immutable` (`files/storage/s3-storage.service.ts:49`) | ok as is |

## 3. Приложение и веб (`apps/mobile`, один код)

Холодный старт после входа: `GET /me/session` (304), `/config/bootstrap` с телефона без запроса, если версия не изменилась, `GET /i18n/languages`, `GET /i18n/bundle/:lang` (+ `en`) через 2 с. После PR-C `/i18n/languages` берётся с телефона в течение часа: **4 → 3 запроса**, и все оставшиеся отвечают 304 без работы базы.

| Экран / данные | Запрос | Провайдер (file:line) | Было (запросов на повторный вход) | Итог |
|---|---|---|---|---|
| Старт: сессия, бейджи, флаги | `GET /me/session` | `core/startup/app_session.dart:17` | 1 на старт (304) | ok as is |
| Старт: bootstrap | `GET /config/bootstrap` | `core/feature_flags/feature_flags_api_client.dart:107` | 0, если версия та же | ok as is |
| Список языков | `GET /i18n/languages` | `core/l10n/i18n_api_client.dart:88`, `available_languages.dart:115` | 1 на каждый старт и каждое открытие выбора языка | 0 в течение 1 ч (`cacheFor`) (PR-C) |
| Переводы | `GET /i18n/bundle/:lang?since=` | `core/l10n/l10n_repository.dart:42` | 1 (дельта, 304) | ok as is |
| Юр. документы | `GET /legal/*` | `features/legal/data/legal_repository.dart:21,93` | 0 (24 ч) | ok as is |
| Страны | `GET /countries` | `features/onboarding/application/countries_providers.dart:14` | 0 (24 ч) | ok as is |
| Темы/практики (поиск, фильтры) | `GET /practice-areas` | `profile_providers.dart:79` (keepAlive), `profile_repositories.dart:220` | 0 (1 ч) | ok as is |
| Тренды поиска | тренды | `search_repository.dart:446` | 0 (10 мин) | ok as is |
| Поиск людей/кейсов/постов | поиск | `search_providers.dart:127,147,167` | вкладка поиска в `IndexedStack`, возврат = 0; тот же запрос заново после выхода = 1 | ok as is (результаты живут, пока живёт вкладка) |
| Обзор: кейсы и посты (сетки) | обзорные списки кейсов и постов | `cases_providers.dart:467`, `social_providers.dart:598` | 1 при возврате к прежнему фильтру | 0 в течение 5 мин (`keepAliveFor`) (PR-C) |
| Лента постов, лента кейсов | ленты постов и кейсов | `social_providers.dart:271`, `cases_providers.dart:432` | 0 (5 мин + копия первой страницы, без таймеров) | ok as is |
| Рилсы | `GET /reels` (1-я страница) | `features/reels/data/reels_repository.dart:197`, `reels_screen.dart:161` | 1 на каждое открытие | 0 в течение 2 мин (`cacheFor` на первую страницу; потягивание вниз по-прежнему спрашивает сервер) (PR-C). Как у Instagram/TikTok: следующая страница и HLS подгружаются заранее (`reels_screen.dart:131`), свежие ролики подмешиваются не чаще раза в 3 мин (`_mixFresh`). Ранжирование не ломается: окно 2 мин меньше 3 мин подмешивания |
| Кейс клиента (карточка) | `GET /users/me/cases/:id` | `cases_providers.dart:252` | 1 на каждое открытие (304) | 0 в течение 5 мин; realtime (`_onEvent`) уже правит карточку (PR-C) |
| Кейс у адвоката | `GET /cases/:id` | `cases_providers.dart:473` | 1 | 0 в течение 5 мин; событие кейса перечитывает (PR-C) |
| Ставка | `GET /bids/:id` | `cases_providers.dart:380` | 1 | 0 в течение 5 мин; `case:update` перечитывает (PR-C) |
| Ставки кейса | `GET /cases/:id/bids` | `cases_providers.dart:374` | 0 (5 мин, `updatedSince`, realtime) | ok as is |
| Контакты клиента в кейсе | `GET /cases/:id/contacts` | `cases_providers.dart:766` | 1 | 0 в течение 5 мин; смена ставки сбрасывает (PR-C) |
| Рабочее место кейса: сводка, файлы, задачи, новости, журнал | `GET /cases/:id/workspace|files|tasks|updates|activity` | `features/cases/workspace/workspace_data.dart:17,26,35,44,53` | 1 на каждую вкладку при каждом входе | 0 в течение 2 мин (realtime-слушателя нет, поэтому окно короче); свои действия сбрасывают (PR-C) |
| Шаблоны форм (подписание) | `GET /cases/:id/documents/templates` | `features/cases/tools/signing_data.dart:47` | 1 при каждом открытии листа | 0 в течение 24 ч (`cacheFor`, как `templates_repository.dart:39`) (PR-C) |
| Запросы на подпись | запросы на подпись кейса | `signing_data.dart:26` | 1 | ok as is (живой статус подписи, после действий перечитывается) |
| Счёт по кейсу, таймер | `GET /cases/:id/billing` | `features/cases/tools/billing_data.dart:20` | 1 + при возврате из фона | ok as is (деньги и идущий таймер) |
| Проверка конфликта интересов | `GET /cases/:id/conflict-check` | `features/cases/tools/conflict_banner.dart:12` | 1 при открытии формы ставки | ok as is (юридическая проверка должна быть свежей) |
| Запись о сделке | `GET /cases/:id/deal-record` | `features/cases/deals/deal_record_data.dart:33` | 1 | ok as is (подписанный документ, читается редко) |
| Оплаты кейса | `GET /cases/:id/payments` | `case_payments_providers.dart:24` | 1 | ok as is (деньги; оплаты сейчас выключены) |
| Настройки оплат (админские) | `GET /payments/settings` | `case_payments_providers.dart:19` | 1 при каждом открытии кейса с карточкой оплат | 0 в течение 1 ч (`keepAliveFor`) (PR-C) |
| Комментарии | `GET /cases/:id/comments`, `/posts/:id/comments` | `social_providers.dart:712` | 1 (realtime дописывает новые) | ok as is |
| Чужой профиль адвоката | `GET /attorneys/:username` | `profile_providers.dart:100`, `profile_repositories.dart:130` | 0 (10 мин) | ok as is |
| Чужой профиль клиента | `GET /clients/:username` | `profile_providers.dart:93`, `profile_repositories.dart:438` | 1 при каждом открытии | 0 в течение 10 мин (`cacheFor`, как у адвоката) (PR-C) |
| Сводка отзывов адвоката | `GET /attorneys/:id/reviews/summary` | `profile_providers.dart:121`, `profile_repositories.dart:276` | 1 | 0 в течение 10 мин (PR-C) |
| Мой отзыв на адвоката | `GET /attorneys/:id/reviews/mine` | `profile_providers.dart:85` | 1 | ok as is (форма отзыва, после отправки перечитывается) |
| Вкладки профиля (посты, рилсы, новости, репосты) | посты/рилсы/новости/репосты профиля | `social_providers.dart:314,346,366,386,412` | 0 (5 мин + копия) | ok as is |
| Отзывы в профиле, «Сохранённое» | — | — | — | #730 (другой помощник) |
| Свой профиль (адвокат / клиент) | `GET /attorneys/me/profile`, `/users/me/profile` | `profile_providers.dart:183,193` | копия с телефона, затем 1 живой запрос на каждый вход | 0 в течение 5 мин (`keepAliveFor`); правка профиля сбрасывает (PR-C) |
| Мои практики (вкладка «Кейсы» ленты адвоката) | `GET /attorneys/me/practice-areas` | `features/cases/presentation/screens/attorney_cases_tab.dart:24` | 1 на вход во вкладку | передано #728/#730 (вкладки ленты); здесь не трогаем |
| Чаты / Контакты / Звонки | `/conversations`, подписки/подписчики, `/contacts/sync`, `/calls/history` | — | — | #728; API-часть (дешёвые ETag) — PR-B |
| Уведомления, бейджи | `GET /notifications?updatedSince`, бейджи из `/me/session` и сокета | `notifications_providers.dart:111` | 0 при возврате в течение 5 мин, потом дельта | ok as is |
| Настройки: приватность, устройства, экспорт, хранилище | приватность, устройства, экспорт, хранилище | `features/settings/**` | 1 при открытии экрана | ok as is (редко открываются, свои данные, после правки должны быть точными) |
| Пакеты ставок, план клиента, подписка | `GET /bid-packs`, `/client-plans/me`, подписка | `bid_packs_screen.dart:13`, `client_plan_providers.dart:18` | 1 при открытии | ok as is (деньги; после оплаты перечитываются по возврату) |
| Каталог подарков | каталог подарков | `stars_repository.dart:91` | 0 (24 ч) | ok as is |
| Стикеры и эмодзи | `GET /stickers*` | `stickers_repository.dart:28,40,51` | 0 (1–24 ч); эмодзи встроены в приложение | ok as is |
| Аватарки, фото, превью видео, обложки рилсов | CDN | `core/media/stable_network_image.dart` (ключ — адрес файла без подписи), `core/media/app_image_cache.dart` (7 дней, 2000 файлов, отдельный кэш чатов) | 0 повторных скачиваний: CDN отдаёт `immutable` на год, ключ файла меняется только с самим файлом | ok as is |
| Blurhash / размеры превью | внутри ответа поста | — | 0 | ok as is |
| Таймеры, опрашивающие сервер | `web_qr_login_screen.dart:115` (10 с, только этот экран), `phone_handoff_panel.dart:71` (5 с, только передача селфи), `call_controller.dart:2034` (30 с, только во время звонка) | — | — | ok as is (живые процессы); других опросов по таймеру нет |

## 4. Что осталось (не в этих PR)

- `updatedSince` для `/calls/history` и подписчиков/подписок: нужен журнал удалений (tombstones), это изменение контракта. Пока дешёвый ETag (PR-B) отвечает 304 без сборки, когда ничего не изменилось.
- «Мои практики» во вкладке ленты — у помощника вкладок (#728/#730).
- Нагрузочный замер «запросов в секунду на 100 пользователей» до и после — в плане нагрузочных тестов (`loadtest/`).
