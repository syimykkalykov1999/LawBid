# 2026-11-02 · Аудит предусловий, часть 1: образы ECR

PR: см. ветку `claude/project-thread-ok6gzk`. SHA слияния: дописать после слияния.

Что нашли: load-test просил `lawbid-clamav:1.4`, которого не кладёт ни один workflow (Mirror ClamAV кладёт `1.4-debian`), то есть третий запуск упал бы уже в ECS, когда деньги потрачены. Репозиторий ECR, отсутствие которого «читалось как нет тега» в Build PgBouncer / Mirror ClamAV, обнаруживался только после сборки.

Что сделали: `scripts/ci/require-ecr.sh` (+ тест, сверка тегов), вызов в load-test, Build PgBouncer, Mirror ClamAV; `docs/runbooks/ECR_PRECONDITIONS.md`.

Не сделано и почему: автосоздание репозитория из workflow: у роли нет `ecr:CreateRepository`, а выдать его значит применять bootstrap (состояние локальное, только владелец).
