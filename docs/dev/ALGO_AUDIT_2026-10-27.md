# Аудит алгоритмов: кейсы → адвокаты, контент, тарифы (2026-10-27)

Только чтение кода, ничего не менялось, не собиралось и не запускалось.
Три области: (1) как новый кейс доходит до адвокатов, (2) лента/рекомендации/модерация, (3) деньги.

## Коротко для владельца

1. **Кейсы доходят до адвокатов правильно и без дублей** — выбор аудитории (практика, штат, лицензия, блокировки), очередь волн и защита от повторной отправки сделаны аккуратно и покрыты тестами.
2. **Главная дыра — тишина по умолчанию.** Пуш «Новые кейсы» у адвокатов ВЫКЛЮЧЕН с рождения; кто не зашёл в настройки и не включил — не получает ни пуша, ни даже строки в колокольчике. На релизе это может значить «никому ничего не пришло». Нужно решить: включать при онбординге или по умолчанию для проверенных адвокатов.
3. **Оповещение уходит один раз — при публикации.** Если клиент потом поправил практику/штат, вернул кейс после паузы, или кейс «стал срочным» по дате — никого не оповещают заново. Повторной рассылки «никто не откликнулся» нет вовсе. Адвокаты «только срочные» видят лишь те кейсы, что были срочными в момент публикации.
4. **Срочные кейсы ждут утра.** Пуш о срочном кейсе подчиняется «тихим часам» (как обычный), а в режиме волн идёт в общей очереди по 10 минут. Плюс даты считаются по UTC: вечером в США кейс «суд сегодня» уже читается как «просрочен» и выпадает из срочных.
5. **Рассылка при выключенном переключателе волн (а он выключен) идёт «на лету» внутри API без повтора** — упал процесс/база на секунду — кейс никому не ушёл, только строка в логе.
6. **Контент: три места, где пост зависает скрытым навсегда** — «Отклонить жалобы» на уже скрытом посте не возвращает его; посты, задержанные авто-правилами (ссылки, дубликат текста), не попадают ни в одну очередь модератора; правило «дубликат» срабатывает на обычном редактировании поста и скрывает его молча. Плюс новым авторам/адвокатам тяжело получить первый показ.
7. **Деньги: основа крепкая** (двойная запись, идемпотентность Stripe, льготный период), но есть опасные края: застрявшее событие Stripe (пользователь теряет доступ после 3 дней), поздний «платёж не прошёл» перекрывает успешную оплату, админский возврат может уйти дважды, возврат пака ставок не отбирает ставки, авто-зарплата при сбое не повторяется.
8. **Цена основателя $99/год и сдельные ставки персонала в коде отсутствуют** — только в документах. Платежи в приложении заблокированы (payments_in_app), это соблюдено.
9. **До релиза:** п.2, п.3 (хотя бы оповещение при смене практики/штата и при возврате из паузы), п.4 (срочные вне тихих часов), п.6 (три зависания), деньги C1/H1/H3/H5. **Можно позже:** повторные рассылки «никто не откликнулся», честный старт для новых авторов, мелочи по округлению и датам.

Счёт по серьёзности: **критических 6, высоких 16, средних 21, низких 15.**

| Область | Critical | High | Medium | Low |
|---|---|---|---|---|
| Кейсы → адвокаты | 2 | 3 | 6 | 3 |
| Контент | 3 | 6 | 7 | 7 |
| Тарифы / деньги | 1 | 7 | 8 | 5 |

---

# Техническое приложение

Все пути относительно `/Users/sima/Desktop/LawBid/apps/api/src/`, если не сказано иначе. Строки — по текущему состоянию `main` (78c1d7e45 + локальные незакоммиченные правки, не затрагивающие эти файлы).

## Часть 1. CASES — как новый кейс доходит до адвокатов

### 1.0 Карта кода

