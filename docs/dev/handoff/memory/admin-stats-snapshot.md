---
name: admin-stats-snapshot
description: "Owner rule: admin counters/statistics must never query big tables live or cost money; one nightly snapshot, admin reads only the snapshot, CI guard against live heavy queries in admin code"
metadata:
  node_type: memory
  type: feedback
  originSessionId: fbc245b1-1347-4f6e-97bd-ab5ade6c3435
  modified: 2026-10-25T22:48:56.526Z
---

Owner (2026-10-26): "чтобы эти данные не загружали наши сервера и базы и чтобы из-за них не приходили суммы… чтобы я потом не жалел, что сделал эти счётчики в админке — там много чего есть".

**Why:** admin pages were adding live count/groupBy/raw SQL over users, messages, payments on every open; at scale that is DB load and (on a replica/metrics) money.

**How to apply:** every admin number comes from the ADMIN STATS SNAPSHOT (apps/api admin-summary cache, nightly cron, small table), manual refresh at most once per 10 min, reltuples estimates for raw totals, statement_timeout on snapshot queries, replica when enabled; an architecture spec fails CI if admin code queries big tables live. No CloudWatch/custom metrics for admin stats. See [[working-not-just-code]], [[scaling-principle]].
