---
name: security-principle
description: "Owner 2026-10-26: security must withstand automated AI-driven attackers (assume tireless, unfiltered), closed systemically, yet add zero friction for owner, staff, clients and attorneys; full attack-and-fix review runs LAST, after all merges, local/staging only"
metadata:
  type: feedback
---

Owner (2026-10-26): «чтобы даже ИИ не могли взломать… максимально закрывай все дыры, но не так, чтобы меня ограничивать, или моих сотрудников, клиентов, адвокатов — а так, системно». Also: run the attack-and-fix loop («взламывай, лечи») as the LAST task, after everything is merged and saved; cover all attack kinds (data theft, access bypass, injection, overload/DDoS resilience, payments, admin, cloud IAM) until two clean rounds.

**Why:** he expects AI-driven automated attacks to be the norm; a user-visible hurdle counts as a product defect to him (see [[no-second-admin]]).

**How to apply:** harden server-side and invisibly (authorization on every route, defense in depth, abuse limits tuned so only automated clients hit them, device binding, anomaly scoring, spend caps); never add captchas/extra logins/approvals for legitimate users; test only against local/staging copies, never prod; no real DoS flooding — test resilience and limits instead; each hole gets a regression test + fix PR. See [[owner-working-rules]], [[scaling-principle]].
