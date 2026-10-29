## RULE #1 — MOST IMPORTANT (owner 2026-10-28)
Do not invent the alphabet when a ready language exists: take proven open-source solutions as is (MIT/Apache/BSD copy whole + THIRD_PARTY_NOTICES; GPL/closed = idea only, own code). Only our look is ours. Full text: AGENTS.md. From now on ONLY copy; own code is forbidden unless no source exists anywhere AND the owner explicitly said yes. Put this rule FIRST in every subagent prompt.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## Known errors (owner rule 2026-10-28)
- Before any change, PR or deploy read `docs/dev/KNOWN_ERRORS.md` (and local `WORKER_BUILD_RULES.md`). Every new cause of a red PR, failed deploy or prod outage is appended there the same hour, before the fix is relaunched. Put this rule in every subagent prompt too.
