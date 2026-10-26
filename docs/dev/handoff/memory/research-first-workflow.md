---
name: research-first-workflow
description: "Owner's mandatory flow for every LawBid request: research how others build it, Q&A, then design, only then code"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7d021279-2390-4840-af87-dda91c51e1ba
  modified: 2026-10-22T01:56:52.855Z
---

Owner rule (2026-10-21) for every request:
1. Don't touch code first. Study the request.
2. Research how proven projects do it (GitHub, official docs, other trusted sources); look at their architecture.
3. If anything is unclear, run a question-and-answer round with the owner and get exact data.
4. Design our architecture from that, built to scale (100k → millions of users), then code.
5. If a skill / plugin / subagent from a trusted source (GitHub, official marketplaces) would make the work easier, install it myself.
6. Spend few tokens, but the result must be strong, working code.

**Why:** in the past, rushing straight into code caused bugs that took hours or days to fix; the owner doesn't want to repeat that.
**How to apply:** research → Q&A → plan → code → check → commit/merge, for every task. Related: [[owner-working-rules]].
- 2026-10-25 owner: prefer proven ready-made solutions (maintained OSS libs, AWS/Cloudflare managed features, official tools) and configure/extend them for us; write own code only where no good ready solution exists; never just code blindly. Put this in every worker brief.

- Owner 2026-10-25: if a skill, agent, plugin or tool is needed to finish the project, search for it and install it yourself (trusted sources only), do not wait to be asked.
- Owner 2026-10-25 (re-confirmed, "work like a real dev team with superpowers"): research primary sources → compare → prefer ready-made → plan architecture → TDD → verify → never break; every helper brief carries the TEAM PROCESS section of COMMON_RULES.md and the PR body has a "Research → choice → why" note.


Owner (2026-10-26): research EVERYWHERE, not only GitHub — vendor docs (AWS/Cloudflare/Postgres/Redis/Stripe/Flutter), engineering blogs and postmortems of companies at scale, standards (OWASP/NIST/SRE), plus GitHub "awesome" lists — before building anything, so it is built without mistakes and with a scalable architecture; cite what was followed in the PR.
