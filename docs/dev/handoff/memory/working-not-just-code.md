---
name: working-not-just-code
description: "Owner demands every delivered feature be functionally tested (really works), no dead code; duplicates across the project must be found and removed; load tests at 1M/10M/1B users come last"
metadata:
  node_type: memory
  type: feedback
  originSessionId: fbc245b1-1347-4f6e-97bd-ab5ade6c3435
  modified: 2026-10-25T22:44:06.905Z
---

Owner (2026-10-26): "мне не нужны просто коды, которые будут занимать место — тестируй на работоспособность, чтобы всё работало". Also: "смотри, чтобы где-то не делали дубликаты одного и того же… срабатывая оба сразу, не ломали что-либо; убери лишние старые дубликаты". AWS load tests at 1M / 10M / 1B users are done only after everything else is finished.

**Why:** many helpers worked in parallel over several sessions; code that merges green but is never exercised, or two jobs doing one thing, is waste or a double-action risk for him.

**How to apply:** every package ends with a functional smoke (boot API/admin/app locally, exercise the feature, not only unit tests); before adding a job/setting/card/endpoint grep for an existing one and extend it; run a duplicate audit (scratchpad/DUPLICATES.md pattern) before release; anything new that is cron-like must be daily/cheap unless the product needs more. See [[owner-working-rules]], [[scaling-principle]].
