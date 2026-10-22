# Все системы LawBid — сверка с большими сервисами (2026-10-22)

Для владельца, перед релизом. Одна глава — одна система. В каждой таблице: что делают Instagram / TikTok / WhatsApp / Telegram (а по деньгам — Stripe и Slack), что есть у нас, статус и где это лежит.

Статус: ✅ есть · 🟡 частично (работает, но не до конца / ждёт ключа) · ❌ нет. «👤» — шаг, который можете сделать только вы (ключи, консоли). Пути — от корня репозитория, `apps/` опущено.

Проверено по `origin/main` после PR #234–#247 и по двум веткам `claude/economy-api` и `claude/economy-mobile` (считаются готовыми). Источники: аудиты #1–#5 (`docs/perf/*_2026-10-22.md`), `docs/SECURITY_TODO.md`, `docs/runbooks/OWNER_TODO_2026-10-22.md`, runbooks, `docs/HANDOFF.md`; спорные пункты сверены с кодом (`grep`).

---

## ЧАСТЬ I. ВНУТРЕННИЕ СИСТЕМЫ

### 1. Вход и сессии (auth & sessions)

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Вход по SMS-коду (WhatsApp, Telegram) | OTP по SMS и e-mail, HMAC-хранение, 5 попыток, лестница блокировок 1/3/30 мин, лимиты на номер/IP/устройство/сутки | ✅ | `api/src/modules/auth/otp-limits.ts`, `otp.service.ts` |
| Вход через Google / Apple (Instagram, TikTok) | Google и Apple id-token с проверкой `aud` + `nonce` | ✅ | `auth/social/*` |
| Пароль (необязательный, как Telegram «облачный пароль») | Пароль после OTP теперь необязателен; «Требовать пароль при входе с нового устройства» — настройка | ✅ | `mobile/lib/core/navigation/guards/app_router_guard.dart:127`, `password-auth.service.ts` |
| Вход по QR с другого устройства (WhatsApp Web, Telegram) | QR-вход есть; подтверждение — опрос раз в 10 с (не socket) | 🟡 | `auth/services/qr-login.service.ts`; `auth:qr_approved` по socket — после security-работы над gateway |
| Магическая ссылка в письме | Есть, привязана к verifier на устройстве | ✅ | `auth.service.ts:351` |
| Короткий access-токен + ротация refresh с детектором повторного использования | access 15 мин, refresh 60 дней, ротация, reuse-detection, чёрный список сессий | ✅ | `auth.service.ts:747-867`, `token.service.ts` |
| Список устройств, «выйти везде», уведомление о новом устройстве | Есть все три | ✅ | `GET/DELETE /auth/sessions`, `POST /auth/logout-all`, `new-device-notifier.service.ts` |
| Разлогин остальных устройств при смене телефона/пароля | Сделано (PR #242) | ✅ | `users/services/contacts.service.ts`, `password-auth.service.ts` |
| Повторная проверка (reauth) перед сменой e-mail/пароля/телефона; биометрия в приложении | `@ReauthRequired` на identifiers/password/contacts; Face ID / отпечаток | ✅ | `auth.controller.ts:414`, `mobile/lib/core/session/biometric_auth_service.dart` |
| Ассистент не может трогать вход хозяина | Весь `AuthController` под `@AssistantSelf` | ✅ | `auth.controller.ts:123` |
| Второй фактор для пользователей (Telegram: пароль; банки: passkeys) | Только SMS/e-mail-код + необязательный пароль. Passkeys (WebAuthn) нет ни у пользователей, ни в админке | ❌ | Шаг 1 — переключатель «пароль с нового устройства» ✅; шаг 2 — `@simplewebauthn/server` + плагин passkeys (research #5 B3) |
| Приложение доказывает, что оно настоящее (App Attest / Play Integrity) | App Check: сервер проверяет заголовок на OTP-ручках в режиме `monitor`; приложение шлёт токен | 🟡 | `auth/app-check/*`, `firebase_app_check` в pubspec. 👤 Зарегистрировать приложения в Firebase App Check, через неделю `enforce` (`docs/runbooks/APP_CHECK.md`) |
| Хранение токенов: только Keychain/Keystore, web — HttpOnly cookie | Так и сделано | ✅ | `token_secure_store.dart`, `auth/web-session-cookie.ts` |
| Защита от SMS-pumping в кабинете оператора | Код: US-only, лимиты, fail-closed. Кабинет Twilio — не подтверждён | 🟡 | 👤 Twilio: Geo Permissions только US, SMS Pumping Protection, auto-recharge OFF, Usage Triggers (`docs/COST_PROTECTION.md §1`) |

### 2. Чаты (1:1)

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Галочки «отправлено / доставлено / прочитано» | `delivered` + `read`, батч раз в 1 с | ✅ | `chat.controller.ts:233,248`, пакет K |
| Печатает… / был(а) в сети | typing и presence по socket, настройка «кто видит last seen» | ✅ | `realtime.gateway.ts:548`, `UserPrivacySettings.last_seen` |
| Текст, фото, видео, голосовые, файлы, стикеры | Всё есть; голосовые как в WhatsApp (скорости, авто-следующее); видео 720p; фото 1600 px / q82 | ✅ | `chat/*`, `stickers/*`, `voice_files.dart` |
| Альбомы из нескольких фото | Склейка на клиенте | ✅ | `chat/domain/message_groups.dart` |
| Ответ, пересылка, редактирование, удаление, реакции, закрепление, «Избранное» | Всё есть | ✅ | `chat-actions.controller.ts`, `forward.controller.ts`, `chat-saved.controller.ts` |
| Исчезающие сообщения (24 ч / 7 д / 90 д) | Есть | ✅ | `PATCH /conversations/:id/disappearing`, `disappearing-sweep.service.ts` |
| Папки / «Ожидают ответа» / запросы на переписку / mute / закрепить чат | Есть: folders, requests, waiting, pinned, mute до времени, mute звонков | ✅ | `chat.controller.ts:78-310` |
| Поиск по чатам и сообщениям (имя, @username, текст) | Есть (`GET /conversations?q`); зашифрованные тела не ищутся | 🟡 | `chat.service.ts`; поиск внутри зашифрованных тел — только локально по Drift (можно добавить) |
| Перевод сообщения | Есть, с кэшем и квотами; таблица переводов на телефоне | ✅ | `translation.service.ts`, пакет K |
| Сообщения лежат на телефоне, открываются с диска, догрузка `afterId` | Drift-хранилище сообщений, лимит 50 МБ | ✅ (economy-mobile) | `chat/data/message_store.dart`, пакет C |
| Исходящие не теряются при закрытии приложения (текст + медиа) | Текст — Drift outbox; медиа — постоянная очередь загрузки с повтором | ✅ | `social_local_database.dart`, PR #244 «persistent media upload queue» |
| Превью ссылок (og:title/картинка) | Нет | ❌ | Небольшая серверная ручка `GET /link-preview` с allow-list и лимитом (SSRF-безопасно) |
| Сквозное шифрование (WhatsApp) | Нет (осознанно): тела зашифрованы на сервере своим ключом, `enc:v3` с AAD на id | 🟡 | `common/secrets/message-body-cipher.ts`; KMS-обёртка ключей и job пере-шифрования — `docs/SECURITY_TODO.md` |
| Пуши без текста (device fetch) | Текст уходит в FCM/APNs в маскированном виде | 🟡 | «data-only pushes» — позже (SECURITY_TODO) |
| Геолокация / контакт-карточка в чате | Нет | ❌ | Низкий приоритет; тип сообщения `location`/`contact` |

### 3. Группы и каналы

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Группы: роли, инвайт-ссылки, заявки на вступление, закреп, темы, опросы | Всё есть; до 512 участников (жёсткий потолок 5 000, настройка админки) | ✅ | `groups.controller.ts`, `groups.dto.ts:29-32` |
| Fan-out сообщений через очередь, а не в запросе | Очередь `GroupFanoutQueue`, один emit в комнату, пуши батчами | ✅ | `groups/group-fanout.queue.ts`, `groups.service.ts:166` |
| Дельты списка групп и сообщений после реконнекта | `GET /groups?updatedSince`, `messages?afterId`, `topics?updatedSince` | ✅ (economy) | пакет B |
| Каналы (Telegram-стиль, подписчики, посты, звонки) | Сервер готов (1 334 строки, события `channel:post`, дельты); в приложении — «скоро» | 🟡 | `channels.service.ts`; `channelsComingSoonProvider = true` (`mobile/lib/features/channels/application/channels_providers.dart:21`). Включить в следующем релизе |
| Лимиты на каналы/группы против спама | Возвращены (PR #240/#243) | ✅ | `groups.dto.ts`, admin «Лимиты» |

### 4. Звонки

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Звонки 1:1 аудио/видео | Есть; видео — по флагу `video_calls` и подписке | ✅ | `calls.controller.ts`, `flag-catalog.ts:85` |
| Групповые звонки (в группах, каналах) | Есть: участники, mute, голосования, «идёт звонок» | ✅ | `calls.controller.ts:80-333` |
| Нативный экран входящего (CallKit / PushKit на iPhone) | Есть: VoIP-push → CallKit | ✅ | `ios/Runner/AppDelegate.swift`, `apns-voip.sender.ts` |
| Android: системный экран входящего (Telecom ConnectionService) | Через `flutter_callkit_incoming` (полноэкранное уведомление), не Telecom API | 🟡 | Достаточно для магазина; полный ConnectionService — позже |
| TURN-релей для NAT | coturn на одном t4g.nano, временные логины | 🟡 | `infra/modules/turn`; одна машина = и риск отказа, и нет потолка трафика. 👤 DNS `turn.lawbid.dev` + секрет в админку (`docs/runbooks/TURN.md`); позже — 2 инстанса/автоскейл |
| SFU для групповых видео (Zoom, Telegram) | Нет (интерфейс провайдера подготовлен, звонки p2p/mesh) | ❌ | `calls/video-call-provider.ts:13`; подключить LiveKit/mediasoup когда видео-звонки включатся массово |
| Индикатор качества, перезвон при обрыве | `QualityTracker` по `getStats`; rejoin-бар; backoff при rate-limit сокета | ✅ | `calls/application/call_media.dart`, `call_rejoin.dart` |
| События звонка с порядковым номером (без опроса) | `seq` на каждом `call:*`, resync только при пропуске | ✅ (economy) | пакет H, `call-seq.spec.ts` |
| SLO «звонок соединился» с алармом | Есть (95 %) | ✅ | `monitoring/slo.tf` |
| Отказ от звонка на системном экране убитого приложения доходит до сервера | Открытый вопрос из HANDOFF | 🟡 | `docs/HANDOFF.md` «declining a call… needs a decision» |

### 5. Лента, посты, рилсы

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Ранжирование (подписки + интересы + свежесть), «уже видел» | Скоринг постов/людей/дел/сообществ, seen-set в Redis, веса в админке | ✅ | `recommendations/*.scoring.ts`, `feed.service.ts:482` |
| Курсорная пагинация, страница 1 в кэше | Курсоры везде, страница 1 в Redis 60 с и на телефоне (Drift) | ✅ | `feed.service.ts:44`, пакет A/D |
| Просмотры/показы батчем (≥50 % карточки ≥1 с) | `POST /posts/events kind=view`, батч 4 с, 1 просмотр/24 ч | ✅ (economy) | `post-events.service.ts`, пакет A |
| Лайки, комментарии (ответы, лайки), репосты, «Сохранённое», архив, закреп | Всё есть; лайк→анлайк склеивается; одно «Сохранённое» для обеих ролей | ✅ | `posts.controller.ts`, `comments/*`, PR #240 |
| Хэштеги, упоминания, скрытые теги | Есть | ✅ | `posts/hashtags.ts`, `mentions/*`, `hidden-tags.ts` |
| Рилсы/видео через CDN-энкодер, инсайты автора | Bunny Stream, 1080p, токен на плеер, `GET /posts/:id/insights` | ✅ | `videos/*`, `post-insights.service.ts`. 👤 Bunny Read-only API key в админку (подпись вебхука) |
| Модерация текста и картинок до/после публикации | Текст — правила; картинки — Rekognition + PhotoDNA-адаптер; видео — только обложка | 🟡 | `moderation/rule-based-moderation.hook.ts`, `media-moderation/*`. 👤 IAM `rekognition:DetectModerationLabels`, регион в админке; PhotoDNA-заявка |
| Комментарии в реальном времени | `comment:new` через `post:watch` | ✅ (economy) | пакет F |
| «Не интересно» / скрыть автора / жалоба из карточки | Жалобы и блокировки есть; явного «меньше такого» нет | 🟡 | `reports`, `blocks`; сигнал «not interested» в `recommendations` — позже |

### 6. Stories

Выключены до следующего релиза (`storiesEnabled = false`, флаг `stories`); сервер, модерация и очистка при удалении аккаунта уже учитывают story-файлы (`account-anonymization.service.ts:283`). Одна строка — по слову владельца.

### 7. Профили, подписки, поиск, «кого почитать»

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| @username, публичная ссылка, QR/поделиться | username + подсказки свободных, публичная SEO-страница `/attorneys/<u>/`, ссылка из приложения ведёт туда | ✅ | `usernames/*`, `profile_mappers.dart` (`publicUrl`) |
| Подписки/подписчики со счётчиками, мгновенный отклик | `follow` отвечает `{following, followersCount}`, правится локально | ✅ (economy) | пакет D |
| Блокировка, «кто может писать/звонить/добавлять в группу», фото/«о себе» | Есть | ✅ | `blocks/*`, `UserPrivacySettings` |
| Поиск людей: транслитерация, опечатки, порядок слов | Postgres `f_name_skel/f_name_cons` + те же правила в приложении | ✅ | `common/search/name-match.sql.ts`, `core/text/search_fold.dart` |
| Рекомендации людей/сообществ | `people.scoring.ts`, `communities.scoring.ts` | ✅ | `recommendations/*` |
| Значок «проверен» / доверие | Attorney trust + проверка номера адвоката по реестрам штатов | ✅ | `attorney-trust/*`, `verification/providers/bar-lookup/*` |
| Просмотр без регистрации (Instagram, Avvo) | Нет: без токена всё ведёт на `/welcome` | ❌ | 👤 Решение A1 из OWNER_TODO; затем read-only лента/поиск/профили для гостей (`app_router_guard.dart`) |
| Один профиль для всех ролей | Три реализации профиля (1 614 + 374 + 720 строк) | 🟡 | Аудит #4 §1 — одна оболочка с секциями по роли (L) |
| Ярлык «Attorney Advertising» по штату | Есть | ✅ | `countries/attorney-advertising.service.ts` |

### 8. Дела, ставки, оферты, консультации (ядро маркетплейса)

| Что есть у больших сервисов (Thumbtack/Avvo/Upwork) | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Дело → ставки → встречные → принятие → кабинет дела | Всё есть, включая проценты (contingency), приглашения, конфликт-проверку с policy доступа | ✅ | `cases/*`, `bids/*`, `bids/conflict/*` (fix PR #242) |
| Кабинет дела: задачи, файлы, журнал, дедлайны, шаблоны документов, подписание PDF | Есть | ✅ | `cases/workspace/*`, `deadlines/*`, `document-templates/*`, `cases/tools/signing.pdf.ts` |
| Оплата дела через платформу с чеком, спорами, возвратами | Stripe, чек PDF, `charge.dispute.*`, возвраты из админки; комиссию платит только клиент (ABA 5.4) | ✅ | `case-payments/*`, `payment-receipt.pdf.ts`, `case-payments.settings.ts:87` |
| Антифрод клиента/адвоката, холды | Trust gate, holds, client-fraud, client-badge | ✅ | `case-payments.service.ts:221`, `client-fraud/*` |
| Отзывы с апелляцией | Есть | ✅ | `client-reviews/*`, admin `review-appeals` |
| Устаревшие дела: напоминание и скрытие | Есть, с датами в DTO | ✅ | `cases/lifecycle/*` |
| События и дельты вместо 34 перезагрузок | `case:update`, `consultation:update`, `?updatedSince` | ✅ (economy) | пакет E |
| Тесты денежных путей | Покрыты (PR #240: billing, bid-packs, case-payments, search) | ✅ | `case-payments.flows.spec.ts` и др. |
| Фиксированная цена, которую платит адвокат | Разрешено; риск обхода комиссии | 🟡 | 👤 Решение A2 из OWNER_TODO |

### 9. Вопросы-ответы (Q&A)

| Что есть у больших сервисов (Avvo Q&A, Quora) | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Вопрос, ответы адвокатов, лайки, «лучший ответ», удаление, сводка | Всё есть; админ снимает «лучший» | ✅ | `legal-qa/*.controller.ts` |
| Дельта «мои вопросы» | `GET /questions?filter=mine&updatedSince` | ✅ (economy) | пакет F |
| Модерация и жалобы на вопросы/ответы | Через общий `reports` + правила текста | ✅ | `reports/*`, `moderation/*` |
| Ответ ИИ-помощника | Нет LLM в API (правила на будущее записаны) | ❌ (осознанно) | `docs/SECURITY_TODO.md` «Rules for a future LLM feature» |

### 10. Уведомления, бейджи, пуши

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Пуш с аватаром и именем (iOS NSE, Android MessagingStyle) | Код есть: `mutable-content`, `NotificationService.swift`, `ChatNotifications.kt` | 🟡 | 👤 Добавить таргет Notification Service Extension в Xcode (`docs/runbooks/IOS_CHAT_NOTIFICATIONS.md`; в `project.pbxproj` его ещё нет) |
| Тихие часы, настройки по темам, mute чата, бейдж на иконке | Есть: `NotificationQuietHours`, `notification-topics.ts`, бейджи в Redis | ✅ | `notifications/*`, `badges.service.ts` |
| Пуши в языке пользователя (85 языков) | Серверные тексты через i18n-таблицу, fallback ru/en | ✅ | `common/i18n/server-texts.service.ts`, `notification-template.service.ts` |
| Пуши параллельно, не по одному | Очередь + fan-out батчами | ✅ | `push-queue.service.ts`, `push-fanout.spec.ts` |
| SLO доставки пушей с алармом | Есть (98 %) | ✅ | `monitoring/slo.tf` |
| Разрешение на пуш/микрофон — в контексте, а не сразу | Карточка-объяснение, микрофон — при первом звонке | ✅ | PR #243/#244 «permission card» |
| Список уведомлений: догон дельтой, поиск | `GET /notifications?updatedSince`, `?q`, событие `notification:new` | ✅ (economy) | пакет F |
| E-mail-дайджесты / «вы пропустили» | Нет (только транзакционные письма и алерты подписки) | ❌ | Позже; `subscription-alerts.service.ts` как образец |

### 11. Синхронизация контактов

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Только хэши номеров, дельты (добавил/удалил), «ничего не изменилось» | Хэш-проверка, только изменения, удалённые снимаются с сервера | ✅ | PR #238, `contacts_sync/application/phone_contacts.dart` |
| «X присоединился» от сервера | `ContactsJoinedJob`, настройка `notify_joined` | ✅ | `contacts-sync.service.ts:88,119` |
| Серверный «перец» для хэшей (против перебора) | HMAC-pepper, дуальное чтение, бэкфилл | 🟡 | `contacts-pepper.ts`. 👤 Создать `CONTACTS_PEPPER` в Secrets Manager и добавить в `extra_secrets` (`DEPLOY_PROD.md`) |
| Удалить загруженную книгу | `DELETE /contacts/sync` | ✅ | `contacts-sync.controller.ts:102` |
| Лимит тела WAF не ломает большие книги | Правило-исключение для пути | ✅ | PR #245, `alb/main.tf` |

### 12. Платежи, подписки, места, продвижение

| Что есть у Stripe / Slack | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Цены с сервера, вебхук с подписью и дедупом, идемпотентность | Да, fail-closed без секрета, idempotency key от клиента | ✅ | `stripe-webhook.intake.ts`, `subscriptions.idempotency.spec.ts` |
| Оплата на своей web-странице (карта, Apple Pay, Google Pay); iOS — ссылка наружу по правилу 3.1.1(a) | Страница `/pay.html`, карта + кошельки; iOS открывает её в браузере (PR #241) | 🟡 | `billing/pay-page.*`. 👤 Stripe → Payment method domains → `lawbid.dev`, файл `apple-developer-merchantid-domain-association` в `/.well-known/` |
| Места для ассистентов с пропорциональным пересчётом (Slack seats) | Есть, `prorationDate`, `pending_update_*` | 🟡 | `billing/seats.service.ts`, PR #239. 👤 Добавить события `customer.subscription.pending_update_applied/expired`, `payment_intent.succeeded` в вебхук Stripe |
| Dunning: `past_due`, льготный период, письма, Customer Portal | Есть: `past_due_grace_days`, алерты, портал | ✅ | `subscription-sync.service.ts:100,180`, `subscription-alerts.service.ts` |
| Чеки/инвойсы, возвраты, диспуты | Чек PDF, `receiptUrl`, возвраты из админки со step-up, диспуты по кейс-платежам | ✅ | `payment-receipt.pdf.ts`, `admin-billing.controller.ts` |
| Промокоды с атомарным лимитом, аудитория по роли | Исправлено в PR #242 | ✅ | `promotions.service.ts` |
| Пакеты ставок, продвижение (boost), звёзды/подарки, рефералы, награды | Всё есть; ассистент не тратит деньги хозяина | ✅ | `bid-packs`, `promotions`, `stars`, `referrals`, `rewards` |
| Выплаты адвокатам/партнёрам (payroll, treasury) со step-up и maker-checker | Есть: step-up на bulk payouts, потолок суммы, approvals | ✅ | `admin-payroll.service.ts:207`, admin `approvals` |
| Налоги (Stripe Tax) | Нет | ❌ | `automatic_tax` в Checkout/Subscription при выходе за один штат |
| Radar / защита от card-testing | Лимит на создание checkout в коде; Radar-правила в кабинете не подтверждены | 🟡 | 👤 Stripe Radar: block highest, review elevated, 3DS (`COST_PROTECTION.md §3`) |
| StoreKit / Google Play Billing для цифровой подписки | Нет (выбран web-link-out) | ❌ (осознанно) | Если Apple отклонит — StoreKit 2 (аудит #2 §3) |

### 13. Верификация, модерация, жалобы

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Проверка адвоката по реестру штата + ручная проверка | Авто-lookup (NY Open Data, generic REST), формат номера по штату, блокировки перебора, ручная очередь | ✅ | `verification/providers/bar-lookup/*`, `bar-attempts.service.ts` |
| Проверка документа + селфи (Stripe Identity / Persona) | Документ+селфи — вручную админом, выключено по умолчанию; авто-провайдера нет (слот `id_check` в cost-guard зарезервирован) | 🟡 | `verification-responses.dto.ts:128`; подключить Stripe Identity при росте |
| Модерация картинок (Rekognition), CSAM-хэши (PhotoDNA), отчёт в NCMEC | Rekognition готов; PhotoDNA-адаптер написан, не прогнан; NCMEC — ручная подача | 🟡 | `media-moderation/*`, `csam.adapters.ts`. 👤 IAM-право, PhotoDNA-заявка, регистрация ESP на report.cybertip.org; хранение улик 1 год — в коде ✅ |
| Модерация видео целиком | Только обложка рилса | ❌ | Rekognition `StartContentModeration` требует видео в S3 (сейчас в Bunny) — решить позже |
| Жалобы с категориями, санкции, баны, апелляции | 15+ причин, `sanctions`, `account-bans`, `moderation-appeals` | ✅ | `ReportReason`, `moderation/moderation-appeals.*` |
| Очереди модератора в админке | Верификация, жалобы, медиа, апелляции, траст, журнал модерации | ✅ | admin `moderation*`, `media-moderation`, `verification` |
| Модераторы на 85 языках | Админка только по-русски | 🟡 | `admin/src/lib/labels.tsx` — i18n админки позже |

### 14. Ассистенты, роли, права

| Что есть у больших сервисов (Slack roles, Stripe team) | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Гранулярные права (duties) с явным согласием на ответственность | 10 обязанностей, старт — ноль прав, `bids`/`publish` только с принятием ответственности, `max_duties` | ✅ | `assistants/assistant-duties.ts` |
| Ассистент не может захватить аккаунт/деньги | Закрыто в PR #242 (`@AssistantSelf`, `@AttorneyOnly`, разлогин при удалении) | ✅ | аудит #3 §1–3, §6 |
| Проверка прав на каждом запросе на сервере | `jwt-auth.guard.ts`, подтверждено аудитом #3 | ✅ | `auth/guards/*` |
| Места ассистентов оплачиваются | Seats (см. §12) | ✅ | `billing/seats.service.ts` |
| Роли админки (super, payroll, billing, users, moderation…) + шаблоны | `AdminRole`, `AdminRoleTemplate` | ✅ | `schema.prisma:709,3307` |

### 15. Настройки, приватность, согласия, экспорт, удаление

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Согласия append-only, с версией документа | Да: terms/privacy/disclaimer/age_18/analytics/marketing… | ✅ | `schema.prisma:81-91,1124-1145` |
| Аналитика только после согласия (EDPB) | Гейт по consent на всех платформах | ✅ | `app_events.dart:38-43`, `analytics-consent.service.ts` |
| Экспорт данных (GDPR Art. 20) | Есть, со сроком жизни файла | ✅ | `privacy/data-export.*`, `exports-cleanup.service.ts` |
| Удаление аккаунта с грейсом 14 дней, покрывающее ВСЕ файлы, Bunny, Stripe Customer | Да (PR #243): все purposes, `videos.markDeleted`, `deleteCustomer`, stories | ✅ | `account-anonymization.service.ts:153-283` |
| Страница удаления аккаунта для магазинов | `https://lawbid.dev/delete-account` | ✅ | `docs/runbooks/STORE_RELEASE.md` |
| CCPA «Do not sell/share» переключатель | В политике написано, что данные не продаются; отдельного переключателя нет | 🟡 | Добавить строку в Settings → Приватность (лог согласия `do_not_sell`) |
| Приватность: last seen, кто пишет/звонит/добавляет, фото, «о себе» | Есть | ✅ | `UserPrivacySettings` |
| Ретенция: журнал дел, экспорты, стори, загруженные книги | Есть job-ы | ✅ | `journal-retention.service.ts`, `exports-cleanup.service.ts` |
| Заявление о доступности | Нет типа документа | ❌ | `LegalDocType` + `assets/legal/accessibility.*.md` |

### 16. Языки (i18n)

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Все тексты приложения на всех языках сразу | 85 языков, аудит «0 пропусков» в CI (blocking) | ✅ | `mobile/lib/core/l10n/*`, `scripts/i18n-audit.mjs`, `mobile-ci.yml:88` |
| RTL, множественные формы, bidi для @username | Есть | ✅ | `core/l10n/plural_rules.dart`, `core/text/bidi.dart` |
| Тесты переполнения на длинных языках | Непальский/арабский | ✅ | `test/l10n/lang_*.json` |
| Серверные тексты (пуши, письма, часы поддержки) на всех языках | Через i18n-таблицу с fallback | ✅ | `server-texts.service.ts` |
| Юрдокументы на 10 главных языках | Код и скрипт готовы; переводы — черновики после ключа | 🟡 | 👤 `GOOGLE_TRANSLATE_API_KEY=… npm run legal:translate` (≈ $12) |
| Направленные отступы (`EdgeInsetsDirectional`) везде | ~43 места с `left/right` | 🟡 | Аудит #4 §4 — проход по `EdgeInsets.only(left:)` |
| Названия языков в языке интерфейса | Английские названия в пикере | 🟡 | `language_picker_sheet.dart` — позже |

### 17. Темы и доступность

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Светлая/тёмная + фирменные темы, только токены | Day, Night, Navy, Glass; тест на сырые цвета/размеры | ✅ | `core/design_system/theme/app_theme.dart`, design_tokens test |
| Dynamic Type / масштаб текста | До 1.3× в оболочке, полный масштаб в сообщениях и постах | ✅ | `mobile/lib/app.dart:80` |
| Reduce motion | Учитывается точечно (`disableAnimations`) в 4 виджетах | 🟡 | Общий `MediaQuery.disableAnimations` в `AppMotion`/переходах роутера |
| Семантика для VoiceOver/TalkBack, контраст | Есть `Semantics` в ключевых виджетах; полного аудита WCAG не было | 🟡 | Прогон с VoiceOver по 10 главным экранам |
| Клавиатура не мешает навигации | `UnfocusOnNavigateObserver` | ✅ | HANDOFF 2026-10-19 |

### 18. Аналитика и отчёты о падениях

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Крэши Dart + нативные (iOS/Android), ANR, символы, обфускация | Sentry Flutter + native, `--obfuscate --split-debug-info`, загрузка символов | 🟡 | `core/diagnostics/crash_reporter.dart`, Fastfile. 👤 `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` на Mac и в GitHub secrets |
| Серверный Sentry с вычисткой PII | Есть | ✅ | `app.setup.ts:195-230` |
| Продуктовые события (воронки, удержание) с согласием | Есть очередь событий, согласие, `screen_view`/`app_open`; события из `docs/analytics_events.md` отправляются частично | 🟡 | `app_events.dart`, `analytics/app-events.service.ts`; сверить список событий с документом, дашборд воронок в админке `analytics` |
| Крэш-репорты от пользователей в админке | `crash-reports`, admin `crashes` | ✅ | `crash-reports/*` |
| Деловые метрики (регистрации, OTP, звонки, пуши) | SLO-счётчики раз в минуту | ✅ | `common/ops/slo-metrics.service.ts` |

### 19. Кэш, офлайн, «экономный клиент»

| Что есть у Telegram / Instagram / WhatsApp | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Старт одним запросом с ETag | `GET /me/session` + `If-None-Match`, bootstrap только при смене версии | ✅ (economy) | пакет G, `session/*` |
| Дешёвые ETag (до сборки тела), `Cache-Control` на справочниках | Есть: bootstrap, профиль, pricing/plans/legal/countries/stickers/templates | ✅ | пакет D |
| Дельты `updatedSince` + `deletedIds`, `409 SYNC_TOO_OLD` → полная загрузка | Общий механизм `common/sync/`; чаты, группы, дела, консультации, уведомления, каналы, Q&A | ✅ | пакеты B/E/F, `SyncedListNotifier` |
| События вместо опроса (звонки, бейджи, комментарии) | Опросы 30 с/10 с убраны, `seq` на звонках, QR 10 с | ✅ | пакеты H/K |
| Данные на телефоне: сообщения, списки, переводы, HTTP-кэш на диске | Drift: сообщения 50 МБ, HTTP 32 МБ, лента 8 МБ, картинки 500 МБ, чат-медиа 300 МБ, файлы 200 МБ, видео 300 МБ; `keep_media_days` | ✅ (economy) | §5 плана, `core/media/app_image_cache.dart` |
| Экран «Данные и память» (как в Telegram) с «Очистить кэш» и «хранить медиа N дней» | Есть; потолки из `app_config`, на телефоне только понижать | ✅ | `app_routes.dart` → «Данные и память» |
| Медиа с `immutable`, кэш по URL без подписи | `Cache-Control: public, max-age=31536000, immutable` на каждом объекте | ✅ | пакет I |
| Приватное медиа через CDN с подписанными ссылками (не прямой S3) | Чат/голос/файлы дел — прямые presigned S3-ссылки на 1 ч | ❌ | 👤 CloudFront key group + `cdnBaseUrl` для приватных бакетов (infra), затем `files.service.ts` подпись CloudFront |
| Фоновые загрузки iOS URLSession / Android WorkManager | Постоянная очередь в приложении с повтором (не системная) | 🟡 | PR #244; системные фоновые загрузки — позже |
| Архитектурный тест «списки не перезагружаются целиком» | Есть | ✅ | economy-mobile «architecture test for list reloads» |
| Трафик за день показывается пользователю | Счётчик трафика дня | ✅ | economy-mobile `9d1ed0178` |

### 20. Админка

| Что есть у больших сервисов (Stripe Dashboard, Slack admin) | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Обязательный второй фактор для всех админов | TOTP обязателен (enrol при первом входе, recovery-коды) | ✅ | `admin-auth.service.ts:937,972`. 👤 Сохранить recovery-коды (`OWNER.md`) |
| Passkeys для админов | Нет | ❌ | research #5 B3/B4 |
| Step-up на деньги/телефон/bulk; maker-checker на выплаты | Есть + потолок суммы bulk-выплат + очередь approvals | ✅ | `admin-payroll.controller.ts:147,187,242`, admin `approvals` |
| Журнал действий с обоснованием (`X-Justification`) | Есть | ✅ | `admin-access/audit-log.service.ts`, admin `audit-log` |
| Фичефлаги, конфиг, лимиты, интеграции (ключи шифруются) | 35 флагов, `app_config`, cost-guard, `SecretEnvelope` | ✅ | `feature-flags/flag-catalog.ts`, `admin-config`, `admin-integrations` |
| IP-allowlist, httpOnly cookie, nonce-CSP, HSTS | Есть; список CIDR по умолчанию пуст | 🟡 | `alb/main.tf:178-230`. 👤 Задать `admin_allowed_cidrs` (ваш IP/VPN) |
| Очереди: верификация, жалобы, медиа, поддержка (макросы, SLA), траст, заявки на данные | Есть; боковая панель опрашивает только `/admin/counts` | ✅ | admin `(app)/*`, пакет J |
| Мёртвые страницы/флаги | «Справочник» и `guide_section_*` удалены | ✅ | PR #240 |
| Язык админки | Только русский | 🟡 | i18n админки — после найма модераторов |
| Открытый редирект после входа | Закрыт (`//`, `/\`, `javascript:`, `data:`) | ✅ | PR #247, `login-form.tsx` тест |

### 21. Web-приложение, SEO, публичные страницы

| Что есть у больших сервисов | У нас | Статус | Где в коде / что сделать |
|---|---|---|---|
| Статические SEO-страницы адвокатов/областей, sitemap, robots, JSON-LD, абсолютный og:image | Есть | ✅ | `scripts/seo/build.mjs`, `seo-deploy.yml` |
| Настоящий 404 (а не soft-404) для удалённых страниц | CloudFront Function `seo_index` + `app_noindex` | ✅ | `infra/modules/web/main.tf:297,369` |
| Web-сборка: CSP без `unsafe-inline` для скриптов, refresh в HttpOnly cookie, версионированные выкладки с откатом | Есть (`releases/<sha>/`, `rollback.yml` для web) | ✅ | `web/main.tf:192-215`, `web-deploy.yml:4`, `rollback.yml:11` |
| Публичные страницы: terms, privacy, contact, delete-account, `.well-known` (AASA, assetlinks) | Есть | ✅ | `scripts/seo/well-known.mjs`, `docs/deeplinks/*` |
| WAF перед CloudFront | Модуль `cdn-waf` | ✅ | `infra/modules/cdn-waf`. 👤 `terraform apply` |
| Web как Instagram web (ширина ≥600 px — десктоп) | Есть, safe-area iPhone, in-tab SQLite fallback | ✅ | `shell_layout.dart`, `core/persistence/drift_web.dart` |
| Гостевой просмотр на web (для SEO-трафика) | Нет (см. §7) | ❌ | Решение владельца A1 |

---

## ЧАСТЬ II. ВНЕШНИЕ СИСТЕМЫ И ИНФРАСТРУКТУРА

### 22. AWS

| Что делают большие | У нас | Статус | Где / что сделать |
|---|---|---|---|
| Автомасштабирование вверх и вниз по CPU, запросам и глубине очереди | API: CPU 60 % + запросов на таск; worker: CPU + очередь; вниз до 1+1, Spot для остальных | ✅ | `infra/modules/ecs/main.tf:599-670` |
| RDS Multi-AZ, бэкапы, копия в другой регион/аккаунт, удаление защищено | AWS Backup → us-west-2 (35 дней), check-блоки Terraform; Multi-AZ/retention — переключить в консоли (база вне Terraform) | 🟡 | `infra/modules/backup`. 👤 RDS → Modify → Multi-AZ, retention 14+, deletion protection (`backups.md`) |
| Учебное восстановление из бэкапа | Скрипт готов, ни одного прогона в журнале | ❌ | 👤 `scripts/ops/restore-drill.sh` (≈ 40 мин, $0.10) — до релиза |
| Redis: TLS, auth, отдельные узлы для очередей и кэша, реплика | TLS+auth ✅; один `cache.t4g.micro`, replicas=0, `noeviction`; отдельный cache-узел — переменной | 🟡 | `launch.tfvars.example:47-48`, `variables.tf:231`; при росте: `redis_replicas=1`, `redis_cache_node=true` |
| S3: block-public, SSE-KMS, versioning, репликация, CloudFront OAC | Есть | ✅ | `infra/modules/s3`, `main.tf:309` |
| Подписанные CloudFront-ссылки для приватного медиа | Нет (presigned S3) | ❌ | см. §19 |
| WAF: managed rules, rate-limit, OTP-правило, Bot Control, WAF на CloudFront | Есть (Bot Control — опционально, платный) | ✅ | `alb/main.tf:216-369`, `cdn-waf`. 👤 `apply`; решить про Bot Control (~$10/мес) |
| VPC endpoints (ECR, logs, secrets, S3) — без NAT | Есть в tfvars | ✅ | `launch.tfvars.example:54` |
| KMS на базу, S3, Redis, логи, секреты; ключи сообщений под KMS | Инфра ✅; `MESSAGE_ENC_KEYS`/`SECRETS_MASTER_KEYS` — сырые env | 🟡 | `docs/SECURITY_TODO.md` (KMS data key + job пере-шифрования) |
| CloudTrail, GuardDuty, Access Analyzer, парольная политика, алерты ≥7 | Модуль `security-baseline` | 🟡 | `infra/modules/security-baseline`. 👤 `apply`; MFA на root, удалить root access keys, IAM Identity Center |
| Контейнеры: non-root, read-only FS, без exec | Есть | ✅ | `ecs/main.tf:151-158`, Dockerfile `USER app` |
| Keep-alive длиннее ALB idle | 310 с | ✅ | `api/src/main.ts:42` |
| Staging/preview-среда | Папка `infra/envs/staging` есть; `STAGING_ENABLED` выключен | 🟡 | `deploy.yml:13`; включить при появлении второго разработчика |
| Бюджет и аномалии расходов | $200/мес, письма 50/80/100 %, ops-guard фиксирует min tasks | ✅ | `infra/modules/budget`, `ops-guard.job.ts` |
| DDoS | Shield Standard (бесплатно, автоматически) + WAF rate rules | ✅ | — |
| Логи: сэмплирование 1 %, retention 30 дней, редакция PII | Есть | ✅ | `common/logging/http-log-policy.ts` |

### 23. CI/CD и цепочка поставок

| Что делают большие | У нас | Статус | Где / что сделать |
|---|---|---|---|
| Actions по SHA, минимальные `permissions` | 0 непривязанных `uses:` | ✅ | `.github/workflows/*` (PR #245) |
| `ignore-scripts`, выдержка версий, Dependabot cooldown | `.npmrc` (`ignore-scripts=true`, `min-release-age=7`), cooldown 7/14 дней | ✅ | `.npmrc`, `.github/dependabot.yml` |
| Сканы: CodeQL, Trivy, gitleaks, `npm audit` с allowlist | Есть, gate блокирующий | ✅ | `codeql.yml`, `container-scan.yml`, `secret-scan.yml`, `scripts/ci/npm-audit-gate.mjs` |
| Контракт API: oasdiff без ломающих изменений, Dart-клиент | Есть | ✅ | `api-ci.yml:7`, `packages/api-contract` |
| Безопасные миграции: прогон «с предыдущего релиза» | `scripts/migrate-from-previous.mjs` | ✅ | `api-ci.yml:178` |
| e2e на реальной БД/Redis/S3, шардированные | Есть | ✅ | `api-ci.yml:247-254` |
| Mobile CI: analyze, тесты, golden, запрет сырых строк/цветов, build-check Android/Web | Есть; аудит зависимостей — advisory | 🟡 | `mobile-ci.yml:75` — сделать blocking с allowlist |
| Деплой с откатом (ECS + web), OIDC вместо ключей | Есть | ✅ | `deploy.yml`, `rollback.yml` |
| Защита ветки `main` (required checks, no force-push) | Не проверяется из кода | 🟡 | 👤 GitHub → Settings → Branches; Actions → read-only permissions |
| Мажорные апгрейды с отложенными advisory (Prisma 7, Next 16, swagger 12) | В allowlist до 2027-01-31 | 🟡 | `docs/SECURITY_TODO.md` «Dependencies left» |
| Over-the-air патчи (Shorebird) | Не настроен | ❌ | `STORE_RELEASE.md:152` — по желанию |
| Принудительное обновление по минимальной версии | `min_app_version_<platform>` в конфиге | ✅ | `admin-config/config-schema.ts:348` |

### 24. Наблюдаемость

| Что делают большие | У нас | Статус | Где / что сделать |
|---|---|---|---|
| Sentry сервер + клиент, символы | Есть (символы — ключ владельца) | 🟡 | см. §18 |
| Инфра-алармы с runbook на каждый | 24 аларма, таблица → runbook | ✅ | `infra/modules/monitoring/main.tf`, `docs/runbooks/README.md` |
| SLO burn-rate (fast/slow) на OTP, звонки, пуши, регистрации | Есть | ✅ | `monitoring/slo.tf`, `slo.md`. 👤 после запуска задать `min_daily_signups` |
| Внешний canary | CloudWatch Synthetics каждые 5 мин (~$10/мес) | ✅ | `uptime_canary_enabled` |
| Дашборды | 4 Grafana JSON (api-health, business, db-redis, queues) | ✅ | `infra/observability/grafana` |
| Ежедневная самопроверка прода | `self-check.yml` (в т.ч. «drill старше 100 дней») | ✅ | `.github/workflows/self-check.yml` |
| Дежурство/ротация, статус-страница | Дежурный — владелец; статус-страницы нет | ❌ | Позже: Route 53 health + простая status-page (Instatus/Upptime) |
| Трассировка запросов (OpenTelemetry) | Нет (только логи + Sentry performance) | 🟡 | Не нужно до роста |

### 25. Платные сторонние сервисы — потолки и алармы

| Сервис | В коде | В кабинете (👤) | Статус |
|---|---|---|---|
| Twilio SMS | US-only, 30/мин, 300/сутки, 5000/мес, лимиты на номер/IP/устройство, fail-closed; cost-guard в центах | Geo Permissions US, SMS Pumping Protection, auto-recharge OFF, Usage Triggers $10/25/50 — не подтверждено | 🟡 |
| AWS SES | 100/мин, 2000/сутки, 30000/мес; DKIM/SPF/DMARC quarantine | Квота SES; через 4 недели DMARC → `p=reject` | ✅ |
| Google Translate | 60/мин, 5000/сутки, 50000/мес + на пользователя; в центах по символам; кэш | Quota «Requests per day» в GCP — не подтверждено | 🟡 |
| AWS Rekognition | провайдер `image_moderation`, повтор бесплатно, `skipped (budget)` | IAM-право; AWS Budget + Anomaly ✅ | 🟡 |
| Bunny Stream | загрузки 30/1000/10000, токен на плеер | Traffic limit / spend alert на зону; Read-only ключ в админку | 🟡 |
| FCM / APNs | ≤10 устройств, только свои, сервис-аккаунт из Secrets Manager | APNs .p8 в Firebase | ✅ |
| S3 / CloudFront egress | OAC, presigned TTL, лимиты загрузок; WAF на CloudFront | Budget + Anomaly ✅ | ✅ |
| Stripe | цены с сервера, подпись, дедуп, idempotency, лимит checkout | Radar-правила, вебхук-события | 🟡 |
| Stripe Identity / Persona | слот `id_check` 5/мин, 20/сутки, 200/мес | не подключены | — |
| ECS compute | ops-guard при 100 % бюджета фиксирует min tasks | Budget ✅ | ✅ |
| CloudWatch Logs | 1 % сэмпл, retention 30 дней | — | ✅ |

Общее правило: автопополнение везде выключено, алерты на почту — пройти чек-лист `docs/COST_PROTECTION.md` и отметить галочки.

### 26. Право и соответствие

| Что делают большие | У нас | Статус | Где / что сделать |
|---|---|---|---|
| Terms, Privacy (CCPA/CPRA), Cookies, EULA, Refund, DMCA, Third-party, соглашения ролей — на языках пользователей | 10 документов en+ru; 10 языков — после ключа перевода | 🟡 | `api/assets/legal/*`, 👤 `npm run legal:translate` |
| Принятие документов с версией, повторное принятие при обновлении | Есть | ✅ | `legal-documents/*`, consents |
| «Attorney Advertising» (NY 7.1(f)) на профилях/постах по штату | Есть | ✅ | `attorney-advertising.service.ts` |
| Комиссия только с клиента (ABA 5.4, Avvo-кейс) | `feePayer: 'client'` | ✅ | `case-payments.settings.ts:87` |
| CSAM: хэш-матч, отчёт NCMEC, хранение улик 1 год | Адаптеры есть, подача вручную | 🟡 | 👤 PhotoDNA + ESP-регистрация (`SECURITY_TODO.md`) |
| DMCA: политика + причина жалобы + удаление | Политика и жалоба `copyright` | ✅ | `dmca_policy.*.md`, `reports` |
| Возраст 18+ (согласие) | `age_18` | ✅ | `ConsentType` |
| Ретенция и удаление по запросу, журнал заявок | Есть, admin `data-requests` | ✅ | `privacy/*` |
| Заявление о доступности | Нет | ❌ | см. §15 |
| Breach-runbook, уведомление регуляторов | Есть | ✅ | `docs/runbooks/BREACH.md` |

### 27. Готовность к магазинам

| Требование | У нас | Статус | Где / что сделать |
|---|---|---|---|
| iOS privacy manifest, тексты разрешений, ATS без исключений в prod | Есть; `NSAllowsLocalNetworking` только dev | ✅ | `ios/Runner/PrivacyInfo.xcprivacy`, `Info.plist:44-52` |
| Android: `allowBackup=false`, `networkSecurityConfig`, R8, minSdk 26 | Есть; `dataExtractionRules` (Android 12+) не объявлен | 🟡 | `AndroidManifest.xml:49-50`; добавить `android:dataExtractionRules` |
| Deep links: AASA, assetlinks, `autoVerify`, проверка хоста | Есть | ✅ | `docs/deeplinks/*`, `deep_link_controller.dart:98` |
| App Check в приложении | `firebase_app_check` подключён | 🟡 | 👤 регистрация App Attest / Play Integrity / reCAPTCHA |
| Ограничение Firebase-ключей по bundle/SHA-1 | — | 🟡 | 👤 Google Cloud → Credentials (`SECURITY_TODO.md`) |
| Экраны с документами без скриншотов | `FLAG_SECURE` / iOS capture guard на верификации | ✅ | `MainActivity.kt:283`, PR #247 |
| Подпись релизов, обфускация, символы | Fastlane; сборка prod без ключа падает сразу | 🟡 | 👤 upload keystore, `google-services.json`, `GoogleService-Info.plist`, `config/prod.json` (`pk_live_`), APNs .p8 |
| Тексты магазинов на 39 (App Store) / 87 (Play) языках | Есть | ✅ | `fastlane/metadata` |
| Скриншоты, иконка 512, feature graphic, демо-коды для ревьюера | — | ❌ | 👤 `docs/store/RELEASE_CHECKLIST.md §3, §8` |
| Оплата цифровой подписки по правилам Apple (3.1.1(a)) | Ссылка наружу на web-страницу | 🟡 | PR #241; запасной план — StoreKit |
| Notification Service Extension | Файлы есть, таргета в Xcode нет | 🟡 | 👤 Xcode → New Target (`IOS_CHAT_NOTIFICATIONS.md`) |
| In-app review prompt | Нет | ❌ | `in_app_review` после успешного дела — по желанию |

---

## (a) ❌ / 🟡 — что ещё сделать, по приоритету

### API-работник
1. ❌ CloudFront signed URLs для приватного медиа (чат, голос, файлы дел) вместо прямого S3 — после ключей владельца (§19, §22).
2. 🟡 KMS-обёртка `MESSAGE_ENC_KEYS` + job пере-шифрования `enc:v2→v3`; data-only пуши (§2, §22).
3. ❌ Passkeys: `@simplewebauthn/server`, сначала для админки, потом пользователям (§1, §20).
4. 🟡 `auth:qr_approved` по socket вместо опроса (§1).
5. ❌ `GET /link-preview` с allow-list (§2).
6. 🟡 CCPA «do not sell» согласие + `LegalDocType.accessibility` (§15, §26).
7. ❌ Stripe Tax (`automatic_tax`) — когда выйдем за один штат (§12).
8. 🟡 Полная модерация видео через S3-копию (§13) — решение позже.
9. ❌ E-mail-дайджесты (§10) — позже.

### Mobile-работник
1. ❌ Гостевой просмотр ленты/поиска/профилей — после решения владельца A1 (§7, §21).
2. 🟡 Passkeys-клиент (плагин / MethodChannel) — после сервера (§1).
3. 🟡 Reduce motion глобально; VoiceOver-прогон 10 экранов (§17).
4. 🟡 43 ненаправленных отступа → `EdgeInsetsDirectional` (§16).
5. 🟡 Сверить продуктовые события с `docs/analytics_events.md` (§18).
6. 🟡 `dataExtractionRules` в манифесте; `in_app_review` (§27).
7. 🟡 Один профиль-шелл для всех ролей (§7) — большая задача, после релиза.
8. 🟡 Admin i18n (английский) — когда появятся модераторы (§13, §20).

### Инфра-работник
1. 🟡 `terraform apply` в `infra/envs/prod` (security-baseline, cdn-waf, backup, VPC endpoints, SLO, canary) — вместе с владельцем (§22–24).
2. ❌ Учебное восстановление — первый прогон до релиза (§22).
3. 🟡 Redis: `redis_replicas=1` и отдельный cache-узел при росте; TURN — второй инстанс/потолок трафика (§4, §22).
4. 🟡 Mobile CI: аудит зависимостей blocking с allowlist (§23).
5. 🟡 SFU (LiveKit) — только когда групповое видео включится массово (§4).
6. ❌ Статус-страница и дежурство (§24) — после запуска.

## (b) Только владелец (ключи, консоли)

Порядок — как в `docs/runbooks/OWNER_TODO_2026-10-22.md`; здесь — та же суть одной строкой каждая.

1. Решения: гости без регистрации (A1); запрет «фиксированной цены, которую платит адвокат» (A2); «делай сборки» (A3).
2. Stripe: добавить события вебхука (`pending_update_applied/expired`, `payment_intent.succeeded`); Payment method domains → `lawbid.dev` + файл Apple Pay в `/.well-known/`; Radar-правила.
3. AWS: `terraform apply` (вместе); RDS → Multi-AZ, retention 14+, deletion protection; `restore-drill.sh`; MFA на root, удалить root-ключи; `admin_allowed_cidrs`; IAM `rekognition:DetectModerationLabels`; `CONTACTS_PEPPER` в Secrets Manager; деплой API и worker одновременно.
4. Ключи: Bunny Read-only key → админка; `GOOGLE_TRANSLATE_API_KEY` для юрдокументов; `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`; Firebase: ограничить ключи по bundle/SHA-1, включить App Check (monitor → enforce через неделю); APNs .p8; `google-services.json`, `GoogleService-Info.plist`, `config/prod.json`, upload keystore.
5. Twilio: Geo Permissions US, SMS Pumping Protection, auto-recharge OFF, Usage Triggers. GCP: Translate quota. Bunny: traffic limit.
6. PhotoDNA-заявка; регистрация ESP в NCMEC (до этого — подача вручную).
7. Xcode: таргет Notification Service Extension (вместе).
8. Админка: сохранить recovery-коды TOTP; после запуска — `min_daily_signups`, дневные бюджеты.
9. GitHub: защита `main`, Actions read-only permissions.
10. Магазины: скриншоты, иконка, feature graphic, демо-коды; формы App Privacy / Data safety по `RELEASE_CHECKLIST.md`.

## (c) Вердикт простыми словами

По устройству мы уже на уровне больших сервисов: вход с ротацией токенов и разлогином, чаты с доставкой/прочтением/реакциями/папками/исчезающими и хранением на телефоне, группы с очередью рассылки, звонки через CallKit с TURN, лента с ранжированием и батчами просмотров, дельты и ETag вместо перезагрузок, экран «Данные и память», платежи как у Stripe (подпись, идемпотентность, dunning, чеки, споры, места, maker-checker), модерация текста и картинок, GDPR-удаление и экспорт, 85 языков, обязательный TOTP в админке, SHA-пиннинг и `ignore-scripts` в CI, SLO-алармы и canary, WAF, KMS, бэкапы в другой регион. Что отличает нас от Instagram/WhatsApp сейчас — не код, а три вещи: (1) **ключи и консоли** — около 20 шагов владельца (Stripe-вебхук и домены, Firebase App Check и ограничение ключей, Rekognition/PhotoDNA/NCMEC, Twilio-защита, `terraform apply`, Multi-AZ и первое учебное восстановление, NSE в Xcode) — без них часть готового кода просто не включена; (2) **масштаб** — один TURN, один Redis без реплики, p2p вместо SFU, приватное медиа мимо CDN, ключи сообщений не под KMS — всё это нормально для первых десятков тысяч пользователей и уже расписано на потом; (3) **мелочи уровня «зрелого продукта»** — passkeys, гостевой просмотр, превью ссылок, Stripe Tax, статус-страница, заявление о доступности, полная модерация видео. Ничего из списка не блокирует релиз, кроме шагов владельца из раздела (b) пункты 2–4 и первого прогона восстановления.
