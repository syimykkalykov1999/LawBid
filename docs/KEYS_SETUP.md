# Ключи и доступы: куда что вставлять

> Полный план регистраций от А до Я (сайт, сторы, сервер, цены, сроки, порядок): `docs/LAUNCH_KEYS_GUIDE.html` (owner 2026-09-30).

Документ для владельца. Всё уже подготовлено: как только ключ вставлен в
нужное место и API/приложение перезапущено, соответствующая функция
включается сама. Пока ключа нет, работает безопасная заглушка (mock) —
но **только** на вашем компьютере и в тестах. На `staging`/`production`
сервер без нужных ключей не запустится и напишет, какой переменной не
хватает (так задумано: в бою никогда не должно быть «тихой» заглушки).

## Где лежат настройки

| Что | Файл | В git? |
|---|---|---|
| Ключи сервера (локально) | `apps/api/.env` (копия `apps/api/.env.example`) | нет, игнорируется |
| Ключи сервера (staging/prod) | AWS Secrets Manager, те же имена переменных | нет |
| Публичные id мобильного приложения | `apps/mobile/config/dev.json` (копия `config/dev.example.json`) | нет, игнорируется |
| URL-схема Google и Team ID для iOS | `apps/mobile/ios/Flutter/Secrets.xcconfig` (копия `Secrets.example.xcconfig`) | нет, игнорируется |
| Файлы Firebase | `ios/Runner/GoogleService-Info.plist`, `android/app/google-services.json` | нет, игнорируются |

Никогда не вставляйте ключи в код, в `.env.example`, в `*.example.*`, в
чаты и в задачи. Формат каждого ключа проверяется при старте сервера
(`apps/api/src/config/env.schema.ts`): если вставлено что-то не то
(лишний пробел в середине, не тот ключ), сервер сразу скажет, что именно.

## Шаг 0. Один раз перед началом

1. `cp apps/api/.env.example apps/api/.env` (если `.env` уже есть —
   оставьте его, но проверьте две строки ниже).
2. В `apps/api/.env` должно быть `SMS_PROVIDER=auto` и
   `EMAIL_PROVIDER=auto`. **Важно:** в вашем текущем `.env` стоит
   `mock` — с `mock` сервер игнорирует вставленные ключи. Поменяйте на
   `auto`.
3. `cp apps/mobile/config/dev.example.json apps/mobile/config/dev.json`
4. `cp apps/mobile/ios/Flutter/Secrets.example.xcconfig apps/mobile/ios/Flutter/Secrets.xcconfig`
5. Запуск приложения теперь: `cd apps/mobile && flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=config/dev.json` (staging/prod: `--flavor staging -t lib/main_staging.dart --dart-define-from-file=config/staging.json` и т.д.; см. apps/mobile/README.md → «Flavors»)

После любого изменения `.env` перезапустите API (`npm run start:dev` в
`apps/api`). В логе старта видно, что выбрано:
`"provider":"twilio" ... "SMS provider selected"` или
`"provider":"mock","missing":[...]` — список того, чего ещё не хватает.

## Порядок получения ключей

Порядок выбран так, чтобы сначала заработал вход (телефон, email,
Google, Apple), затем то, что понадобится на следующих этапах.

