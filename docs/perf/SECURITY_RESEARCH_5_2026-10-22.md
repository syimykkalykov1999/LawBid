# Security research #5: как ломают приложения и что у нас уже закрыто (2026-10-22)

Только чтение. Код читался с `origin/main` (`c1e6f27e`, после PR #240–#243). Не повторяет то, что уже сделано в аудитах #2 (`docs/perf/SYSTEM_AUDIT_2_2026-10-22.md`), #3 (`docs/perf/SECURITY_AUDIT_3_2026-10-22.md`, закрыт PR #242) и `docs/SECURITY_TODO.md` — на них только ссылки. Пути — от корня репозитория.

Содержание: (A) ответ блогеру · (B) как ломают сейчас, с источниками · (C) таблица «атака × наш статус» · (D) список правок для двух исполнителей · (E) платные сервисы и лимиты · (F) источники.

---

## A. Про «данные отдельно от кода — и вас не взломают» (ответ владельцу)

1. Блогер пересказал настоящее правило, но перепутал его смысл. Правило звучит так: **в приложении на телефоне не должно быть ничего секретного** — ни паролей к базе, ни ключей Stripe/Twilio/AWS. Телефон — чужая территория: любой файл из APK/IPA можно распаковать и прочитать за минуты. Так утекли ключи у сотен приложений на Firebase в 2025 году (см. B).
2. Поэтому все секреты и все проверки «кому что можно» живут **на сервере**. Приложение только спрашивает сервер, предъявляя короткоживущий токен входа. Это и есть «данные отдельно от кода» — не магия, а разделение: код на телефоне публичный, секреты и данные — на сервере, за проверкой прав.
3. Второе настоящее правило: **секреты не лежат в репозитории и в образе** (контейнере). Они хранятся в хранилище секретов и подаются серверу при запуске.
4. Третье: данные на сервере **зашифрованы на диске** ключом, которым управляет облако (KMS), а переписка ещё и своим ключом внутри приложения.
5. Что у нас уже так: в приложении только публичные значения (`apps/mobile/config/*.example.json`: адрес API, домен ссылок, публичный ключ Stripe); файлы Firebase в git не попадают (`.gitignore:38-43`); секреты сервера — в AWS Secrets Manager под KMS (`infra/modules/secrets`, `infra/modules/ecs/main.tf:196-210`); ключи, которые вы вводите в админке, зашифрованы (`apps/api/src/common/secrets/secret-envelope.ts`); права проверяются на сервере на каждом запросе (`apps/api/src/modules/auth/guards/jwt-auth.guard.ts`, аудит #3 это подтвердил); база, файлы, Redis и логи зашифрованы KMS (`infra/modules/postgres`, `s3`, `redis`, `kms`); тексты сообщений зашифрованы своим ключом (`message-body-cipher.ts`); утечки секретов в git ловит `gitleaks` в CI.
6. Чего это НЕ даёт: «не взломают» не бывает. Даже с идеальным разделением остаются: кража аккаунта через SIM-swap или украденный телефон, боты, которые жгут деньги на SMS, заражённые npm-пакеты, которые воруют ключи из CI, и ошибки в правах «кому можно смотреть этот кейс». Этим занимаются разделы C–D.
7. Что у нас ещё не так, как у лучших: ключи шифрования сообщений и мастер-ключ админских секретов пока лежат в переменных окружения, а не обёрнуты KMS (уже в `SECURITY_TODO.md`); у пользователей нет второго фактора кроме SMS-кода; приложение не доказывает серверу, что оно «настоящее» (App Check / Play Integrity — шаги владельца в `SECURITY_TODO.md`); в AWS не включены CloudTrail/GuardDuty (журнал и детектор для самого облака).
8. Простая проверка «как у блогера»: распакуйте наш APK — внутри не должно быть ничего, что открывает деньги или базу. Там есть только адрес API и публичные ключи Firebase/Stripe, которые по дизайну публичны (но их надо ограничить по bundle id — шаг владельца из `SECURITY_TODO.md`).
9. Итого: тезис верный наполовину. Верно — «секреты только на сервере, права только на сервере, данные зашифрованы». Неверно — «значит, не взломают». Защита — это десяток слоёв, большинство у нас уже есть, остальное — в списке D.
10. Самые важные три шага сейчас: (1) цепочка поставок — `.npmrc` с `ignore-scripts`, выдержка версий, фиксированные SHA в CI; (2) App Check-токен на запросе SMS-кода (бот без настоящего приложения не получит SMS); (3) CloudTrail + GuardDuty + MFA на root в AWS (шаг владельца).

---

## B. Как ломают приложения в 2023–2026 (коротко, с источниками)

Официальные списки: [OWASP Mobile Top 10 (2024)](https://owasp.org/www-project-mobile-top-10/) — M1 неправильное обращение с учётными данными, M2 цепочка поставок, M3 аутентификация/авторизация, M4 валидация, M5 связь, M6 приватность, M7 защита бинарника, M8 конфигурация, M9 хранение, M10 криптография. [OWASP API Security Top 10 (2023)](https://www.imperva.com/blog/understanding-the-owasp-api-security-top-10-why-bola-is-the-number-one-risk-for-apis/) — №1 BOLA (чужой объект по id), №2 сломанная аутентификация, №4 неограниченное потребление ресурсов (бывший «rate limiting»). [OWASP Top 10 2025 RC](https://orca.security/resources/blog/owasp-top-10-2025-key-changes/) — поднялись «Security Misconfiguration» (№2) и новый «Software Supply Chain Failures» (№3); SSRF влит в Broken Access Control; новая A10 «Mishandling of Exceptional Conditions».

Реальные случаи и их корни:

| Что случилось | Корень | Урок для нас |
|---|---|---|
| **Tea (июль 2025)** — 72 000 фото, в т.ч. 13 000 селфи с документами, потом 1,1 млн личных сообщений ([security.org](https://www.security.org/identity-theft/breach/tea-app/), [dev.to](https://dev.to/bcowley-dragonbyte/how-the-tea-app-breach-happened-and-what-it-should-scare-you-into-fixing-m6l)) | Firebase-бакет без правил доступа; имя бакета и ключи лежали в APK; старые данные не удалили | Хранилище закрыто (S3 block-public ✔), приватные файлы только по подписанным ссылкам ✔, удаление по сроку ✔ |
| **Firebase/Supabase массово (2025–2026)**: ~150 из 1200 приложений с открытыми базами, 72 % Android-AI-приложений с зашитыми секретами ([Zimperium](https://zimperium.com/blog/mobile-threat-watch/misconfigured-firebase-apps-leave-sensitive-user-data-exposed), [Cybernews](https://cybernews.com/security/android-ai-apps-leaking-google-secrets/)); Lovable CVE-2025-48757 — 170+ приложений без RLS ([vibeappscanner](https://vibeappscanner.com/blog/vibe-coded-app-security-report-2026)); Moltbook (02.2026) — открытая база с ключами ([SecurityBrief](https://securitybrief.co.nz/story/moltbook-vibe-coded-flaw-exposed-ai-chats-keys)) | Клиент ходит в базу напрямую, права «в базе» не включены | У нас клиент в базу не ходит вообще — только через API с проверкой прав ✔ |
| **SMS pumping / toll fraud** — боты заказывают коды на дорогие номера; Twitter оценивал потери в $60M/год ([Twilio](https://twilio.com/blog/sms-pumping-fraud-solutions), [NCSC Ireland](https://ncsc.gov.ie/pdfs/2506120143_SMS_Pumping.pdf)) | Нет лимитов, нет гео-ограничений, автопополнение | Лимиты в коде ✔; гео/антифрод в кабинете Twilio — владелец (см. E) |
| **Trello (2024)** — 15 млн профилей по утёкшим e-mail; **Twilio Authy (2024)** — 33 млн номеров через «зарегистрирован ли номер» ([Barracuda](https://blog.barracuda.com/2024/07/09/shadows--zombies--and-twilio-s-wide-open-api), [Tenable CVE-2024-39891](https://tenable.com/cve/CVE-2024-39891)) | Анонимный эндпоинт отвечает «есть такой аккаунт», слабый rate limit, прокси | `/auth/phone/status` отвечает «есть пароль» (оставлено намеренно, с лимитом); контакт-синк с лимитами и детектором перебора — частично (C-14) |
| **npm: Nx «s1ngularity» (08.2025), Shai-Hulud (09 и 11.2025)** — ~500 пакетов, червь ворует npm/GitHub/AWS-токены из CI через install-скрипты ([InfoQ](https://www.infoq.com/news/2025/10/npm-s1ngularity-shai-hulud), [Flashpoint](https://flashpoint.io/blog/shai-hulud-worm-targeting-npm-supply-chains/)) | `postinstall` выполняется при установке; свежие версии ставятся сразу | Нет `ignore-scripts` и выдержки версий — **пробел** (D-A1) |
| **tj-actions/changed-files CVE-2025-30066 (03.2025)** — теги действия перенаправили на вредоносный коммит, секреты CI ушли в логи ([CISA](https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-github-action-cve-2025-30066)) | Действия подключены по тегу `@v4`, а не по SHA | У нас 0 действий по SHA — **пробел** (D-A2) |
| **Stripe-вебхуки: CVE-2026-41432 (new-api), CVE-2026-21894 (n8n)** — подпись не проверялась или пустой секрет ([vulert](https://vulert.com/vuln-db/new-api-stripe-webhook-signature-bypass-via-empty-secret-enables-unlimited-quota-fraud-in-github-co-), [osv](https://osv.dev/vulnerability/CVE-2026-21894)) | «fail-open» при отсутствии секрета | У нас fail-closed: `stripe-payment.provider.ts:718-735` ✔ |
| **Юрфирмы**: ICO выговор Levales — вход по украденному паролю без MFA, данные клиентов в даркнете ([Legal Futures](https://legalfutures.co.uk/latest-news/ico-reprimands-law-firm-after-client-data-ends-up-on-dark-web)); Qilin у Shollenberger Januzzi & Wolfe — 161 ГБ дел (2025) | Нет MFA у привилегированных, слитые пароли | Админ: TOTP есть, но необязателен (решение владельца, `docs/CHANGELOG.md:207`) — частично (C-8) |
| **SIM swap**: NIST 800-63B относит SMS-коды к «restricted»; FCC 23-95 обязала операторов проверять смену SIM ([CyberArk](https://www.cyberark.com/resources/home/sim-swap-and-its-effects-on-sms-based-authentication)) | Вход и восстановление только по SMS | У нас вход — SMS/e-mail код (+ опц. пароль), уведомление о новом устройстве ✔; passkeys нет — частично (C-9) |
| **FCM-ключи в APK (2020, по-прежнему актуально)** — спам-пуши всем пользователям Hangouts/Teams ([PortSwigger](https://portswigger.net/daily-swig/google-firebase-messaging-vulnerability-allowed-attackers-to-send-push-notifications-to-app-users)) | Серверный ключ в клиенте | Пуши шлёт сервер по сервис-аккаунту из Secrets Manager (`fcm-push.sender.ts`) ✔ |
| **Deep links / intent redirection** — экспортированные активити, `intent://` в WebView, перехват кастомной схемы ([Oversecured](https://oversecured.com/blog/android-deep-link-vulnerabilities)) | Непроверенные параметры ссылок, WebView | WebView нет; App Links с `autoVerify`; magic-link привязан к verifier на устройстве ✔ |
| **Prompt injection (OWASP LLM01:2025)** — текст пользователя становится командой для модели ([Barracuda](https://blog.barracuda.com/2024/11/20/owasp-top-10-risks-large-language-models-2025-updates)) | Пользовательский текст в промпте | В API нет LLM (grep `openai|anthropic|gemini|bedrock` — 0); перевод — Google Translate v2, не LLM ✔. При появлении LLM — см. D-A10 |

---

## C. Атака × наш статус

Статус: ✔ закрыто · ◐ частично · ✖ нет. «Уже в TODO» — значит, в `docs/SECURITY_TODO.md`, тут не повторяется.

| # | Атака (OWASP) | Статус | Что есть / чего нет, файлы |
|---|---|---|---|
| 1 | Секреты в бинарнике (M1, M8) | ✔ | `apps/mobile/config/*.example.json` — только публичные; Firebase-файлы в `.gitignore:38-43`; web-сборка через `--dart-define` публичных Firebase-ключей (`.github/workflows/web-deploy.yml:64-71`). Ограничение ключей по bundle/SHA-1 — уже в TODO (владелец). |
| 2 | Секреты в репозитории / CI | ✔ | `secret-scan.yml` (gitleaks), `.env` в `.gitignore`; деплой через OIDC-роли, не ключи (`deploy.yml:33-58`); `rollback.yml`, `self-check.yml` — тоже OIDC. |
| 3 | Секреты сервера в образе/окружении | ◐ | Secrets Manager + KMS (`infra/modules/ecs/main.tf:196-210`, `secrets/main.tf:22-25`); ключи из админки — `SecretEnvelope`. Но `SECRETS_MASTER_KEYS` и `MESSAGE_ENC_KEYS` — сырые env (KMS-обёртка — уже в TODO). |
| 4 | BOLA / IDOR (API1) | ✔ | Проверено аудитом #3; остатки (conflict-check, copyForUser, bid-packs роль) закрыты в PR #242. |
| 5 | Mass assignment (API3) | ✔ | `app.setup.ts:162-168` whitelist + forbidNonWhitelisted. |
| 6 | Сломанная аутентификация (API2): JWT, refresh | ✔ | HS256 с `kid`-ротацией, секрет ≥32 (`env.schema.ts:116-122`), audience на тип токена (`token.service.ts:249-252`), access 15 мин / refresh 60 дней, ротация с детектором повторного использования (`auth.service.ts:794-798`), чёрный список сессий. Google/Apple id-token — проверка `aud`+`nonce` (`social/*`). |
| 7 | OTP-перебор, блокировки | ✔ | HMAC-хранение, атомарный Lua, 5 попыток, лестница 1/3/30 мин (`otp.service.ts`, `otp-limits.ts`), лимиты на id/IP/устройство/сутки. |
| 8 | Взлом админа (пароль без MFA) | ◐ | TOTP, recovery-коды, step-up на деньги/телефон/bulk (`admin-payroll.controller.ts:147,187,242`, `admin-billing.controller.ts:367`, `admin-users.controller.ts:131,165,190`), IP-allowlist в WAF (`alb/main.tf:178-230`, но `admin_allowed_cidrs` по умолчанию пуст), httpOnly+SameSite=strict cookie (`apps/admin/src/lib/api/server.ts:22-24`), nonce-CSP+HSTS (`next.config.ts`, `middleware.ts`). **Нет**: обязательного TOTP (владелец отключил, `CHANGELOG.md:207`) и passkeys. |
| 9 | Захват аккаунта пользователя: SIM swap, кража телефона | ◐ | Уведомление о новом устройстве (`new-device-notifier.service.ts`), список сессий, «выйти везде», разлогин при смене контакта/пароля (#242), биометрический reauth в приложении (`local_auth`). **Нет**: второго фактора кроме SMS/e-mail (NIST «restricted»), passkeys. |
| 10 | Захват через поддержку/админа | ✔ | Смена телефона админом: step-up + причина + разлогин + уведомление (`admin-users.service.ts:112-114,464-478`); `X-Justification` на просмотр контактов; журнал действий (`admin-access/audit-log.service.ts`). |
| 11 | Stripe-вебхук подделка | ✔ | fail-closed без секрета/подписи, `constructEvent` по сырому телу, дедуп и очередь (`stripe-webhook.intake.ts`). |
| 12 | Bunny-вебхук | ✔ | HMAC `X-BunnyStream-Signature` (`bunny-webhook.controller.ts:20-36`); ключ надо сохранить в админке → Интеграции → Bunny «Read-only API key» (владелец). |
| 13 | Rate-limit abuse / DoS дорогих эндпоинтов (API4) | ◐ | Глобально 100/мин на пользователя/IP в Redis (`throttler/`), WAF 3000/5 мин/IP + managed rules + тело ≤8 КБ (`alb/main.tf:238-300`), body 256 КБ, `TRUST_PROXY_HOPS=1`. **Нет**: лимитов на события сокета (`realtime.gateway.ts` — 0 упоминаний лимитера), WAF на CloudFront (web, `infra/modules/web/main.tf` — нет `aws_wafv2`), отдельных лимитов на тяжёлые `/search/*`. |
| 14 | Скрейпинг профилей / перебор «есть ли аккаунт» | ◐ | Публичный каталог без телефона/почты; `/auth/phone/status` оставлен намеренно с лимитом; contacts-sync: хэши, суточный лимит и детектор перебора (`contacts-sync.service.ts:16-40`). **Нет**: HMAC-pepper для хэшей номеров (`:76` TODO), per-route лимита на `GET /public/attorneys`. |
| 15 | SSRF (A01:2025) | ✔ | Сервер не ходит по URL из ввода пользователя: bar-lookup URL из конфига реестра (`registry-http.ts:143`), превью ссылок нет, чат пропускает только `https?://` текст. |
| 16 | Загрузки файлов | ✔ | Ключ на сервере, presigned POST с типом и размером, сниффинг магии, ClamAV (`files/scanning/virus-scanner.ts`), S3 block-public + SSE-KMS + versioning + репликация (`infra/modules/s3`). |
| 17 | Инъекции SQL | ✔ | Prisma; `$executeRawUnsafe` только с константами (`secrets.service.ts:300`, `demo-database.service.ts:194` — имя БД из env). |
| 18 | XSS в админке / web | ✔ | React; единственный `dangerouslySetInnerHTML` — тема с nonce (`admin/src/app/layout.tsx:30`); web-app CSP без `unsafe-inline` (`web/main.tf:200-215`); письма экранируются (`email-templates.ts:42`). |
| 19 | Утечка PII в логи / Sentry (A09:2025) | ✔ | pino redact (`app.module.ts:160-195`), компактные строки без query-значений (`http-log-policy.ts`), Sentry-скраб (`app.setup.ts:195-230`). ALB access-logs пишут путь — секреты в пути заменены на `POST /webhooks/bunny` без токена. |
| 20 | Deep links / WebView / exported (M3, M8) | ✔ | WebView нет; App Links `autoVerify` + `assetlinks.json`; экспортированы только `MainActivity` и FCM-receiver с `c2dm` permission (`AndroidManifest.xml`); хост ссылки проверяется (`deep_link_controller.dart:98-100`); magic-link привязан к verifier (`auth.service.ts:351`). Кастомная схема `lawbid://` перехватываема, но без verifier бесполезна. |
| 21 | Небезопасное хранение на телефоне (M9) | ✔ | refresh — только Keychain/Keystore (`token_secure_store.dart`), access — в памяти; `allowBackup=false`; web: refresh в HttpOnly cookie (`auth/web-session-cookie.ts`). |
| 22 | Небезопасная связь (M5) | ◐ | HTTPS, HSTS, `rds.force_ssl`, `sslmode` обязателен (`env.schema.ts:771-779`), Redis TLS+auth (`redis/main.tf:86-90`). **Нет**: iOS `NSAllowsArbitraryLoads=true` (`ios/Runner/Info.plist:46`) — разрешает http для всех сборок; Android network_security_config нет (по умолчанию http запрещён с targetSdk 28 — ок, но не зафиксировано явно). Пиннинг сертификатов — нет (см. D-B2, сознательно). |
| 23 | Защита бинарника (M7) | ✔ | `--obfuscate --split-debug-info` в iOS и Android Fastfile (аудит #2 §11). Root/jailbreak-детекция — нет и не нужна (легко обходится, ложные срабатывания). |
| 24 | Приложение-самозванец / боты вместо приложения (App Check) | ✖ | Сервер не отличает наше приложение от `curl` — это главная дверь для SMS-pumping. Шаги в консоли — уже в TODO; **серверная проверка App Check-токена на `/auth/otp/request` — нет** (D-A4). |
| 25 | Цепочка поставок npm/pub (A03:2025, M2) | ◐ | lock-файлы, Dependabot weekly (npm, pub, actions, docker), `npm audit` gate с allowlist, CodeQL, Trivy, gitleaks. **Нет**: `.npmrc` с `ignore-scripts=true` / `min-release-age`, cooldown в Dependabot, SHA-пиннинг действий (0 из ~40), `permissions:` в `api-ci.yml`, `mobile-ci.yml`, `load-nightly.yml` (нет вообще → наследуют настройку репозитория). pub — без install-скриптов, риск ниже. |
| 26 | Dependency confusion | ✔ | Workspaces `api`, `admin` и `packages/api-contract` резолвятся локально; внешних scoped-пакетов нет. |
| 27 | Пуш-токены / спам пушами | ✔ | Регистрация только своего устройства (`@AssistantSelf`), ≤10 устройств (`push-tokens.service.ts:5`), FCM v1 по сервис-аккаунту. Тексты пушей в открытом виде до FCM — уже в TODO. |
| 28 | Шифрование на диске, KMS | ✔/◐ | RDS, S3, Redis, CloudWatch — KMS с ротацией (`infra/modules/kms`); сообщения — `enc:v3` с AAD на id. KMS-обёртка data-key — уже в TODO. |
| 29 | Детектирование и журналирование облака | ✖ | В Terraform нет CloudTrail, GuardDuty, AWS Config, Security Hub; есть SLO-алармы, Sentry, бюджеты. (D-A6) |
| 30 | Бэкапы / восстановление | ◐ | AWS Backup с копией в DR-vault (`infra/modules/backup`), алармы; учение по восстановлению не записано (аудит #2 §9). |
| 31 | Контейнер | ◐ | `USER app` в Dockerfile, `enable_execute_command=false`, минимальные роли admin/migrate. **Нет**: `readonlyRootFilesystem`, `no-new-privileges`. |
| 32 | Подделка писем от нашего домена | ✔ | DKIM, SPF `-all`, DMARC `p=quarantine` (`ses/main.tf:29-58`). Позже → `p=reject`. |
| 33 | Скриншоты/запись экрана на экранах с документами | ✖ | `FLAG_SECURE` / iOS screen-capture guard не используется (ID-документы в верификации, сообщения). Низкий приоритет (D-B5). |
| 34 | Prompt injection (LLM01) | n/a | LLM в API нет. Условие на будущее — D-A10. |
| 35 | Open redirect после логина в админке | ? | Аудит #2 §15 (`\evil.com`): в `login-form.tsx` на origin/main grep по `\\` ничего не нашёл — проверить вручную (D-B6). |

---

## D. Что делать — два исполнителя параллельно

Приоритеты: **P0** критично (деньги/захват аккаунта/утечка ключей) · **P1** важно · **P2** полезно · **P3** по желанию. «Владелец» = нужны действия в консоли/ключи.

### Исполнитель A — API и инфраструктура

**A1 (P0) Защита от заражённых npm-пакетов.**
- `.npmrc` в корне: `ignore-scripts=true`, `audit=true`, `fund=false`, `min-release-age=7` (npm ≥ 11.10; на более старом npm строка игнорируется — проверить версию в `api-ci.yml` и Dockerfile `node:22-alpine`). После `ignore-scripts` явно запускать нужные хуки: `npx prisma generate` в `postinstall` корня через `scripts.prepare`, `esbuild`/`sharp` — проверить, что ставятся без скриптов (sharp — предсобранные бинарники, ок).
- `.github/dependabot.yml`: `cooldown: { default-days: 7, semver-major-days: 14 }` для npm и pub; security-апдейты cooldown обходят сами.
- Тест: `npm ci` в CI должен проходить; `npm run build` для api и admin; e2e.
- Владелец: нет.
- Источники: [Datadog cooldowns](https://securitylabs.datadoghq.com/articles/dependency-cooldowns/), [GitHub changelog](https://github.blog/changelog/2025-07-01-dependabot-supports-configuration-of-a-minimum-package-age/).

**A2 (P0) GitHub Actions: SHA-пиннинг и минимальные права.**
- Все `uses:` → полный 40-символьный SHA с комментарием версии (`actions/checkout@<sha> # v4.2.2` и т.д.); Dependabot (`github-actions`) умеет обновлять SHA.
- В каждом workflow без `permissions:` (`api-ci.yml`, `mobile-ci.yml`, `load-nightly.yml`) добавить `permissions: { contents: read }` на верхнем уровне; в `api-ci.yml` job с `upload-artifact` права не нужны сверх contents:read.
- Владелец: Settings → Actions → «Workflow permissions: Read repository contents», «Require approval for all outside collaborators»; Branch protection на `main`: required checks, no force-push, «Require signed commits» по желанию.
- Тест: прогон всех workflow на ветке.

**A3 (P0) WAF: отдельный лимит на выдачу кодов + защита web-раздачи.**
- `infra/modules/alb/main.tf`: rate-based rule на `/api/v1/auth/otp/request`, `/auth/password/reset/request`, `/users/me/contacts/request`: 20 за 5 мин с IP (как в `COST_PROTECTION.md`), `aggregate_key_type=IP`; плюс `AWSManagedRulesBotControlRuleSet` в режиме COUNT на неделю, затем BLOCK для категории «Unverified bots» (Bot Control платный — ~$10/мес + $1/млн запросов; владелец решает).
- `infra/modules/web/main.tf`: `aws_wafv2_web_acl` scope `CLOUDFRONT` (us-east-1 provider alias) с rate-rule 2000/5 мин и IP-reputation list; подключить к дистрибуции.
- Тест: `terraform plan` в `infra/envs/staging`; k6-скрипт из `load-nightly` на OTP-путь должен получать 403 после порога.
- Владелец: `terraform apply`.

**A4 (P0) Серверная проверка App Check на дорогих анонимных ручках.**
- В `OtpRequestDto`/`auth.controller.ts` принимать заголовок `X-Firebase-AppCheck`; проверять через `firebase-admin` (`getAppCheck().verifyToken()`, официальный SDK; сервис-аккаунт уже есть для FCM). Режим: сначала `monitor` (лог + метрика доли запросов без токена), через неделю `enforce` для `/auth/otp/request` (phone), `/auth/password/reset/request`; web — reCAPTCHA Enterprise-токен из App Check для web (`firebase_app_check` даёт его же).
- Fallback-политика: без токена — только e-mail-код, не SMS (деньги не тратятся).
- Тест: unit на guard (валидный/просроченный/отсутствующий токен, режимы), e2e с замоканным `verifyToken`.
- Владелец: консольная часть из `SECURITY_TODO.md` (App Attest / Play Integrity / reCAPTCHA Enterprise). Мобильная часть — B1.

**A5 (P1) Лимиты на события сокета и тяжёлый поиск.**
- `realtime.gateway.ts`: per-socket token-bucket (например 30 событий/10 с, `typing` отдельно 1/с) через существующий `RedisThrottlerStorageService` или in-memory на сокет; при превышении — `disconnect` с кодом.
- `@Throttle({ default: { limit: 30, ttl: 60_000 } })` на `search/*` и `GET /public/attorneys` (`public-directory.controller.ts:11`), как уже сделано для `attorneys.controller.ts`.
- Тест: spec на лимитер; e2e на 429 для search.

**A6 (P1) Журнал и детектор облака.** Новый модуль `infra/modules/security-baseline`: `aws_cloudtrail` (multi-region, лог-валидация, S3 с KMS, 365 дней), `aws_guardduty_detector` (+ S3 Protection, Malware Protection off для экономии), `aws_securityhub` с CIS 1.4 по желанию, `aws_iam_account_password_policy`, `aws_accessanalyzer_analyzer`, EventBridge → SNS на GuardDuty findings severity ≥ 7 → почта владельца. Цена: CloudTrail первый trail бесплатен (S3 копейки), GuardDuty ~$1–5/мес при нашем объёме. Владелец: `apply`; отдельно вручную — MFA (passkey/hardware) на root, удалить root access keys, IAM Identity Center вместо IAM-пользователей ([AWS SSB](https://aws.amazon.com/blogs/startups/aws-startup-security-baseline-day-one-recommendations-to-secure-your-account-and-workload)).

**A7 (P1) HMAC-pepper для хэшей номеров в contacts-sync** (`contacts-sync.service.ts:76` TODO). Сервер отдаёт клиенту не pepper, а считает `HMAC(pepper, sha256(phone))` поверх присланного sha256 и хранит `users.phone_hmac`; миграция + бэкфилл; клиент не меняется. Pepper — новый секрет `CONTACTS_PEPPER` (≥32) в Secrets Manager. Тест: spec на матчинг, e2e sync.

**A8 (P1) Контейнер.** `infra/modules/ecs/main.tf` task definitions: `readonlyRootFilesystem = true` (+ tmpfs `/tmp`), `linuxParameters.initProcessEnabled`, убедиться что `USER app` в admin Dockerfile тоже. Тест: staging deploy + smoke.

**A9 (P2) DMARC → `p=reject`** через 4 недели чистых отчётов на `dmarc_rua`; добавить `aws_route53_record` для BIMI не нужно. Владелец: читать отчёты.

**A10 (P2) Правило на будущее для LLM.** Если появится модель (ответы «юридический вопрос», модерация текста): пользовательский текст только в `user`-роли, system-промпт без секретов, вывод валидируется схемой, модель без инструментов с правами, лимит токенов на запрос, `costGuard.consume('llm')` — 8-й провайдер.

**A11 (P2) Идемпотентность и защита от card-testing на создании Checkout** — per-user лимит 5/мин на `POST /subscriptions/checkout`, `case-payments` (Radar в кабинете — владелец).

**A12 (P3) Redis: проверка `rediss://`** в `env.schema.ts` на staging/prod (как сделано для `sslmode`) — иначе TLS ElastiCache не будет использован при ошибке в URL.

### Исполнитель B — мобильное приложение, web и админка

**B1 (P0) App Check в приложении** (пара к A4). `firebase_app_check` (официальный FlutterFire): `FirebaseAppCheck.instance.activate(appleProvider: AppAttestWithDeviceCheckFallback, androidProvider: PlayIntegrity, webProvider: ReCaptchaEnterpriseProvider(key))`; `headers_interceptor.dart` добавляет `X-Firebase-AppCheck` на `/auth/otp/request` и `/auth/password/reset/request` (токен кэшируется SDK); dev/staging — `debug` provider с токеном в консоли. Тест: интерцептор unit; ручной прогон на устройстве dev/staging. Владелец: регистрация приложений в Firebase App Check (TODO).

**B2 (P0) iOS ATS.** `ios/Runner/Info.plist:44-48`: убрать `NSAllowsArbitraryLoads=true`; для dev-flavor разрешить только `NSAllowsLocalNetworking=true` (через xcconfig-переменную по схеме, как `DEEP_LINK_HOST`). Android: добавить `res/xml/network_security_config.xml` с `cleartextTrafficPermitted="false"` и debug-override для `10.0.2.2`/локальной сети; в манифест `android:networkSecurityConfig`. Пиннинг сертификатов **не делать**: ALB/ACM перевыпускает ключи, а App Check + TLS закрывают MITM-риск лучше, чем пиннинг с риском «кирпича» ([разбор](https://dev.to/vmodal_ai/certificate-pinning-in-flutter-55kc)). Тест: dev-сборка ходит на localhost, prod-сборка не открывает `http://`.

**B3 (P1) Второй фактор для пользователей — passkeys (поэтапно).** Шаг 1 (сейчас): экран «Безопасность входа» с переключателем «Требовать пароль при входе с нового устройства» (сервер уже умеет пароль). Шаг 2: passkeys — сервер `@simplewebauthn/server` (официально поддерживается, WebAuthn L3), клиент — iOS `ASAuthorization` / Android Credential Manager через `passkeys`-плагин (corbado, активно поддерживается) или собственный MethodChannel; web — WebAuthn напрямую. Начать с админки (шаг 3, B4). Тест: e2e регистрации/входа с софт-аутентификатором `@simplewebauthn` в тестах.

**B4 (P1) Админка: обязательный TOTP для ролей с деньгами** — предложить владельцу компромисс: TOTP обязателен для super admin, `payroll`, `billing`, `users` (смена телефона), остальным — по желанию. Реализация: флаг `admin.totp_required_areas` в настройках (`admin-auth.service.ts:450` уже читает похожие списки), проверка на `issueSession`; экран подключения. Владелец: согласие (ранее отключил — `CHANGELOG.md:207`).

**B5 (P2) Экран с документами без скриншотов.** Android: `FLAG_SECURE` через MethodChannel на экранах верификации (фото ID/лицензии) — `window.addFlags(FLAG_SECURE)` при входе на экран, снять при выходе; iOS: `UIScreen.isCaptured`/`capturedDidChangeNotification` → затемнение. Не для чатов (как Telegram, `group_info_settings.dart:248`). Тест: ручной.

**B6 (P2) Проверить и закрыть open-redirect** в `apps/admin/src/app/login/login-form.tsx` (аудит #2 §15): `next` допустим только если `^\/(?![\/\\])`; unit-тест на `//evil`, `/\evil`, `javascript:`.

**B7 (P2) Web: `Permissions-Policy` и COOP** уже в CloudFront; добавить `Referrer-Policy: no-referrer` для app-дистрибуции, если отсутствует (`web/main.tf:185-250` — проверить `referrer_policy`).

**B8 (P3) Очистка буфера обмена** после копирования кода/ссылки входа через 60 с (`Clipboard.setData` с пустой строкой по таймеру) — Android 13+ сам предупреждает; низкая ценность.

### Что НЕ делать (и почему)
- Пиннинг TLS-сертификата (см. B2). - Root/jailbreak-детекция: обходится за час, ломает честных пользователей. - Шифрование SQLite/кэша на телефоне: кэш не содержит секретов, refresh уже в Keychain. - «Своё» шифрование поверх TLS: добавляет ошибки, не защиту.

---

## E. Платные сервисы: где нас могут «накрутить» и что держит

| Сервис | Как накручивают | Что есть в коде | Что есть/нет в кабинете (владелец) |
|---|---|---|---|
| **Twilio SMS** | SMS pumping на дорогие номера | US-only + тип номера (`validators.ts:50-63`), 30/мин, 300/сутки, 5000/мес «Авто» с потолком (`cost-guard`), лимиты на номер/IP/устройство, 5/ч, 10/ч; fail-closed при недоступном Redis | ✖ Geo Permissions только US, ✖ SMS Pumping Protection, ✖ auto-recharge OFF, ✖ Usage Triggers $10/25/50 — чек-лист `COST_PROTECTION.md §1`, не подтверждён |
| **AWS SES** | массовые письма, рассылки по украденной сессии | 100/мин, 2000/сутки, 30000/мес; шаблоны экранируются | SES sending quota (не просить лишнего); DMARC-отчёты |
| **Google Translate** | перевод тысяч сообщений | 60/мин, 5000/сутки, 50000/мес + per-user суточная квота; кэш переводов | ✖ Quota «Requests per day» в GCP — не подтверждена |
| **AWS Rekognition** | заливка тысяч картинок | провайдер `image_moderation` (7-й), повторная картинка бесплатна, при исчерпании — `skipped (budget)` | IAM только `DetectModerationLabels` (TODO); AWS Budget 50/80/100 % + Anomaly Detection (`infra/modules/budget`) ✔ |
| **Bunny Stream** | загрузки видео; **просмотры/трафик** | загрузки 30/1000/10000; token-auth на плеер (`bunny-stream.client.ts:17,98`) с TTL | ✖ Лимита на egress в коде нет — поставить в Bunny «Traffic limit / monthly spend alert» на зону; API-ключ только read-only для вебхука |
| **FCM / APNs** | спам пушами | бесплатно; ≤10 устройств, только свои | — |
| **S3 / CloudFront egress** | hotlinking медиа, скачивание в цикле | медиа через CloudFront OAC, приватные файлы — presigned GET с TTL; загрузки 120/5000/100000 + 60/ч на пользователя | ✖ WAF на CloudFront (A3); AWS Budget ✔; Anomaly Detection ✔ |
| **Stripe** | card testing (комиссия за попытку), диспуты | цены с сервера, вебхук подписан, дедуп, idempotency-key; лимит на создание checkout — A11 | ✖ Radar rules (block highest, review elevated, 3DS) — `COST_PROTECTION.md §3`, не подтверждён |
| **Stripe Identity / Persona** | лишние проверки | `id_check` 5/мин, 20/сутки, 200/мес | cap в договоре, когда подключат |
| **AWS compute (ECS autoscale)** | DDoS → автоскейл | ops-guard при 100 % бюджета фиксирует min tasks (`infra/modules/budget` комментарий; `ops-guard.job.ts`) | Budget ✔; Shield Standard бесплатно ✔ |
| **CloudWatch Logs** | флуд запросами → ГБ логов | семплирование 1 %, компактные строки (`http-log-policy.ts`) | retention 30 дней ✔ |

Общее правило из `COST_PROTECTION.md`: автопополнение везде выключено, оповещения на почту — пройти чек-лист и отметить галочки; это единственная защита, если ключ украден или код ошибся.

---

## F. Источники

OWASP: [Mobile Top 10 2024](https://owasp.org/www-project-mobile-top-10/) · [API Security Top 10 2023 (обзор Imperva)](https://www.imperva.com/blog/understanding-the-owasp-api-security-top-10-why-bola-is-the-number-one-risk-for-apis/) · [Top 10 2025 RC (Orca)](https://orca.security/resources/blog/owasp-top-10-2025-key-changes/) · [LLM Top 10 2025 (Barracuda)](https://blog.barracuda.com/2024/11/20/owasp-top-10-risks-large-language-models-2025-updates).
Инциденты: [Tea — security.org](https://www.security.org/identity-theft/breach/tea-app/) · [Firebase — Zimperium](https://zimperium.com/blog/mobile-threat-watch/misconfigured-firebase-apps-leave-sensitive-user-data-exposed) · [Android AI apps — Cybernews](https://cybernews.com/security/android-ai-apps-leaking-google-secrets/) · [Lovable CVE-2025-48757 / RLS — vibeappscanner](https://vibeappscanner.com/blog/vibe-coded-app-security-report-2026) · [Moltbook — SecurityBrief](https://securitybrief.co.nz/story/moltbook-vibe-coded-flaw-exposed-ai-chats-keys) · [Nx s1ngularity / Shai-Hulud — InfoQ](https://www.infoq.com/news/2025/10/npm-s1ngularity-shai-hulud), [Flashpoint](https://flashpoint.io/blog/shai-hulud-worm-targeting-npm-supply-chains/) · [tj-actions CVE-2025-30066 — CISA](https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-github-action-cve-2025-30066) · [Stripe webhook CVE-2026-41432](https://vulert.com/vuln-db/new-api-stripe-webhook-signature-bypass-via-empty-secret-enables-unlimited-quota-fraud-in-github-co-), [CVE-2026-21894](https://osv.dev/vulnerability/CVE-2026-21894) · [SMS pumping — Twilio](https://twilio.com/blog/sms-pumping-fraud-solutions), [NCSC Ireland](https://ncsc.gov.ie/pdfs/2506120143_SMS_Pumping.pdf) · [Trello/Authy — Barracuda](https://blog.barracuda.com/2024/07/09/shadows--zombies--and-twilio-s-wide-open-api), [CVE-2024-39891](https://tenable.com/cve/CVE-2024-39891) · [Levales / ICO — Legal Futures](https://legalfutures.co.uk/latest-news/ico-reprimands-law-firm-after-client-data-ends-up-on-dark-web) · [SIM swap / NIST restricted — CyberArk](https://www.cyberark.com/resources/home/sim-swap-and-its-effects-on-sms-based-authentication) · [FCM keys — PortSwigger](https://portswigger.net/daily-swig/google-firebase-messaging-vulnerability-allowed-attackers-to-send-push-notifications-to-app-users) · [Deep links — Oversecured](https://oversecured.com/blog/android-deep-link-vulnerabilities).
Практики: [секреты в клиенте — GitGuardian](https://blog.gitguardian.com/how-to-handle-mobile-app-secrets/), [Okta](https://developer.okta.com/blog/2019/01/22/oauth-api-keys-arent-safe-in-mobile-apps) · [cooldowns — Datadog](https://securitylabs.datadoghq.com/articles/dependency-cooldowns/), [Dependabot cooldown](https://github.blog/changelog/2025-07-01-dependabot-supports-configuration-of-a-minimum-package-age/) · [AWS Startup Security Baseline](https://aws.amazon.com/blogs/startups/aws-startup-security-baseline-day-one-recommendations-to-secure-your-account-and-workload) · [пиннинг во Flutter](https://dev.to/vmodal_ai/certificate-pinning-in-flutter-55kc).
