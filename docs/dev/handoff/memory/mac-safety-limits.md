---
name: mac-safety-limits
description: "Hard limits after the Mac froze and rebooted on 2026-10-26 with 21 helpers — max 6 helpers, one heavy lane unless RAM ≥ 60 % free, RAM watchdog stops launches below 40 % free, pause on the owner's word"
metadata:
  node_type: memory
  type: feedback
  originSessionId: fbc245b1-1347-4f6e-97bd-ab5ade6c3435
  modified: 2026-10-26T00:45:58.642Z
---

On 2026-10-26 the Mac (16 GB) froze and rebooted while 21 helper agents + two heavy lanes ran (free RAM fell to 32 %); the whole session and all helpers died. Owner: "следи за маком… ускоряй только до того, насколько может выдержать Mac, и про память не забывай… сделай паузу".

**Why:** a frozen Mac loses everything in flight; speed beyond what the machine holds is negative speed.

**How to apply:** at most 6 helper agents at once (3 if any runs Flutter/Docker builds); heavy queue lane 2 only when free RAM ≥ 60 % (commits ≥ 70 %); before every launch check `memory_pressure` — below 40 % free launch nothing, below 30 % stop the newest helper; never run Terraform, Flutter builds and Jest e2e at the same time; keep MACGUARD running and read it every check; when the owner says pause — launch nothing until he says go. See [[owner-working-rules]], [[model-policy]].
