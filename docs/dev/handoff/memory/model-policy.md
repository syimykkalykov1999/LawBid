---
name: model-policy
description: Owner rule 2026-10-25 on which model does what — foreman session on Fable, helpers by task difficulty (haiku mechanical, sonnet normal, strong only for hard pieces)
metadata:
  type: feedback
---

Owner 2026-10-25: the foreman session itself works on Fable (he chose it). Helpers (Agent tool) are picked by difficulty: haiku for mechanical work (renames, fixtures, translations, CI log reading), sonnet for ordinary code and merges, a strong model (opus/fable) only for one genuinely hard piece. State the model explicitly in every Agent call.

**Why:** tokens are the owner's money; an earlier session was caught twice running everything on expensive models.
**How to apply:** before each Agent launch decide the tier from the task; never default everything to one model. See [[owner-working-rules]] and [[research-first-workflow]].
