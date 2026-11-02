# Сборка на телефон: никаких дубликатов приложения

**Причина дубликата (проверено по коду):** у flavor `dev` в `apps/mobile/android/app/build.gradle.kts` стоит `applicationIdSuffix = ".dev"` и то же имя «LawBid» — на Android это ВТОРОЕ приложение `com.lawbid.lawbid.dev` рядом с prod `com.lawbid.lawbid`, с той же иконкой и названием. На iPhone так же: dev = `com.lawbid.lawbid.dev`, staging = `com.lawbid.lawbid.staging`, prod = `com.lawbid.lawbid` (ios/Runner.xcodeproj). Каждая dev-сборка с Mac ставилась отдельным приложением и старая копия оставалась.
**Правило сборки на телефон (одна копия, свежий код):**
1. Только flavor `prod`, один id `com.lawbid.lawbid`. Dev/staging на телефон владельца не ставить.
2. Ставить ТОЛЬКО скриптом `scripts/dev/install-phone.sh android <serial>` / `ios <udid>` (он сам удаляет `.dev` и `.staging`, собирает prod и ставит). Вручную то же: перед установкой удалить все остальные id: `adb -s <serial> uninstall com.lawbid.lawbid.dev; adb -s <serial> uninstall com.lawbid.lawbid.staging` (ошибка «not installed» — нормально). Prod поверх prod ставится обновлением (`install -r`), без `pm clear`, данные сохраняются.
3. iPhone: перед первой prod-установкой удалить с экрана старые «LawBid» с bundle id `.dev` и `.staging` (долгое нажатие → Удалить приложение), потом ставить prod. Проверка: на экране ровно одна иконка LawBid.
4. Сборка: `flutter build apk --release --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json`; номер сборки не задавать для dev, только prod.
5. Пока dev-flavor сохраняет суффикс `.dev`, его иконка и имя совпадают с prod — это и есть источник дубля. Решение владельца 01.11: не переименовывать, а всегда ставить одну свежую prod-сборку скриптом.

Скрипт: `scripts/dev/install-phone.sh` (Android: `adb uninstall` для `.dev`/`.staging`, `install -r` prod; iPhone: `xcrun devicectl device uninstall app` для `.dev`/`.staging`, затем установка prod).
