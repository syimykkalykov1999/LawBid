# 2026-11-02 · Аудит предусловий, часть 4: terraform fmt + validate в CI

Нашли: ничего не проверяло синтаксис `.tf` до платного load-test, ночного drift или apply из админки. Два файла (`modules/ecs/main.tf`, `modules/stack/main.tf`) были не отформатированы.

Сделали: `terraform fmt -recursive` (только пробелы), workflow `infra-validate.yml` (fmt -check + `init -backend=false` + `validate` для 5 корневых модулей, на PR с `infra/**`). Не обязательная проверка: провайдеры качаются из публичного реестра.

Не проверено в облаке: сам `validate` (реестр провайдеров недоступен из этой среды), проверит CI этого PR.
