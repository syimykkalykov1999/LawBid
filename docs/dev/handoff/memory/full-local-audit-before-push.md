---
name: full-local-audit-before-push
description: Owner rule 2026-10-27 — every helper runs the full CI-equivalent audit locally before ANY push; one push, one CI run; no fix-push-fail cycles
metadata:
  type: feedback
---

Before any push, a worker must run locally what CI runs: full typecheck + lint (api, admin), all API e2e shards + two-databases + unit (commands/env from .github/workflows/api-ci.yml), oasdiff breaking via the same docker call against origin/main, the N-1 script when migrations changed; mobile only by diff inspection (no local Flutter). Everything found goes in ONE push. Put this rule (it is in WORKER_BUILD_RULES.md) into every helper brief.

**Why:** 2026-10-27 ~03:20 the owner, after 8 h of merge cycles, said «каждый раз какая-то ошибка выходит… сделай полный аудит… чтобы меня эти ошибки больше не заёбывали» — every CI-discovered failure costs him an hour and tokens.

**How to apply:** also when I push myself. Prefer a union/batch branch over per-PR re-merges when many PRs touch shared files ([[owner-working-rules]], [[mac-safety-limits]] for running heavy suites one at a time).
