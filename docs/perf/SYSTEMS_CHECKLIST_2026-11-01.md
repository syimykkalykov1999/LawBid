# Сверка с чек-листами: перепроверка и закрытие (01.11.2026)

Основа: PDF «Сверка LawBid с чек-листами» (main на 28.10, #519: 57 / 27 / 5 / 6).
Каждый пункт «Частично» и «Нет» перепроверен по коду main и закрыт на стороне
кода, либо вынесен в «руками владельца» с точными шагами. «Не нужно сейчас» не
трогали. Облачный тред не видит прод, AWS, Stripe, Twilio — поэтому «Готово»
здесь значит «есть в коде и проверено тестами», а не «включено на проде».

## A. Закрыто в коде (этот PR)

| Пункт | Что сделано |
|---|---|
| Сканы / `npm audit` | `npm audit fix`: follow-redirects, systeminformation, qs, uuid-патчи. Гейт `scripts/ci/npm-audit-gate.mjs --workspace apps/api` снова зелёный (main краснел из-за двух новых high). Остались только мажорные (Prisma 7, Next 16, vitest 5) — это dev/build-инструменты, отдельным PR. |
| Пентест / bug bounty / SBOM | `SECURITY.md` (порядок сообщения об уязвимости), `/.well-known/security.txt` (RFC 9116, публикуется `seo-deploy.yml`, Expires ставится автоматически на год вперёд). SBOM уже был: SPDX на каждый образ в `deploy.yml`. Платной bug bounty нет — решение владельца, не код. Внешний пентест — нанять человека, см. раздел C. |
| Deep links (найдено при перепроверке) | `/verification/wizard` был в Android-манифесте и в `docs/deeplinks`, но не в генераторе `scripts/seo/well-known.mjs`, то есть на lawbid.dev iOS-файл публиковался без него. Тесты `well-known` на main уже были красными. Добавлено, 107/107. |

## B. Перепроверка: в коде уже есть (PDF устарел или недоглядел)

| Пункт из PDF | Факт в коде | Что сделать владельцу |
|---|---|---|
| CSRF-защита (Частично) | `modules/auth/web-session-cookie.ts`: куки refresh только с заголовком `X-LawBid-Web-Session` (форсирует CORS preflight) + проверка Origin по `web.allowed_origins` + `SameSite=Strict` + path `/api/v1/auth`. Access-токен идёт в заголовке, не в куке. Отдельный CSRF-токен не нужен. | ничего |
| Пуши без текста (Частично) | Настройка `push.chat_preview` (`push-dispatcher.ts`): выключена = в пуше нет текста сообщения. Для звонков data-only. | Админка → Настройки → `push.chat_preview` → выкл, если нужна строгая приватность (по умолчанию включено, как в WhatsApp) |
| Возраст (Частично) | `compliance/age-gate.service.ts`: режимы `off` / `record` / `enforce`, дата рождения, 403 `AGE_UNDER_MINIMUM`. По умолчанию `off`. | Админка → `compliance.age_gate.mode` → `record`, через неделю `enforce` (после релиза приложения с экраном даты рождения) |
| SBOM | `deploy.yml`, шаги «SBOM api/admin (syft, SPDX)» | ничего |

## C. Руками владельца (нужен доступ к консолям; код и Terraform готовы)

Порядок: сверху самое важное для первых 10 000 пользователей.

1. **Multi-AZ у RDS.** `infra/envs/prod/terraform.tfvars`: `multi_az = true` → `terraform plan -target=module.stack.module.postgres …` → apply в тихое окно (воскресенье, ~несколько минут простоя на failover). Откат — вернуть `false`.
2. **Учебное восстановление.** В tfvars `restore_test_enabled = true` для модуля `backup` (проверка раз в месяц сама), результат в админке → «Здоровье системы» → «Учебное восстановление базы». Один раз руками: `scripts/ops/restore-drill.sh` на Mac (≈ $0.10), строку вставить в `docs/runbooks/restore-drill.md`.
3. **Stripe live.** Ключи в админке → Интеграции → Stripe; вебхук `https://api.lawbid.dev/api/v1/webhooks/stripe`; цены 299/мес и 2 499/год. Тест: «Send test webhook» должен дать 200, не 400 (runbook `STRIPE_ROBUSTNESS.md`, `stripe-webhooks.md`).
4. **Terraform apply** модулей `backup`, `security-baseline`, `cdn-waf`, `monitoring`: `terraform plan -var-file=launch.tfvars.example -out=x.plan`, прочитать план, `apply x.plan` (runbook `TF_CATCHUP.md`).
5. **Повторный нагрузочный тест** после #507: Actions → `load-test` → Run workflow; смотреть ленту дел юриста и поиск по имени (`docs/runbooks/LOAD_TEST.md`).
6. **Redis.** Второй узел кэша/реплика: `docs/runbooks/redis-cluster.md`, `redis-autoscale.md`.
7. **Twilio против SMS-pumping.** Console → Messaging → Settings → Geo Permissions: оставить только США (плюс страны, где есть клиенты); Billing → auto-recharge OFF; Usage Triggers на $20/день. Лимиты расхода со стороны приложения: `docs/runbooks/sms-spend.md`.
8. **CSAM.** Регистрация в NCMEC CyberTipline (ESP), договор PhotoDNA (Microsoft); ключи в Интеграции; код `csam.adapters.ts` готов.
9. **App Check → enforce.** После выхода сборки с заголовком: `security.app_check.mode = enforce` (откат — `monitor`), `docs/runbooks/APP_CHECK.md`.
10. **Алерты на телефон и статус-страница.** `status_page_enabled = true` + DNS по `docs/runbooks/STATUS_PAGE.md`; пейджер — `docs/runbooks/paging.md`.
11. **IP-список админки.** Админка → Настройки: `admin.ip_allowlist` = ваши адреса, затем `admin.ip_allowlist_enabled` = вкл. Сначала добавить адрес, потом включать, иначе запрёте себя (есть `ADMIN_IP_ALLOWLIST_BYPASS`).
12. **Защита main.** GitHub → Settings → Branches → Add rule `main`: Require status checks (API CI, admin-ci, Mobile CI), Require PR. `npm run precheck` из PR #536 — перед каждым пушем.

## D. Не решено (с причиной)

| Пункт | Почему не закрыт сейчас |
|---|---|
| Pinning сертификатов / root-jailbreak | Нужен Flutter и телефон для проверки; в облачной среде их нет. Pinning без запасного ключа может навсегда отрезать приложение при смене сертификата Cloudflare/ACM, поэтому сначала решение владельца: делаем ли pinning вообще. |
| Web Push | Нужны проект Firebase Web + VAPID-ключ (консоль Firebase). Код сервис-воркера есть (`apps/mobile/web/firebase-messaging-sw.js`). |
| Модерация видео целиком | Сейчас проверяется обложка. Покадровая проверка требует ffmpeg в образе воркера и права Rekognition; без прод-проверки Bunny-кадров делать вслепую нельзя. |
| Докачка загрузок (tus) / seq у чатов | Нужны миграция БД и прогон на Postgres (в этой среде базы нет). Клиентская очередь с повтором и курсор `afterId` работают; это улучшение, не дыра. |
| Админка на нескольких языках | Крупная работа по переводам в `apps/admin`, не блокер запуска. |
| Impersonation | Решение: пока не нужен (риск злоупотребления, нужны step-up и журнал). |
| Доступность (VoiceOver, reduce motion) | Нужен прогон на устройстве. |
| e2e в CI | Карантин-механизм работает (`e2e-quarantine.yml`); стабильность видно только по истории запусков после #536. |