| Шаг | Файл:строки | Что делает |
|---|---|---|
| Публикация | `modules/cases/cases.service.ts:417-590` (`create`), `:566-568` | После коммита: `alerts.later(() => alerts.attorneysForCase(id))` — setImmediate, без повторов. Единственный вызов рассылки в модуле кейсов. |
| Прокладка | `modules/notifications/subscription-alerts.service.ts:73-75`, `:126-132` | `attorneysForCase` → `fanout.start`; `later()` ловит ошибку и пишет warn. |
| Старт волн | `modules/notifications/case-fanout/case-fanout.service.ts:142-159` (`start`), `:161-176` (`enqueue`), `:179-194` (`gate`) | `enabled=false` (по умолчанию) → `runWave` выполняется прямо здесь, очередь не используется даже при наличии Redis. jobId `casefanout-<case>-w<n>`. |
| Волна | `case-fanout.service.ts:299-432` (`runWave`) | Проверка open/paused/deleted, фрод-гейт, stop_at_bids, аудитория, уже-оповещённые по `dedupe_key=case_fanout:<id>`, cap 5000 (`CASE_ALERT_REACH_MAX:35`), daily cap → дайджест только в волне 1 (`:383-392`), следующая волна через `waveIntervalMinutes`. |
| Аудитория | `case-fanout/case-audience.service.ts:50-68`, SQL `:74-127`, split-вариант `:140-265` | Практика (точная / родительская категория / доп. темы / not_sure→general_practice), `verification_status='verified'`, `urgent_only` учтён, лицензия `verified` в любом штате кейса, **JOIN notification_settings (category='new_cases', push_enabled)**, user active, блокировки. LIMIT 20000 без ORDER BY. |
| Срочность | `modules/cases/domain/case-urgency.ts:81-93` (`daysUntil`, UTC), `:111-122` (`effectiveUrgency`), `:291-294` (`URGENT_LEVELS` = urgent, very_urgent) | Дата — календарный день в UTC. 'overdue' не срочный. |
| Скоринг | `case-fanout/case-fanout.scoring.ts:116-130`, `:135-157`, `:166-186` | Веса, стабильный tie-break по хэшу, квота новичков. |
| Настройки | `case-fanout/case-fanout.settings.ts`, `common/app-settings/app-settings.defaults.ts:1014-1027` | `case_fanout.enabled=false`, волна 5000, интервал 10 мин, 20 волн, stop_at_bids 0, daily_cap 0. |
| Воркер | `case-fanout/case-fanout.worker.ts:53-78`; `jobs/worker.module.ts:102` | Consumer в API (JOBS_ENABLED≠false) и в worker-процессе; attempts 3, backoff 5s exp. |
| Пуш | `modules/notifications/notifications.service.ts:288-313` (`emitMany`, `skipDuplicates`), `:323-362` (`emitDigest`) | (user_id, dedupe_key) уникален → ретрай не дублирует. |
| Доставка | `notifications/push/push-dispatcher.ts:517-570` | Тематический выключатель `newCases` (`notification-topics.ts:154-155`), тихие часы для всех, кроме `QUIET_EXEMPT` (`notification-rules.ts:64-69`) — `new_urgent_case` там **нет**. |
| Дефолты пуша | `notifications/notification-rules.ts:36-49` | `new_cases: false` (opt-in, владелец 2026-09-30). |
| Лента адвоката | `modules/cases/services/cases-feed.service.ts:125-300`, `queries/cases-visible.sql.ts:195-260` | `status='open' AND deleted_at IS NULL AND paused_at IS NULL`, пары (штат лицензии × практика профиля) по листьям; keyset `(created_at, id)`; промо-слоты 3 + приоритетные 5 на первой странице; `for_you` — offset по 300 новейшим. |
| Пауза/архив | `jobs/handlers/case-lifecycle.jobs.ts:126-195` (stale-ask), `:235-274` (pause/archive); `cases/domain/case-state-machine.ts:230-315` | Возврат из паузы / restore **не** вызывает рассылку. |
| Фрод | `modules/client-fraud/client-fraud.service.ts:311-325` (`onCaseCreated`) | Пересчёт статуса идёт **после** того, как рассылка уже запланирована. |

Тесты: `case-fanout.waves.spec.ts` (18 кейсов: волны, идемпотентность, stop_at_bids, cap, фрод-гейт, legacy), `case-fanout.scoring.spec.ts`, `cases-feed.service.spec.ts`, `case-urgency.spec.ts`. **Нет** спека на `CaseAudienceService.single()` (сырой SQL), на тихие часы для срочных, на повторные оповещения, на UTC-границу даты.

### 1.1 Находки

