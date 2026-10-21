# Паспорт проекта LawBid для нового аккаунта Claude (21.10.2026)

Репозиторий ПУБЛИЧНЫЙ: здесь нет ни одного секрета, только где они лежат. Секреты в чат, коммиты и PR не вставлять.
Владелец: SiMA (по-русски, коротко, вспыльчив, нужны факты). Дополнительно читать `RELEASE_20OCT_HANDOFF.md` (раздел 13 обязательно), хвост `RELEASE_20OCT_JOURNAL.md`, `DEPLOY_PROD.md`.

## 1. Что это и где код

- LawBid: приложение, где клиенты находят адвокатов (кейсы, чаты, звонки, группы/каналы, Q&A, лента). Роли: клиент, адвокат, помощник.
- Репозиторий `syimykkalykov1999/LawBid`:
  - `apps/mobile` — Flutter 3.47.5 (Android + iOS + web).
  - `apps/api` — NestJS + Prisma (PostgreSQL 16).
  - `apps/admin` — Next.js (админка, admin.lawbid.dev).
  - `infra/` — Terraform (`infra/envs/prod`, `infra/bootstrap`).
  - `packages/api-contract` — OpenAPI и Dart-клиент.
  - `scripts/deploy`, `scripts/agent/run-handoff.mjs`, `docs/runbooks`.
- Сайт: репозиторий `LawBidSite` (/about на lawbid.dev, S3 `lawbid-prod-web`).
- Рабочая ветка: `claude/release-20oct`, PR #226 → `main` (https://github.com/syimykkalykov1999/LawBid/pull/226). Merge жмёт владелец (или даёт слово).
- Старые копии НЕ читать: LawBid-copie, copieoflawbid, LawBidAdmin, lawbid-preview.
- Приложение: `com.lawbid.lawbid`. Прод: https://api.lawbid.dev, https://admin.lawbid.dev, https://lawbid.dev.

## 2. Где остановились (21.10 вечером)

- Голова ветки на GitHub в момент записи: `e18ff70d` (журнал). Агент на Mac мог уйти дальше (последний известный `6ebbeea5`): смотри `git log -5 origin/claude/release-20oct` и хвост журнала.
- CI был зелёный на `5605161e` (API, Mobile, admin, CodeQL, Secret scan, Container scan).
- Сделано: inbox 1–25 (звонки 1:1 и групповые, «Запросы»-гейт, исчезающие, пересылка, запрет копирования, «Поделиться», Q&A, Каналы+Группы, живые подсказки людей, журнал звонков). Список файлов после `60ae65d8` — `RELEASE_20OCT_FILES.md`.
- Очередь inbox (если не успеет — следующий релиз): 22c архив у Чатов/Групп/Каналов; 22d действия во всех вкладках Мои/Подписки/Обзор; 22e действия чатов отдельно; 27 «без звука» со сроком (muteUntil на сервере); 20e звонок внутри группы/канала как Telegram «Видеочат»; 20f живой список участников; 20c большая группа (~500 только SFU); 20d лимит 9/9; 26b/26c группы и каналы точь-в-точь как Telegram (экран «Разрешения», голосования); 28 аватарки групп/каналов; 29/29b счётчик на иконке в колокольчике; 30 гранулярные уведомления.
- Не проверено: FCM при закрытом приложении (только прод), плохая сеть, Samsung с выключенным экраном, Stripe 3-DS, стартовые картинки S3, iPhone-звонки (владелец сам). Админка не показывает флаг «запрет копирования».
- Не вошло в релиз: свайп-звонок из недавних (SFU), реакции в группах, CloudFront перед API, USCIS, постер видео, очки Q&A, PiP.

