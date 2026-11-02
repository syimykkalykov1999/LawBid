# 2026-11-02 · Аудит предусловий, часть 5: мобильный релиз

Нашли (аудит мобилки/релиза): секрет `MOBILE_DART_DEFINES_JSON` писался в файл без проверки (пустой/неполный → поздний сбой сборки или сборка с пустыми ключами); `google-services.json` / `GoogleService-Info.plist` в релизный workflow не попадали вообще, Gradle лишь предупреждает, prod-AAB ушёл бы без push и App Check.

Сделали: `scripts/ci/check-dart-defines.sh` (+ тест в Repo guards): обязательны `API_BASE_URL`, `DEEP_LINK_HOST`; Stripe/Sentry/App Store id: предупреждение (владелец заполнит позже). Шаг «Firebase config (prod)» в Android и iOS джобах: на теге/upload без секрета сборка падает, иначе предупреждение.

Не сделано (требует решения/магазинов, отложено владельцем): фиксация Xcode, ручная подпись двух таргетов iOS, targetSdk, SCHEDULE_EXACT_ALARM, version из тега.
