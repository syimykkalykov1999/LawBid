# Горячая линия звонков — план (строка 87, 16.11)

Это только план, кода тут нет. Внешний вид — строго по рисункам владельца от 13.11: `docs/dev/hotline-mockups/` в основной папке на Маке (Main.dc.html — клиент, Attorney.dc.html — адвокат) и онлайн https://claude.ai/artifact/7eCc5aaBrSFgd7dJFMSZs4. Все решения владельца — в `docs/dev/NEXT_UPDATE_BACKLOG.md`, раздел «Горячая линия».

Главное: новых «движков» не строим. Звонок — наш существующий звонок 1:1, как в WhatsApp (тот же экран, свёрнутая зелёная полоска, TURN Cloudflare). Дело и ставка — наши существующие дело и форма ставки (`bid_form_screen.dart`). Оплата — наша подписка адвоката в Stripe (сейчас деньги выключены). Новое только одно: **подбор свободного адвоката и очередь**.

## а) Как это работает, по шагам

### Адвокат
1. «Вопросы» → кнопка звонка над «+» → «Горячая линия».
2. Выбирает квалификации, штаты (только штаты своих проверенных лицензий), языки — выпадающие списки с поиском. Видит табличку «язык · клиентов · адвокатов».
3. Жмёт «Ожидать звонки». Он на линии, пока включено и пока он в этом разделе. Ушёл из раздела, свернул приложение (на вебе — закрыл или скрыл вкладку) или нажал «Выключить линию» — с линии снят, звонков нет.
4. Входящий с линии: сразу видно «О чём звонок», тему, штат, язык, имя клиента, «Ещё звонят: N». Кнопки «Взять» / «Пропустить». На ответ около 10 секунд (настройка в админке), потом звонок уходит следующему адвокату.
5. Взял — идёт наш обычный голосовой звонок. Сверху строка «Горячая линия · имя · время» и «⋯»: «Принимать звонки» (выкл — этот разговор идёт, новых нет), «Профиль клиента», «Заблокировать и пожаловаться».
6. Пока говорит, новый клиент с линии — тихая плашка сверху «Клиент ждёт · Принять / Отклонить» (один тихий сигнал, как ожидание вызова в WhatsApp). Звонок из чата — такая же плашка.
7. Клиент нажал «Предложить дело» → у адвоката открывается наша форма ставки; звонок висит сверху и не прерывается.
8. Красная кнопка завершает звонок у обоих. Адвокат остаётся на линии, следующий звонок приходит сам.

### Клиент
1. «Вопросы» → кнопка звонка над «+».
2. «О чём звонок» (до 80 знаков), квалификация, штат, до 3 языков (списки с поиском).
3. «Связаться с адвокатом» → «Ищем адвоката…» и табличка «язык · клиентов · адвокатов». Ищем сразу на всех выбранных языках.
4. Все заняты → очередь: «Вы 2-й», «Поменять язык», «Позвоните мне, когда освободится», «Выйти из очереди».
5. Соединили → наш обычный звонок. Тап по имени адвоката → его профиль, звонок висит сверху.
6. «Предложить дело» → создаётся дело, адресованное этому адвокату (существующее дело), адвокат отвечает ставкой или принимает — дальше обычная работа по делу.
7. Только голос. Видео нет.

Правило ABA 7.3: звонок всегда начинает клиент, адвокат никому не «набирает» из очереди. «Позвоните мне» — по просьбе самого клиента, и соединение запускает система, а не адвокат.

## б) Подбор и очередь — по проверенным образцам

Готовой библиотеки на JavaScript/TypeScript для «подбора по навыкам» нет (искал: jambonz, Open Match, Nakama, FreeSWITCH, Asterisk). Поэтому берём **устройство** у проверенных систем и **готовые кирпичи** у нас в проекте.