**C-1 (critical). Оповещение только при создании; смена практики/штата, возврат из паузы, рост срочности — никого не оповещают.**
- `cases.service.ts:568` — единственный вызов `attorneysForCase`. `update()` (`:593+`), `updateUrgency()` (`:899+`), `client_resume`/`client_restore`/`client_keep_alive` (`case-state-machine.ts:230-315`) рассылку не трогают.
- Сценарий А: клиент выбрал «Семейное право», через 5 минут исправил на «Иммиграция». Иммиграционные адвокаты не получат ничего, семейные получили чужой кейс. Сценарий Б: кейс «Гибко», через 4 дня клиент ставит дату суда через 2 дня → `urgent`; адвокаты с «только срочные» (`new_case_alerts_urgent_only`) не узнают никогда. Сценарий В: кейс ушёл в паузу за молчание, клиент вернул — лента показывает, пуша нет.
- Fix (минимальный): при изменении `practice_area_id`/extra/states и при `client_resume|client_restore` вызывать `fanout.start(caseId)` c **новым** dedupe-ключом поколения (например `case_fanout:<id>:<version>`), иначе `dedupe_key` и BullMQ `jobId` (`:136-138`, `removeOnComplete count 1000`) молча проглотят повтор (см. M-2). При `set_urgency` → urgent: дополнительная волна только для `urgent_only`-адвокатов.
- Тесты: нет.

**C-2 (critical). «Новые кейсы» выключены по умолчанию, и аудитория требует явную строку настройки.**
- `notification-rules.ts:41` `new_cases: false`; `case-audience.service.ts:117-119` `JOIN notification_settings s ... AND s.push_enabled` — адвокат без строки (никогда не открывал настройки) не попадает в аудиторию вовсе: ни пуша, ни in-app строки, ни бейджа. Дополнительно тематический выключатель `newCases` (`push-dispatcher.ts:557-563`).
- Сценарий: релиз, 300 верифицированных адвокатов, 12 включили тумблер → клиентский кейс видят 12. Для клиента «никто не отвечает».
- Fix: (а) при верификации адвоката создавать `notification_settings(new_cases, push_enabled=true)` с явным согласием в онбординге (экран `new_case_alerts_section.dart` уже есть), либо (б) разделить «строка в колокольчике» (всем подходящим) и «пуш» (по настройке): в аудитории убрать JOIN на push_enabled, а решение о пуше оставить `pushAllowed`. Решение владельца.
- Тесты: нет спека на SQL аудитории.

**H-1 (high). Рассылка при выключенных волнах (прод-дефолт) — fire-and-forget в API-процессе без повтора.**
- `subscription-alerts.service.ts:126-132` (`setImmediate`, ошибки → warn), `case-fanout.service.ts:151-156` (`!s.enabled` → `runWave` inline, очередь игнорируется даже при `REDIS_URL`).
- Сценарий: деплой/рестарт пода или 2-секундный обрыв БД сразу после `create` → `runWave` падает/обрывается, кейс никому не ушёл, записи нет, ничего не повторит. Клиент не узнает.
- Fix: если `this.queue` есть — всегда `enqueue` (legacy-режим = одна волна на 5000, это уже реализовано через `size`), inline только без Redis. Добавить метрику «кейсов без ни одного alert через 15 мин» (`SELECT c.id FROM cases c WHERE NOT EXISTS (notifications dedupe_key=...)`).
- Тесты: `waves.spec` «enabled=false is the old behaviour» проверяет только счёт, не доставку.

**H-2 (high). Срочный кейс ждёт утра и стоит в общей очереди волн.**
- `notification-rules.ts:64-69` `QUIET_EXEMPT` без `new_urgent_case`; `push-dispatcher.ts:564-569` откладывает до конца тихих часов. В режиме волн `runWave` не отличает urgent: тот же `firstWaveSize`/`waveIntervalMinutes` (`:354-364`, `:418-424`).
- Сценарий: клиент в 22:30 публикует «суд завтра в 9:00». Адвокат с тихими часами 22:00–07:00 получит пуш в 07:00; в режиме волн 5000 адвокатов получают его порциями до 200 минут.
- Fix: добавить `new_urgent_case` в `QUIET_EXEMPT` (или отдельный пользовательский флаг «срочные ночью»); в `runWave` при `aud.urgent` брать `size = CASE_ALERT_REACH_MAX` и интервал 1–2 мин. Решение владельца по тихим часам.
- Тесты: нет.

**H-3 (high). Дата срочности считается по UTC, не по часовому поясу клиента.**
- `case-urgency.ts:81-93` `daysUntil` на `getUTC*`; `:111-113` `effectiveUrgency`; фильтр ленты `hasDeadline → deadline_at >= CURRENT_DATE` (`:287`).
- Сценарий: клиент в Калифорнии в 17:30 (00:30 UTC следующего дня) публикует «суд сегодня вечером/завтра утром» с датой сегодня → `daysUntil = -1` → `overdue`: не срочный (`URGENT_LEVELS:291`), `urgent_only`-адвокаты исключены, фильтр «с датой» скрывает, карточка «просрочено». С 20:00 ET все «сегодня» становятся «вчера».
- Fix: считать дни в `users.timezone` клиента (есть в `users`, уже используется в `case-deadline-reminder.job.ts:89-102`), либо хранить deadline как конец дня в поясе клиента. Для ленты — `deadline_at >= (now() AT TIME ZONE client_tz)::date` или просто `>= CURRENT_DATE - 1`.
- Тесты: `case-urgency.spec.ts` — только UTC-кейсы.

