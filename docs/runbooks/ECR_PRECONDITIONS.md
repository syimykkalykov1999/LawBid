# Образы в ECR: что должно существовать до запуска

Аудит 02.11.2026: пробный load-test (#605) падал два раза до начала теста: сначала не было тегированного
образа, потом не было репозитория `lawbid-pgbouncer`. Дальше его ждал бы третий провал: он просил тег
`lawbid-clamav:1.4`, а «Mirror ClamAV» кладёт `1.4-debian`.

## Что откуда берётся

| Репозиторий ECR | Кто создаёт репозиторий | Кто кладёт образ | Какие тесты/запуски его требуют |
|---|---|---|---|
| `lawbid-api`, `lawbid-admin` | `infra/bootstrap` | `deploy.yml` (тег = SHA коммита) | Deploy, Rollback, Load test |
| `lawbid-pgbouncer` | `infra/bootstrap` | «Build PgBouncer», тег `1.24.0-1` | Load test, прод при `db_pooler_enabled` |
| `lawbid-clamav` | `infra/bootstrap` | «Mirror ClamAV», тег `1.4-debian` | Load test, прод (ARM64) |

Роли workflow не умеют создавать репозитории (нет `ecr:CreateRepository`, так задумано: репозитории с
неизменяемыми тегами и сканом при загрузке живут в Terraform). Поэтому **репозиторий создаёт только
`infra/bootstrap`**.

## Как теперь падает, если чего-то нет

`scripts/ci/require-ecr.sh` проверяет репозитории и теги за секунды, до сборки и до траты денег, и пишет
точное действие:

* нет репозитория → «создать через `infra/bootstrap`» или одной командой только недостающий репозиторий
  (команда в тексте ошибки);
* нет тега → «запустить workflow …» (названо какой).

Где стоит проверка: начало «Load test» (все четыре образа сразу), «Build PgBouncer» и «Mirror ClamAV»
(репозиторий, до сборки/копирования). Тест скрипта и сверка тегов `load-test.yml` с умолчаниями
`build-pgbouncer.yml` / `mirror-clamav.yml`: `bash scripts/ci/require-ecr.test.sh` (идёт в «Repo guards»).

## Если репозитория нет (как было с `lawbid-pgbouncer`)

Только недостающий репозиторий, с теми же настройками, что в `infra/bootstrap/main.tf`
(`aws_ecr_repository.app`: теги неизменяемые, скан при загрузке). Не `apply` всего bootstrap с чужого
компьютера: его состояние Terraform хранится локально.

```
aws ecr create-repository --repository-name lawbid-pgbouncer \
  --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true
aws ecr put-lifecycle-policy --repository-name lawbid-pgbouncer --lifecycle-policy-text file://policy.json
```

Правила очистки (`policy.json`) скопировать из `aws_ecr_lifecycle_policy.app` там же. Когда bootstrap
когда-нибудь будет применяться, созданный вручную репозиторий сначала импортировать:
`terraform import 'aws_ecr_repository.app["lawbid-pgbouncer"]' lawbid-pgbouncer`.