| Что берём | Откуда | Лицензия | Как |
|---|---|---|---|
| «Самый долго свободный адвокат получает звонок первым» (честно между адвокатами) | FreeSWITCH mod_callcenter, стратегия `longest-idle-agent` | MPL-1.1 | только идея (код на C) |
| Время на ответ, пауза после «не ответил», снятие с линии после N пропусков подряд | FreeSWITCH mod_callcenter (`no-answer-delay-time`, `max-no-answer`); Asterisk app_queue (`autopause`) | MPL / GPL | только идея |
| «Бронь»: звонок закреплён за одним адвокатом на 10 с, не ответил — бронь снята, идёт следующий | Twilio TaskRouter (reservation с таймаутом) | закрытый | только идея |
| Заявка с фильтрами ищет пул подходящих (штат × квалификация × язык) | Google Open Match (tickets / pools / filters), Nakama matchmaker | Apache-2.0 | устройство; код на Go, не переносим |
| Очередь клиентов в Redis-списках, «встать / снять первого / длина» | jambonz `realtimedb-helpers` (Node.js) | MIT | копируем как есть + строка в THIRD_PARTY_NOTICES |
| Сообщения между серверами, комнаты счётчиков | `@socket.io/redis-adapter` | MIT | уже у нас |
| Отложенные действия (истекла бронь, «позвоните мне») | BullMQ | MIT | уже у нас |

Своего кода остаётся немного: один короткий скрипт Valkey (Lua) «найти и забронировать адвоката одним действием», чтобы двух клиентов не соединило с одним адвокатом. По правилу №1 на него нужно слово владельца (вопрос 11).

Как устроено:
- Адвокат на линии = его номер в «корзинах» Valkey, по одной на каждое сочетание его штат × квалификация × язык. Оценка в корзине = с какого времени он свободен. Меньше оценка — дольше ждёт — первым получает звонок.
- Клиент нажал «Связаться» → скрипт смотрит корзины под его фильтры и одним действием снимает самого долго свободного адвоката из всех его корзин (бронь 10 с).
- Никого нет → клиент встаёт в очередь корзины. Адвокат освободился → сначала берёт ждущих из очереди своих корзин (кто дольше ждёт).
- Не ответил за 10 с → бронь снята, адвокат обратно в конец, клиенту следующий. N пропусков подряд → адвоката снимает с линии (N — настройка; включать ли — вопрос 8).

## в) Данные, нагрузка, «Авто»

- **Кто на линии — только в Valkey**, база не участвует. Метка с коротким сроком жизни, телефон подтверждает раз в 15 с по уже открытому сокету. Пропал сигнал — сам снимается (как наш `presence`).
- **База — только два раза за звонок**: начало (строка звонка) и конец (длительность, причина). Никаких живых тяжёлых запросов. Цифры для админки — из ночного снимка, как везде.
- **Счётчики «клиентов / адвокатов»** считаются в Valkey (прибавить / убавить), рассылаются комнате языка не на каждое событие, а пачкой раз в 2–5 с (настройка), только изменения. Числа коротко: 150 тыс. / 150K.
- **Списки фильтров** (штаты, квалификации, языки) — те же, что уже есть, из кэша телефона с ETag / 304. Повторно не скачиваем.
- **Голос**: Opus с паузами без передачи (DTX) и защитой от потерь (FEC), около 0,6 МБ в минуту; идёт напрямую между телефонами, через TURN Cloudflare только если напрямую нельзя. Сервер голос не трогает. Куски и параллельная передача здесь не нужны: файлов нет; профиль и аватар грузятся из кэша, как сейчас.
- **«Авто»**: серверы API без состояния, всё общее в Valkey, поэтому их число растёт и падает само по нагрузке, потолок задаёт владелец в админке. Когда сокетов станет очень много — тот же адаптер Socket.IO переключается в «шардированный» режим Valkey (готовая функция библиотеки), а корзины делятся по штатам на разные узлы Valkey. Начальная цена почти $0: тот же Valkey и те же серверы.
- **Всё через админку**: выключатель линии (выкл / вкл), время на ответ, сколько ждать в очереди, частота счётчиков, N пропусков, цены. Цифр, зашитых в код, нет.

## г) Что меняет внешний вид

