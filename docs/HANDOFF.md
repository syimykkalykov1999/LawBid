# HANDOFF — continue exactly here (written 2026-10-24 night by the coordinator)

Another Claude account may pick this up. Read ALL of this before doing anything.

## 1. Who and how
- **Owner:** SiMA (Syimyk Kalykov). He is not a programmer.
  - Always answer in Russian, in plain words, 2-4 short lines. No long tables or "books" unless he asks.
  - He gets angry at long texts, jargon, guesses, and at re-proposing things that are already done.
- **You are the foreman.** Delegate the work to sub-agents:
  - model `sonnet` (or `haiku` for mechanical work);
  - at most 2 heavy workers at once;
  - `isolation: worktree`.
  - Every brief says: research first with LIVE web search using 2025-2026 sources and citing dates, then design, then code. Never guess; copy proven open-source or managed tools where they exist.
- **The app's LOOK is FROZEN:** layout, buttons, colors, screens.
  - Change UI only when he asks for it, and then minimally. «чуть чуть» means about 20 px.
  - The held branch `claude/mine-menus-polish` (menu rewrites) is NOT to be merged without his OK.
- **Scaling rule:**
  - every component starts cheapest and grows or shrinks by itself;
  - its ceiling can be raised in the admin;
  - the move to bigger, split or cluster setups is ready now as a switch or button.
  - We never pay for empty capacity and never need code changes later.
- **Git:**
  - Push and self-merge PRs when CI is green: `gh ... -R syimykkalykov1999/LawBid`; there are two remotes.
  - Never use `--no-verify`.
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - PR bodies end with the Claude Code line.
- **Prod Terraform apply is done ONLY by the owner, pressing Run on a saved plan you prepared.** The classifier blocks you from applying to prod and from IAM changes. Give him one bash block.
- **AWS credentials:** `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CREDENTIAL_EXPIRATION; eval "$(aws configure export-credentials --format env)"`. If the session expired, tell him to run `aws login`.
- **Hooks:**
  - The Fact-Forcing Gate wants facts before the first Bash command and before rm or destructive commands: request, what the command does, rollback, and his words quoted. Then retry the SAME command.
  - With `rm` on variables, use `${x:?}`.
- **Mac hygiene:** when free space is below 15 GB, delete build outputs; after installing builds on the phones, delete apps/mobile/build. A battery watch runs; at 15 % send him a PushNotification.

## 2. Where things are
- **Prod tfvars (git-ignored):** `.claude/worktrees/tf-plan/infra/envs/prod/terraform.tfvars`. A backup is in Secrets Manager `lawbid-prod/terraform-tfvars`; re-upload it after every edit.
  - Settings: turn_enabled=false (calls use Cloudflare); api_max_tasks 50 / worker 20; redis_replicas 1.
  - Do NOT copy launch.tfvars.example blindly.
- **Load-test IAM state (local):** `.claude/worktrees/tf-plan/infra/bootstrap-loadtest/terraform.tfstate`, backed up to `s3://lawbid-prod-tfstate/bootstrap-loadtest/terraform.tfstate`. Keep the tf-plan worktree; do not delete it.
- **Prod state:** `s3://lawbid-prod-tfstate/prod/terraform.tfstate`, init with `-backend-config=backend.hcl` in envs/prod.
- **Docs to read:**
  - docs/architecture/: SHARDING_READY, DB_POOLER, DB_AUTOSCALE, REDIS_AUTOSCALE, SEARCH_READY, R2_PUBLIC_MEDIA, ONLINE_DDL, GROUP_CALLS_CLOUDFLARE_SFU, BENCHMARK_BIG_APPS, P0_AND_COST_PLAN.
  - docs/runbooks/: DNS_TO_CLOUDFLARE, TURN, db-autoscale, pg-repack, redis-autoscale, DB_POOLER, batch-a-owner, paging, restore-drill, nat-endpoints.
- **Pending-owner checklist (memory):** `~/.claude/projects/-Users-sima-Desktop-LawBid/memory/release-checklist-2026-10-24.md`. Read MEMORY.md and all the files it links.