**M-1 (medium). Упавшая волна = конец рассылки, без DLQ и алерта.**
- `case-fanout.service.ts:42-47` attempts 3 / 5s exp; `worker.ts:72-77` только `logger.error`. Следующая волна ставится только из успешной (`:418-424`).
- Fix: `failed`-хук → ops-алерт + ночной sweeper «open-кейсы < N alerts и возраст > 15 мин → `start()`».

**M-2 (medium). Повторный `start()` для того же кейса молча ничего не делает.**
- `jobId` фиксирован (`:136-138`), завершённые jobs хранятся (`removeOnComplete count 1000`), `dedupe_key` один на кейс (`:132-134`). Любая будущая «повторная рассылка» (C-1, re-broadcast) без смены ключа будет проглочена.
- Fix: ключ и jobId с поколением `<caseId>:<gen>`; gen = поле `cases.alert_generation` или `updated_at` практики/штатов.

**M-3 (medium). Нет повторной рассылки «никто не откликнулся» и нет истечения.**
- Единственный жизненный цикл — stale-ask → pause → archive (`case-lifecycle.jobs.ts`), все про молчание клиента. Кейс с 0 ставок через сутки никому не напоминается, адвокаты вне первой волны (при daily_cap или >5000) не получают его.
- Fix (позже): job «0 bids через 24/72 ч → волна по ещё не оповещённым (включая capped) с типом `new_case` и ключом gen+1».

**M-4 (medium). Фрод-гейт читает статус до его пересчёта и полностью пропускается в legacy.**
- `cases.service.ts:568` планирует рассылку, `:576-579` `fraud.onCaseCreated` → `recompute` идёт после; `runWave:316-318` при `enabled=false` `g='normal'` без гейта. `assertNotRestricted` (`:423`) частично спасает (restricted не создаст кейс), но авто-перевод в restricted **этим** кейсом не остановит его рассылку.
- Fix: `await fraud.onCaseCreated(...)` до `alerts.later(...)`; гейт применять и в legacy (действие для banned всегда `none`).

**M-5 (medium, растёт с масштабом). Аудитория > 5000 → остальные не узнают никогда; LIMIT 20000 без ORDER BY.**
- `CASE_ALERT_REACH_MAX=5000` (`:35`), в legacy одна волна (`more` требует `!legacy`, `:418`); `AUDIENCE_QUERY_MAX=20000` (`case-audience.service.ts:14`, `:127`) — при превышении срез произвольный.
- Fix: включить волны (`case_fanout.enabled=true`) до того, как в одном штате×практике станет >5000 подходящих; добавить `ORDER BY trust_level DESC, rating_count DESC` в LIMIT-запрос.

**M-6 (medium, проверить). Аудитория шире ленты.**
- Аудитория матчит родительскую категорию и `new_case_alert_practices` (`case-audience.service.ts:99-110`); лента — только листья `attorney_practice_areas` × штат лицензии (`cases-visible.sql.ts:199-206`). Адвокат с кастомным списком алертов (категория целиком) без соответствующего листа в профиле получит пуш о кейсе, которого нет в его ленте; при тапе — `CaseAccessPolicy` может дать `CASE_NOT_AVAILABLE`.
- Fix: единое определение «мои (штат, практика)» для аудитории и ленты (вынести в `cases.public.ts`).

**L-1.** `overdue` не входит в `URGENT_LEVELS` — кейс «суд сегодня» (после H-3 — любой вечерний) не срочный для алертов. Включить `overdue` в URGENT_LEVELS или трактовать `days ∈ [-1, 0]` как very_urgent.
**L-2.** Дайджест-ключ по UTC-дате (`:384`) — адвокат в США получает «день» со сдвигом; косметика.
**L-3.** `quietHoursEnd` (`notification-rules.ts:99-117`) складывает минуты локального времени в UTC-мс — в ночь перевода часов пуш придёт на час раньше/позже.
**L-4.** `emitDigest` — по одному запросу на получателя (`:333-358`), до 5000 раундтрипов за волну; perf, не логика.

