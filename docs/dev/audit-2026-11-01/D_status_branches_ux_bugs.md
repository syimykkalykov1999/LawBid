# Аудит статуса / веток / UX / багов (read-only), база: origin/main 00cd2a1 (2026-11-01)
Метод: grep по коду main + git diff/merge-tree по веткам. «main» = origin/main. Не запускалось, только чтение.

## 1. Статус запросов владельца
### 1A. TODO_LIST_2026-11-01 (21 пункт)
| # | Пункт | Статус | Доказательство |
|---|---|---|---|
|1| iPhone зависает / чёрный рилс / строка автора | только ветка claude/reels-freeze | коммит a9ac9239b «start video only after page settles» + reels_screen.dart, тесты reels_swipe_settle/overlay_layout; в main их нет |
|2| Медленная загрузка видео/фото, куски в хранилище | не начато | в api/mobile нет multipart/presigned-part/tus; есть только клиентское сжатие core/media/video_compression.dart |
|3| Звонки: iPhone/Samsung, lock-screen, последний кадр | owner thread (#538); #519 в main, #522 открыт | main: 3da72a118 «locked callee stops ringing»; VoIP→CallKit 60 с — только PR #522 |
|4| Лаги звонков / шторка | не начато | нет getStats-замеров; нужен телефон |
|5| Плавность анимаций везде | не начато | reduce-motion учтён (93 файла), но замера/профиля нет |
|6| Белая вспышка темы, пустые квадраты профиля, архив серый, пол-экрана пусто, подъём после поиска | только ветка claude/archive-reauth (+ pull-refresh для 18) | system_nav_band.dart, back_swipe.dart, app_page_transitions.dart в ветке |
|7| Pull-to-refresh чувствительный | только ветка claude/pull-refresh | main: нет AppRefreshIndicator (design_system/widgets/feedback без него), 49 мест с RefreshIndicator |
|8| Android R8 ML Kit | PR #525 / ветка claude/mobile-release-fix | proguard-rules.pro +6 строк, только в ветке |
|9| Двум сотрудникам одна задача | не начато (нет репро) | work-lease/lease.service.ts: claim атомарен (INSERT..ON CONFLICT WHERE free/expired); дубль скорее в onClaimed/assignee_id очереди support или в stillOpen; perf-round-2 добавляет skipIfBusy — это скорость, не фикс |
|10| Поиск людей/чатов (#515), дел (#520), постов/тем, фильтры | PR #515/#520 открыты; посты/темы не начато | main: modules/search без правок под эти пункты |
|11| Уведомления: кейсы не приходят; колокольчик «назад» | п.24 — ветка no-extra-phone? (по списку); п.34 не начато | main: notifications/case-events.spec.ts есть, доставка не проверена; Handoff п.24 по факту в ветке claude/no-extra-phone не подтверждён (в diff ветки нет notifications_screen) -> считать «не начато» |
|12| Скрыть лайки/просмотры + закреп до 6 | owner thread: PR #517 открыт | main: hide_likes есть (posts.service.ts:289, post-engagement.service.ts:108), pin_slot 1..3 (posts: «slot 1..3») -> закреп до 6 НЕТ в main |
|13| Приватность «Мои подписчики / Мои подписки» | только ветка claude/privacy-follow | privacy-audience.ts (+84), миграция, e2e owner-privacy-follow; в main privacy-settings без followers/following |
|14| Убрать доп. телефон, кнопки кода, пароль-подтверждение | только ветки no-extra-phone (22) и archive-reauth (23) | archive-reauth: auth/services/password-reauth.service.ts (+206); main: reauth-verifier.service.ts (SMS/email токен) |
|15| Геолокация в чате как WhatsApp | не начато | grep geolocator/map_launcher/location-message в mobile и api = 0 |
|16| Реестры адвокатов | PR #516 открыт (упавший voice_test) | docs/STATE_BAR_REGISTRIES.md есть; код реестров не в main |
|17| Косметика: «Не завершить, а загрузить» | только ветка no-extra-phone | reels_strings.dart reels.keepOpen: «завершить»→«загрузить» |
|17b| чипы-фильтры по высоте; старт-поиск без сеток | не начато / не подтверждено | pill_tabs.dart правится в reels-freeze (+65) — возможно п.13 |
|17c| «Чаты» в Сохранённом | ждёт ответа владельца | docs/HANDOFF п.19 |
|18| PR #534 CI→TestFlight | PR открыт, нужны секреты | — |
|19| PR #526 (правила+handoff), #523 (план звонков) | документы, не в main | AGENTS.md в main есть (#518), PROJECT_MAP/owner-requests только в PR #526 |
|20| Волна A: кэш, Redis, LB, автоскейл, автопроход, 10 млн | частично | docs/architecture/REDIS_AUTOSCALE.md, DB_AUTOSCALE.md есть; нагрузочные скрипты — ветка perf-round-2; автопроход не начат |
|21| Сборки на телефоны | по правилу не делать | — |

### 1B. HANDOFF.md разделы 1-3 (45 пунктов)
Звонки: 1 main(#519, 3da72a118) | 2 main частично (VoIP-токен #519; #522 открыт; owner thread #538) | 3 main (#519) | 4 не начато | 5 не проверено (iOS CallKit аватар запрещён Apple; в нашем UI — calls/presentation/*avatar* есть) | 6 PR #523 (док) | 7 main = «чиним старое»; вариант LiveKit только claude/calls-variant-a.
iPhone/вид: 8 ветка reels-freeze | 9 main (#521) | 10 main (#514) | 11 ветка pull-refresh | 12 main (#512) | 13 не подтверждено | 14 main (#521) | 15 ветка reels-freeze | 16,17 ветка archive-reauth | 18,19 ветка pull-refresh (вопрос «Чаты» — владельцу) | 20,21 ветка archive-reauth | 22 ветка no-extra-phone | 23 ветка archive-reauth | 24 ветка no-extra-phone по Handoff, но в diff нет колокольчика -> не начато | 25 ветка no-extra-phone | 26 main частично (hide_likes), счётчики/просмотры — PR #517 | 27 не в main (pin_slot 1..3), PR #517 | 28 ветка privacy-follow.
Поиск: 29-33 PR #515/#520 открыты (owner thread), не в main.
34 не начато. 35 не начато. 36 не начато. 37 не начато.
Правила: 38-40 main (AGENTS.md, #518) | 41 частично (только звонки) | 42 вне репо | 43 скрипты в perf-round-2, автопроход не начат | 44 только в ветках mac-main-wip/mac-rescue (docs/architecture/APP_BUILD_ROADMAP.md не в main) | 45 в работе (эти ветки).
Owner-thread: #535 старый чат, #537 чеклисты, #538 звонки — статус выше «owner thread» только для звонков; #535/#537 пересечений с 45 пунктами не найдено.
Итого: в main полностью 1,3,9,10,12,14,38-40; в ветках 8,11,13,15-25(кроме 24),28; PR-only 2,6,26,27,29-33; не начато 4,34-37,43.

## 2. Инвентарь неслитого (diff origin/main...branch)
- claude/reels-freeze: 11 файлов +857/-83: video_cache(.proxy), reels_screen, reel_video, pill_tabs, feed_screen + 3 теста. Реальный фикс a9ac9239b + wip. СЛИВАТЬ первым (п.8/15). Конфликт: 1 (tool/ci/hardcoded_colors.allow, тривиально).
- claude/pull-refresh: 54 файла +745/-88: новый AppRefreshIndicator (294 стр.) + замена RefreshIndicator по экранам. Стоит; wip не проверен, переводы не затронуты. Конфликтов 0, но 54 файла -> быстро устареет, мержить рано.
- claude/archive-reauth: 43 файла +2011: password-reauth.service(+spec), reauth.dto, system_nav_band, back_swipe, step_up_strings, seed xlsx (бинарь, 13 МБ -> риск конфликта при любой другой ветке с xlsx). Стоит, но нужен ревью безопасности. Конфликт: 1 (docs/dev/KNOWN_ERRORS.md).
- claude/privacy-follow: 30 файлов +1898/-380: миграция, privacy-audience.ts, privacy-settings.service/controller, mobile privacy_repository/providers, e2e. Стоит (п.28). Конфликтов 0; xlsx и миграция — следить за порядком миграций и open API contract.
- claude/no-extra-phone: 26 файлов +622/-369: убирает доп. телефон (account_providers -125, account_repository -61), app_button, inbox_screen, reel_publish_card, текст reels.keepOpen, switch app-settings. Стоит. Конфликтов 0.
- claude/perf-round-2: 38 файлов +1489: badges.service (prefs cache), feed.service, chat-message-extras, lease skipIfBusy, лоадтест-скрипты. Стоит (api-only, с тестами). Конфликтов 0. Проверить skipIfBusy (advisory lock) под нагрузкой.
- claude/calls-variant-a: 155 файлов +11811/-7571: LiveKit-медиа, vendored callkit, удалены CallForegroundService/CallRinging/CallPushReceiver (Kotlin). НЕ сливать (отложено владельцем, конфликтует с #522/#538 по смыслу, хотя merge-tree чист).
- claude/mac-main-wip-2026-10-29: 82 файла +6298: iOS pbxproj/Podfile.lock/entitlements, NotificationService скрипт, contacts_sync, stickers, conversation_screen (-505/+), ~40 доков. Частично: доки и контакты ценны; pbxproj/conversation_screen — ручной вынос. Конфликтов 6 (pbxproj, entitlements, conversation_screen, contact_picker, invite_contact, contacts_screen_test). Пересекается с PR #535 (старый чат) — риск.
- claude/mobile-release-fix: 4 файла +18: R8 dontwarn, CocoaPods в Gemfile/workflow. Слить (= PR #525). Конфликт: KNOWN_ERRORS.md (тривиально).
- claude/badge-toggle-29: по diff 7415 файлов (старая база b673d8ee, 1532 коммита), реально 3 коммита: переключатель значка + notification-topics (per-kind настройки): +1342, api миграции, openapi, dart-контракт. Ценно (настройки уведомлений по типам), но портировать cherry-pick 01279b690 53f8eca3b; прямой merge нельзя. main уже имеет badges.service.ts — вероятны конфликты контракта.
- rescue/*: 
  - group-chats-polls-a41ykg-local (6124 файла, база 10-20) и stash-12/13/14: устарели (старые базы) — не мержить.
  - partition-messages-local (111 файлов +8371): партиционирование messages; смотреть вручную, высокий риск миграции.
  - stash-0..11 (6-87 файлов): WIP по bid-ranking, legal-requests, secrets-rotation, admin-privilege, ops-observability, search-alias, assistant-seats(87), cloudflare-turn — выборочно (stash-1, 8, 11 крупнее), большинство, вероятно, уже в main отдельными PR; проверять по одному.
  - wt-agent-calls-failover (11 ф.), wt-agent-speed (12), wt-ios-wiring (4 ф., +482), wt-perf-run (3), wt-build-main (5): небольшие, ревью по запросу. wt-agent-ad7821003a1445008 — кэш graphify 182 МБ, игнор/удалить. wt-agent-a1012..., abc3d... (≈7400 ф.): устарели. wt-train-358 (1116 ф.) устарел. wt-tf-owner, a7c86, events, qa, hidden-cost, resume-from-checkpoint: мелкие, нет ценности без ревью.

## 3. UX-разрыв (по наличию в коде, apps/mobile/lib; число файлов-совпадений в скобках)
Есть: haptics (47), skeleton (39), empty/error states (59/34), long-press меню (27), swipe-reply (8), реакции (17), исчезающие сообщения (26), voice waveform+скорость+lock (7/4/5), pinch-zoom + drag-dismiss в галерее (photo_gallery.dart), story viewer + tap-nav (8), reels double-tap/long-press, quiet hours, настройки уведомлений (notification_settings_screen.dart), reduce-motion (93), Hero (8), link_preview_card.dart, read-state (lastRead в chat_providers/models).
Нет / слабо (стиль не трогаем: без жёлтых иконок, Phosphor):
| ID | Тип | Что | Где/мелкое предложение |
|---|---|---|---|
|D-1| feature | Индикатор «печатает…» отсутствует (0 в api realtime, 0 в mobile) | realtime-gateway: событие chat:typing (throttle 3 с, TTL 5 с) + строка под именем в conversation_screen |
|D-2| feature | Номера/порядок сообщений (message seq) отсутствуют в модели Message | Message без seq; порядок по created_at -> дубли/перестановка при гонках. Добавить per-chat bigserial seq + сортировка по нему |
|D-3| feature | Чёткие статусы галочек sent/delivered/read (Telegram/WhatsApp ✓✓): есть lastRead, delivered_at не найден | добавить delivered-статус по ack realtime |
|D-4| feature | Геолокация в чате (п.36) | message kind location + url_launcher maps:// и geo: |
|D-5| feature | Reels: скорость воспроизведения 0, «зажми — пауза» есть | необязательно; не TikTok-стандарт |
|D-6| feature | Закреплённые сообщения есть (MessagePin), «избранные/звёздочка» только 1 файл | star сообщения — опционально |
|D-7| animation | scroll-to-bottom FAB только 2 файла, unread divider 3, date separator 1 | проверить conversation_screen: плавающая кнопка со счётчиком и «Новые сообщения» |
|D-8| cosmetic | blurhash/thumbhash 1 файл — плейсхолдеры медиа в ленте/профиле (п.18 «пустые квадраты») | заполнять grid-тайл цветом/blurhash пока грузится |
|D-9| feature | Upload progress только 3 файла: чат-медиа без кольца прогресса + отмены | кольцо на пузыре + cancel (связано с п.35) |
|D-10| feature | Story viewer: ответ на сторис 2 файла; нет pause-on-hold? (long-press 5 файлов в reels) | проверить story_viewer_screen: hold = пауза, свайп вниз = закрыть |
|D-11| feature | Медиа-вьювер: pinch + drag-dismiss в design_system photo_gallery, но видео в chat_video.dart без drag-dismiss | подключить тот же onVerticalDrag |
|D-12| feature | Ссылки в чате: link_preview_card есть; нет предпросмотра в composer до отправки | необязательно |
|D-13| feature | Сообщения по расписанию (3 файла) — есть; тишина по чатам (mute until) — есть |  ок |
|D-14| admin | Next.js admin: error.tsx только (app)/error.tsx и global-error.tsx; нет loading.tsx и not-found.tsx на 109 страниц | добавить (app)/loading.tsx со скелетоном и not-found.tsx |
|D-15| a11y | Semantics много (244), но проверить Dynamic Type: textScaler 25 файлов | выборочный аудит |
|D-16| feature | Pull-to-refresh: чувствительность (п.11) — только в ветке pull-refresh | см. раздел 2 |
|D-17| cosmetic | Колокольчик «назад» (п.24) — навигация в notifications | PopScope/back_swipe: возвращать на предыдущий маршрут |
Заметка: сегмент Telegram/WhatsApp «запись голоса — lock/slide-cancel» есть, «waveform scrub» есть.

## 4. Баги / гигиена кода
Счёт TODO/FIXME/HACK: api src = 0 (кроме не-spec); mobile lib = 4 (profile 2: client_profile_view.dart:263, call_controller.dart:1484 TODO(owner), contacts_sync_repository.dart:112 TODO(contract)); admin = 0.
Пропущенные тесты: api/admin xit/skip/todo = 0; mobile `skip:` = 0 в test/. Хорошо.
Пустые catch: TS `.catch(() => undefined|null)` = 178 в api/admin (не spec); Dart `catch (_) {}` = 10 (5 в demo).
| ID | Sev | Файл / ветка | Находка → правка |
|---|---|---|---|
|D-20| P1 | apps/api/src/modules/plans/entitlements.service.ts:141 | invalidateAll: `redis.incr(VERSION_KEY).catch(() => undefined)` — если Redis упал, кэш прав не инвалидируется, пользователи видят старый план молча → логировать + fallback: очистить L1 и не доверять L1 при ошибке. То же :135 invalidateUser |
|D-21| P2 | calls.service.ts :235,:243,:518,:607,:1105,:1133,:1136,:1223,:2813 (9 штук) | `void x.catch(() => undefined)` — отказ SFU/TURN/endSolo не виден → catch с logger.warn + метрика |
|D-22| P2 | sharding/move/shard-move.runner.ts (9) | проглоченные ошибки при переносе шардов опасны для данных → логировать и останавливать ран при ошибке записи |
|D-23| P2 | ledger/ledger-reconcile.service.ts:153,248,252 | сверка леджера глотает ошибки записи результата → хотя бы log.error (деньги) |
|D-24| P2 | billing/duplicate-subscriptions.service.ts:593,630,724,774; privacy/data-export.runner.ts:117,150,206 | аналогично: деньги/экспорт ПДн, добавить лог |
|D-25| P2 | mobile core/session/session_providers.dart:210 | `try { writeRealRefreshToken } catch (_) {}` — потеря реального токена при выходе из демо молча → залогировать в crash-reports |
|D-26| P3 | referrals/install_referrer.dart:66, profile/client_public_profile_screen.dart:156, client_profile_view.dart:107 | пустой catch; допустим best-effort, но добавить комментарий/лог |
|D-27| P2 | work-lease (п.9) | баг «одна задача двум сотрудникам»: lease сам по себе атомарен; проверить onClaimed (support assignee_id) и stillOpen: если очередь выдаёт item по assignee_id мимо work_leases — дубль. Нужен e2e с 2 параллельными next() |
|D-28| P2 | main: posts pin | закреп до 6 (п.27): в main слоты 1..3 (posts.service). Менять только через PR #517; не реализовывать вне |
|D-29| P2 | миграции/seed | translations_seed.xlsx (13 МБ бинарь) меняют 3+ ветки (archive-reauth, privacy-follow, no-extra-phone) -> гарантированный конфликт при мерже второй. Мержить по одной и пересобирать xlsx скриптом, не вручную |
|D-30| P3 | api | 26 `eslint-disable/@ts-ignore` вне spec — разово проверить, нет ли отключённой проверки на деньги/авторизацию |
|D-31| P3 | docs | docs/HANDOFF.md п.24 приписан ветке no-extra-phone, но в её diff нет notifications -> пометить «не начато», чтобы другой ИИ не считал сделанным |
|D-32| P2 | main vs HANDOFF | docs/dev/owner-requests, PROJECT_MAP в main отсутствуют (только PR #526) -> слить #526, иначе следующий ИИ не найдёт карту |
|D-33| P3 | admin | нет loading.tsx/not-found.tsx (см. D-14); 0 TODO/skip — тесты чисты |

Не проверено (нет запуска): мёртвые флаги app-settings (switch-contract.spec.ts проверяет определённость, но не использование), реальная работа в рантайме, причина зависаний iPhone.
