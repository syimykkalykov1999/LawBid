---
name: test-phase-plan
description: Owner's plan 2026-10-28 for the test phase — deploy now, owner tests phones, I load-test on the Linux laptop, agents keep fixing; NO device rebuilds until the owner says (batch his fixes, one final build)
metadata:
  type: project
---

Owner 2026-10-28 ~02:10: after this deploy he tests the app on his phones; I run load tests (1M / 10M users and up) on his Linux laptop (ssh sima@<laptop ip>); agents keep working on the admin and his other requests. He sends bugs/changes as he finds them; I collect them, agents fix and merge, but I do NOT rebuild/install on the phones each time (costs tokens) — one final batched build later, when he says.

**Why:** «не хочу терять много токенов когда ты сборку делаешь и вставляешь на устройство».

**How to apply:** keep a running list of his phone-test findings in NEXT_CLAUDE_START_HERE.md; fix via PRs; deploy server-side fixes as they merge (with his Approve); device build only on his word. Related: [[device-build-entrypoint]], [[working-not-just-code]].
