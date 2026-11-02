# 2026-11-02 — Terraform: coturn по требованию

PR: ветка `claude/project-thread-z3yhan-turn-tf`. Парный код API — PR #555.

Что: `modules/turn` получил `on_demand` (без Elastic IP, адрес берётся из метаданных при каждом старте, без второго релея, DNS и алармов), `modules/stack` — `turn_on_demand`, IAM `ec2:Start/StopInstances` только на эту машину + `DescribeInstances`, env `TURN_ONDEMAND_INSTANCE_ID` у API. Prod: `turn_on_demand` (по умолчанию false).

Проверка: `terraform` в облаке нет — `fmt/validate/plan` делает Mac-тред. После apply: ОСТАНОВИТЬ машину (`aws ec2 stop-instances`), не удалять; в админке оставить в TURN только secret (urls пусто).
