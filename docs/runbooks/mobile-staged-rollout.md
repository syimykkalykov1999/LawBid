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
- если пустые секреты подписи (`ANDROID_KEYSTORE_BASE64`, `IOS_CERT_P12_BASE64`), сборка
  по тегу или с `upload=true` **падает**, а не публикует debug-подписанный файл;
- ключ iOS в keychain доступен только `codesign`/`security` (раньше любому приложению).

Честно: lanes `production`/`promote`/`halt` написаны по документации fastlane `supply`,
но без живого Play-аккаунта не прогонялись. Первый настоящий запуск = проверка; запасной
путь: Play Console -> Release -> Production -> Halt rollout / Update rollout.

## fastlane match (вместо p12 в секретах) — план, не включено

`match` хранит сертификаты и профили в зашифрованном приватном git или S3-бакете.
Шаги (Claude проведёт): создать приватный репозиторий `lawbid-certs`, `fastlane match init`,
`fastlane match appstore` один раз на Mac владельца, положить `MATCH_PASSWORD` и
доступ (`MATCH_GIT_BASIC_AUTHORIZATION`) в секреты environment `release`, заменить шаг
«Signing» в `mobile-release.yml` на `bundle exec fastlane match appstore --readonly`.
Пока работает схема с p12, но уже с ограниченным доступом к ключу.

Flutter закреплён в `apps/mobile/.fvmrc` (одно место для всех workflow).
