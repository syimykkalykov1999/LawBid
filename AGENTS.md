> Строгие правила владельца: [`docs/dev/STRICT_RULES.md`](docs/dev/STRICT_RULES.md). Читать при каждом старте и после сжатия контекста.

# ОБЯЗАТЕЛЬНО: CI-протокол перед PR/пушем/слиянием

Прочитай раздел «ОБЯЗАТЕЛЬНО перед любым PR/пушем/слиянием» в [`docs/dev/PROJECT_MAP.md`](docs/dev/PROJECT_MAP.md) (merge main → `npm run precheck` / `precheck:full` → генераторы после мерджа → красный шаг читать, не перезапускать). Причины красного: `docs/dev/CI_CHECKLIST.md`, `docs/dev/CI_FAILURES_AUDIT_2026-11-01.md`.

# СТРОГИЕ ПРАВИЛА ПРОЕКТА (владелец, 02.11.2026; для каждого ИИ, нынешнего и нового)
Эти правила записаны в `AGENTS.md`, `CLAUDE.md`, `docs/dev/PROJECT_MAP.md` и `docs/HANDOFF.md`. Что уже сказано ниже (Rule #1–#3, CI-протокол, журнал шагов), не отменяется, а дополняется.
1. **Планка: большой проект, не MVP.** Нагрузка, скорость, экономика, баланс ресурсов, работоспособность, тесты, живучесть, безопасность и всё прочее обязательны по умолчанию. Владелец не перечисляет это по пунктам и не должен.
2. **Ничего «Частично».** PR с пометкой «не проверено» по тому, что проверяется на стенде или в CI, возвращается автору с тестами. Что нельзя проверить без устройства или прода, честно пишется в «Осталось», а не выдаётся за готовое.
3. **Сначала поиск в коде, потом механика.** Новую механику не делаем, пока не проверено, что её нет (поиск по коду, docs, `docs/dev/PROJECT_MAP.md`, `KNOWN_ERRORS.md`). Дубли запрещены. В описании PR раздел **«Что искали и где»**, а также «как у больших и почему так же у нас».
4. **Перед «готов»:** `/code-review high`, `/security-review`, `/simplify`, `npm run precheck`, тесты на **класс** ошибки (не на один случай), минимальный дифф, файл в `docs/dev/journal/` (формат в конце файла).
5. **Слияния и деплой:** в main сливает только диспетчер «Вылечить CI», по одному, после слова «готов» от автора. Merge queue и force-push не используем. Деплойные PR идут серией: следующий деплой только после проверки выката предыдущего. Облачные потоки не трогают прод, AWS, чужие ветки и чужие прогоны.
6. **Операции на Mac и ноуте** (сборки на телефон, Terraform, Docker, раннеры, нагрузка) идут только через Mac RC-поток; облачный поток их сам не запускает.
7. **Общение с владельцем:** по-русски, коротко, факты и SHA, команды в code block, один вопрос за раз, секретов в чате нет, время по Висконсину (UTC−6). После 4 попыток писать «Не решено» с причиной.
8. **Работать с сабагентами и скилами** (там, где это ускоряет и не противоречит правилам выше), не стоять на месте: если упёрся, сказать об этом сразу и идти к следующему пункту.

# Rules for every AI agent, helper and session working on LawBid

**Start with [`docs/dev/PROJECT_MAP.md`](docs/dev/PROJECT_MAP.md) — the current plan and state. Work from the map, not from old chat transcripts.**

## RULE #1 — THE MOST IMPORTANT RULE (owner, 2026-10-28)

**Do not invent the alphabet when a ready language exists.**

- If a proven, widely used open-source solution exists, **take it as is** (as close to verbatim as possible) instead of writing our own. This applies to the whole system: app, server, admin, infrastructure. It applies above all to the areas that keep breaking: calls, reels/video, uploads, push notifications, navigation/back/keyboard, search, caching, cost and speed.
- **Our look stays ours.** Only the screens' appearance and the things nobody else has are written by us. The internals come from the proven source.
- **Licenses:**
  - MIT / Apache-2.0 / BSD: copy whole. Keep the copyright and license notice in `THIRD_PARTY_NOTICES`. That is all the license asks.
  - GPL / AGPL / closed code (e.g. Signal, Element): **never copy, not even "slightly changed"**. Small edits do not make it ours, and a court compares substance. Read for the idea only, write our own code, and test it against the same cases.
- **Take it WHOLE, never mix.** Breakage comes from our own half-working code mixed with copied pieces. Transplant the proven implementation entirely (its full flow, not fragments), delete our replaced code, and connect it only at the edges (our screens, auth, push). Do not "fix" copied code with our own patches — if it misbehaves, the cause is our glue or a missing part of the original; copy that part too.
- **From now on we only copy.** Writing our own code is FORBIDDEN by default. If no proven source exists anywhere in the world, STOP and ask the owner first. Write own code only after the owner explicitly says yes.
- **Both platforms:** the rule applies equally to iPhone (Swift/iOS) and Android (Kotlin) native code, not only to Flutter/Dart.
- **GPL / AGPL / code that forces us to open our source:** never copy it. Study it and build exactly the same behaviour for us, in our own code. Do not invent: follow the studied reference step by step.
- **Safety of copied code:**
  - Take it only from the official repository, at a pinned release tag or commit.
  - Record the URL and commit in a `docs/dev/<AREA>_REFERENCE_<date>.md` file, together with a list of every mismatch against our code.
  - Read every copied file: no obfuscation, no calls to unknown hosts, no install scripts.
  - Prefer depending on the published package (pinned version and lockfile) over copying.
  - Run gitleaks and a dependency audit.
- **Before building anything:** search GitHub and the docs for the proven way first, and write down which reference you follow.

**Why:** we kept hitting the same bugs and spending tokens on rewrites of our own inventions, especially in calls. The owner had asked from the start to take proven solutions.

## Rule #2 — Light on phones and server
Every feature must not heat, crash or drain user phones. It must keep server load and cost minimal: bytes go straight to storage and the server never proxies files. Quality stays at Instagram level.

## Rule #3 — Known errors
Before any change, PR or deploy, read [`docs/dev/KNOWN_ERRORS.md`](docs/dev/KNOWN_ERRORS.md). Append every new cause of a red PR, failed deploy or prod outage there in the same hour.

## Rule #4 — Repo hygiene: no binary seeds in git
Data that changes often (translations, seeds, fixtures) is stored as sorted plain text (JSON/CSV), never as xlsx/zip/dumps: git cannot diff or delta binaries, and every rewrite adds the full file to history and to every CI clone ([`KNOWN_ERRORS.md` #39](docs/dev/KNOWN_ERRORS.md)). Translations live in `apps/api/prisma/seed/translations/<lang>.json`; add texts with `scripts/i18n-add.mjs`.

Put these rules in every subagent / helper prompt.

**Журнал шагов:** после каждого влитого шага добавь файл `docs/dev/journal/YYYY-MM-DD-prNNN-кратко.md` (дата, PR, SHA, что сделано). Строки в таблицу PROJECT_MAP.md не дописывай: параллельные PR конфликтуют на ней.


## Правила владельца (дословно)
Поведение ИИ. Источник: `docs/dev/OWNER_REQUESTS_CHECKLIST_2026-11-03.md`.
- **R-263 (21.10).** Сделанное и слитое до 60ae65d8 не менять и не «улучшать»; правки только по Q&A, падениям CI, чек-листу, минимальным диффом; в конце список изменённых файлов. «Правило владельца: всё, что в HANDOFF отмечено как сделанное и слито до 60ae65d8, НЕ менять и не «улучшать».»
- **R-267 (22.10).** Нет ответа на вопросы — работать дальше, вопросы в самый конец; не повторять вылеченное; будить «заснувших» помощников. «Если я не отвечаю на твои вопросы, то продолжай работать не ожидая меня, оставив свои вопросы в самый конец»
- **R-268 (22.10).** Любую правку делать во всех профилях (адвокат, клиент и др.). «когда я что то говорю тебе делать делай это во всех профилях»
- **R-274 (22.10).** Перед внедрением находок дать список «что это делает», он выберет. «было бы лучше если по списку ты написал это для такой вещи делает вот этот и тд и потом я принимаю какие делать а какие не делать»
- **R-276 (22.10–28.10).** Регулярно чистить Mac и ноутбук (диск, ОЗУ до 14 из 16 ГБ, нагрев), нужное не удалять, лишнее (Docker) без нужды не запускать. «не забывай чистить мак от не нужных файлов так как он может заполниться»
- **R-293 (25.10).** Разведчику добавить аудит плавности анимаций и скорости (приложение, веб, админка; Samsung, iPhone, ПК) — после системных работ. «плавность анимации и тд для самсунг айфонов пк какие пусть тоже ищет»
- **R-301 (26.10).** Ничего не отменять без спроса, он готов ждать. «не отменяй ничего, если вопрос отменой и ожиданием я готов ждать»
- **R-302 (26.10).** Перед косметикой проверить, что выполнено из последних просьб; свежий вид не откатывать. «внешний вид не верни назад оьратно как это было 2 недели назад»
- **R-303 (26.10).** Проверять всех помощников каждые 5 минут, застрявших подталкивать, самому не останавливаться. «проверяй каждые 5 минут всех на обновлении есть результат или нет каждые 5 минут понял»
- **R-310 (27.10).** Отчёты не чаще раза в 10–20 минут; ошибки чинить с корня, не ходить кругами. «Не пиши мне каждые 5 минут далбаеп тратя токены блядь тогда, пиши каждые 10 минут или 20 минут»
- **R-316 (28.10).** Админка готова — не ломать её новыми копированиями. «надеюсь админку не выебите с новыми копированиями»
- **R-322 (28.10).** Нужна общая «карта постройки приложений на миллиард пользователей» (не про LawBid), пошаговый «мозг» для любого ИИ. «я хочу создать карту гондон блядь на карту блядь сука понимаешь»
- **R-362 (28.10).** На Linux-ноутбук поставить «чистый» Claude с ярлыком «Claude» на рабочем столе, управление с телефона, не только в папке проекта. «Я хочу вообще не связанный чистый клауд»