## 3. State at handoff
**Merged to main today:**
- Cloudflare TURN #299, R2 public media #303 (switch off), group calls API/app #304/#307, Mine polish #309/#310, Cloudflare parity #311.
- Own PgBouncer #312 (off), image /tmp VOLUME fix #313, shard-ready 0-2 #314, DB autoscale #315.
- Pooler max 4 #316, docs #318, batch A #320.
- Load-test fixes #300 #302 #305 #306 #308.

**Open PRs, to merge when green:**
- #317 Redis autoscale (conflict just resolved);
- #319 shard-ready 3-5;
- #321 search-ready.

**Running worker:** batch B (abuse and quotas) on `claude/batch-b-abuse`. When it reports, open a PR and merge.

**Prod:**
- The API is healthy on the old images.
- The deploy of the latest main waits for the OWNER's approval in GitHub Actions (Deploy workflow, environment production). Before approving, CANCEL older queued deploy runs: stale runs block the queue (`gh run cancel`, then `gh api -X POST .../runs/<id>/force-cancel`).
- The previous deploy rolled back because of the read-only /tmp issue; #313 fixes it.
- RDS Multi-AZ is pending for the Sunday window.
- The first AWS Backup job was started manually on 2026-10-24.

- **Checklist reconciliation (2026-11-01):** every «Частично»/«Нет» item re-verified against main, with owner steps and open items: `docs/perf/SYSTEMS_CHECKLIST_2026-11-01.md`. SECURITY.md + security.txt added.

## 4. Queue — do ALL, in order (the owner wants everything, nothing skipped)
1. **Batch C** (P0_AND_COST_PLAN): SES and Stripe circuit breakers; a separate allkeys-lru cache Redis; Cache-Control on anonymous public GETs (careful: no personalized data through the CDN) and hot search cache 30-60 s; Cloudflare TURN usage via GraphQL `callsTurnUsageAdaptiveGroups`, alert at 700/1000 GB; Bunny `/statistics` polling and alerts.
2. **Batch D (after B):** the Flutter WEB Turnstile widget (web only), the honest wording fixes, and the admin «Масштаб» page: all ceilings, buttons, and alarm cards "what happened / what was done automatically / button", in the existing admin style.
3. **DB split, steps 6-10 of SHARDING_READY:** user loader, outbox for cross-family writes, feed/search/admin scatter-gather, dropping cross-family FKs, the move tool, and the admin «Разделить базу» button with checks and rollback. Use the 113 known two-DB limitations in apps/api/test/two-db-suites.json as the worklist.
4. **Redis cluster-mode readiness:** hash tags for BullMQ and Lua keys; a switch.
5. **A search alert:** search p95 above 300 ms emails «пора вынести поиск».
6. **P1, first month:** ECS canary/blue-green, Terraform drift check, an AWS FIS GameDay, cosign + SBOM, S3 Intelligent-Tiering, k6 p95 gates, push collapse keys, ARM64 + worker Spot (scripts ready: scratchpad spot-no-downtime.sh approach, `scripts/ops/arm64-check.sh`, the Mirror ClamAV workflow).
7. **Then the owner's main path:**
   - the owner pastes the Cloudflare TURN key and creates the SFU key; 1:1 and group call tests on his phones;
   - the DNS move to Cloudflare (runbook), then R2 (bucket, CORS, cache rule, verify-r2-media.sh), then flip `media.public_store`;
   - load tests on AWS (smoke, m1, m10, calls) ONLY after the moves; the `load-test.yml` workflow; each run needs his approval;
   - final iOS + Android builds on his phones (iPhone 00008150-001E545A1480401C, Samsung R5GL11433DD; prod flavor, `--dart-define-from-file=config/prod.json`), then the .aab for Google Play.

## 5. Owner to-do list (show him as a short list when relevant)
1. Approve the Deploy run in GitHub.
2. Cloudflare: TURN key into admin (Integrations → Cloudflare TURN); create the Serverless SFU app and its key; the DNS move.
3. PagerDuty Free signup; give the integration URL (docs/runbooks/paging.md).
4. Name the monthly budget ceiling. He said up to $500 is OK. Note: the cost-guard caps ECS at min when the budget is hit, so do not set it too low.
5. Delete the manual $50 budget "LawBid Monthly" in the console.
6. Run the restore drill when asked.
7. At the end: the Apple account transfer to SiMA LLC, the Stripe live key.

