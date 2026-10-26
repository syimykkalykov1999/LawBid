---
name: prod-state-2026-10-24
description: Prod AWS state after the 2026-10-24 reliability applies; what is done and what is left before release
metadata:
  type: project
---
Done on 2026-10-24 (owner pressed Run on reviewed saved plans):
- Redis has a replica; WAF, GuardDuty, CloudTrail, security baseline, KV store, CORS applied.
- 12 SLO burn alarms + 6 composites created (fix: MAX floor `total * 0`, PR #297).
- RDS: backups 14 days; Multi-AZ PENDING for the maintenance window sun 04:30-05:30 UTC (no apply_immediately).
- TURN: two t4g.small relays, primary EIP 32.192.170.198 (us-east-1a), second 98.95.110.148 (us-east-1b). No turn.lawbid.dev DNS at Namecheap, so admin TURN urls must list both IPs.
- Prod tfvars re-uploaded to Secrets Manager lawbid-prod/terraform-tfvars after turn_second_enabled.
- Load-test profile tfvars were never in git (infra/.gitignore *.tfvars); recreated in PR #297.

Left: admin TURN urls with both IPs; ECS ceiling 50/20 via admin «Экономика»; load tests smoke → m1 → m10 → calls; final builds.
Related: [[owner-working-rules]], [[local-dev-environment]]
Update 2026-10-24 later: Container Insights off; own TURN servers fully removed (turn_enabled=false); calls rely on Cloudflare TURN once the owner enters the key; AWS Backup on; Redis auto-failover on. Spot was NOT applied (it forces an ECS service replacement, so it needs a no-downtime path). Warning: the db_connection_budget check fails (pool 3 x 140 peak tasks > 99 connections on db.t4g.micro), so before scaling past ~16 tasks we need RDS Proxy or a bigger DB.