**Переключатели OFF по умолчанию, из-за которых кейс может остаться без оповещения в проде:** `new_cases` push (`DEFAULT_PUSH`, C-2); тематический `newCases`; `JOBS_ENABLED=false` на API без запущенного worker-процесса → очередь `push` не потребляется (строки создаются, пуши не уходят); `case_fanout.enabled=false` сам по себе безопасен (одна волна всем), но включает H-1.

Что **в порядке**: dedupe на (user_id, dedupe_key) и `skipDuplicates`; идемпотентная волна; паузные кейсы вне ленты и остановка волн; блокировки в обе стороны; стабильный tie-break; квота новичков; promoted/priority вне keyset — дублей в ленте нет; ранжирование `for_you` отделено от keyset.

## Часть 2. CONTENT — лента, рекомендации, модерация

(По отчёту помощника; ключевые утверждения C-1…C-3 проверены по коду: `admin-moderation.service.ts` `act`/`availableActions`, `rule-based-moderation.hook.ts:60-91` INCR на каждом вызове, `posts.service.ts:195/536`.)

### 2.0 Карта кода
- Лента: `modules/feed/feed.service.ts` — `organicPage:210`, кэш первой страницы 60 с `:225-239/419-430`, reco-слоты `:308-337`, `mixPage` (`feed-mixer.ts:14-38`), хвост `latestTail:575-614`, `recommendations:512-569` (окно 200 из снапшота 1000), `markSeen:622`. `feed-reco.job.ts:29-60` — каждые 10 мин, score = (likes+2c+2s)/(age_h+2)^1.5, окно 14 дней, TTL 1 ч.
- Фильтр контента: `posts/content-filter.service.ts:33-80`; видимость `posts/post-presenter.service.ts:17-29`.
- Рекомендации: `recommendations/recommendations.service.ts` (`peopleCandidates` ~300-360, `PEOPLE_SCAN=600`; `postsFor` ~385-470; `casesFor` ~495-600; кэш `~790`), `offset-cursor.ts`.
- Модерация: `moderation/rule-based-moderation.hook.ts:54-91`; `moderation.service.ts:460-720` (`setContentStatus`), `:729-765` (`autoHideIfThreshold`); `admin-moderation.service.ts:63-138` (очередь = только `reports`), `:176-289` (`act`); `moderation-appeals.service.ts:66-130/140-200/295-380`; `media-moderation/media-moderation.service.ts:126,234-355,458-630`.
- Мобильный клиент: `apps/mobile/lib/shared/domain/cursor_page.dart:63-76` (дедуп по id), `features/social/application/social_providers.dart:168-232`.

### 2.1 Находки

**C-1 (critical). «Dismiss» на авто-скрытом посте оставляет его скрытым навсегда.** `admin-moderation.service.ts` `act` ~204-232: dismiss закрывает жалобы, статус не меняет, уведомления и `moderation_action` нет → пост вне очереди, автор не может обжаловать. Fix: для `hidden` dismiss = restore (или убрать кнопку). Тест: `stage-6-4.e2e-spec.ts:457-481` только для published.

**C-2 (critical). Посты/комментарии, задержанные правилами (hold-слова, ≥3 ссылки, дубликат), не попадают ни в одну очередь.** `posts.service.ts:195-203, 1086-1099`, `comments.service.ts:101-150` → `hidden`; `report` не создаётся, очередь читает только `reports`, в админ-списке постов нет фильтра по статусу, автору не сообщают. Fix: системный report `auto_hold` + уведомление. Тест: `stage-6-4.e2e-spec.ts:145-204` проверяет только `hidden`.

**C-3 (critical). Правило «дубликат» считает каждый вызов → редактирование и повтор после ошибки скрывают пост.** `rule-based-moderation.hook.ts:69-88` INCR при каждом `check()`; `posts.service.ts:536` зовёт модерацию на каждом edit с обязательным `body`; `:195` модерация раньше `assertAttachable` (~220-260) — повтор после `FILE_NOT_ATTACHABLE` = hold. Комментарий «Спасибо» дважды в сутки — второй скрыт. Fix: `check()` только читает, запись хэша после успешного create; на edit пропускать при неизменном тексте; минимум ~20 символов. Тест: `rule-based-moderation.hook.spec.ts` только счётчик.

