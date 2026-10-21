# Передача релиза 20.10 (для Claude Code в терминале на Mac)

Без секретов. Всё, что нужно, чтобы продолжить без проекта в приложении Claude.

## 1. Цель и запреты

- PR #226 `claude/release-20oct` → `main` (https://github.com/syimykkalykov1999/LawBid/pull/226). **Merge жмёт владелец сам.**
- НЕ деплоить, НЕ грузить в магазины, НЕ ставить сборки `--build-number 4` без слова владельца.
- Владелец SiMA: по-русски, коротко, только факты; ничего не утверждать без проверки кода; «что слито» — SHA.
- В `claude/release-20oct` пушит один исполнитель за раз: `git pull --rebase`, `git cherry-pick <sha>`, проверки, один push, `git fetch` и сверка головы.

## 2. Что в голове `release-20oct`

Голова на момент записи: `git log -1 origin/claude/release-20oct` (после e21324bb, shared-media слита). Полный список: `git log --format='%h %s' 1a3dfbb6..origin/claude/release-20oct`. По темам:

- **Звонки:** принятие из шторки, гудки громче, чистка призраков, рингтон у принимающего, «Завершить для всех / Покинуть» у хоста, передача хост-прав, голосование за удаление и бан на звонок (403 на join/invite), лимит 6 аудио / 4 видео, звонки из чат-групп = лёгкое уведомление 60 с с «Присоединиться», видео-фокус (тап по плитке, мини-окно), аватар при выключенной камере, гейт: чужих нельзя ни звонить, ни добавить (только через «Запросы»).
- **Заглушка:** «Без звука» 1ч/8ч/неделя/всегда, «Заглушить звонки» для чата и группы; глушит рингтон и лёгкое уведомление группы (сервер и клиент).
- **Вкладка «Звонки»:** сегмент «Контакты | Звонки», `GET /calls/history`, `GET /calls/ongoing`, зелёный «+» при идущем групповом звонке.
- **Чаты:** чипы «Все · Кейсы · Ожидают · Запросы», «Подарить» в меню ⋯ профиля, исчезающие сообщения (выкл/24ч/7д/90д, воркер `chat.disappearing`, 3 миграции с индексами), медиа-вкладки группы (`GET /groups/:id/shared`).
- **Выгрузка для госорганов:** admin/data-requests (только super_admin + step-up + аудит; ZIP = PDF + JSON + SHA-256; S3 30 дней).
- **Прочее ранее:** юзернеймы, «Рекомендуем», архив, кэш, плейсхолдеры, админка на телефоне, индексы, права групп, Q&A («кейс актуален?»), счётчики в формате Instagram, свайп строки с краёв 32dp, напоминания планера (экран «Будильники» только при добавлении напоминания).

## 3. Ветки в работе (не слиты)

- **Группы:** приглашения в группу через «Запросы» с предпросмотром, в работе (ветка потока «Группы»).
- **Q&A** `claude/qa-feed-mine`: вкладки «Все · Мои · Лучшие · Без ответа» в шапке со свайпом, лента адвоката по специализациям, бесконечная лента, шторка ответов, лимит 10 ответов, адвокат видит только свой ответ, лайки только клиентам, «Закрыть вопрос», автозакрытие через 30 дней и чистка через 90, миграция `closed_at`. В работе.
- Если владелец заморозит релиз, эти две ветки в него не входят.

## 4. Проверки перед каждым push

API (`apps/api`): `npx prisma generate` (иначе ложные ошибки tsc), `npx tsc --noEmit`, `npx prettier --check "src/**/*.ts" "test/**/*.ts"`, `npx jest` (минимум `src/architecture src/ops` и затронутые модули).
- **prelaunch-wipe:** каждая таблица в `src/ops/prelaunch-wipe.plan.ts` должна быть KEEP/FILTERED/WIPE.
- **module-boundaries:** `UPDATE_BOUNDARIES=1 npx jest architecture/module-boundaries`.
- **SQL:** `make_interval(mins => $1::INT)`, без голых параметров.

Из корня репозитория:
- ERD: `npm run db:erd --workspace apps/api` и коммит `docs/db/ERD.md` (иначе CI красный).
- Контракт: `sh packages/api-contract/generate.sh` (`SKIP_OPENAPI_EXPORT=1`, если нужен только Dart-клиент). CI запускает `oasdiff breaking --fail-on ERR --err-ignore packages/api-contract/oasdiff-err-ignore.txt` против `main`. Новые строки в ignore-файл только со словом владельца.
- i18n: `node scripts/i18n-audit.mjs --ci`. Переводы лежат в `apps/api/prisma/seed/translations_seed.xlsx` (лист `translations`, ключ в колонке 1). При конфликте объединять по ключу через openpyxl.

