# Поэтапный выход приложения (Google Play и App Store)

## Коротко для владельца (по-русски)

Новую версию не отдаём всем сразу. Сначала 1% людей, смотрим, потом больше.
Если что-то сломалось, останавливаем выход, пока не пострадали все.

1. Сборка и загрузка в магазины, как раньше: workflow **Mobile release**
   (`upload = true`): Play Internal и TestFlight.
2. **Android**: GitHub → Actions → **Mobile rollout** → `platform = android`,
   `step = start`, `percent = 1`. Через день без проблем: `increase` → 10, потом
   50, потом 100. Первый запуск каждого шага делайте с `dry_run = true` (Google
   только проверит, ничего не поменяется), потом то же с `dry_run = false`.
3. **iPhone**: `platform = ios`, `step = submit`, `build =` номер сборки из
   TestFlight. Apple сам раздаёт обновление 7 дней (1, 2, 5, 10, 20, 50, 100%)
   после проверки. Остановить: App Store Connect → приложение → версия →
   **Pause Phased Release**; продолжить: **Resume**; отдать всем сразу:
   **Release to All Users**.
4. **Что смотреть между шагами** (админка): Система → «Здоровье системы»,
   «Вылеты» (раздел crashes), страница статуса. Новых красных нет и вылетов не
   больше обычного: идём дальше.
5. **Плохая версия — стоп**: Android: `step = halt`, `build =` код версии.
   iPhone: Pause Phased Release. Кто уже обновился, остаётся на ней, остальные
   не получат. Дальше выпускаем исправленную версию и снова с 1%.
6. **Принудительное обновление** (только когда старая версия опасна или не
   работает с сервером): админка → Настройки → `min_app_version_android` /
   `min_app_version_ios`. Всё, что старее, увидит экран «Обновите приложение».
   Ставьте номер **только после** того, как новая версия дошла до 100% в этом
   магазине, иначе люди упрутся в экран, а обновления у них ещё нет.
   Мягкое (можно пропустить): `soft_update_version_android` / `_ios`.
7. **Выключить кусок, не трогая магазины**: админка → Флаги (kill-switch функции:
   звонки, истории и т.д.). Работает сразу, без новой версии.

Если что-то не понятно или шаг не сработал, просто напишите, что увидели.

---

## Technical

### Pieces

| What | Where |
|---|---|
| Build + upload to Play Internal / TestFlight | `.github/workflows/mobile-release.yml` (`upload=true`) |
| Staged rollout, both stores | `.github/workflows/mobile-rollout.yml` (manual, `release` environment, `dry_run` default true) |
| Android lane | `apps/mobile/android/fastlane/Fastfile` `rollout` (`upload_to_play_store`: `track_promote_to`, `rollout`, `release_status`, `version_code`, `validate_only`) |
| iOS lane | `apps/mobile/ios/fastlane/Fastfile` `release_phased` (`deliver`: `submit_for_review`, `phased_release`, `automatic_release`, `build_number`) |
| Forced update | `AppVersionGuard` answers 426 `APP_UPDATE_REQUIRED` when `X-App-Version` < `min_app_version_<platform>` (admin: Настройки). Bootstrap also serves `soft_update_version_<platform>`. |
| Feature kill switches | feature flags, admin Флаги (`apps/api/src/modules/feature-flags/flag-catalog.ts`) |

Secrets are the ones the release workflow already uses (`PLAY_SERVICE_ACCOUNT_JSON`,
`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`); no new secret.

### Android: Play staged rollout

Steps: `start` (promotes the build of the Internal track to Production at
`percent`), `increase` / `resume` (set `percent` for `build` = versionCode),
`halt` (`release_status: halted`). `percent` 100 completes the release. The
versionCode is the build number printed in the Play Console release (or in the
release workflow log). A new `start` is refused by Play while another release
is `inProgress` on Production: finish or halt it first.

A halted Play release stops new installs and updates; devices that already
updated keep the version. There is no "rollback" in Play: ship a fixed build
(higher versionCode) and start again at 1%.

First use: run each step with `dry_run = true` (maps to `validate_only`) to
confirm the service account has the rights and fastlane accepts the options
for our fastlane version; then run for real.

### iOS: phased release

`release_phased` submits an existing TestFlight build with phased release ON and
automatic release after approval. Apple's schedule is fixed (day 1 1%, 2 2%, 3 5%,
4 10%, 5 20%, 6 50%, 7 100%) and only applies to automatic updates; anyone can
still get the version by hand from the App Store. Pause (up to 30 days), resume
and release-to-all are App Store Connect buttons; fastlane has no action for them.
The `metadata` lane does not submit; only `release_phased` does.

### Halting a bad release: order of actions

1. Stop the spread: Android `halt`, iOS Pause Phased Release.
2. If the bug is in one feature: switch its flag off (Флаги), no release needed.
3. If the server must refuse the bad build: set `min_app_version_<platform>` to
   the next good version (only after that version is live for everyone, else users
   get a screen with nothing to install). Bad builds then get 426 and the update
   screen.
4. Fix, new build through Mobile release, restart from 1%.

### Sources (checked 2026-10-25)

- fastlane docs, upload_to_play_store (rollout, release_status incl. `halted`, validate_only): https://docs.fastlane.tools/actions/upload_to_play_store/
- fastlane docs, deliver (phased_release, automatic_release, build_number): https://docs.fastlane.tools/actions/deliver/
- Google Android Developers Blog, "Automating your app releases with the Google Play Developer API" (2018): staged rollout as `inProgress` + `userFraction`, halt/resume by status: https://android-developers.googleblog.com/2018/06/automating-your-app-releases-with.html
