---
name: scaling-principle
description: Owner's core infra rule — cheapest start, auto up/down by usage, raisable ceilings in admin, everything ready now for split or upgrade
metadata:
  type: project
---
Owner 2026-10-24: for EVERY component (app servers, DB, pooler, Redis, search, calls, media and anything new):
- start at the cheapest size;
- grow AND shrink automatically with usage, so we never pay for empty capacity;
- the ceiling can be raised in the admin;
- the move to bigger, split or cluster setups must be prepared NOW, so later it is a switch or button in the admin (or automatic), never a code change.
**Why:** there are no users or data yet, so it is easy now and painful later.
**How to apply:**
- check new components against this rule;
- the remaining gaps are tracked in [[release-checklist-2026-10-24]]: DB split button (steps 6-10), Redis cluster-mode readiness, search switch, an admin «Масштаб» overview.
Related: [[prod-state-2026-10-24]]
- 2026-10-25 owner (applies to EVERY feature, not only servers): maximum automation. Build the code fully now; if not needed at start it ships OFF / at zero and turns on by itself on a signal, or by one admin button. If something truly cannot be automated or put in the admin, write a plain description of what, why and how (runbook). Goal: ready for any outcome in code and logic, everywhere, "все до единого".
- 2026-10-25 owner: even when a thing cannot be automated or put in the admin, the CODE must still be fully prepared now (plus the plain instruction), so nobody has to open the project and write code later. Do everything on my side, every item.
- 2026-10-25 owner: every manual step gets a guide on the admin «Инструкции» page: plain Russian, external button/menu names in ENGLISH exactly as on the site, official links, cost, time, how to check (which «Запуск» light turns green). New manual steps must add a guide there.

- Owner 2026-10-25 (angry): never propose "turn X off at launch" as a cost fix. Everything starts at the cheapest state and switches itself ON when a signal says so and OFF again when it fades (DB/Redis autoscale, worker by queue depth, endpoints by NAT traffic). A fixed "off by default until someone presses" is NOT acceptable where an automatic trigger is possible.
- Redis → Valkey decision 2026-10-25: Valkey (Redis 7.2 fork, same commands, ~20 % cheaper on ElastiCache) chosen, but only after a loadtest-stand run (queues, sockets, failover); prod switch is one tfvars line; stay on Redis if the stand shows problems.
- Owner 2026-10-25 (cost gate): every new billable thing (AWS resource, vendor call, sidecar, canary, pipeline) starts OFF or auto-triggered, has an admin switch/ceiling, is under budget alarms/caps, and the PR lists its cost at launch and at 1M users. No surprise bills. A scout round "what we added that can bill" runs after merges and feeds the admin «Расходы» page.
- Owner 2026-10-25: he must SEE in the admin («Расходы») every billable item with real monthly numbers, its state (off/on/auto), whether it is useful now, and step-by-step how to switch it on/off. Pay nothing for emptiness at launch. Package COST-REGISTRY (queue 1q) + CI check that every billable resource/vendor has a registry entry.
- Owner 2026-10-25: deliver a COST LADDER (docs/runbooks/COST_LADDER.md + admin «Расходы»): day-1 cost line by line, owner-switchable items with price/purpose, auto-switching items with the user/load trigger and price, totals at 1k/10k/100k/1M users.
- Owner 2026-10-25: every automatic/billable thing has a 3-state admin control Выкл / Вкл / Авто (+ ceiling); Авто stays the default and must keep working; the owner can override either way.


Owner clarification (2026-10-26): the rule is "nothing is turned ON before launch" (not "nothing is turned off"): every growth/billable feature stays OFF by default, with a 3-state admin control Выкл/Вкл/Авто and a guide in admin «Инструкции»; it turns on automatically by a growth signal, or by the admin button, or by following the guide — only when actually needed.
