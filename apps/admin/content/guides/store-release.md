---
id: store-release
title: Выпустить приложение в App Store и Google Play (порядок действий)
category: launch
cost: Аккаунты уже оплачены (Apple 99 долларов в год, Google 25 долларов разово); сам выпуск бесплатный
time: Первый раз 1-2 рабочих дня плюс проверка магазинов 1-7 дней; потом 2-3 часа на релиз
runbook: STORE_RELEASE.md
verified: 2026-10-27
sources:
  - Репозиторий: docs/runbooks/STORE_RELEASE.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/STORE_RELEASE.md
  - Репозиторий: docs/store/RELEASE_CHECKLIST.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/store/RELEASE_CHECKLIST.md
  - Apple: App Store Connect Help | https://developer.apple.com/help/app-store-connect/
  - Google: Play Console Help | https://support.google.com/googleplay/android-developer/
  - Flutter: Build and release an Android app | https://docs.flutter.dev/deployment/android
  - Flutter: Build and release an iOS app | https://docs.flutter.dev/deployment/ios
---

## Что это и зачем

Мобильное приложение попадает к людям через два магазина: App Store (iPhone) и Google Play (Android). В каждый нужно загрузить собранный файл приложения, заполнить анкеты (какие данные собираем, возрастной рейтинг, скриншоты, тексты) и отправить на проверку. Эта инструкция про порядок действий на вашем Mac. Ответы для анкет, рейтинг и демо-коды для проверяющих уже собраны в `docs/store/RELEASE_CHECKLIST.md`.

Главное правило: собирать приложение один раз, в самом конце, когда боевой сервер уже отвечает по адресу `https://api.lawbid.dev/api/v1/health`. Номер сборки ставится сам, руками его не меняют.

## Что понадобится

- Mac с Flutter (stable), Xcode, CocoaPods, JDK 17, Android SDK, Ruby. В папке `apps/mobile` один раз: `git pull`, `flutter pub get`, `dart run build_runner build --delete-conflicting-outputs`, `bundle install`.
- Файлы, которых нет в репозитории (они секретные): `config/prod.json` с живым публичным ключом Stripe (`pk_live_...`) и ссылкой Sentry; `google-services.json` и `GoogleService-Info.plist` из консоли Firebase; ключ APNs (пуши iPhone), загруженный в Firebase → **Cloud Messaging**.
- Ключ загрузки для Android (создаётся один раз, хранится вечно) и файл `android/key.properties` с путём к нему и паролями. Храните резервную копию ключа и паролей в менеджере паролей.
- Скриншоты: iPhone 6.9 дюйма (1320×2868) и Android (1080×1920 и больше), иконка 512×512 и баннер 1024×500 для Play.
- Два демо-кода (клиент и юрист) из админки для проверяющих магазинов.

## Шаги

1. **Android, ключ загрузки** (один раз): `keytool -genkey -v -keystore ~/lawbid-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`. Создайте `apps/mobile/android/key.properties` по образцу из runbook.
2. **Android, сборка**: в `apps/mobile` выполните `flutter build appbundle --release --flavor prod -t lib/main_prod.dart --obfuscate --split-debug-info=build/symbols/android --dart-define-from-file=config/prod.json`. Файл появится в `build/app/outputs/bundle/prodRelease/`. Без ключа загрузки сборка сразу остановится: это защита.
3. **Play Console**: создайте приложение «LawBid» (English (US), бесплатное, США). При первой загрузке включите **Play App Signing**. **Testing → Internal testing** → загрузите `.aab`, добавьте себя тестером, установите по ссылке и пройдите проверки из RELEASE_CHECKLIST, раздел 2. Заполните **Data safety**, рейтинг, категорию, тексты из `store/listing-en.md`, скриншоты. Потом **Production → Create release** → отправить на проверку.
4. **iOS, подготовка**: Apple Developer → **Identifiers** → App ID `com.lawbid.lawbid` с возможностями **Push Notifications** и **Associated Domains**. App Store Connect → **New app** (LawBid, SKU `lawbid`, English (U.S.)). Числовой Apple ID приложения впишите в `APP_STORE_ID` в `config/prod.json`.
5. **iOS, сборка**: в Xcode откройте `ios/Runner.xcworkspace` → Runner → **Signing & Capabilities** → ваша команда, галочка **Automatically manage signing**. Затем `flutter build ipa --release --flavor prod -t lib/main_prod.dart --obfuscate --split-debug-info=build/symbols/ios --dart-define-from-file=config/prod.json --export-options-plist=ios/ExportOptions.plist`.
6. Загрузите `.ipa` через приложение **Transporter** (или Xcode → **Window → Organizer → Distribute App**). Через 10-30 минут сборка появится в **TestFlight**: установите себе и пройдите те же проверки.
7. В App Store Connect заполните версию: тексты, скриншоты, **App Privacy**, рейтинг, заметки для проверяющих с демо-кодами, ссылки на политику и поддержку, выберите сборку → **Submit for Review**.
8. Отчёты о сбоях: после каждой сборки загрузите символы в Sentry командой `SENTRY_ORG=… SENTRY_AUTH_TOKEN=… dart run sentry_dart_plugin` (вместо многоточий — имя организации и токен) (или собирайте через `bundle exec fastlane android build` / `bundle exec fastlane ios build`, они делают это сами). Папку `build/symbols/` каждой сборки сохраняйте.
9. После одобрения выпускайте постепенно: инструкции «Постепенный выпуск в App Store (за 7 дней)» и «Постепенный выпуск в Google Play (staged rollout)».

## Как проверить

- В Play Console у релиза статус «Available on Google Play», в App Store Connect «Ready for Sale».
- Приложение скачивается из обоих магазинов, вход по телефону работает, пуши приходят.
- В Sentry проект `lawbid-mobile` показывает читаемые стеки (символы загружены). В админке **Система → Вылеты** нет новых ошибок после выпуска.
- На **Система → Запуск** строки про магазины зелёные.

## Частые ошибки

- Личный аккаунт разработчика Google, созданный после ноября 2023: перед Production нужен закрытый тест (12 тестеров, 14 дней). У аккаунта организации такого требования нет.
- Архив iOS не подписывается: в профиле нет **Associated Domains** или **Push Notifications**. Включите их на App ID и пересоберите.
- Play отклоняет файл как debug-подписанный: не найден ключ загрузки. Проверьте `key.properties`.
- Сборка собрана до того, как сервер отвечает: приложение у проверяющих не войдёт. Сначала сервер, потом сборка.
- Потеряли ключ загрузки Android: с Play App Signing его можно перевыпустить через поддержку Google, но это недели. Храните копию.
