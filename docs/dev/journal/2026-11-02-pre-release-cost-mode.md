# 2026-11-02 — Экономный режим до релиза
Профиль `pre-release.tfvars.example` (Redis 1 узел, автомасштаб Redis выкл, `database_multi_az=false`) и runbook `docs/runbooks/pre-release-cost-mode.md` с командой для RDS и чек-листом возврата. Экономия ≈ $1,6/сутки. Не применено: apply делает Мак-тред после слияния и одобрения владельца. WAF, NAT, метрики не тронуты.
