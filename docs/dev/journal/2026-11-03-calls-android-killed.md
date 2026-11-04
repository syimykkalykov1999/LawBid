# 2026-11-03 — Android не звонил при закрытом приложении: сборка без Firebase

PR: см. описание (ветка `claude/calls-android-killed`). SHA слияния: допишется после слияния.

- Причина (на телефоне Samsung R5GL11433DD): APK собран без `google-services.json` (файл в `.gitignore`, плагин стоял на WARN). Firebase не запускался, токена FCM нет, журнал FCM Google Play пуст для com.lawbid.lawbid. Код сервера и приложения правильный.
- Владелец/диспетчер пересобрал APK с файлом в 17:12, в logcat «FirebaseApp initialization successful».
- Защита: prod release без файла падает (Gradle `missingGoogleServicesStrategy = ERROR` для `*ProdRelease*`, Xcode-фаза — `exit 1` для `Release-prod` без `GoogleService-Info.plist`); пробная сборка CI без секрета — `LAWBID_ALLOW_NO_FIREBASE=1`.
- Тесты: `fcm-push.collapse.spec.ts` (форма FCM-пуша звонка), `android_killed_ring_test.dart` (обработчик в фоне показывает экран звонка; prod-сборка требует Firebase).
- KNOWN_ERRORS №47.
