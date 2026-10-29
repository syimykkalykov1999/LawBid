# Диагностика красных PR — 2026-10-26 05:40

Из 40 PR большинство не сломаны по-настоящему, а просто отстали от main.
24 PR конфликтуют в одних и тех же файлах (настройки, расписание задач, схема базы, openapi). Это не поломка: надо подтянуть main в ветку и разрешить конфликты, поезд делает это по одному. Большие (358, 356, 401, 396, 347) лучше оставить напоследок, они всё равно переконфликтуют после каждого слияния.
Ещё 11 PR красные из-за двух тестов, которые в main уже починены (тест очередей и инструкция в админке). Лечится так же: обновить ветку и перезапустить.
Настоящие ошибки в самих PR: 13 штук, у каждого маленькая правка. Чаще всего забыли вписать новое в «охранные списки» (новая таблица, новый провайдер, новые коды ошибок, лимиты зависимостей).
Две логические ошибки: 411 (оповещения о новых делах перестали приходить сразу) и 367 (вход отдаёт «конфликт»). Их чинит исполнитель по PR.
Две миграции (373, 352) помечены датой раньше уже выпущенных, нужно просто переименовать.
GitHub-очередь: 386, 295, 387 отменены или не уложились по времени, перезапуск. 390 упал на скачивании.
330 и 364 упали по нехватке памяти на сборке. Это надо один раз починить в main (дать сборке больше памяти и поднять лимит времени), иначе будет повторяться у всех.
Мигающие тесты: счётчики лайков/подписчиков (407) и один тест входа (367). Перезапуск, и стоит один раз укрепить их в main.
Порядок: сначала мелкие зелёные, потом отставшие, потом большие конфликтные.

## Группы

