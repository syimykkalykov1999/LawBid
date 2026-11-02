# 2026-11-02 · CI: случайные порты сервисов

Класс ошибки: фиксированные `5432:5432`, `6379:6379`, `1025/8025` и MinIO `:9000` в api-ci.yml. Два job на одном Docker-хосте (раннеры laptop-N, повтор на той же машине) падали на `port is already allocated`.
PR #593. Лечение: сервисы публикуются на случайный host-порт; `scripts/ci/service-env.sh` берёт порты из `job.services.*.ports[...]` и пишет DATABASE_URL/REDIS_URL/SMTP_PORT в GITHUB_ENV; `scripts/ci/start-minio.sh` берёт свободный порт, держит данные и лог в $RUNNER_TEMP и пишет S3_ENDPOINT.
Как у больших: у каждого job своя сетевая среда или динамический порт (GitLab services по алиасу, CircleCI в отдельной сети); мы берём динамический порт, он работает и на GitHub-раннерах.
Не тронуто: e2e-quarantine.yml (ночной, один job), остаётся на 5432.
