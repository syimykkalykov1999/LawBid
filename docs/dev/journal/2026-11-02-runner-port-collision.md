# 2026-11-02 · Параллельные systemd-раннеры сталкиваются по портам

Факт: e2e 1/3 на #546 (job 125087679423, laptop-5) упал на `Bind for 0.0.0.0:5432 failed: port is already allocated`.
Причина: laptop-2…5 как systemd-службы делят один Docker; service-контейнеры api-ci.yml публикуют фиксированные порты.
Решение: runbook помечает systemd-вариант «только один раннер», параллель только через `scripts/ci/self-hosted-runner.sh up` (изолированный DinD на раннер).
