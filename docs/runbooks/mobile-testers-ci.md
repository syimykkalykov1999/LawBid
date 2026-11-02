# Сборки на телефоны без Mac (TestFlight + Play Internal)

Каждый push в `main`, который трогает `apps/mobile/**`, запускает **Mobile testers**
(`.github/workflows/mobile-testers.yml`): iOS уходит в TestFlight, Android в Play
Internal testing. На телефоне это обычное обновление. Вручную: Actions -> Mobile testers
-> Run workflow (можно только `ios` или `android`).

Номер сборки автоматический (минуты с 2026-01-01, одинаково на iOS и Android).
`github.run_number` не используем: он намного меньше номеров, которые уже есть в Play.

Все секреты кладём в **Settings -> Environments -> release -> Environment secrets**
(там же, где их ждёт `mobile-release.yml`). В `release` не включайте Required reviewers,
иначе каждая сборка будет ждать нажатия.

## Секреты (названия)

| Секрет | Что это |
|---|---|
| `MOBILE_DART_DEFINES_JSON` | содержимое `config/prod.json` (по образцу `config/prod.example.json`) |
| `GOOGLE_SERVICES_JSON_BASE64` | `google-services.json` prod, в base64 |
| `GOOGLE_SERVICE_INFO_PLIST_BASE64` | `GoogleService-Info.plist`, в base64 |
| `APPLE_TEAM_ID` | `78T56RPM74` |
| `ASC_KEY_ID` | Key ID ключа App Store Connect |
| `ASC_ISSUER_ID` | Issuer ID оттуда же |
| `ASC_KEY_CONTENT` | файл `.p8` в base64 |
| `PLAY_SERVICE_ACCOUNT_JSON` | JSON сервисного аккаунта Google Play (целиком) |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | ключ загрузки Android (или создаётся в CI, см. ниже) |
| `SENTRY_AUTH_TOKEN` (по желанию) + переменная `SENTRY_ORG` | символы для Sentry |
| `GH_SECRETS_TOKEN` (только для создания нового ключа Android) | fine-grained токен GitHub, этот репозиторий, Secrets: Read and write |

Файл в base64 без Mac: на https://www.base64encode.org/ -> Encode files, либо в браузерной
консоли GitHub Codespaces `base64 -w0 файл`. Ключи из Apple/Google в чат не присылать.

## iOS: куда нажать

1. https://appstoreconnect.apple.com -> Users and Access -> Integrations -> App Store Connect API
   -> Team Keys -> «+». Имя `ci`, доступ **Admin** (нужен, чтобы Xcode сам создал
   сертификат распространения). Generate.
2. Скопировать **Issuer ID** (над таблицей) -> секрет `ASC_ISSUER_ID`; **Key ID** -> `ASC_KEY_ID`.
3. Download API Key (скачать можно один раз) -> файл `AuthKey_XXXX.p8` в base64 -> `ASC_KEY_CONTENT`.
4. Сертификаты и профили не нужны: Xcode в CI создаёт «cloud managed» сертификат через этот ключ.
   У Apple лимит 3 сертификата распространения: если ошибка «maximum number of certificates»,
   удалите лишний на https://developer.apple.com/account/resources/certificates/list.
5. TestFlight: приложение -> TestFlight -> Internal Testing -> «+» группа, включить
   **Automatic distribution**, добавить себя. Установите приложение TestFlight на iPhone.
6. `GoogleService-Info.plist`: Firebase Console -> Project settings -> iOS-приложение -> скачать.

## Android: куда нажать

1. Play Console -> Setup -> API access -> Create new service account -> по ссылке в Google Cloud
   создать аккаунт `lawbid-ci` -> Keys -> Add key -> JSON (скачается файл) -> содержимое целиком
   в `PLAY_SERVICE_ACCOUNT_JSON`.
2. Вернуться в Play Console -> Users and permissions -> Invite -> e-mail аккаунта `lawbid-ci`
   -> права на приложение LawBid: Release to testing tracks (+ View app information).
3. Testing -> Internal testing -> Testers: ваш e-mail в списке; открыть ссылку-приглашение один раз
   и принять. Дальше сборки приходят как обновления Google Play.
4. `google-services.json`: Firebase Console -> Project settings -> Android-приложение
   `com.lawbid.lawbid` -> скачать.
5. Ключ загрузки:
   - Есть `lawbid-upload.jks` -> base64 в `ANDROID_KEYSTORE_BASE64` + три пароля/алиас.
   - Файла нет (он остался на Mac): Play App Signing включён (Play Console -> Test and release ->
     App integrity -> App signing; для приложений в магазине он включён всегда), значит ключ
     можно заменить. Создайте токен `GH_SECRETS_TOKEN`, запустите Actions -> **Android upload key
     (one-off)** -> confirm `RESET`. Скачайте артефакт `upload-certificate-PUBLIC`, в Play Console ->
     App signing -> **Request upload key reset** -> загрузить `upload_certificate.pem`. Google
     одобряет примерно за 2 дня; до этого Android-сборки в Play не примет, iOS работает сразу.

Первый запуск — проверка: логи в Actions покажут, какой секрет пуст или чего не хватает.
