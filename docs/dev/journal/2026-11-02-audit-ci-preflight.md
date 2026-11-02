# 2026-11-02 · Аудит предусловий, часть 3: ранние проверки в CI и деплой-скриптах

Что нашли (аудит CI/AWS): секреты не проверялись до дорогих шагов (WASM-сборка 30 мин, платный load-test); `run-migrations.sh` искал запущенную миграцию по семейству С номером ревизии, список всегда пуст, защита от двух миграций не работала; `current-tag.sh` мог записать `api_image = "None"` в tfvars.

Что сделали: `scripts/ci/require-secrets.sh` (+ тест, в «Repo guards») первым шагом в load-test, web-deploy, rollback; правка семейства в `run-migrations.sh` (проверка недоступна → стоп, не миграция вслепую); web-rollback тоже проверяет секреты; `current-tag.sh` падает на пустом/None.

Не сделано: проверка образа при ручном Deploy с `image_tag` (deploy.yml, отдельный деплойный PR); `terraform validate` в CI; lock-файлы провайдеров для bootstrap/loadtest.

Дополнение по code-review: stderr успешного `list-tasks` не считается запущенной миграцией (отдельный файл); rollback проверяет `PROD_API_URL`/`PROD_ADMIN_URL` до смены прод-сервисов; web-deploy предупреждает о пустых Firebase web-значениях; необязательные имена в `require-secrets.sh` берутся в кавычки (glob); `current-tag.sh` проверяет вид `<registry>/<repo>:<tag>` + тест `scripts/deploy/current-tag.test.sh` в Repo guards. Не покрыто тестом: `run-migrations.sh` (нужен стенд ECS).

По /simplify: stderr успешного `list-tasks` больше не пишется во временный файл (в `$(...)` попадает только stdout, ошибки остаются в логе job); заглушка aws в тесте `current-tag` без `eval`; слабый тест «value never printed» убран. Не делаем: проверка «имя из require-secrets есть в env: шага» (часть имён берётся из job-env, нужен отдельный тест), перенос оставшихся ad-hoc проверок секретов (mobile-testers, terraform-drift), параллельные вызовы aws в current-tag.
