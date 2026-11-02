# 2026-11-02 · Аудит предусловий, часть 3: ранние проверки в CI и деплой-скриптах

Что нашли (аудит CI/AWS): секреты не проверялись до дорогих шагов (WASM-сборка 30 мин, платный load-test); `run-migrations.sh` искал запущенную миграцию по семейству С номером ревизии, список всегда пуст, защита от двух миграций не работала; `current-tag.sh` мог записать `api_image = "None"` в tfvars.

Что сделали: `scripts/ci/require-secrets.sh` (+ тест, в «Repo guards») первым шагом в load-test, web-deploy, rollback; правка семейства в `run-migrations.sh` (проверка недоступна → стоп, не миграция вслепую); web-rollback тоже проверяет секреты; `current-tag.sh` падает на пустом/None.

Не сделано: проверка образа при ручном Deploy с `image_tag` (deploy.yml, отдельный деплойный PR); `terraform validate` в CI; lock-файлы провайдеров для bootstrap/loadtest.