План 12 шагов (говорить владельцу «ты на шаге N»; на 21.10 17:00 был шаг 1→2):
1. Агент доделывает, CI зелёный, всё в GitHub.
2. Слить PR #226 в main + деплой AWS (владелец: Approve, aws login).
3. Проверка прода: health, админка (/integrations), веб.
4. Прод-сборка на Samsung: звонки/пуши при закрытом приложении, заблокированном экране, в фоне.
5. Владелец подключает iPhone, ставится сборка, проверяет звонки Samsung↔iPhone.
6. Демо-видео + AAB №4 → `~/Desktop/LawBid-download`.
7. Владелец: видео на YouTube (unlisted).
8. Play Console → App content → декларация FGS (микрофон/VoIP) + полноэкранный intent.
9. Production → Create release → AAB → Start rollout.
10. Transporter → ipa → App Store Connect → шифрование «Нет» → Submit.
11. Владелец присылает числовой App Store ID, вписать.
12. После одобрения: Stripe live, sima-admin, Terraform, пересоздать ключи Console.

## 3. Агент на Mac (Claude Agent SDK)

- Запуск (окно 1 в Terminal):
  ```sh
  cd ~/Desktop/LawBid && export ANTHROPIC_API_KEY=<ключ из Console → API Keys> && while true; do rm -f ~/.lawbid-agent-session; node scripts/agent/run-handoff.mjs; sleep 120; done
  ```
  Проверка: `pgrep -fl "run-handoff.mjs|sleep 120"`. Каждый круг — новая сессия; скрипт читает HANDOFF и журнал и продолжает с последнего шага. Финиш: в окне `=== success` и финальный список без новых коммитов.
- Почта владельца: `~/Desktop/LawBid-download/inbox/notes.txt` + скрины. Обработанное агент переносит в `inbox/done/`. Если агент унёс notes.txt в done/, не сделав поздние пункты, — пересобрать notes.txt.
- Журнал: `docs/runbooks/RELEASE_20OCT_JOURNAL.md` (запись после каждого шага, в конец, старое не править). HANDOFF 13.99–13.103: не спрашивать владельца, не ждать CI стоя, inbox выше всех правил, экономить токены.
- Правила владельца 0–0m: главный приоритет — соединение людей; решения самому в журнал «Решения для владельца»; каждый шаг пушить; 4 попытки → «Не решено»; чистить Mac; все устройства; видеозвонки как Zoom; без прогонки 4 ролей/Maestro.
- Порядок экономии: доделать начатое → push → слить #226 → деплой AWS → одна проверка звонка/пуша на проде с Samsung → видео и AAB → финальный список; без повторных проверок.
- Бюджет Console: на 21.10 ~18 $ (промокредиты 200 $ потрачены; лимит организации 300 $). Карта сама не списывается. При остановке «400 usage limits»: Console → Оплата и платежи → Купить кредиты. Старые API-ключи были засвечены: пересоздать после релиза (Console → API Keys).
- Новому аккаунту: создать свой ключ в Console и подставить в команду выше; модель в скрипте `claude-opus-5-5`.

## 4. Деплой (подробно: `DEPLOY_PROD.md`)

- Порядок: push/merge в `main` → workflow **Deploy** → окружение `production` требует Approve владельца → миграции (задача `lawbid-prod-migrate`, `prisma migrate deploy`) → выкладка api/worker/admin → smoke → health `https://api.lawbid.dev/health/ready`. Terraform Deploy ничего не применяет. Старый Deploy от 20.10 отменить.
- Веб: `web-deploy.yml` (Flutter web на lawbid.dev), `seo-deploy.yml` (SEO-страницы; нужна GitHub Variable `ANDROID_APP_SHA256`). Остальные workflow: `api-ci`, `admin-ci`, `mobile-ci` (лимит 40 мин), `mobile-release`, `rollback` (откат вручную), `codeql`, `container-scan`, `secret-scan`, `self-check`, `load-nightly`.
- AWS: аккаунт `047754151252`, регион `us-east-1`. Вход с Mac:
  ```sh
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CREDENTIAL_EXPIRATION; aws login && eval "$(aws configure export-credentials --format env)"
  ```
- Terraform (`infra/envs/prod`), перед apply подставить текущие теги `scripts/deploy/current-tag.sh`:
  ```sh
  terraform init -backend-config=backend.hcl
  terraform plan -target=<ресурс> -var-file=launch.tfvars.example -out=x.plan
  ../../../scripts/deploy/plan-guard.sh x.plan
  terraform apply x.plan
  ```
  Нужно применить с Mac после релиза: lifecycle S3 выгрузок, CSP (`infra/modules/web/main.tf`), Spot, TURN TCP/443.