| № | Что это | Где взять | Куда вставить (точно) | Что заработает | Как проверить |
|---|---|---|---|---|---|
| 1 | **Twilio Account SID** (начинается с `AC`, 34 символа) | [console.twilio.com](https://console.twilio.com) → главная страница → блок *Account Info* | `apps/api/.env` → `TWILIO_ACCOUNT_SID=` | пока ничего (нужны шаги 2–3) | сервер стартует без ошибки формата |
| 2 | **Twilio Auth Token** (32 символа) | там же, *Account Info* → *Auth Token* → Show | `apps/api/.env` → `TWILIO_AUTH_TOKEN=` | пока ничего (нужен шаг 3) | лог: `missing` содержит только номер отправителя |
| 3 | **Номер отправителя Twilio** в формате `+15551234567` **или** Messaging Service SID (`MG…`) | Twilio → *Phone Numbers → Manage → Buy a number* (US, с SMS). Для рассылок в США нужна регистрация A2P 10DLC: *Messaging → Regulatory Compliance*; после неё Twilio даст Messaging Service (`MG…`) | `TWILIO_FROM_NUMBER=` **или** `TWILIO_MESSAGING_SERVICE_SID=` (достаточно одного; если оба — используется Messaging Service) | **SMS-коды входа по телефону уходят через Twilio** | лог `"provider":"twilio"`; войдите в приложении по своему номеру — придёт SMS. Для случайного кода вместо `000000` поставьте `OTP_DEV_FIXED_CODE=false` |
| 4 | **AWS SES: регион и адрес отправителя** | [AWS Console → SES](https://console.aws.amazon.com/ses/) → *Identities → Create identity* → домен (добавить DNS-записи DKIM), затем *Account dashboard → Request production access* (иначе письма уходят только на подтверждённые адреса) | `SES_REGION=` (например `us-east-1`, регион, где подтверждён домен), `SES_FROM_ADDRESS=` (например `LawBid <no-reply@ваш-домен>`) | **письма с кодом входа по email уходят через SES** | лог `"provider":"ses"`; вход по email — письмо в ящике |
| 5 | **AWS-ключи для локальной отправки** (только на вашем компьютере) | AWS → *IAM → Users → Create user* с правом `ses:SendEmail` → *Security credentials → Create access key* | `AWS_ACCESS_KEY_ID=` и `AWS_SECRET_ACCESS_KEY=` (оба сразу). На staging/prod **не нужны** — там IAM-роль | SES работает локально | без них при отправке письма будет ошибка доступа AWS |
| 6 | **SEED_ADMIN_EMAIL** — ваш email администратора | придумать/выбрать самим | `apps/api/.env` → `SEED_ADMIN_EMAIL=` | при `npx prisma db seed` создаётся админ | в логе сида нет строки `SEED_ADMIN_EMAIL not set` |
| 7 | **Apple Team ID** (10 символов) | [developer.apple.com/account](https://developer.apple.com/account) → *Membership details* | `apps/api/.env` → `APPLE_TEAM_ID=`; `Secrets.xcconfig` → раскомментировать `DEVELOPMENT_TEAM = …` | Xcode подписывает сборку без ручного выбора команды | `flutter run` на iPhone проходит подпись |
| 8 | **Bundle ID + Sign in with Apple** | Apple Developer → *Certificates, IDs & Profiles → Identifiers* → App ID `com.lawbid.lawbid`, галочка *Sign in with Apple* | `apps/api/.env` → `APPLE_BUNDLE_IDS=com.lawbid.lawbid` | **вход через Apple** | кнопка Apple на iPhone → вход проходит (без ключа сервер отвечает `AUTH_PROVIDER_DISABLED`) |
| 9 | **Google OAuth: Web client ID** (оканчивается на `.apps.googleusercontent.com`) | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → сначала *OAuth consent screen*, затем *Credentials → Create credentials → OAuth client ID → Web application* | `apps/api/.env` → `GOOGLE_CLIENT_IDS=` **и** `apps/mobile/config/dev.json` → `GOOGLE_SERVER_CLIENT_ID` | сервер принимает Google-токены; Android получает токен | сервер стартует без ошибки формата |
| 10 | **Google OAuth: iOS client ID** и его **iOS URL scheme** | там же → *Create OAuth client ID → iOS*, Bundle ID `com.lawbid.lawbid`. На странице клиента есть *iOS URL scheme* (`com.googleusercontent.apps.…`) | `config/dev.json` → `GOOGLE_IOS_CLIENT_ID`; `Secrets.xcconfig` → `GOOGLE_REVERSED_CLIENT_ID = …`; в `apps/api/.env` **добавить через запятую** в `GOOGLE_CLIENT_IDS=<web id>,<ios id>` | **вход через Google на iPhone** | кнопка Google на iPhone → вход проходит |
| 11 | **Google OAuth: Android client** (значение никуда не вставляется) | там же → *Create OAuth client ID → Android*, пакет `com.lawbid.lawbid`, SHA-1 ключа подписи (`cd apps/mobile/android && ./gradlew signingReport`; для релиза — SHA-1 из Google Play Console → *App signing*) | никуда: Android узнаётся по пакету и SHA-1; токен выпускается на Web client ID из шага 9 | **вход через Google на Android** | кнопка Google на Android → вход проходит |
| 12 | **Секреты сервера для staging/prod** (генерируются, а не покупаются) | в терминале: `openssl rand -base64 48` — по одному на каждую переменную | Secrets Manager: `JWT_KEYS=prod1:<секрет>`, `JWT_ACTIVE_KID=prod1`, `OTP_CODE_SECRET`, `OTP_KEY_PEPPER`, `AUTH_EVENT_PEPPER`; `OTP_DEV_FIXED_CODE=false` | безопасные токены в бою | сервер в `production` откажется стартовать с заготовками `CHANGE_ME` |
| 13 | **Firebase (push, будущий этап)**: файлы приложения | [console.firebase.google.com](https://console.firebase.google.com) → проект → добавить iOS (`com.lawbid.lawbid`) и Android (`com.lawbid.lawbid`) приложения | `apps/mobile/ios/Runner/GoogleService-Info.plist`, `apps/mobile/android/app/google-services.json` | понадобится на этапе push-уведомлений | файлы лежат на месте, в git не попали (`git status` чистый) |
| 14 | **Firebase: сервисный аккаунт (FCM на сервере, будущий этап)** | Firebase → *Project settings → Service accounts → Generate new private key* (скачается JSON) | из JSON: `FCM_PROJECT_ID=` ← `project_id`, `FCM_CLIENT_EMAIL=` ← `client_email`, `FCM_PRIVATE_KEY="…"` ← `private_key` (в кавычках, `\n` не заменять). Все три сразу | отправка push (когда появится этот этап) | сервер стартует без ошибки формата |
| 15 | **AWS S3 (файлы, будущий этап)** | AWS → S3 → создать два приватных бакета (документы и медиа) в одном регионе | `S3_REGION=`, `S3_BUCKET_DOCUMENTS=`, `S3_BUCKET_MEDIA=`. Локально вместо AWS — MinIO: `S3_ENDPOINT=http://localhost:9000`, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` из `docker-compose.yml`. На staging/prod `S3_ENDPOINT` пустой | загрузка документов верификации (этап файлов) | сервер стартует без ошибки формата |
| 15a | **ClamAV (антивирус загрузок, этап 3.2)** | сервис `clamav/clamav` (ECS-сервис/сайдкар в той же VPC, порт 3310, clamd с `TCPSocket 3310`) | Secrets Manager / env: `CLAMAV_HOST=<хост clamd>`, `CLAMAV_PORT=3310` | антивирус-проверка аватаров, документов верификации, фото постов. **В production обязателен:** без него файлы остаются `pending` и не прикрепляются. Локально не нужен (встроенный dev-сканер ловит только тестовую строку EICAR) | загрузить файл с EICAR — он получает `scan_status=infected` |
| 16 | **Stripe: тестовые ключи (будущий этап 6.7)** | [dashboard.stripe.com](https://dashboard.stripe.com) → режим *Test* → *Developers → API keys* | `apps/api/.env` → `STRIPE_SECRET_KEY=sk_test_…`; `config/dev.json` → `STRIPE_PUBLISHABLE_KEY` = `pk_test_…` | подписка адвоката (этап 6.7) | локально сервер **не примет** `sk_live_` — это защита от реальных списаний |
| 17 | **Stripe: цены и вебхук** | Stripe → *Product catalog → Add product*: «LawBid Attorney» $399 monthly → `STRIPE_PRICE_ID`; «Assistant seat» $100 monthly → `STRIPE_PRICE_SEAT_ID`; «LawBid Yearly (attorney + 6 assistants)» $9,590 yearly → `STRIPE_PRICE_YEARLY_ID`. Логотип и цвета страницы оплаты — *Settings → Branding*; *Developers → Webhooks → Add endpoint* `https://<api>/api/v1/webhooks/stripe` → *Signing secret* `whsec_…`. Локально: `stripe listen` печатает свой `whsec_…` | `STRIPE_PRICE_ID=`, `STRIPE_PRICE_SEAT_ID=`, `STRIPE_PRICE_YEARLY_ID=`, `STRIPE_WEBHOOK_SECRET=` | подписка и вебхуки (этап 6.7) | сервер стартует без ошибки формата |
| 18 | **Stripe: боевые ключи** (перед запуском) | Stripe → режим *Live* → те же разделы | только Secrets Manager `production`: `sk_live_…`, live `price_…`, live `whsec_…`; `pk_live_…` — в конфиг релизной сборки | реальные платежи | в `production` сервер **не примет** `sk_test_` |
| 19 | **Хеш Android-приложения для автоподстановки SMS-кода** (11 символов) | после создания релизного ключа подписи: запустить релизную сборку и вызвать `SmsCodeRetriever.appSignature()` (или вычислить по инструкции Google «SMS Retriever — compute app hash» из ключа Play App Signing) | `apps/api/.env` / Secrets Manager → `SMS_ANDROID_APP_HASH=` | на Android код из SMS подставляется сам | SMS начинается с `<#>`, последняя строка — хеш; на Android поле кода заполняется само |

## Что нужно сделать руками (не ключи)

- **Xcode:** открыть `apps/mobile/ios/Runner.xcworkspace` → *Runner →
  Signing & Capabilities* → выбрать команду (или шаг 7), проверить, что
  capability *Sign in with Apple* включена (entitlement уже в проекте).
- **Twilio (США):** регистрация A2P 10DLC (бренд + кампания) обязательна
  для стабильной доставки SMS в США; без неё операторы режут сообщения.
- **SES:** выход из sandbox (*Request production access*), DNS-записи
  DKIM/SPF для домена.
- **Google:** OAuth consent screen в статусе *In production* перед
  публичным релизом.

## Как это устроено (коротко, для разработчика)

- `SMS_PROVIDER` / `EMAIL_PROVIDER`: `auto` (по умолчанию) | `mock` |
  `twilio` / `ses`. Логика — `apps/api/src/config/provider-selection.ts`,
  тесты — `provider-selection.spec.ts`, `env.schema.spec.ts`.
- Twilio Verify не используется намеренно: ТЗ требует хранить хеш кода у
  нас (01 §10.6), а Verify кода не отдаёт. Используется Twilio Messages
  API (решение этапа 1.4, docs/CHANGELOG.md).
- Stripe/S3/FCM переменные пока только проверяются по формату — код,
  который их читает, появится на своих этапах.
