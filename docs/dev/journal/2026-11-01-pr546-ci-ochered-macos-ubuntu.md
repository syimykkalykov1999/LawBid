# 2026-11-01 · PR #546 + #551 + #534

01.11 Очередь CI: analyze и unit/widget Mobile на ubuntu, macOS только golden и iOS при правке `apps/mobile/**`, таймауты на всех job, watchdog раз в 3 ч, `ci-gate.yml` удалён — PR #546 (SHA слияния дописать). CodeQL/Container scan не на каждый push, гейты деплоя не ждут чужие проверки — PR #551, a7c8254a, влито. Автосборки TestFlight/Play выключены без `vars.MOBILE_TESTERS_ENABLED` — PR #534, 81cefe53, влито.
