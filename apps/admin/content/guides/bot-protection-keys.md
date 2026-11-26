---
id: bot-protection-keys
title: Защита от ботов и копия фото: какие ключи вставить
category: launch
cost: Turnstile бесплатно; reCAPTCHA Enterprise бесплатно до 10 000 проверок в месяц; фильтр адресов $1–15 в месяц; копия фото $1–25 в месяц; оригиналы видео в Bunny $0,01 за ГБ в месяц
time: 30 минут один раз
launch: turnstile, app_check, web_app_check, dns_firewall, media_backup
verified: 2026-11-26
sources:
  - Cloudflare Turnstile: Get started | https://developers.cloudflare.com/turnstile/get-started/
  - Cloudflare Turnstile: Server-side validation | https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
  - Google Cloud: Create reCAPTCHA keys for websites | https://cloud.google.com/recaptcha/docs/create-key-website
  - Firebase: App Check with reCAPTCHA Enterprise on the web | https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
  - Firebase: App Check overview | https://firebase.google.com/docs/app-check
  - Cloudflare R2: Authentication (API tokens) | https://developers.cloudflare.com/r2/api/tokens/
  - AWS Route 53: DNS Firewall metrics in CloudWatch | https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/monitoring-resolver-dns-firewall-with-cloudwatch.html
  - Bunny Stream: цены | https://bunny.net/pricing/stream/
---

## Что это и зачем

Здесь собрано всё, что осталось сделать вам для защиты от ботов и для ночной копии фото. Код уже готов. Вы вставляете ключи в админке и нажимаете «Сохранить» с кодом 2FA. Остальное включается само.

Как это работает:

- Блокировка не включается сразу. Сначала сервер только записывает, кто прошёл проверку. Блокировать ботов он начинает сам, когда почти все настоящие люди проходят проверку (настройка «Авто», 99 % за 7 дней).
- Если ключ неверный или сервис не отвечает, людей пускают как раньше. Ошибка видна в админке.
- Состояние каждого пункта видно на странице **«Запуск»**: красный = «ключ не вставлен» или «ошибка проверки», жёлтый = «ключ есть, ждём первых проверок», зелёный = «работает».

## Что понадобится