- Прод-сид и демо-мир: `scripts/deploy/prod-admin-ecs.sh <TAG>`, демо-база `lawbid_demo`.
- Инфра: RDS `lawbid-prod-postgres` (t4g.micro, PG16), ECS кластер `lawbid-prod`, CloudFront `d28wq9t218p67x`, ACM `77615c70` (CNAME не удалять), TURN EC2 `i-0a93f35edc1ba5a05`, EIP `32.192.170.198`. AWS держать по минимуму.

## 5. Магазины

Google Play (аккаунт SiMA LLC, ID `8650120273767012614`):
- AAB №4 — только prod-сборка, подписанная ключом `~/lawbid-upload.jks` на Mac (SHA1 `F7:3E:3F:28:4B:C0:EB:32:5B:B1:65:FC:67:46:8D:11:9A:36:24:77`). `~/lawbid-upload-new-20oct.jks` НЕ использовать. Пароли ключа знает владелец, в репо нет.
- Prod: `google-services.json` → `apps/mobile/android/app/src/prod/`; `--build-number 4` только для prod.
- Декларации: foreground service (микрофон/VoIP) со ссылкой на видео, полноэкранный intent. Видео `fgs-demo-call.mp4` (`~/Desktop/LawBid-download/`, копия в `/mnt/project-files/`) → YouTube unlisted (делает владелец). Тексты листинга: `~/Desktop/LawBid-download/store-listing.md`, скрины `.../shots/`.
- Потом Production → Create release → AAB → Start rollout (кнопки жмёт владелец).

App Store (Team `78T56RPM74`, App ID `com.lawbid.lawbid`):
- Собрать ipa, затем `open -a Transporter ~/Desktop/LawBid/apps/mobile/build/ios/ipa` → App Store Connect → LawBid 1.0 → шифрование «Нет» → Submit.
- `GoogleService-Info.plist` → `ios/Runner/`; APNs ключ `K78RWRB7Y9`; пуши iOS: PushKit VoIP + APNs.
- Числовой App Store ID присылает владелец, вписать в проект/SEO.

## 6. Аккаунты и где лежат ключи (значений здесь нет)

- Админка ключей: https://admin.lawbid.dev/integrations (Twilio, Stripe sk/whsec/pk, Firebase JSON, Bunny, Sentry DSN). Лежат в БД прода, деплой их не трогает.
- Секреты AWS: Secrets Manager `lawbid-prod/*` (`SECRETS_MASTER_KEYS` k1, `JWT_KEYS` j1, `MESSAGE_ENC_KEYS` m1 — не менять); TURN: SSM `/lawbid-prod/turn/static-auth-secret`.
- GitHub Secrets/Variables репо LawBid: `AWS_DEPLOY_ROLE_PROD`, `AWS_REGION`, `ECR_REGISTRY`, `PROD_API_URL`, `PROD_ADMIN_URL`, Variable `DEPLOY_ENABLED`, `ANDROID_APP_SHA256`.
- Firebase: проект `lawbid-6e5ff` (номер 180217144161). Android data-only FCM.
- Stripe (оплата на lawbid.dev/pay): live ещё не включён; вебхук `/api/v1/webhooks/stripe`, цены 299/мес и 2 499/год.
- Twilio (SMS-вход по номеру), Bunny (видео), Sentry (org `lawbid`; DSN mobile/admin вписать в админку), Namecheap (домен), CloudFront/ACM/S3 — доступ у владельца.
- Демо-коды прод (адвокат/клиент/помощник, до 18.11): у владельца и в памяти проекта, в репо не писать.
- Пароль `sima-admin` в IAM — владелец.
- В репозитории не было и не будет секретов: перед коммитом gitleaks (`.gitleaksignore` для ложных).

## 7. Устройства и правила Mac