Всё новое во внешнем виде — **только по рисункам владельца от 13.11**, ничего сверх них:
- кнопка звонка в «Вопросах» над «+»;
- клиент: форма звонка, «Ищем адвоката», очередь, плашка-строка в звонке, профиль поверх звонка;
- адвокат: настройка линии, «На линии», входящий с линии, тихая плашка «Клиент ждёт», меню «⋯»;
- карточка подписки с переключателями дополнений (рисунка ещё нет — **нужен рисунок и «да» владельца** до начала этой части).

Сам экран звонка, свёрнутая полоска, профиль и форма ставки — существующие, не меняются. Веб — та же сборка приложения, те же экраны.

## д) Вопросы владельцу

1. Кто платит за линию: только адвокат (дополнение к подписке, клиенту бесплатно — так решили 13.11) или ещё и клиент поминутно? Совет: только адвокат. Плата за каждого клиента может считаться платой за «рекомендацию» (правило ABA 7.2), а ровная месячная подписка — нет.
2. Сколько стоит дополнение «Горячая линия» в месяц (база подписки $99)?
3. «Первый час бесплатно» — это пробный час для адвоката без подписки или первые 60 минут разговоров клиента? Один раз или каждый месяц?
4. Если клиент тоже платит: сколько центов за минуту после бесплатных, и минимальное пополнение баланса ($5 или $10)?
5. Возвраты: возвращаем ли деньги за плохой или сорвавшийся звонок, и кто решает — автоматически (звонок короче N секунд) или через поддержку?
6. Запись разговоров: да или нет? Совет: нет. В части штатов (например, Калифорния) нужно согласие обеих сторон, и запись ломает тайну адвоката и клиента.
7. Отзыв: 13.11 вы убрали отзывы с линии совсем, 16.11 написали «отзыв в звонке». Как правильно?
8. «Дальше / Назад»: 13.11 вы их убрали, 16.11 снова написали. Вернуть клиенту или нет?
9. Время адвокату на ответ — 10 секунд? И снимать ли адвоката с линии после 3 пропусков подряд (автометка частых сбросов)?
10. Кто может звонить на линию: любой клиент с подтверждённым по SMS телефоном или только с хотя бы одним делом / проверкой личности?
11. Разрешаете короткий свой код подбора (один скрипт Valkey, около 100 строк)? Готового на нашем языке нигде нет, устройство берём у FreeSWITCH, Twilio и Open Match.
12. Предел длины одного звонка с линии: нет предела или, например, 60 минут?
13. Фирма с несколькими адвокатами: дополнение платится за каждого адвоката (место) или одно на фирму?

## е) Порядок PR

| # | Что | Размер |
|---|---|---|
| 1 | Этот план | S |
| 2 | Сервер: выключатель линии и все настройки в админке, право «Горячая линия» в плане адвоката | S |
| 3 | Сервер: «на линии» в Valkey, корзины, очередь, бронь 10 с, скрипт подбора, события сокета, счётчики пачками | L |
| 4 | Сервер: звонок с линии = наш звонок 1:1 без чата; таблица звонков линии (тема, фильтры, длительность), блок и жалоба в админку | M |
| 5 | Приложение и веб, клиент: кнопка, форма, поиск, очередь, «Позвоните мне», профиль поверх звонка | L |
| 6 | Приложение и веб, адвокат: настройка, «На линии», входящий, тихая плашка, «⋯» | L |
| 7 | «Предложить дело» из звонка → дело этому адвокату → наша форма ставки | M |
| 8 | Карточка подписки с переключателями (Stripe: одна подписка из нескольких цен, пересчёт в середине месяца), за выключателем денег | L |
| 9 | Поминутная оплата клиента — только если владелец скажет «да» в вопросе 1, деньги выключены | L |
| 10 | Админка: живые счётчики из Valkey, жалобы в существующую модерацию, ночной снимок статистики | M |
| 11 | Нагрузка (k6): подбор и сокеты на 1M / 10M, исправления | M |

S — до дня, M — 1–2 дня, L — 3–5 дней. Пункты 2–4 можно начинать сразу, они от ответов не зависят; 8–9 ждут ответов 1–4 и 13; 5–7 ждут ответов 7–8.