**H-1.** После restore любая новая жалоба снова скрывает: `autoHideIfThreshold` (~742) считает `open`+`actioned`. Fix: только `open` / после последнего restore.
**H-2.** Автора не уведомляют об авто-скрытии, hold и image-hide; `moderation_action` не создаётся → обжалование невозможно (`moderation-appeals.service.ts:66-92,140`).
**H-3.** Снапшот рекомендаций сканируется только на глубину 200 (`feed.service.ts:532-536`), хвост исключает весь снапшот (`:588-591`) → ранги 200-999 никогда не показываются «Legal only»-зрителям и тяжёлым читателям. Fix: сканировать чанками до 1000.
**H-4.** Новый адвокат никогда не попадает в кандидаты «люди» (`peopleCandidates` ORDER BY rating DESC LIMIT 600 до скоринга). Fix: union с 200 новейшими.
**H-5.** Пост без реакций имеет score 0 (`feed-reco.job.ts:33-46`); при >1000 постов за 14 дней новые авторы не попадают в снапшот. Fix: exploration-доля (~100 слотов для постов <6 ч).
**H-6.** Restore возвращает удалённый автором пост: `setContentStatus('restore')` ставит `deleted_at: null` (~474-480); approve картинки (`media-moderation.service.ts:598-599`) и принятие апелляции идут тем же путём. Fix: не чистить `deleted_at`, если удалял не модератор.

**M-1.** Image-модерация fail-open навсегда при исчерпанном бюджете (`skipped`) и после 4 ошибок (`error` вне `QUEUE_STATUSES`), без перепроверки. **M-2.** Повторно загруженная картинка копирует статус двойника, но не `decision` approved → снова скрыта (`adopt:337-355`). **M-3.** Кэш первой страницы 60 с не учитывает блокировки/подписки/свой новый пост (`fromIds:632-656`). **M-4.** Репосты: `take:10` на окно (`:498`), лишние теряются молча. **M-5.** `seen` ставится при выдаче, а не при показе (`:415-418`). **M-6.** Offset-пагинация по кэшированным спискам (For-You grid, cases `for_you` — только 300 новейших, `hydrate` без перепроверки статуса/блоков) → пропуски при пересборке кэша. **M-7.** «Legal only» теряет непомеченные посты адвокатов (`content-filter.service.ts:33-40`).

**L-1…L-7.** Курсор по мс против timestamptz с микросекундами (проверить `date_trunc`); claim-ключ жалобы ставится до INSERT (`reports.module.ts:117-127`); reels и гостевая лента игнорируют content mode; `VISIBLE_POST_WHERE` скрывает только `suspended` (не `rejected/pending`); снапшоты сообществ 30 мин без фильтра блоков; клиент видит свои посты в рекомендациях себе; поведение скролла при странице из одних дублей не проверено.

Что **в порядке**: миксер и курсоры `f`/`l`/`v` (`feed-mixer.spec.ts`, `stage-5-3.e2e-spec.ts`); keyset `(created_at,id)` везде, где не offset; блок удаляет подписки в обе стороны; search `presentPosts` перепроверяет видимость и блоки; поток reels `processing→published` условным update; принятие апелляции с откатом. «Галочки/attorney-first» в ленте нет: только гостевая лента = авторы-адвокаты (`feed.service.ts:185`), trust/badge — малые веса в grid/people.

## Часть 3. TARIFFS / PRICING

(По отчёту помощника; проверены по коду: `stripe-webhook.intake.ts:66-97` (P2002 → `return false`, 200), `subscription-sync.service.ts:328` (`paid = type === 'invoice.paid'`).)

### 3.0 Живое / мёртвое
- `payments_in_app` **заблокирован** (`common/feature-flags/locked-flags.ts:8`); `POST /webhooks/stripe/connect` → 404 без `CASE_PAYMENTS_UNLOCKED_FOR_TESTS` (`stripe-webhook.controller.ts:41`). Мёртво: весь `case-payments` (quote/escrow/Connect/возвраты по кейсам, комиссия платформы `case-payments.settings.ts:~250-300`).
- Живое: подписки (checkout, карта в приложении `start/confirm`, pay-page/pay-link, `switchToYearly`, места, cancel/resume), bid packs ($15/$39/$99, `bid-packs.service.ts:40`), boosts (`promotions`), stars, промокоды/рефералы, возвраты (админ + `verification-loss-billing`), контрактные гранты, payroll/treasury.
- **Не найдено в коде:** цена основателя $99/год (только админ-созданный yearly `plan_prices`), сдельные ставки персонала. Встроенные суммы: $399/мес, $100/место, $9 590/год (`billing.constants.ts`).