- Samsung `46e13270` (вход Thomas +12125550101, код `000000`), iPhone `00008150-001E545A1480401C` (владелец отключил до финиша), Android-эмулятор. iOS-симулятор не собирается.
- Локальные входы: адвокат Thomas +12125550101, Charlotte +12125550103, клиенты +14155552680 / +14155552681; код везде `000000`.
- API для телефонов: `10.113.194.215:3000` через раздачу Samsung. Раздачу и режим полёта НЕ трогать; не `pm clear`.
- Сборки по одной, не параллельно. Dev без `--build-number`. iOS: dev flavor в release-режиме. Не коммитить `Podfile.lock`, `project.pbxproj`, `dev.json.bak`.
- Docker Desktop нужен. Mac не должен засыпать. Не трогать `LawBid-stable` без слова владельца.
- Голдены только на macOS (Linux падают); push PNG без Podfile.lock/pbxproj.
- Команды: `npx prisma generate`; `npm run seed:i18n --workspace apps/api`; `pod install` с `LANG=en_US.UTF-8`.
- CI-ловушки: ERD `npm run db:erd --workspace apps/api`; `node scripts/i18n-audit.mjs --ci`; контракт `sh packages/api-contract/generate.sh` + oasdiff (новые строки в `oasdiff-err-ignore.txt` только со словом владельца); `UPDATE_BOUNDARIES=1 npx jest architecture/module-boundaries`; prelaunch-wipe план для каждой новой таблицы.
- Тестовые Public Group N в локальной БД не чистить.

## 8. Правила владельца и продукта

- Коротко, по-русски, факты; без проверки кода ничего не утверждать; «что слито» — SHA; «объясни» — просто; всё одним списком; команды в code block; вопросы по одному.
- Эталоны: WhatsApp, Telegram, Instagram, WeChat. Навбар не трогать. Компактно как Telegram, масштаб ×1.1, обе роли, веб и админка.
- Жёлтых иконок нет: золото только галочка клиента, ★, активная вкладка. Иконки Phosphor. Синий #0095F6 только «Подписаться».
- Вход только по номеру, никаких SMS с сервера сверх Twilio. Переводы: xlsx → БД, 85 языков, `apps/api/prisma/seed/translations_seed.xlsx`. Sentry везде.
- Проверять ru, ne, ar (RTL), de, mr при 360dp в 4 темах.
- Звонки: mesh WebRTC (`calls.service.ts`), лимит 9 аудио / 6 видео (SFU потом), красная кнопка выводит только нажавшего, хост «Завершить для всех / Покинуть», голосование за удаление, чужой не звонит без принятого чата («Запросы»).
- Флаги выкл: `email_login`, `deadlines`, `chat_translate`. Q&A: лимит 10 ответов, автозакрытие 30 дн, чистка 90 дн.
- Процесс: хотелка → эталоны → архитектура → план → код с тестами. Минимальный дифф, готовое до `60ae65d8` не ломать.
- Без деплоя и магазинов без слова владельца; сейчас слово дано (деплой разрешён 21.10 16:48).

## 9. Что нужно от владельца

- Approve в GitHub (окружение production) при Deploy; merge PR #226.
- `aws login` на Mac.
- Кредиты в Console при остановке агента; пересоздать ключи Console после релиза.
- Подключить iPhone после финиша агента; проверить звонки Samsung↔iPhone.
- Видео на YouTube unlisted; кнопки Play Console (декларации, Start rollout); Transporter и Submit в App Store Connect; числовой App Store ID.
- Stripe live, Sentry DSN в админку, `ANDROID_APP_SHA256` в GitHub Variables, Terraform apply с Mac, заново войти в магазинное приложение на Samsung.

## 10. Как новому ИИ начать: первые 5 команд

```sh
cd ~/Desktop/LawBid && git fetch origin && git checkout claude/release-20oct && git pull --rebase origin claude/release-20oct
git log --format='%h %s' -10
tail -n 40 docs/runbooks/RELEASE_20OCT_JOURNAL.md
ls ~/Desktop/LawBid-download/inbox/ && pgrep -fl "run-handoff.mjs|sleep 120"
curl -fsS https://api.lawbid.dev/health/ready
```

Затем: прочитать `RELEASE_20OCT_HANDOFF.md` (раздел 13), спросить владельца только одно — на каком шаге плана 12 шагов он сейчас; продолжать с последней записи журнала, пушить только в `claude/release-20oct`.