### Stale branches: merge conflicts with main in the same hot files — [417, 407, 402, 401, 398, 396, 395, 393, 392, 390, 389, 388, 387, 382, 379, 375, 371, 370, 366, 363, 360, 358, 356, 347]
- Причина: 24 PRs were cut before a burst of main changes to a handful of shared files (apps/admin config/page.tsx, app-settings.defaults.ts, jobs/cron.processor.ts, jobs.constants.ts, jobs.runner.spec.ts, admin-config/config-schema.ts, prisma schema.prisma, docs/db/ERD.md, openapi.json + Dart export, infra/*.tf). Nothing is broken in these files; the branches simply do not contain main's versions. Every merge in the train rewrites these files again, so the remaining PRs re-conflict after each landing.
- Что делать: train: merge main into each branch and resolve conflicts (textual, keep both sides in config/defaults/constants/wipe-plan lists; regenerate openapi.json + Dart client and ERD.md instead of hand-merging). Land order: small, no-conflict green PRs first (417, 387, 398, 402, 375, 366, 363, 379, 360), then the 7-10-file ones, and the giants last (358: 26 files, 396: 15, 356: 16, 347: 14, 401: 11) since they will re-conflict after every landing anyway. 358/356/401/396/347 may need a per-PR fixer to resolve by hand.

### Branch behind main: tests already fixed on main (runner spec redis mock, admin guides category, integration-labels) — [403, 399, 393, 390, 388, 384, 371, 370, 396, 392, 389]
- Причина: Three failures that none of these PRs touch: (a) src/jobs/jobs.runner.spec.ts 'isRedisClusterMode is not a function' from a stale redis-connection mock, fixed on main by d23e81fd2/cc94ac7dd after #380; (b) apps/admin guides.test.ts 'key-rotation-and-verified-tls.md category security not in list', fixed on main by 0b8388b64; (c) PR 370 integration-labels.test sentry.orgSlug hint, fixed on main by 5a5fd685d. Main CI is green.
- Что делать: train: merge main into the branch and rerun; no code change. Nothing to fix on main. If a branch still shows the runner-spec error after the merge, check that jobs.runner.spec.ts conflict was resolved to main's version (keep real redis-connection exports in the mock).

### PR forgot to update a guard/baseline list (architecture and registry guard tests) — [415, 413, 364, 389, 405, 369, 392]
- Причина: The repo has guard tests that pin exact lists/baselines; each PR added something new without recording it: 415 mget in calls/cloudflare-transport.ts with no reason in redis-cluster-scan allowlist; 413 new table infra_change_requests missing from ops/prelaunch-wipe.plan.ts; 364 provider openai_moderation missing from common/ops/cost-registry; 389 new case-tools modules push module-boundaries baseline by +6; 405 cases feature depends on 20 features (feature_boundaries_test.dart limit); 369 two live heavy queries in admin-users.service.ts (admin-heavy-queries baseline 0); 392 new owner-only page not in rbac.test.ts set.
- Что делать: per-PR fixer: one-line additions in the PR itself. 415 add the cluster reason entry (or replace mget with per-key gets); 413 add infra_change_requests to prelaunch-wipe.plan.ts; 364 add a cost-registry row for openai_moderation; 389 update module-boundaries.baseline.json (or cut the extra imports); 405 raise the cases entry in the feature-boundaries baseline or remove the new cross-feature import; 369 move the 2 counters to the nightly snapshot (owner rule: no live heavy admin queries), not raise the baseline; 392 add the page to the expected set in rbac.test.ts.

### Runner saturation: cancelled jobs, 45-min timeouts, Node heap OOM in API build/openapi export — [386, 295, 330, 364, 390, 387]
- Причина: Not code: 386 all 10 checks cancelled at once ~1.5 min after start; 295 cancelled in the last 'two databases' e2e step at 45 min (job timeout); 387 main check cancelled; 390 Flutter job exit 1 after a 5-min curl download with no test output. 330 ('API contract is up to date', openapi export) and 364 (npm run build in Docker) died with 'JavaScript heap out of memory' at ~4 GB; other recent branches hit the same, so the default Node heap is now too small for the grown API on GitHub runners.
- Что делать: train: rerun 386, 295, 387, 390 (after merging main). fix-PR-to-main first for the OOM: in .github/workflows/api-ci.yml and the Dockerfile build stage set NODE_OPTIONS=--max-old-space-size=6144 (or 7168) for the openapi export and tsc/nest build steps; also raise the API job timeout-minutes (currently cut at ~45 min while the job takes 40-75 min) or split the 'two databases' e2e step into its own job. Until that lands, 330 and 364 will keep flipping red.

### Real logic bugs in the PR's own feature — [411, 367, 382, 405, 376]
- Причина: 411: case-fanout.service.ts now queues new-case alerts even with the fanout switch off (return 0), so owner-case-urgency and owner-subscription-alerts e2e get no alert; failed on retry too. 367: its own new auth-hardening.e2e-spec.ts S14-10/S14-4 get 409 Conflict instead of 201 on login/register with deviceId list-dev/nc-dev (duplicate device or reused email), reproducible. 382: removes/changes admin-approvals endpoints, so the oasdiff 'no breaking changes' gate fails by design. 405: two i18n keys demo.reauth.message/continue used in demo_strings.dart but absent from the translation workbook. 376: 4 flutter analyze infos in sentry_native.dart and trace_interceptor.dart (analyzer exits 1 on info).
- Что делать: per-PR fixer. 411 keep the direct send path when the fanout switch is off (queue only when enabled), or make the e2e drain the queue; 367 use unique emails/deviceIds per test or clear sessions in setup; 382 add the removed admin-approvals paths to packages/api-contract/oasdiff-err-ignore.txt with a reason (intentional removal) or keep the old endpoints deprecated; 405 add the two keys to the workbook; 376 apply the 4 lint fixes.

### New API error codes not mirrored in mobile ApiErrorCodes list — [392, 373, 364]
- Причина: Each PR adds codes to apps/api error-code.enum.ts (373: ADMIN_IP_NOT_ALLOWED, 392/364: several) and regenerates the Dart ErrorCode enum, but the hand-written apps/mobile ApiErrorCodes.all list is not updated, so api_error_codes_test.dart fails.
- Что делать: per-PR fixer: add the new codes to apps/mobile/lib/core/network/api_error_codes.dart in each PR. Optional follow-up on main (not blocking): make ApiErrorCodes derive from the generated enum so this test cannot drift again.

### Migration timestamp sorts before migrations already released on main — [373, 352]
- Причина: migrate-from-previous check: PR migration folders 20261029600000_admin_audit_hardening (373) and 20261028700000_attorney_ad_archive (352) are dated earlier than main's newest released migrations (20261031200000_message_search_tokens, 20261031200100_legal_qa_fts_indexes).
- Что делать: per-PR fixer: rename the migration folder to a timestamp later than 20261031200100 (e.g. 2026110100000X_...) and keep migration_lock/ERD consistent; no SQL change. Train must re-check before landing because any new migration on main moves the bar again.

### Flaky e2e under load: counter flush and auth 503 with 'Command timed out' — [407, 367]
- Причина: 407: stage-5-1 (like_count flush, nightly reconcile) and stage-5-5 (followers_count) fail with 0 while the PR touches no counter/follow code and the log shows 'Command timed out' on cron start. 367: auth.e2e scenario 3 gets 503 next to /health/ready 503 lines in the same shard. Both are timing on a saturated runner, not the PR.
- Что делать: train: rerun (for 407 after merging main for the cron.processor.ts conflict). fix-PR-to-main first if it recurs: in stage-5-1/5-5 await the counters flush explicitly (call the flush job and wait) instead of a sleep, and make the auth e2e wait for /health/ready before scenario 3.

## По каждому PR

### #417 (конфликт)
PR конфликтует с main только в одном файле (push-dispatcher.ts), упавших проверок нет — нужно слить main в ветку и вручную разрешить этот конфликт.
- конфликты: apps/api/src/modules/notifications/push/push-dispatcher.ts

### #415
PR не сливается из-за одного упавшего unit-теста: новый файл звонков cloudflare-transport.ts использует Redis mget без записанной причины для кластера (охранный тест redis-cluster-scan), надо добавить причину или переписать вызов.
- `Lint, typecheck, unit + e2e tests` → own-bug: redis-cluster-scan.spec.ts: Redis Cluster guard › has a written cluster reason for every multi-key Redis call; received ["modules/calls/cloudflare-transport.ts|mget"]

### #413
PR добавляет новую таблицу infra_change_requests, но не внёс её в план предзапускной очистки базы (prelaunch-wipe.plan), поэтому один юнит-тест красный; конфликтов нет.
- `Lint, typecheck, unit + e2e tests` → own-bug: apps/api src/ops/prelaunch-wipe.plan.spec.ts: prelaunch wipe plan › lists every table of the schema exactly once (plan.unknown = ["infra_change_requests"], expected [])

### #411
PR сломал два e2e-теста про оповещения о новых делах: он перенёс рассылку в очередь даже при выключенном переключателе, и в тестах уведомления не приходят сразу (конфликтов нет).
- `Lint, typecheck, unit + e2e tests` → own-bug: FAIL test/owner-case-urgency.e2e-spec.ts (an urgent case alerts as new_urgent_case) Expected: [new_case, new_urgent_case] Received: []; FAIL test/owner-subscription-alerts.e2e-spec.ts (alerts attorney

### #407 (конфликт)
В PR есть конфликт слияния с main в файле apps/api/src/jobs/cron.processor.ts, а упавшие тесты счётчиков (лайки и подписчики) похожи на случайный сбой по времени и к самому PR не относятся.
- `Lint, typecheck, unit + e2e tests` → flaky-timing: test/stage-5-1.e2e-spec.ts (bumps land in the DB on flush; like_count Expected 3, Received 0; nightly reconcile) and test/stage-5-5.e2e-spec.ts (followers_count Expected 2, Received 0); Tests: 3 faile
- конфликты: apps/api/src/jobs/cron.processor.ts

### #405
PR не конфликтует, но красный по двум своим причинам: в таблицу переводов не добавлены два ключа demo.reauth.message и demo.reauth.continue, а фича cases теперь зависит от 20 других фич, что больше записанного лимита в архитектурном тесте.
- `Lint, typecheck, unit + e2e tests` → own-bug: i18n check: keys used in code but missing from the workbook (2): demo.reauth.message, demo.reauth.continue (exit code 1)
- `Analyze, lint checks, unit/widget/golden tests` → own-bug: test/architecture/feature_boundaries_test.dart: no feature depends on more features than recorded. Expected: empty, Actual: [MapEntry(cases: 20)]

### #403
PR не конфликтует, но отстал от main: два красных теста (мок redis в тесте очереди и категория в инструкции по ключам) уже починены в main, нужно просто обновить ветку из main и перезапустить проверки.
- `Lint, typecheck, unit + e2e tests` → main-drift: FAIL src/jobs/jobs.runner.spec.ts: TypeError: (0 , redis_connection_1.isRedisClusterMode) is not a function
- `build` → main-drift: apps/admin guides.test.ts: key-rotation-and-verified-tls.md: category «security» не из списка

### #402 (конфликт)
В PR 402 нет упавших проверок, но он конфликтует с main в двух файлах: админская страница config/page.tsx и клиентские настройки client_tuning.dart. Их нужно слить с main вручную.
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/mobile/lib/core/config/client_tuning.dart

### #401 (конфликт)
PR #401 не сливается из-за конфликта с main: 11 файлов изменены и в нём, и в main (схема БД, задачи по расписанию, настройки админки, шардинг, ERD, terraform); упавших проверок нет.
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/prisma/schema.prisma, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/jobs.constants.ts, apps/api/src/jobs/jobs.runner.spec.ts, apps/api/src/modules/admin-config/config-schema.ts, apps/api/src/ops/prelaunch-wipe.plan.ts

### #399
PR не конфликтует, но отстаёт от main: обе красные проверки (мок redis в тесте очередей и категория в тесте инструкций админки) к его правкам не относятся и уже исправлены в main, нужно подтянуть main в ветку и перезапустить проверки.
- `Lint, typecheck, unit + e2e tests` → main-drift: FAIL src/jobs/jobs.runner.spec.ts: TypeError: (0 , redis_connection_1.isRedisClusterMode) is not a function (Test suite failed to run)
- `build` → main-drift: apps/admin src/lib/guides.test.ts: key-rotation-and-verified-tls.md: category «security» не из списка

### #398 (конфликт)
Тесты в PR не падают, проблема только в конфликте с main: нужно слить main в ветку и вручную разрешить конфликты в client_tuning.dart и drift_web.dart.
- конфликты: apps/mobile/lib/core/config/client_tuning.dart, apps/mobile/lib/core/persistence/drift_web.dart

### #396 (конфликт)
PR #396 отстал от main и конфликтует в 15 файлах (настройки, cron/ops, конфиг админки, terraform). Красный build из-за админского теста гайдов, он не связан с PR и должен пройти после слияния main.
- `build` → main-drift: apps/admin src/lib/guides.test.ts > every file is valid: key-rotation-and-verified-tls.md: category «security» не из списка
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/common/ops/ops.constants.ts, apps/api/src/common/ops/ops.module.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/handlers/admin-summaries.job.spec.ts, apps/api/src/jobs/handlers/admin-summaries.job.ts, apps/api/src/jobs/jobs.constants.ts

### #395 (конфликт)
PR #395 не вливается из-за конфликтов слияния с main в 7 файлах (админ-конфиг, package.json, schema.prisma, настройки по умолчанию, env.schema, jobs.runner.spec, prelaunch-wipe.plan), упавших проверок нет.
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/package.json, apps/api/prisma/schema.prisma, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/config/env.schema.ts, apps/api/src/jobs/jobs.runner.spec.ts, apps/api/src/ops/prelaunch-wipe.plan.ts

### #393 (конфликт)
PR конфликтует с main в файле sentry_reporter.dart, а тест jobs.runner.spec упал потому, что ветка отстала от main (там его уже починили) — нужно слить main в ветку и решить один конфликт.
- `Lint, typecheck, unit + e2e tests` → main-drift: FAIL src/jobs/jobs.runner.spec.ts — TypeError: (0 , redis_connection_1.isRedisClusterMode) is not a function (Tests: 3802 passed, 17 skipped; only this suite failed)
- конфликты: apps/mobile/lib/core/diagnostics/sentry_reporter.dart

### #392 (конфликт)
PR конфликтует с main в 10 файлах (схема Prisma, cron-задачи, настройки, конфиг админки), а в самом PR не обновлены тесты: список страниц только для владельца и список кодов ошибок в мобильном приложении; ещё одна ошибка про руководство пропадёт после обновления ветки от main.
- `build` → own-bug: src/lib/rbac.test.ts > owner-only pages are exactly the intended set: expected 21 pages to equal 20 (new owner-only page added)
- `build` → main-drift: src/lib/guides.test.ts > every file is valid: key-rotation-and-verified-tls.md: category «security» не из списка
- `Analyze, lint checks, unit/widget/golden tests` → own-bug: apps/mobile/test/core/network/api_error_codes_test.dart: ApiErrorCodes.all is exactly the generated ErrorCode enum (failed)
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/prisma/schema.prisma, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/jobs.constants.ts, apps/api/src/jobs/jobs.module.ts, apps/api/src/jobs/jobs.runner.spec.ts, apps/api/src/modules/admin-config/config-schema.ts

### #390 (конфликт)
PR устарел и конфликтует с main в 7 файлах (api package.json, fcm-push.sender, dio_client.dart и 4 terraform-модуля); две красные проверки тянутся из main и лечатся обновлением ветки, а проверка Flutter упала без ясной причины (похоже на сбой скачивания).
- `Lint, typecheck, unit + e2e tests` → main-drift: FAIL src/jobs/jobs.runner.spec.ts: TypeError: (0 , redis_connection_1.isRedisClusterMode) is not a function
- `build` → main-drift: apps/admin src/lib/guides.test.ts: key-rotation-and-verified-tls.md: category «security» не из списка
- `Analyze, lint checks, unit/widget/golden tests` → unknown: Process completed with exit code 1 (after a ~5 min curl download step, no analyzer or test error in log)
- конфликты: apps/api/package.json, apps/api/src/modules/notifications/push/fcm-push.sender.ts, apps/mobile/lib/core/network/dio_client.dart, infra/modules/alb/main.tf, infra/modules/monitoring/main.tf, infra/modules/s3/main.tf, infra/modules/stack/main.tf

### #389 (конфликт)
PR 389 конфликтует с main в 10 файлах (задачи cron, схема Prisma, настройки, openapi, ERD), плюс тест границ модулей падает из-за новых модулей PR, а тест гайдов админки падает из-за изменений в main.
- `Lint, typecheck, unit + e2e tests` → own-bug: FAIL architecture/module-boundaries.spec.ts › no module depends on more modules than recorded (Expected -1, Received +6)
- `build` → main-drift: apps/admin src/lib/guides.test.ts: key-rotation-and-verified-tls.md: category «security» не из списка
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/prisma/schema.prisma, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/jobs.constants.ts, apps/api/src/jobs/jobs.module.ts, apps/api/src/jobs/jobs.runner.spec.ts, docs/db/ERD.md

### #388 (конфликт)
Ветка отстала от main: есть конфликты в 8 файлах (конфиг админки, схема Prisma, app.module, настройки, шардинг, ERD), а два красных теста уже починены в main, так что после слияния main и разрешения конфликтов они пройдут.
- `Lint, typecheck, unit + e2e tests` → main-drift: FAIL src/jobs/jobs.runner.spec.ts: Test suite failed to run — TypeError: (0 , redis_connection_1.isRedisClusterMode) is not a function
- `build` → main-drift: apps/admin vitest src/lib/guides.test.ts > every file is valid: key-rotation-and-verified-tls.md: category «security» не из списка
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/prisma/schema.prisma, apps/api/src/app.module.ts, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/modules/admin-config/config-schema.ts, apps/api/src/sharding/shard-manifest.spec.ts, apps/api/src/sharding/shard-manifest.ts, docs/db/ERD.md

### #387 (конфликт)
Упавших проверок нет (основная проверка просто отменена раннером), а мешает только конфликт слияния с main в файле apps/api/src/jobs/jobs.runner.spec.ts.
- конфликты: apps/api/src/jobs/jobs.runner.spec.ts

### #386
В PR #386 нет ни конфликтов, ни упавших тестов: все 10 проверок были разом отменены GitHub (~1.5 минуты после старта), поэтому статус UNSTABLE; нужно просто перезапустить проверки.
- `all 10 checks (API CI, Mobile CI, CodeQL, Container scan, admin-ci, etc.)` → runner-cancelled: No FAILURE conclusions; every check is CANCELLED, all runs lasted about 1m21s-1m31s from 01:13:38Z

### #384
PR не конфликтует, но тест jobs.runner.spec.ts падает из-за старой заглушки redis-connection; исправление уже есть в main (cc94ac7dd), поэтому ветку нужно обновить из main.
- `Lint, typecheck, unit + e2e tests` → main-drift: FAIL src/jobs/jobs.runner.spec.ts and jobs/jobs.runner.spec.ts: TypeError: (0 , redis_connection_1.isRedisClusterMode) is not a function

### #382 (конфликт)
PR конфликтует с main в 4 файлах (админ config/page.tsx, ops-metrics.job.ts, client_tuning.dart, admin_dashboard_client.dart), и в CI падает проверка OpenAPI «нет ломающих изменений»: PR убирает или меняет админские эндпоинты согласований.
- `Lint, typecheck, unit + e2e tests` → own-bug: Step 'OpenAPI has no breaking changes against the base branch (docs/06 §7.2)' - Process completed with exit code 1
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/src/jobs/handlers/ops-metrics.job.ts, apps/mobile/lib/core/config/client_tuning.dart, packages/api-contract/dart/lib/src/clients/admin_dashboard_client.dart

### #379 (конфликт)
PR #379 не сливается из-за конфликтов с main в 8 файлах (настройки, cron, шардинг, чат, экспорт данных, ERD, oasdiff); упавших проверок нет.
- конфликты: apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/jobs.runner.spec.ts, apps/api/src/modules/chat/chat-actions.service.ts, apps/api/src/modules/privacy/data-export.service.ts, apps/api/src/sharding/shard-manifest.spec.ts, docs/db/ERD.md, packages/api-contract/oasdiff-err-ignore.txt

### #376
PR не сливается: проверка анализатора Flutter падает на 4 замечаниях по стилю кода в файлах самого PR (sentry_native.dart и trace_interceptor.dart); конфликтов нет, это нужно поправить в самом PR.
- `Analyze, lint checks, unit/widget/golden tests` → own-bug: flutter analyze: 4 issues found (info): sentry_native.dart:67:7 use_if_null_to_convert_nulls_to_bools; sentry_native.dart:260:16 one_member_abstracts; sentry_native.dart:320:81 lines_longer_than_80_ch

### #375 (конфликт)
PR не сливается из-за конфликтов с main в 5 файлах (admin-ops.module.ts, openapi.json и сгенерированный Dart-клиент); упавших проверок нет, главная проверка с тестами ещё идёт.
- конфликты: apps/api/src/modules/admin-ops/admin-ops.module.ts, packages/api-contract/dart/lib/src/clients/admin_ops_client.dart, packages/api-contract/dart/lib/src/clients/admin_ops_client.g.dart, packages/api-contract/dart/lib/src/export.dart, packages/api-contract/openapi.json

### #373
В PR 373 две красные проверки: миграция названа более ранней датой, чем уже выпущенные в main (нужно переименовать её на более позднюю), и в мобильном коде не обновлён список кодов ошибок (не хватает ADMIN_IP_NOT_ALLOWED).
- `Lint, typecheck, unit + e2e tests` → main-drift: [migrate-from-previous] FAILED: no new migrations after 1473dd92..., or a new migration sorts before an already-released one
- `Analyze, lint checks, unit/widget/golden tests` → own-bug: api_error_codes_test.dart: ApiErrorCodes.all is exactly the generated ErrorCode enum. Which: does not contain 'ADMIN_IP_NOT_ALLOWED'

### #371 (конфликт)
PR 371 отстал от main: у него конфликты в 5 файлах (api-ci.yml, .gitleaksignore, apps/api/package.json, infra/envs/prod/main.tf и variables.tf), а красный тест jobs.runner.spec.ts уже починен в main, поэтому после слияния main в ветку он должен пройти.
- `API static (lint, types, unit, migrations, contract)` → main-drift: FAIL src/jobs/jobs.runner.spec.ts: TypeError: (0 , redis_connection_1.isRedisClusterMode) is not a function (Test suite failed to run)
- `API CI` → main-drift: Process completed with exit code 1 (RESULTS: failure success success success)
- конфликты: .github/workflows/api-ci.yml, .gitleaksignore, apps/api/package.json, infra/envs/prod/main.tf, infra/envs/prod/variables.tf

### #370 (конфликт)
В ветке cost-hardening 7 файлов конфликтуют с main (экономика, настройки, админка), а два красных теста (jobs.runner.spec и integration-labels) сломаны не ею, а устарели относительно main, поэтому нужно слить main в ветку и разрешить конфликты.
- `Lint, typecheck, unit + e2e tests` → main-drift: FAIL src/jobs/jobs.runner.spec.ts: TypeError: (0 , redis_connection_1.isRedisClusterMode) is not a function
- `build` → main-drift: FAIL src/lib/integration-labels.test.ts > every service has Russian texts, a field hint per field...: AssertionError: sentry.orgSlug hint: expected undefined to be truthy
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/admin/src/app/(app)/economy/page.tsx, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/common/economy/economy.rules.spec.ts, apps/api/src/common/economy/economy.rules.ts, apps/api/src/common/economy/economy.service.ts, apps/api/src/common/ops/ops.constants.ts

### #369
В PR добавлены 2 тяжёлых запроса в admin-users.service.ts поверх разрешённого лимита (тест-страж "admin-heavy-queries" красный): их нужно перевести на ночной снимок или осознанно поднять базовый лимит.
- `Lint, typecheck, unit + e2e tests` → own-bug: FAIL architecture/admin-heavy-queries.spec.ts › admin heavy queries › does not grow past the baseline (new counters go through the snapshot): received ["modules/admin-users/admin-users.service.ts: 2 >

### #367
В PR свои новые тесты auth-hardening (S14-10 и S14-4) падают: вместо 201 приходит 409 Conflict при входе или регистрации. Это ошибка самого PR, она повторилась и при перезапуске. Один тест auth.e2e с ответом 503 похож на случайный сбой.
- `Lint, typecheck, unit + e2e tests` → own-bug: test/auth-hardening.e2e-spec.ts: S14-10 (session list, line 669) and S14-4 (refresh from new country, line 699): expected 201 "Created", got 409 "Conflict"
- `Lint, typecheck, unit + e2e tests` → flaky-timing: test/auth.e2e-spec.ts scenario 3 'revokes the whole chain on reuse...': Expected 401, Received 503

### #366 (конфликт)
Проверки не упали (красных нет), PR #366 не вливается только из-за конфликтов с main в 7 файлах: admin-ops (controller, dto, module), privacy data-export (runner, service), export.dart и openapi.json — нужно слить main в ветку и разрешить конфликты.
- конфликты: apps/api/src/modules/admin-ops/admin-ops.controller.ts, apps/api/src/modules/admin-ops/admin-ops.dto.ts, apps/api/src/modules/admin-ops/admin-ops.module.ts, apps/api/src/modules/privacy/data-export.runner.ts, apps/api/src/modules/privacy/data-export.service.ts, packages/api-contract/dart/lib/src/export.dart, packages/api-contract/openapi.json

### #364
PR не сливается из-за двух своих ошибок: у нового провайдера openai_moderation нет строки в реестре расходов, а новые коды ошибок не добавлены в мобильный список ApiErrorCodes; сборка образа при этом упала по нехватке памяти, причина не выяснена.
- `Lint, typecheck, unit + e2e tests` → own-bug: FAIL src/common/ops/cost-registry.spec.ts: every provider in provider-registry.ts has a registry entry (missing: openai_moderation)
- `Analyze, lint checks, unit/widget/golden tests` → own-bug: apps/mobile/test/core/network/api_error_codes_test.dart: ApiErrorCodes.all is exactly the generated ErrorCode enum (failed)
- `Build image + Trivy` → unknown: FATAL ERROR: Ineffective mark-compacts near heap limit - JavaScript heap out of memory (exit code 134 in npm run build --workspace apps/api)

### #363 (конфликт)
PR #363 не вливается из-за конфликтов слияния с main в шести файлах (админ-настройки, app-settings defaults, cron/jobs); упавших проверок нет.
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/jobs.constants.ts, apps/api/src/jobs/jobs.module.ts, apps/api/src/jobs/jobs.runner.spec.ts

### #360 (конфликт)
PR #360 не сливается из-за конфликтов с main в 8 файлах (настройки по умолчанию, cron-процессор, тесты jobs и шардов, чат, экспорт данных, ERD, oasdiff-ignore); упавших проверок нет, нужно только смержить main в ветку и разрешить конфликты.
- конфликты: apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/jobs.runner.spec.ts, apps/api/src/modules/chat/chat-actions.service.ts, apps/api/src/modules/privacy/data-export.service.ts, apps/api/src/sharding/shard-manifest.spec.ts, docs/db/ERD.md, packages/api-contract/oasdiff-err-ignore.txt

### #358 (конфликт)
PR #358 не сливается из-за конфликтов с main в 26 файлах (схема Prisma, cron/jobs, чат, push, admin-ops, openapi и др.); упавших проверок нет, статусов CI у PR вообще нет, значит нужно слить main в ветку и разрешить конфликты.
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/prisma/schema.prisma, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/jobs.constants.ts, apps/api/src/jobs/jobs.module.ts, apps/api/src/jobs/jobs.runner.spec.ts, apps/api/src/modules/admin-config/config-schema.ts

### #356 (конфликт)
PR #356 не сливается из-за конфликтов с main в 16 файлах (схема Prisma, app.module, jobs, openapi.json, Dart-клиент и др.); упавших проверок нет, нужен ребейз/мерж main в ветку.
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/prisma/schema.prisma, apps/api/src/app.module.ts, apps/api/src/architecture/module-boundaries.baseline.json, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/jobs.constants.ts, apps/api/src/jobs/jobs.module.ts

### #352
Проверка падает потому, что у PR миграция с датой 20261028700000 стоит раньше уже выпущенных миграций в main (до 20261031200100); нужно переименовать её на более позднюю дату.
- `Lint, typecheck, unit + e2e tests` → main-drift: [migrate-from-previous] FAILED: no new migrations after 1473dd92c4feafd9bb3e4a65ef8f93934e55ab59, or a new migration sorts before an already-released one

### #347 (конфликт)
PR #347 не сливается из-за конфликтов с main в 14 файлах (админ-настройки, cron/jobs, admin-ops, openapi и Dart-клиент); упавших проверок нет, нужно только смержить main в ветку и разрешить конфликты.
- конфликты: apps/admin/src/app/(app)/config/page.tsx, apps/api/src/common/app-settings/app-settings.defaults.ts, apps/api/src/jobs/cron.processor.ts, apps/api/src/jobs/jobs.constants.ts, apps/api/src/jobs/jobs.runner.spec.ts, apps/api/src/modules/admin-config/config-schema.ts, apps/api/src/modules/admin-ops/admin-ops.controller.ts, apps/api/src/modules/admin-ops/admin-ops.dto.ts

### #330
PR не конфликтует, но проверка упала не на тестах: при выгрузке openapi.json у API закончилась память (Node heap out of memory, код 134), и неясно, виноват ли сам PR или CI (другие PR тоже недавно падали).
- `Lint, typecheck, unit + e2e tests` → unknown: Step 'API contract is up to date': FATAL ERROR: Ineffective mark-compacts near heap limit, JavaScript heap out of memory (~4 GB heap after 63 s) during '[api-contract] exporting openapi.json from apps

### #295
В PR #295 нет красных проверок и нет конфликтов: единственная проверка (тесты e2e) была отменена по времени на последнем шаге "две базы" после 45 минут, всё остальное зелёное, поэтому нужно просто перезапустить эту проверку.
- `Lint, typecheck, unit + e2e tests` → runner-cancelled: No failing test. Step 'e2e tests on TWO databases (shard-ready step 5, subset)' was cancelled; lint, typecheck, unit and main e2e steps all succeeded.
