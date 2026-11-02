# 02.11 Резервный coturn по требованию (API)

Сервер coturn стоит выключенным; API запускает его, когда открывается выключатель Cloudflare, записывает адрес, через 30 минут спокойствия и без звонков выключает. Код: `calls/turn-on-demand.ts`, `turn-instance.gateway.ts`, проводка в `calls.service.ts`; тесты `turn-on-demand.spec.ts`. Документ: `docs/runbooks/TURN.md`, раздел «On-demand own coturn».

Состояние: код в PR (ветка claude/project-thread-z3yhan). Не сделано: Terraform (IAM, без EIP, TURN_ONDEMAND_INSTANCE_ID) через Mac-тред; проверка на живом сервере.
