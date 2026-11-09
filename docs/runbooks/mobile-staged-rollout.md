# Мобильный релиз по ступеням (S11-12)

Плохую сборку приложения нельзя откатить (она уже у людей), поэтому показываем её
постепенно. Всё запускается вручную: GitHub -> Actions -> **Mobile release** ->
Run workflow, поле `stage`.

| stage | что делает | сборка? |
|---|---|---|
| `internal` (по умолчанию) | собирает и кладёт в Play Internal / TestFlight (`upload=true`) | да |
| `closed` | та же сборка переезжает в закрытое тестирование Play | нет |
| `production` | Play: production на 5 % (`rollout`); App Store: отправка на проверку с 7-дневным поэтапным выпуском (1-2-5-10-20-50-100 %) | нет |
| `promote` | поднимает долю Play до `rollout` (0.2, потом 0.5, потом 1.0) | нет |
| `halt` | останавливает выкатку в Play | нет |

Между ступенями смотрим Sentry / Crashlytics (крэши и ANR). Остановка в App Store:
App Store Connect -> версия -> Pause phased release (API-команды нет).

Правила безопасности:
- сборка по тегу `v*.*.*` ждёт зелёного CI этого коммита;
- если пустые секреты подписи (Android: `ANDROID_KEYSTORE_BASE64`; iOS: `ASC_KEY_ID`, `ASC_ISSUER_ID`,
  `ASC_KEY_CONTENT`, `APPLE_TEAM_ID`), сборка по тегу или с `upload=true` **падает**, а не публикует
  debug-подписанный файл;
- iOS подписывает Xcode через ключ App Store Connect, как в «Mobile testers» (сертификата и профиля в
  runner нет); нужен Xcode 26+ (`scripts/ci/select-xcode.sh`);

Честно: lanes `production`/`promote`/`halt` написаны по документации fastlane `supply`,
но без живого Play-аккаунта не прогонялись. Первый настоящий запуск = проверка; запасной
путь: Play Console -> Release -> Production -> Halt rollout / Update rollout.

## Store release: одна кнопка, без Мака (2026-11-09)

GitHub -> Actions -> **Store release** -> Run workflow. Поля: `platform` (both / android / ios),
`action`, `percent`. Сборка и подпись — тот же «Mobile release» (вызывается из `beta`),
флейвор `--flavor prod -t lib/main_prod.dart`.

| action | Android (Play) | iOS (App Store) |
|---|---|---|
| `beta` | сборка + Internal testing | сборка + TestFlight |
| `release` | Internal -> production 5 %, тексты «Что нового» на всех языках | на проверку, 7-дневный поэтапный выпуск, выходит сам после проверки |
| `rollout` 50 | сначала страж, потом 50 % | сначала страж, потом продолжить паузу (шаги ставит Apple) |
| `rollout` 100 | страж + **подтверждение владельца** (environment `production`), потом 100 % | страж + подтверждение, потом всем сразу |
| `halt` | остановить выкатку | пауза поэтапного выпуска |

**Страж** (`scripts/ci/rollout-guard.mjs`): сравнивает новую версию с прошлой — доля сессий без падений
в Sentry (не ниже 99 % и не хуже прошлой больше чем на 0,5 п.п.) и средняя оценка новых отзывов
(Play — по номеру сборки, App Store — 3 последних дня против 14 до них; падение больше чем на ползвезды).
Хуже — выкатка **останавливается сама**. Мало данных — ничего не меняет. Нет токена Sentry —
отказ (можно `skip_guard`, но не поверх «хуже»). Если переменная репозитория `STORE_WATCH = true`,
страж сам проверяет идущую выкатку каждые 6 часов и останавливает её.

**Тексты «Что нового»** лежат рядом с описаниями магазинов (87 языков Play, 42 App Store):
`android/fastlane/metadata/android/<язык>/changelogs/default.txt` и
`ios/fastlane/metadata/<язык>/release_notes.txt`. Если файла нет, берётся английский текст
из коммитов (feat / fix / perf с прошлого тега). Перевод на все языки: положить файлы в эти папки.

**Подтверждение 100 %** включено по умолчанию: GitHub -> Settings -> Environments -> `production`
-> Required reviewers (владелец). Снять ворота = убрать там проверяющих.

### Шаги владельца один раз
1. **Ключ Google Play (секрета пока нет, Play-шаги падают с этой подсказкой):** Play Console ->
   Setup -> API access -> привязать проект Google Cloud -> Create new service account ->
   в Google Cloud: Keys -> Add key -> JSON -> вернуться в Play Console -> Grant access ->
   роль Release manager (выпуски и страница магазина) для LawBid -> весь JSON вставить в секрет
   `PLAY_SERVICE_ACCOUNT_JSON` environment `release`. Ключ загрузки (upload key) уже есть.
2. Environment `production` с Required reviewers (см. выше).
3. Для стража: секрет `SENTRY_AUTH_TOKEN` (права project:read, org:read) и переменная `SENTRY_ORG`;
   для оценок App Store — переменная `APP_STORE_ID` (номер приложения в App Store Connect).
4. Когда выйдет первая версия: переменная `STORE_WATCH = true`.

Честно: lanes и шаги написаны по документации fastlane (`supply`, `deliver`, Spaceship
`AppStoreVersionPhasedRelease`) и проверены `fastlane lanes` и actionlint, без живой выгрузки.
Первый настоящий запуск = проверка.

## fastlane match (вместо p12 в секретах) — план, не включено

`match` хранит сертификаты и профили в зашифрованном приватном git или S3-бакете.
Шаги (Claude проведёт): создать приватный репозиторий `lawbid-certs`, `fastlane match init`,
`fastlane match appstore` один раз на Mac владельца, положить `MATCH_PASSWORD` и
доступ (`MATCH_GIT_BASIC_AUTHORIZATION`) в секреты environment `release`, заменить шаг
«Signing» в `mobile-release.yml` на `bundle exec fastlane match appstore --readonly`.
Пока работает схема с p12, но уже с ограниченным доступом к ключу.

Flutter закреплён в `apps/mobile/.fvmrc` (одно место для всех workflow).