### 3.1 Карта кода
- Webhook: `billing/stripe-webhook.intake.ts` `receive:53`, insert `:66-77`, P2002 `:77-84`, `queue.add:93-97`; `billing.runner.ts` `processWebhook:129-173`, DLQ `:154-163`.
- Синк: `billing/subscription-sync.service.ts` `handleEvent:75`, `apply:178-270` (grace `:213-217`), `onInvoice:317-441`, `seatSync:496-531`, `onRefund:533-566`, `mapStatus:596-618`; правило доступа `subscriptions/subscription-rules.ts:7-16` (`grace_ends_at > now`), кэш 60 с `subscription-access.service.ts`.
- Подписки: `billing/subscriptions.service.ts` `prepareOrder:304`, `applyOrder:476`, `switchToYearly:671`, `confirm:721`, `cancel:1015`; `seats.service.ts` `set:~110`, `decrease:~190`, `applyDueDecrease:~235`; `stripe-payment.provider.ts` `createSubscription:242`, `switchToYearly:514`.
- Возвраты: `admin-billing/refunds.service.ts:137-235`; `subscription-admin.service.ts:200-250`; `jobs/handlers/verification-loss-billing.job.ts` `unusedShare:19`, `handle:77`, `refund:196`; `ledger/ledger-posting.service.ts:109,162`.
- Паки/лимиты/промо: `bid-packs.service.ts` `consume:149`, `refund:157`, `applyCheckout:357`; `bids/bids.service.ts:221-292`; `admin-billing/promo-rules.ts:57,88,143`; `promotions/promotions.settings.ts:~329-385`.
- Payroll: `admin-payroll/admin-payroll.service.ts` `payBulk:209`, `sendTransfers:416`, `autoDue:499`, `cancel:592`; `payroll-accruals.service.ts` `accrue:76`, `cancel:110`, `stripeFee:224`; `treasury/treasury.service.ts` `payrollDaily:184-280`, `markPayrollRan:595`; `treasury-plan.ts:126-170`.

### 3.2 Находки

**C-1 (critical). Событие Stripe может застрять навсегда; ресенд из Dashboard не помогает.** `stripe-webhook.intake.ts:67-97`: строка в `stripe_webhook_events` создаётся до `queue.add`; при падении Redis/процесса между ними ответ 500, ретрай Stripe упирается в P2002 → `return false`, 200, `processed_at` null; никто не подметает; повторный `add` с тем же `jobId` — no-op пока failed-job хранится (`removeOnFail: 5000`). Сценарий: `customer.subscription.updated` (past_due→active) потерян → через 3 дня grace платящий теряет доступ. Fix: при P2002 грузить строку, если `processed_at IS NULL` → re-add с `jobId event.id:attemptN` или 500; sweeper раз в 5 мин; поправить runbook `docs/runbooks/stripe-webhooks.md`. Тест: `stripe-webhook.intake.spec.ts` — только обычный дубль.

**H-1.** Поздний `invoice.payment_failed` перекрывает успешную оплату: `subscription-sync.service.ts:328` `paid` берётся из типа события, не из `invoice.status`; `:353-376` Payment → failed, `:400-415` past_due + grace, `:422-425` re-sync пропускается. Fix: `paid = invoice.status === 'paid'`; не понижать `succeeded`.
**H-2.** `invoice.paid` без локальной подписки молча отбрасывается (`:327 if (!sub) return`) — гонка с `applyOrder` в карточном пути: нет Payment, нет ledger, нет реферала. Fix: throw (ретраи) или создать Payment по customer.
**H-3.** Админский возврат может уйти дважды: `refunds.service.ts:184-229` один try на Stripe+БД; при ошибке БД после успешного Stripe строка `failed`, резерв освобождён, новый `refund:<id>` ключ → второй реальный возврат. Fix: двухфазно — сначала persist `stripe_refund_id`.
**H-4.** «Отменить с возвратом» берёт последний `succeeded` Payment пользователя (`subscription-admin.service.ts:207`), а таблица общая с паками/бустами/stars/$0 trial → пропорциональный возврат считается от не той суммы. Fix: выбирать по `latest_invoice`/`stripe_invoice_id`, исключить 0.
**H-5.** Возврат/чарджбэк не отбирает купленное: `onRefund:556-565` не трогает `bidCredit`; `charge.dispute.*` уходит в `casePayments.handleProviderEvent` (`:80-88`), который без CasePayment выходит (`case-payments.service.ts:1060-1068`) → диспут на подписку/пак/буст игнорируется. Fix: `bidPacks.refundPayments` по образцу `StarsService.refundPayments:537`; обработчик платформенных диспутов.
**H-6.** Payroll auto-run помечается «ran» даже при неудачных переводах (`treasury.service.ts:259`) → зарплата не повторится до следующего месяца. Fix: mark только при `failed.length===0`.
**H-7.** Выплата `processing` может зависнуть (crash между коммитом и Stripe в `payBulk`/`sendTransfers:416`), считается оплаченной (`COUNTS_AS_PAID:77`), `cancel:603` отказывает, sweeper'а нет. Fix: sweep `processing` > N мин с тем же idempotency `payroll-<id>`.