Mobile (`apps/mobile`, Flutter 3.47.5):
- `flutter analyze --no-pub`.
- `flutter test test/features/<…> test/architecture`.
- **Overflow-тесты** (`test/overflow`): 4 темы × ru/ne/ar/de/mr при 360dp, масштаб ×1 и ×1.1.
- **Голдены только на macOS.** На Linux падают голдены профиля и contact_info, это ожидаемо. Пересчёт на Mac на финальной голове, push PNG **без** `Podfile.lock` и `pbxproj`.
- Числа в тексте через `context.digits(...)`.

CI на PR: «Lint, typecheck, unit + e2e tests» (API, включая ERD, prettier и контракт) и «Analyze, lint checks, unit/widget/golden tests» (Mobile). Падение MinIO на старте = инфра-флейк, один перезапуск.

## 5. Правила Mac

- Одна сборка за раз. Dev-сборки **без** `--build-number` (4 только для prod).
- iOS: debug с домашнего экрана нельзя, ставить dev flavor в release-режиме, API `10.113.194.215:3000` через раздачу Samsung.
- Раздачу Samsung и режим полёта не трогать. Не делать `pm clear`.
- Демо локально: адвокат Thomas Brennan +12125550101, Charlotte +12125550103, клиент +14155552680 / +14155552681, код 000000.
- Уведомления LawBid в шторке тапать можно, чужие приложения нельзя.

## 6. Чек-лист проверки на телефонах

1. «Принять» из шторки открывает экран звонка.
2. После конца звонка `dumpsys` без 7003/callkit-призраков.
3. Одна системная шторка на звонок.
4. Звонок из чат-группы = уведомление 60 с «Присоединиться»; обычный групповой (≤9) звонит системно.
5. Голосование 2:1 удаляет участника и даёт 403 на join; в 1:1 голосования нет.
6. Хост на 4+ видео: диалог «Завершить для всех / Покинуть».
7. Тап по плитке открывает её на весь экран; назад кнопкой и свайпом; мини-окно таскается и скрывается; аватар при выключенной камере.
8. «Звонки» глобально выкл — без рингтона; «Без звука» 1ч/8ч/нед/всегда; «Заглушить звонки».
9. Зелёный «+» при идущем звонке открывает вкладку «Звонки».
10. Чипы «Все · Кейсы · Ожидают · Запросы».
11. «Подарить» в ⋯ профиля; исчезающие сообщения выкл/24ч/7д/90д.
12. Медиа-вкладки группы (фото и видео, файлы, ссылки, голосовые).

## 7. После всего: финальный список для владельца

1. Merge PR #226.
2. Deploy → Approve (Terraform Deploy ничего не применяет).
3. `prisma migrate deploy` на проде.
4. Terraform с Mac (`infra/envs/prod`): lifecycle S3 выгрузок, CSP, Spot/автоскейл, пересоздание EC2 TURN под TCP/443. Команды: `terraform init -backend-config=backend.hcl`, `terraform plan -var-file=launch.tfvars.example -out=x.plan`, `terraform apply x.plan`. AWS: `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CREDENTIAL_EXPIRATION; aws login && eval "$(aws configure export-credentials --format env)"`.
5. Сборки с `--build-number 4` только после слова владельца.
6. Google Play: AAB, декларации (микрофон в фоне, VoIP), видео `fgs-demo-call.mp4` → YouTube unlisted, полноэкранный intent.
7. Transporter → App Store Connect → LawBid 1.0, шифрование «Нет».
8. GitHub Variables `ANDROID_APP_SHA256` (Play Console → App integrity) → workflow «SEO pages».
9. Числовой App Store ID.
10. Sentry DSN mobile и admin в админке.
11. Stripe live: вебхук `/api/v1/webhooks/stripe`, цены 299/мес и 2 499/год.
12. Пароль `sima-admin` в IAM.
13. Очистка Mac; `sudo pmset -a sleep 0 disksleep 0`.

**Не вошло в релиз:** свайп-звонок из недавних (нужен SFU), реакции в группах, CloudFront перед API, USCIS, постер видео, очки Q&A, PiP-окно в приложении.

**Не проверено:** FCM-звонок при закрытом приложении, плохая сеть и смена сети в звонке, Samsung с выключенным экраном (PIN), всё на iPhone (владелец сам), Stripe 3-DS.