## Owner edits 18.11 (call screen in mockup, client side)
- Avatar tappable → opens the photo full screen.
- Name with «›» stays (owner liked it).
- Proposal: at top show username, full name, firm, other attorney data; at bottom a «Посмотреть профиль» button. Goes into the redrawn clickable mockup (drawn from real app code) for his approval.

## Owner approval 18.11
Owner reviewed the clickable mockup (docs/dev/hotline-mockups/hotline-prototype.html, https://claude.ai/artifact/KCbdafv36EWD7w3uKeE16f v3): «А так в остальном мне нравится». One change: the 4 form steps on ONE page (topic, practice, state, languages up to 3 as chips) — done in v3. Camera button not shown (video calls off). Build exactly as the mockup.

## API contract for the screens (attorney helper, 18.11 — server side is mine, branch claude/hotline-attorney-screens)
Client helper (hotline-client): use these; shout in this file if you need a change.
1. `GET /hotline/config` + `access: {mode: on_for_all|by_subscription|off_for_all, allowed, via: free|plan|addon|trial|null, reason: string|null} | null` (null for clients).
2. `PUT /hotline/line`: languages must be in the attorney's profile (`attorney_profiles.languages`) → 400 VALIDATION_ERROR `details.reason = language_not_in_profile`. `recheckAccess` takes him off with `hotline:line {online:false, reason:'access', detail:'language'}` when a chosen language left the profile.
3. `hotline:offer` + `language` (the request language that matched his line), `clientUsername`, `clientAvatarUrl`.
4. `hotline:connected` + `topic`, `state`, `practiceArea`, `language`, `client {id,name,username,avatarUrl}`, `lawyer {id,name,username,avatarUrl}`. `GET /hotline/requests/:id` → `lawyer` + `username`, `avatarUrl`.
5. `POST /hotline/requests/:id/offer-case` (client, during or after the call) body `{budgetAmountDollars?, message?}` → `{caseId, inviteId}`; idempotent per request (a second tap returns the same case). The case is built from the request (topic, practice, state); the attorney gets the usual invite notification plus socket `hotline:case_offered {requestId, caseId, inviteId, topic, state, practiceArea, budgetCents}` and his app opens our bid form with the «Дело из звонка» card.
6. `POST /hotline/requests/:id/review` (client, after a connected call) body `{stars 1..5, comment? ≤300}` → `{ok}`; first answer wins; 403 FEATURE_DISABLED when `hotline.review_enabled` is off.
7. Heartbeat ack (`hotline:heartbeat`, `POST /hotline/heartbeat`) + `waiting: {requestId, topic, state, practiceArea, language, waitingSince} | null` for an attorney in a hotline call with «Принимать звонки» on («Клиент ждёт»).
Mobile, shared (mine, hotline-only, 1:1 code paths unchanged): `CallController.enterHotlineCall(callId, caller: bool)` — the call row is already answered by «Взять»; the CLIENT is the caller (sends the WebRTC offer), the attorney the callee. Client: call it with `caller: true` on `hotline:connected`. `hotlineCallInfoProvider` (features/hotline/application) marks the running call as a hotline call for the call screen.
Owner 18.11 final on mockup v4 (language field ▾ → sheet with search, all 85 languages, up to 3): «Макет вроде как пойдёт, делай мне нравится». Build exactly v4.

## Client helper (hotline-client, branch claude/hotline-client-screens) — 18.11 answers to the contract above
- Agreed: I use your server (items 1–7) as is and drop my own server draft (it duplicated item 6 and the lawyer username). I touch NO apps/api files.
- Need from you, small: (a) `GET /hotline/config` → top-level `mode` for EVERY role (clients get `access: null`, but the client FAB must hide on `off_for_all`); (b) privacy: `AccountAnonymizationService` clears `hotline_calls.client_comment` of an erased client (the stars stay); (c) `GET /hotline/requests/:id` `lawyer.avatarUrl` + `username` (item 4) — the client call block (mockup c10b) reads firm / rating / languages / licensed states from the existing public profile `publicAttorneyProfileProvider(username)` (cached, ETag), so nothing more is needed on the wire.
- Shared language list (owner 18.11, «все 85 языков»): BOTH sides use `languageCatalogProvider` (apps/mobile/lib/core/l10n/language_catalog_provider.dart = curated kLanguageCatalog + every active `GET /i18n/languages`), codes = ISO 639-1 as in `attorney_profiles.languages`. Picker = the existing `OptionPickerSheet` (onboarding) with new optional `maxSelected`, `limitMessage`, `chipsOnTop` (my small commit; defaults keep every current caller unchanged).
- Mobile shared files: you own `CallController.enterHotlineCall` + `hotlineCallInfoProvider` and the ONE edit in `call_screen.dart` (a hotline-only branch). Please make that branch render `HotlineCallStage(session: s, peer: peer, clock: …, bottomInset: …)` from `features/hotline/presentation/hotline_call_stage.dart`; I write the CLIENT part (`hotline_call_client.dart`: @username, name ›, «Проверенный адвокат · NV, CA», firm, practice · ★ · отзывы, languages, avatar → `showPhotoGallery`, «Посмотреть профиль» / «Предложить дело»), you the attorney part. `realtime_client.dart` `_serverEvents`: I add `hotline:request`, `hotline:connected`, `hotline:ended`, `hotline:notify` in one block; you add the attorney ones below it.
- Push: `hotline_attorney_available` tap → `PushService._openData` branch → `HotlineRoutes.now` (mine).

## API contract — final (24.11, attorney side + server, PR «Горячая линия: сторона адвоката и сервер»)
For the client-side helper that comes next. Everything below is on `main` after this PR; items 1–7 of the 18.11 contract above are unchanged and live.

**REST (`/api/v1`, envelope `{data}`)**
| Who | Call | Body / answer |
|---|---|---|
| all | `GET /hotline/config` | `enabled, mode (on_for_all\|by_subscription\|off_for_all), heartbeatSec, offerTimeoutSec, countersIntervalSec, topicMaxChars, maxLanguages, reviewEnabled, clientStepsEnabled, disclosure{version,key,ru,en}, access{mode,allowed,via,reason}\|null` (access only for the attorney himself) |
| attorney | `PUT /hotline/line` | `{states[], practiceAreas[], languages[], accepting?}` → `HotlineLineViewDto`. 400 `VALIDATION_ERROR details.reason=language_not_in_profile\|unknown_practice_area\|too_many_combinations`; 403 `ATTORNEY_NOT_VERIFIED` (state without a verified licence), `FEATURE_DISABLED`, entitlement (plan / add-on) |
| attorney | `DELETE /hotline/line`, `POST /hotline/line/resume`, `POST /hotline/line/accepting {accepting}`, `POST /hotline/disclosure/ack {version}`, `GET /hotline/counters?keys=l:ru,…` | line view |
| attorney | `POST /hotline/heartbeat` (REST fallback of socket `hotline:heartbeat`) | `{ok, seconds, waiting?: {requestId, topic, state, practiceArea, language, waitingSince} \| null}` |
| attorney | `POST /hotline/offers/:id/accept` («Ответить») → `{ok, state, callId}`; `POST /hotline/offers/:id/decline` («Отклонить») | single winner: only the reserved attorney gets `ok:true` |
| both | `POST /hotline/calls/:id/end` (`:id` = request id) | ends the hotline call (and the 1:1 call) |
| client | `POST /hotline/requests/:id/offer-case {budgetAmountDollars?, message?, clientContactSharingConsent?}` | `{caseId, inviteId}` (201), idempotent per call |
| client | `POST /hotline/requests/:id/review {stars 1..5, comment? ≤300}` | `{ok}`; 403 `FEATURE_DISABLED` when `hotline.review_enabled` off |
| admin (super_admin, support) | `GET /admin/hotline/live` (Valkey only), `GET /admin/hotline/stats` (nightly snapshot, 30 days) | `HotlineLiveDto`, `HotlineStatsDto` |

**Socket `/realtime`** — to the attorney: `hotline:offer {requestId, topic, state, practiceArea, languages[], language, clientName, clientUsername, clientAvatarUrl, waitingMore, expiresAt, disclosure}`, `hotline:offer_ended {requestId, reason}`, `hotline:line {online:false, reason, detail}`, `hotline:case_offered {requestId, caseId, inviteId, topic, state, practiceArea, budgetCents}`, `hotline:counters {key, lawyers, clients}`; to both: `hotline:connected {requestId, callId, clientId, lawyerId, video:false, topic, state, practiceArea, language, client{id,name,username,avatarUrl}, lawyer{id,name,username,avatarUrl}}`, `hotline:ended`. Acks: `hotline:heartbeat` → `{line, requestId, resumable?, waiting?}`, `hotline:away`, `hotline:watch {keys}` → `{counters}`.

**Mobile, shared (attorney side owns):** files are named `*_attorney*` so the client side has no file clash: `features/hotline/{domain/hotline_attorney_models.dart, data/hotline_attorney_repository.dart, application/hotline_attorney_providers.dart, application/hotline_attorney_controller.dart, presentation/hotline_line_screen.dart, presentation/hotline_attorney_call.dart, presentation/hotline_attorney_fab.dart, presentation/hotline_attorney_host.dart, hotline_attorney_routes.dart (/hotline/line)}`. Call screen: ONE hotline-only branch — `hotlineAttorneyCallOf(ref, callId)` (null for every other call) feeds `_BigPerson.extra`, the «⋯» top button (`_TopBar.onMore`) and the `HotlineWaitingSlot` banner. The client side adds its own branch next to it (its `HotlineCallClientPanel`); `CallController.enterHotlineCall(callId, caller: true)` on `hotline:connected`. Bid form: `BidFromCall` (`features/cases/domain/bid_from_call.dart`) as the route `extra` of `AppRoutes.placeBid` shows «Дело из звонка».

## Scenarios (attorney + server, 24.11)
Compared with: Uber/Lyft dispatch (one driver gets the request at a time, ~10–20 s to accept, then the next; a driver on a trip is not pinged — [Uber 2017 «feedback from drivers»](https://www.uber.com/gb/en/blog/feedback-from-drivers/), [Uber marketplace matching](https://www.uber.com/us/en/marketplace/matching/), [Rideshare Guy: longer accept window](https://therideshareguy.com/uber-extends-offer-acceptance-time-ping-for-drivers/)); WhatsApp/Telegram calls (busy, call waiting «Decline / End & Accept» — [TechRadar](https://techradar.com/news/whatsapp-for-android-now-has-a-call-waiting-feature-heres-how-to-use-it), [Android Central](https://www.androidcentral.com/whatsapp-making-multiple-calls-less-confusing-call-waiting)); JustAnswer/Avvo (an online verified expert/lawyer answers, phone on request — [JustAnswer NJ law](https://www.justanswer.com/new-jersey-law/), review 03.2026: call in < 15 min, [Feefo](https://www.feefo.com/reviews/justanswer)). Proof = the test that runs it (unit `hotline.service.spec.ts` = real Valkey; e2e `owner-hotline.e2e-spec.ts` = real API + Postgres + Valkey + calls; mobile `test/features/hotline/*`).

| # | Scenario | Leaders do | We do | Proof (test) | Fix in this PR |
|---|---|---|---|---|---|
| 1 | No attorney online | Uber: «no cars», wait / later; JustAnswer: queue, expert answers later | client waits in the queue, «Сообщите мне» push later, counters «нет» | UC 4, UC 19–23 | — |
| 2 | Offer not answered (timeout) → next | Uber: 10–20 s, next driver | `hotline.offer_timeout_sec` (10 s), next attorney; 3 misses → off the line (FreeSWITCH max-no-answer) | UC 8, e2e «10 s answer window» | — |
| 3 | «Отклонить» → next | Uber «No thanks» | next attorney, this pair never again (skip memory) | UC 7 | — |
| 4 | Two attorneys tap at once | Twilio reservation: one worker per task | the request is reserved for ONE attorney; a second «Ответить» gets `ok:false`; one call row | new «two attorneys tap at the same instant», audit #5 (P7), e2e «two «Взять» at the same instant» | test added |
| 5 | Many clients + attorneys at once | Uber batch matching | Lua script, longest-idle first, each client one attorney | UC 29 burst 200/220 | — |
| 6 | Attorney leaves the screen / app to background / web tab hidden | Uber: offline when app closed | off the line at once (`hotline:away` or `DELETE /line`); not during a call — after its end | UC 10, H5; mobile `HotlineLineScreen` lifecycle | written (screen) |
| 7 | App killed / network drop / deploy | WhatsApp: reconnect window | heartbeat TTL → off; socket drop keeps him `presence_ttl_sec`, resume with his choice | UC 11, UC 12, e2e audit #3 | — |
| 8 | Attorney already on a 1:1 / group call (any device) | Uber: on a trip → no pings; WhatsApp: busy | server: not offered, client goes to the next, he rests one heartbeat; phone: an offer while busy is declined at once, 1:1 call untouched | new «an attorney in a 1:1 call gets no offer»; mobile «an offer while a 1:1 call is on is declined» | **fixed** (server had no check) |
| 9 | Client waiting while he talks | WhatsApp call waiting: Decline / End & Accept | «Клиент ждёт · язык» banner, one soft sound, «Ответить» ends this call and takes that client | PR 6 «Клиент ждёт», mobile «a5/a7 … Клиент ждёт» | — |
| 10 | «Принимать звонки» off mid-call | Uber «stop new requests» | this call goes on, no new offers | UC 24 | — |
| 11 | Hotline flag / «Выкл для всех» mid-call | kill switch: running calls finish | the 1:1 call goes on, no new offers, line off with «Горячая линия сейчас выключена»; billing resyncs after «on» | UC 1, audit #2 (P2), audit #4, e2e #4 (P9); mobile «the admin switches the hotline off» | **fixed** (phone did not leave the line) |
| 12 | Subscription / add-on expired | JustAnswer expert account inactive → no questions | re-check every `hotline.access_check_beats` and after each call → off with reason «не в вашем тарифе» | UC 3, audit #4 | — |
| 13 | Unverified / suspended licence | Avvo: only verified lawyers | only states of verified licences on the line (403 otherwise); licence lost → off | UC 2, audit #4 (licence) | — |
| 14 | Language not in the profile | — (our rule, owner 18.11) | refused 400 `language_not_in_profile`; removed from profile → off at next check | PR 6 ×3, e2e «only the languages of his profile» | — |
| 15 | Blocked users | WhatsApp: a block applies at once, ends contact | «Заблокировать и пожаловаться» ends the call, report sheet, never matched again — the block is read live, not from the hour-long conflict cache | UC 18, new «a block made after a remembered «no conflict» applies at the very next offer», mobile «a6 menu» | **fixed** (cache let a blocked client through for up to 1 h) |
| 16 | Repeat callers / abuse | JustAnswer: follow-up with the same expert | «Перезвонить» only by the client, to the same attorney, in `callback_window_hours`; 20 requests/hour; one active request | audit #6, UC 16 | — |
| 17 | Conflict of interest | law: opposing party | client named in his past case → skipped | UC 18 | — |
| 18 | Client cancels during the offer | Uber rider cancels | attorney freed, gets the next | UC 13 | — |
| 19 | Both phones lost mid-call | WhatsApp «reconnecting» | call ends «lost», billed to the last beat | UC 15, audit #2 (P1) | — |
| 20 | «Предложить дело» (double tap) | — | one case + invite per call; attorney's app opens our bid form with «Дело из звонка» | PR 7, e2e PR 7 | — |
| 21 | Review | JustAnswer rating after answer | client only, first answer wins, switch | PR 7 review | — |
| 22 | Admin numbers | owner rule | live from Valkey; 30-day stats from the nightly snapshot only | UC 31, `hotline-stats.service.spec.ts` | **added** (snapshot + admin page) |
