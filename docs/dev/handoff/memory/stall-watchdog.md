---
name: stall-watchdog
description: Owner rule 2026-10-27 04:05 — never spin in circles: same failure twice or no progress 60–90 min → change approach, not retry; watch everything that slows the project, not only CI
metadata:
  type: feedback
---

Watch for stalls, not just status: (a) the same failure/blocker seen twice in a row → stop retrying, change the approach (batch/union branch, local full audit, scope a check, ask the owner for the one click only he can do); (b) no merge / no landed step for 60–90 min while work is pending → diagnose the real bottleneck (GitHub queue, conflicts, a helper waiting, Mac limits) and remove it; (c) also watch what slows the project outside CI: queue depth, helpers idle, disk/RAM, missing packages, decisions waiting on the owner — surface those as one concrete request with a Run button, with `-R syimykkalykov1999/LawBid` for gh.

**Why:** 2026-10-26→27 the merge train re-merged 22 PRs one by one for ~8 h (each merge dirtied the rest; CI queue clogged; two N-1 CI bugs) with no landed result; owner: «22 раза повторялся… чтобы проект продвигался… следи не только за прогоном, но и за тем, что тормозит проект».

**How to apply:** in every watch tick check "what changed since last tick"; if nothing landed for >60 min, write the bottleneck + fix in the journal and act. Related: [[full-local-audit-before-push]], [[owner-working-rules]], [[mac-safety-limits]].