## 6. VERY LAST TASK (the owner's "everything is done" signal)
ONLY after every item above is finished: the verified checkmark badges (attorney green, client badge) look greyish in some themes. Fix ONLY their colors per theme (Day, Night, Blue, Green) so each is clearly visible; keep the icon shape and size. If anything else is unfinished, do NOT do this, because the owner uses it to know all work is complete.

---

## СТАТУС ПРАВОК (01.11, ветка `claude/project-thread-v0m4cp`, PR в main)
Полный список «просил/сделано/не сделано» — `docs/HANDOFF_MAC_2026-10-29.md`; слова владельца — `docs/dev/owner-requests/`.
Статусы: сделано SHA / в работе / не решено после 4 попыток.

| Пункт | Статус |
|---|---|
| Слиты в рабочую ветку: #525 R8, #526 правила, #522 VoIP→CallKit, #523 план звонков, #517 скрытие счётчиков, `reels-freeze`, `pull-refresh`, `archive-reauth`, `no-extra-phone`, `privacy-follow`, #515, #520 поиск, #516 реестры | слито (конфликты решены; xlsx переводов объединён по ключам); проверка — CI этого PR |
| Ветка `claude/mac-rescue-2026-10-29` целиком | не слита: конфликты ios pbxproj/entitlements, контакты, чат; в рабочую ветку взяты только документы |
| Звонки: лаги (п. 4) | не начато: нужен замер на телефоне |
| Местоположение в чате (п. 36) | сделано в #535 (кнопка «Моё местоположение», GPS бесплатно, 85 языков); нужна декларация Data safety (геолокация) в Play Console |
| Поиск (п. 29–33) | людей/дел/мастера дела — в #535; стартовый экран — плейсхолдеры вместо пустоты; CJK от 2 знаков; посты/темы — индексы FTS+trigram уже есть, не проверено на телефоне |
| Уведомления кейсов (п. 34) | код проверен: 13 типов отправляются, темы и переходы есть; если не приходят на телефоне — FCM/настройки, проверка на устройстве |
| Загрузка кусками, сжатие, плавность (п. 35, 37) | тред «Закрыть все пункты сверки» (#537) и тред «Ускорить мобилку» |
| Очередь после слияния #535 | п.8, 11 (проверить), 15, 16, 17, 20, 21, 10, 13, 14, 9, плеер рилсов |

## Экономный режим до релиза (2026-11-02)
Убрать Multi-AZ базы и второй узел Redis до релиза (≈ $1,6/сутки), вернуть перед запуском. Команды и чек-лист «вернуть перед релизом»: `docs/runbooks/pre-release-cost-mode.md`, профиль `infra/envs/prod/pre-release.tfvars.example`. Apply только с Мака, с одобрения владельца.

## Решения для владельца
- «Чаты» в Сохранённом (п. 19): оставлено как есть, ответа не было.
- Ветка mac-rescue не слита целиком: там снимок несохранённой работы Mac (контакты, стикеры, iOS-проект) — конфликтует с main; брать частями по команде.

## Ждёт устройства или решения (02.11)
| Пункт | Что нужно |
|---|---|
| Certificate pinning | этап телефонных сборок: проверка на Samsung и iPhone, запасной ключ (primary+backup), kill-switch; без устройства не включать |
| VoiceOver / TalkBack | этап телефонных сборок: пройти экраны экранным диктором на устройстве; в коде метки есть, на телефоне не проверено |
| Покадровая проверка видео (#597) | флаг выключен. Rekognition и Bunny sandbox/mock в репозитории нет, настоящий прогон возможен только на проде с дневным лимитом. Включение: `gh workflow run container-scan.yml -f with_ffmpeg=true` → зелёный → `gh variable set WITH_FFMPEG --body 1` → деплой → в админке `moderation.video.frames_enabled` |
| Списки из копии телефона (#635, 32b20e1b3) | этап телефонных сборок: холодный старт без сети, режим «в самолёте», 304 на медленной сети, ощущение скорости на Samsung и iPhone. Без устройства проверены только тесты: копия отдаётся без запроса, медленный диск = промах быстрее 1 с, офлайн-старт отдаёт копию |
| Скорость мобилки (аудит 02.11, PR #643) | этап телефонных сборок: время холодного старта в мс, память при длинной прокрутке ленты/чата, 60/120 fps в профиле на Samsung и iPhone; в облаке измерить нельзя |

### Тест на наезд текста: что покрыто и что осталось (02.11)
Покрыто пачками 1–6 (`apps/mobile/test/overflow/batch1..6_overflow_test.dart`, общий каркас `test/helpers/overflow_harness.dart`, журнал `docs/dev/journal/*overflow*`): #609, #622, #627, #630, #637, #640. Каждая проверка идёт на 360 dp, 7 языков (самый длинный, RTL, ne, de, mr, ar, ru), масштаб 1 и 1,3, темы на самом длинном тексте, и убеждается, что на экране настоящее содержимое.

| Пункт | Что нужно |
|---|---|
| Шторка зрителей истории (`story_viewer_sheets`, `_ViewersSheet`) | фейк `storyViewersProvider`, пачка 7 |
| Экраны архива групп и каналов (`GroupsArchiveScreen`, `ChannelsArchiveScreen`) | фейки `archivedGroupsProvider`, `archivedChannelsProvider` |
| `chat_video` | тест виджетов видео в чате, нужны фейки плеера |
| `AppPaginatedListView` со строками | подвал уже покрыт, сам список с длинными строками нет |
| `WorkCaseScreen` | фикстура `attorneyCase` |
| Камерные экраны (`id_selfie_capture_screen`, `camera_capture_screen`, `story_camera_view`) и `secure_screen` | только на телефоне, в финальном раунде |
| Всё сделанное | на телефоне не проверено; голдены только на macOS |
Попутно: общие `overflowOpener`/`overflowShows` стоит применить в `batch1_overflow_test.dart`, `data_sheets_overflow_test.dart`, `groups_overflow_test.dart` (там локальные копии); корень дефекта «`AppButton` растягивается на всю ширину и в `Row` требует ограничения» не менялся (в `chat_payment_bar.dart` стоит `maxWidth: 148`).

---

## Режим работы 2026-11-02 (ускоренный; продолжать ровно так)
Записано по ходу ночи 1→2 ноября. Если что-то ниже расходится с PROJECT_MAP.md или AGENTS.md, главнее они. Пометка «вне main» значит: факт взят из чата владельца, в main файла ещё нет, проверить перед использованием.

### 1. Правила качества владельца
- **«По-взрослому»:** сначала изучить, как это сделано в Instagram, TikTok, WhatsApp, Telegram; решение должно масштабироваться (кэш, очереди, партиционирование и шардирование, курсорная пагинация, обработка кусками).
- **Всё на автомате по порогам в коде.** Переключатели растут и сжимаются сами, потолок поднимается в админке, пустую ёмкость не оплачиваем (см. `docs/perf/AUTO_SCALING_SWITCHES_2026-11-01.md`).
- **Лечить класс ошибки, а не один случай.** Нашёл причину красного — строка в `docs/dev/KNOWN_ERRORS.md` в тот же час.
- **В описании PR раздел «как у больших и почему так же у нас».**
- **Перед PR:** `/code-review high`, `/security-review`, `/simplify`, затем `npm run precheck` (перед последним пушем `npm run precheck:full`). Подробно: `docs/dev/PROJECT_MAP.md`, раздел «ОБЯЗАТЕЛЬНО перед любым PR/пушем/слиянием», и `docs/dev/CI_CHECKLIST.md`.
- **Ничего «Частично».** Либо сделано полностью, либо «Не решено» после 4 попыток. «Частично» = частично, SHA ветки ≠ слито, не проверенное на телефоне так и пишется.
- **Никаких платных облачных нагрузочных прогонов.** Нагрузка только на ноуте владельца (интернет у него 1,3–2 Мбит/с).
- Отчёты владельцу: по-русски, коротко, факты и SHA, команды в code block, секреты в чат не писать, время по Висконсину (UTC−6).

### 2. Слияния в main
- **Один диспетчер-поток** (тред «Вылечить CI») сливает в main **по одному** после зелёного CI.
- **Авторы PR сами не сливают.** Красное в PR чинит автор; механику CI (перезапуск, merge main, схемы переключателей) правит диспетчер.
- **Merge queue не включать.** Required check пока не включён (`ci-gate.yml` удалён 01.11, см. docs/dev/CI_FAILURES_AUDIT_2026-11-01.md): если владелец включит правило, требовать `Repo guards` и `API CI`.
- Стек PR: после слияния A сразу `base` B → `main`. Ветка не живёт дольше суток без merge main. Force-push на чужую ветку нельзя.
- Постоянное разрешение владельца: зелёное сливать и деплоить без вопросов. Approve деплоя нажимает владелец (см. п. 5).

### 3. Свои раннеры CI на Linux-ноуте
Полный runbook: `docs/runbooks/self-hosted-runner.md` (в `api-ci.yml` четыре тяжёлых job выбирают раннер по переменной репозитория).
- Метка раннера **`lawbid-ci`**; службы systemd под пользователем **`ghrunner`**; каталоги **`/home/ghrunner/runner2`…`runnerN`** (первый раннер `laptop-1` в `actions-runner`).
- Включение: переменная репозитория **`CI_RUNNER=self`**; выключение: `github` (или удалить). Если ноут выключился без остановки, сразу поставить `github`, иначе job встанут в очередь.
- PR из форков на ноут не попадают (условие `head.repo.full_name == github.repository`).
- **Состояние на 02.11 (вне main):** `laptop-1` работает; `laptop-2…5` зарегистрированы, офлайн до конца нагрузочного теста. Служба `lawbid-runners-autostart` стартует их около 23:45 по Висконсину (≈05:45 UTC). Ручной старт на ноуте:
```
sudo systemctl start actions.runner.syimykkalykov1999-LawBid.laptop-{2,3,4,5}.service
```
- **Как добавить ещё раннер:** шаги 1–5 из раздела «Вариант попроще» runbook (новый каталог `runnerN`, имя `laptop-N`, `--labels lawbid-ci`, `./svc.sh install ghrunner`).
- **Расчёт:** примерно 2 vCPU и 4 ГБ на раннер, запас 20 % от ноута (32 vCPU / 62 ГБ). Пока идёт нагрузочный стек (Docker держит около 29 ГБ), лишние раннеры не поднимать. После отчёта нагрузочного теста: остановить стек `lt-*` (`docker compose down`) и поднять `laptop-6…laptop-10`.
- Риск: раннер исполняет код PR из нашего репозитория; ноут без личных данных, лишних прав `gh` там не держать.

### 4. Нагрузочный стенд на ноуте
- Стенд: `loadtest/local-docker` (Postgres, PgBouncer, Redis, API, k6), лестница `ladder.sh` (ступени r100, r1k, r1kw, r3k, s10k, auth), описание `docs/perf/LOAD_LADDER_2026-11-02.md`.
- Ветка тестера: **`claude/laptop-load-2`**; отчёты: `docs/perf/LOAD_TEST_2026-11-02.md` (в main) и `docs/perf/LOAD_RESILIENCE_2026-11-02.md` (вне main, на этой ветке: отвал Postgres и Redis, восстановление).
- Главное из отчётов: r100 зелёная; r1k упирается в базу с 2 CPU и в поиск людей по имени (Seq Scan); сокеты режет `realtime.max_connects_per_ip_per_minute`; потолок ноута около 1 800–2 000 человек, 100 000 одновременных на ноуте невозможно (считать расчётом).
- **Правило тестера (одобрено владельцем):** тестер **сам лечит найденное** отдельными маленькими PR по правилам качества, пишет в PR комментарий **«готов к слиянию»**, сливает диспетчер.
- Soak 1 500 человек шёл с 21:39 по Висконсину около двух часов; после него: «Раунд 2» и засев 10M.
- Команды для ноута владелец вставляет в окно Claude на ноуте, отчёты тестера копирует в чат (ноут координатору недоступен).

### 5. Деплой
- Деплой запускает workflow `deploy.yml`, шаг «Wait for green CI», затем ждёт Approve владельца. Когда статус waiting, владельцу сказать «жми».
- Approve из Терминала Mac:
```
gh api -X POST repos/syimykkalykov1999/LawBid/actions/runs/<id>/pending_deployments -F 'environment_ids[]=23646149155' -f state=approved -f comment=approve
```
- Номер прогона: `gh run list --repo syimykkalykov1999/LawBid --workflow deploy.yml --status waiting --json databaseId --jq '.[0].databaseId'`
- Проверка после деплоя: https://api.lawbid.dev/health/ready и звонки. Terraform apply на проде делает только владелец по сохранённому плану; планы со сносом TURN не отдавать, если tfvars на Mac со `turn_enabled=false`.
- Телефонные сборки только в конце, одним раундом (Samsung + iPhone, `scripts/install-phone.sh`).

### 6. Готовые промпты (вставлять в окно Claude на ноуте)
**Поднять раннеры:**
```
Прочитай docs/HANDOFF.md раздел «Режим работы 2026-11-02» и docs/runbooks/self-hosted-runner.md. Проверь на ноуте: sudo systemctl list-units 'actions.runner.*' и docker ps. Если нагрузочный стек lt-* ещё идёт, ничего не поднимай и скажи мне. Если закончен, запусти laptop-2…5: sudo systemctl start actions.runner.syimykkalykov1999-LawBid.laptop-{2,3,4,5}.service, затем проверь в Settings → Actions → Runners, что они Idle, и что CI_RUNNER=self. Расчёт: ~2 vCPU и 4 ГБ на раннер, запас 20 %. Лишнее не включай. Отчёт мне по-русски в 3 строки.
```
**Запустить тестера:**
```
Ты тестер нагрузки. Прочитай docs/HANDOFF.md раздел «Режим работы 2026-11-02», docs/perf/LOAD_LADDER_2026-11-02.md и docs/perf/LOAD_TEST_2026-11-02.md. Работай на ветке claude/laptop-load-2, стенд loadtest/local-docker. Платные облачные прогоны запрещены, прод не трогать. Найденное лечи сам отдельными маленькими PR по правилам качества (/code-review high, /security-review, /simplify, npm run precheck), в PR комментарий «готов к слиянию»; сливает диспетчер. Сначала проверь, свободен ли ноут (не мешай раннерам), затем продолжай с раунда 2 и засева 10M. Отчёты мне по-русски, коротко, с числами.
```
**Продолжить работу в этом режиме:**
```
Прочитай AGENTS.md, docs/dev/PROJECT_MAP.md (раздел «ОБЯЗАТЕЛЬНО перед любым PR/пушем/слиянием»), docs/HANDOFF.md раздел «Режим работы 2026-11-02» целиком. Работай так: по-взрослому и масштабируемо (изучи Instagram/TikTok/WhatsApp/Telegram), всё на автомате по порогам, лечи класс ошибки, мелкие PR, перед PR /code-review high, /security-review, /simplify, npm run precheck. В main сам не сливай: красное чини, зелёное передай диспетчеру «Вылечить CI». Ничего «Частично». Владельцу пиши по-русски, коротко, с SHA, время по Висконсину.
```

### 7. Как работает связка с ноутом сейчас (дополнение 02.11, со слов владельца; вне main)
- **Владелец ничего не вставляет вручную.** Промпты из раздела 6 остаются запасным вариантом, если связка недоступна.
- Mac RC-тред «Задеплоить» ходит на ноут **по SSH**: `lawbid-ops@172.20.10.11` (полный sudo). Логи окон Claude на ноуте лежат в `/home/sima/.claude/projects`: по ним видно, что делают тестер и раннеры.
- **Нагрузочный стенд `lt-*`** живёт в Docker Desktop под пользователем `sima`. **Раннеры CI** живут в системном docker/systemd (другой Docker, не перепутать при `docker ps`).
- Разрешения (approve в приложении) владелец нажимает **с телефона**.
- Если тестер или раннеры остановились: координатор «подталкивает» (сообщение в нужный тред), Mac-тред смотрит логи по SSH и запускает недостающее.
- Пароли, ключи SSH и токены в репозиторий и чат не писать.

### 8. Строгие правила для каждого ИИ (владелец, 02.11.2026)
Действуют для всех нынешних и новых потоков, как и разделы 1–7. Полный текст в `AGENTS.md`, раздел «СТРОГИЕ ПРАВИЛА ПРОЕКТА»; краткий список в `docs/dev/PROJECT_MAP.md`. Новый ИИ читает `AGENTS.md` первым и в каждый промпт сабагенту вставляет эти правила.
