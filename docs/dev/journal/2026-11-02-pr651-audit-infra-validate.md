# 2026-11-02 · Аудит предусловий, часть 4: terraform fmt + validate в CI

Нашли: ничего не проверяло синтаксис `.tf` до платного load-test, ночного drift или apply из админки. Два файла (`modules/ecs/main.tf`, `modules/stack/main.tf`) были не отформатированы.

Сделали: `terraform fmt -recursive` (только пробелы), workflow `infra-validate.yml` (fmt -check + `init -backend=false` + `validate` для 5 корневых модулей, на PR с `infra/**`). Не обязательная проверка: провайдеры качаются из публичного реестра.

Не проверено в облаке: сам `validate` (реестр провайдеров недоступен из этой среды), проверит CI этого PR.

PR #651. Доп. по code-review: общий кэш провайдеров, `apps/status-page/**` в paths, строка в README workflows. Не сделано: lock-файлы провайдеров для loadtest/bootstrap, динамический поиск корней (`infra/modules/org-guardrails` не корень).

По /simplify (4 агента): установка Terraform через уже закреплённый в репо `hashicorp/setup-terraform` (как infra-apply/drift) вместо ручного curl; корневые модули ищутся глобом `infra/envs/*/ infra/bootstrap*/` (новый корень не пропускается); шапка workflow сокращена. Не делаем: общий composite для остальных ручных установок в load-test*.yml, матрица по корням (параллель), actions/cache для провайдеров (нужны lock-файлы).