- Вход в Cloudflare ([dash.cloudflare.com](https://dash.cloudflare.com)).
- Вход в Google Cloud ([console.cloud.google.com](https://console.cloud.google.com)) и Firebase ([console.firebase.google.com](https://console.firebase.google.com)) с тем же проектом, что в карточке FCM.
- Mac с Terraform и входом в AWS (только для шага 4, один раз).

## Шаги

### 1. Защита сайта: Cloudflare Turnstile (бесплатно)

1. Cloudflare → **Turnstile** → **Add widget**. Widget name: `lawbid-web`. Hostnames: `lawbid.dev`, `www.lawbid.dev`. Widget mode: **Managed** → **Create**.
2. Скопируйте **Site key** и **Secret key**.
3. Админка → **Ключи и сервисы** → карточка **«Cloudflare Turnstile (защита сайта от ботов)»** → «Добавить ключи»:
   - «Секретный ключ (Secret key)» ← Secret key;
   - «Ключ сайта (Site key, публичный)» ← Site key;
   - «Разрешённые домены сайта» ← `lawbid.dev,www.lawbid.dev`.
4. «Сохранить» (код 2FA) → «Проверить» → «Включить».

Что дальше само: на сайте появится проверка на входе, регистрации, кодах и «Забыл пароль». Сервер сразу проверяет каждый ответ у Cloudflare. Блокировать начинает, когда почти все настоящие люди проходят.

### 2. Защита сайта: reCAPTCHA Enterprise для App Check (бесплатно до 10 000 проверок в месяц)

1. [console.cloud.google.com](https://console.cloud.google.com) → выберите проект Firebase → **Security** → **reCAPTCHA** → **Create key**.
2. Display name: `lawbid-web`. Application type: **Web**. Domains: `lawbid.dev`, `www.lawbid.dev`. Галочку **checkbox challenge** не ставить → **Create key**. Скопируйте **ID ключа** (начинается на `6L`).
3. [console.firebase.google.com](https://console.firebase.google.com) → проект → **Security** → **App Check** → вкладка **Apps** → веб-приложение → **reCAPTCHA Enterprise** → вставьте тот же ключ → **Save**.
4. Админка → **Ключи и сервисы** → карточка **«Firebase Cloud Messaging (push)»** → поле **«Сайт: ключ reCAPTCHA Enterprise»** ← этот ключ. Если поля «Сайт: apiKey», «appId», «messagingSenderId», «VAPID-ключ» ещё пустые, заполните их тоже (подсказки в карточке).
5. «Сохранить» (код 2FA) → «Включить».

Что дальше само: сайт получает ключ при открытии страницы, новая сборка сайта не нужна.

### 3. Защита приложения на телефонах: App Check

Ключи для телефонов уже есть, если карточка **«Firebase Cloud Messaging (push)»** включена (Project ID, Service account email, Private key). Регистрацию приложений в Firebase → **App Check** (App Attest для iPhone, Play Integrity для Android) описывает инструкция «Firebase App Check - защита от ботов». Включать **Enforce** в Firebase не нужно: блокирует наш сервер сам, когда почти все настоящие запросы проходят.

### 4. Копия фото R2 → S3 каждую ночь

1. Cloudflare → **R2 Object Storage** → **Manage R2 API Tokens** → **Create API token**. Token name: `lawbid-media-backup`. Permissions: **Object Read only**. Specify bucket: корзина с фото (её имя есть в карточке «Cloudflare R2»). TTL: **Forever** → **Create API Token**.
2. Скопируйте **Access Key ID** и **Secret Access Key** (секрет показывается один раз).
3. Админка → **Ключи и сервисы** → карточка **«Копия фото R2 → S3 (ключ R2 только на чтение)»** → «Добавить ключи»:
   - «Cloudflare account ID» и «Имя корзины R2» ← как в карточке «Cloudflare R2»;
   - «Access Key ID токена R2» ← Access Key ID;
   - «Secret Access Key токена R2» ← Secret Access Key.
4. «Сохранить» (код 2FA) → «Проверить» → «Включить». Сразу запустится пробная копия: она только считает файлы. Через несколько минут на «Запуске» строка «Копия фото R2 → S3» покажет, сколько файлов и гигабайт будет скопировано. Настоящая копия пойдёт этой ночью и дальше каждую ночь.
5. **Один шаг на Mac (один раз, только вы: это права в AWS).** В папке `infra/bootstrap` выполните `terraform plan`. В плане должны быть только новые части: корзина `lawbid-prod-media-backup-…`, её ключ, роль `lawbid-prod-github-media-backup` и добавленные права роли `infra-apply` (DNS-фильтр). Ничего не удаляется. Затем `terraform apply`.

Почему этот шаг нельзя сделать из админки: он даёт права в AWS. Роль, которая применяет изменения из админки, сама себе права дать не может, так задумано для безопасности.

### 5. Фильтр исходящих адресов серверов (DNS Firewall)

Ключи не нужны. Фильтр уже включён в коде в режиме **ALERT**: только журнал, ничего не блокируется. Он создастся при следующем применении облака после шага 4.5: «Масштаб» → «Применить изменения из кода» → код 2FA. Пока шага 4.5 нет, план сам откладывает фильтр и пишет «ждёт прав bootstrap».

Блокировка (**BLOCK**) включается отдельной кнопкой: «Масштаб» → «Фильтр исходящих адресов: блокировать чужие (BLOCK)» → «Вкл» → код 2FA. Включайте, только когда на «Запуске» в строке фильтра нет нужных адресов.

### 6. Оригиналы видео в Bunny

Ничего делать не нужно: следующий выкат сам включит в Bunny хранение оригиналов (KeepOriginalFiles). Цена: $0,01 за ГБ в месяц, хранение видео вырастет примерно вдвое (строка «Оригиналы видео в Bunny» на странице «Расходы»).

### WAF Bot Control и правила входа

Ключи не нужны, это пункты «Авто» на странице «Масштаб»: во время атаки они включаются сами в режиме блокировки и выключаются, когда тихо. Чтобы держать их включёнными всегда, нажмите там «Вкл» (код 2FA). Цена Bot Control: $10 в месяц + $1 за миллион запросов.

## Куда вставить в нашей админке

| Ключ | Где взять | Карточка «Ключи и сервисы» → поле |
|---|---|---|
| Turnstile Secret key | Cloudflare → Turnstile → виджет | «Cloudflare Turnstile» → «Секретный ключ (Secret key)» |
| Turnstile Site key | там же | «Cloudflare Turnstile» → «Ключ сайта (Site key, публичный)» |
| reCAPTCHA Enterprise key | Google Cloud → Security → reCAPTCHA | «Firebase Cloud Messaging (push)» → «Сайт: ключ reCAPTCHA Enterprise» |
| R2 Access Key ID и Secret | Cloudflare → R2 → Manage R2 API Tokens | «Копия фото R2 → S3» → «Access Key ID…», «Secret Access Key…» |

## Как проверить

Админка → **«Запуск»**, группа «Безопасность» и «Медиа»:

- «Защита сайта от ботов (Turnstile)» зелёная: ключи проверены.
- «Защита сайта: reCAPTCHA Enterprise» станет зелёной после первых входов на сайте.
- «App Check» показывает долю настоящих людей, прошедших проверку.
- «Фильтр исходящих адресов» зелёный: режим ALERT и число чужих адресов за 2 недели.
- «Копия фото R2 → S3» зелёная: дата последней копии, число файлов и объём.

## Частые ошибки

- В Turnstile вставлен только один ключ: проверка на сайте не появится, нужны оба.
- Ключ reCAPTCHA не вставлен в Firebase → App Check: строка станет красной «ошибка проверки». Вставьте его там (шаг 2.3).
- Токен R2 с правом записи вместо Object Read only: копия работает, но так рискованнее. Создайте новый токен только на чтение.
- Строка «Копия фото» красная «нет корзины или прав в AWS»: не сделан шаг 4.5.