**M-1.** `verification-loss-billing.job.ts`: база для «неиспользованной доли» — последний invoice (может быть мелкая проратация мест, `:99-106`); `cancelNow`+`apply` до возврата без маркера (`:93-94`) → повтор падает, возврат не делается; нет ledger-записи; декремент кредитов гонится с `consume` (`:184`). **M-2.** Частичные возвраты не доходят до `onRefund` (`:535` guard `charge.refunded`). **M-3.** `switchToYearly` (`subscriptions.service.ts:671-715`) пишет локальное состояние без проверки результата, без idempotency-ключа и блокировки → двойной тап = две проратации, declined-карта = yearly без мест. **M-4.** Повторная подписка после grace не отменяет старую Stripe-подписку (`applyOrder:476-520`), дубликат из второго устройства не рефандится. **M-5.** Ошибка Stripe Tax проглатывается (`pay-page.service.ts:~225-228`) — налог не собран молча. **M-6.** Отменённый PaymentIntent переигрывается тем же idempotency-ключом (`one-time-pay-page.ts:80-95`) → покупатель 24 ч не может оплатить пак/stars. **M-7.** `hadPayment` считает $0 trial и паки (`:206-210`) → `canceled` вместо `expired`. **M-8.** `payroll-accruals.service.ts:110-130` `cancel` возвращает `'canceled'` для `processing`; отмена оплаченной выплаты не сторнирует `expense_payroll`.

**L-1.** Месячный лимит ставок без блокировки (`bids.service.ts:221-292`), reused-bid сбрасывает `created_at`. **L-2.** `addMonthsUtc` дрейф дат грантов (31 янв → 28 фев → 28 мар). **L-3.** Промо: купон `duration:'once'` может сгореть на $0 trial-инвойсе (проверить test clock); `quote()` создаёт реферальный купон на каждый показ цены (`:625-640`); `quotePromotion` даёт отрицательную скидку при `payableCents < MIN_CHARGE_CENTS`. **L-4.** Места: `effectiveAt = current_period_end ?? now` — null применяет снятие сразу. **L-5.** `TRIAL_DAYS=7` при комментарии «14»; `stripe_webhook_events` без ретенции; `quotePayment` деление на ноль при 100 % (мёртвый путь).

Что **в порядке**: grace — epoch-ms, UTC, якорь не сдвигается, `> now` строго; события подписки перечитываются из Stripe (порядок почти не важен, кроме H-1); dedupe по `stripe_event_id` + `jobId`; идемпотентность checkout (`subscriptionAttemptKey`, `seats:<user>:<paid>-<seats>:<prorationDate>`); ledger двойная запись с уникальным `(source_type, source_id, event)` и `reverseProportional`; Stars refund c FOR UPDATE и долгом; `applyCheckout` паков serializable; базовая зарплата раз в период по DB-guard; idempotency `payroll-<payoutId>`.

Спек-пробелы с наибольшей ценностью: `subscription-sync.service` (`handleEvent/onInvoice/onRefund/mapStatus/apply`), `AdminPayrollService`, intake «дубль, но не обработан», `BidPacksService.applyCheckout` гонка.

## Порядок исправлений (предложение)

1. **До релиза:** CASES C-2 (решение по умолчанию/онбордингу), C-1 (хотя бы re-alert при смене практики/штата и resume, с поколением ключа M-2), H-1 (всегда через очередь при Redis), H-2 (срочные вне тихих часов); CONTENT C-1, C-2, C-3, H-6; TARIFFS C-1, H-1, H-3, H-5, H-6.
2. **Сразу после:** CASES H-3 (пояс клиента), M-4; CONTENT H-1, H-2, M-1, M-3; TARIFFS H-2, H-4, H-7, M-1–M-4.
3. **Можно позже:** CASES M-3 (re-broadcast), M-5/M-6; CONTENT H-3/H-4/H-5 (честный старт), M-4–M-7; TARIFFS M-5–M-8 и L.

Граф `graphify-out` не обновлялся (изменён только этот документ).
