# 2026-11-02 · свой раннер для API CI

02.11 Подготовлен (не включён) свой раннер на Linux-ноуте: `api-ci.yml` выбирает раннер по переменной репо `CI_RUNNER` (только PR из этого репо), `scripts/ci/self-hosted-runner.sh up|down|status`, `docs/runbooks/self-hosted-runner.md`. Пока `CI_RUNNER` не `self`, ничего не меняется. Mobile — после слияния #546. PR и SHA слияния дописать.
