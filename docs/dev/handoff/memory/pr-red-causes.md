---
name: pr-red-causes
description: 2026-10-28 list of the recurring reasons PRs went red (analyzer infos, gitleaks fake tokens, ERD, lock_timeout, two-db e2e, stacked base, smoke envelope) — every worker brief must point to WORKER_BUILD_RULES.md §2026-10-28
metadata:
  type: feedback
---

Owner 2026-10-28: «каждый новый PR зависает с ошибками, так не должно быть… запиши эти ошибки, чтобы последующие не повторяли». The full checklist is in WORKER_BUILD_RULES.md section «ПРАВИЛО 2026-10-28». Most frequent: full-app `flutter analyze` (CI fails on infos like require_trailing_commas), gitleaks on fake tokens in tests, ERD not regenerated, migration without `SET LOCAL lock_timeout`, two-db e2e without shard context, stacked PR base not retargeted.

**Why:** each miss costs a ~40-min CI round and the owner watches the PR list.

**How to apply:** whenever a NEW cause of a red PR or failed deploy appears, append it to docs/dev/KNOWN_ERRORS.md (committed, linked from README) AND WORKER_BUILD_RULES.md (numbered) the same hour, before relaunching the fix — owner asked «записывай последующие ошибки». Every worker brief says "follow WORKER_BUILD_RULES.md §2026-10-28 before the single push"; gitleaks is installed on the Mac (/opt/homebrew/bin/gitleaks). Related: [[full-local-audit-before-push]], [[union-waves]].
