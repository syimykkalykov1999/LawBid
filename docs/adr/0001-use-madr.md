---
status: "accepted"
date: 2026-10-25
decision-makers: owner + Claude
---

# Record architecture decisions as MADR files

## Context and problem statement

Decisions live in chat history and in long research docs. A new Claude session or
a new engineer cannot tell which choices were deliberate. How do we keep the "why"?

## Decision drivers

- The owner is not a programmer and re-explaining costs him time.
- Several Claude sessions work in parallel and must not undo each other's choices.
- Low ceremony: one screen per decision.

## Considered options

- MADR 4.0 files in `docs/adr/` (chosen)
- Free-form notes in `docs/architecture/` only
- A wiki outside the repo

## Decision outcome

MADR, because it is plain Markdown in git (reviewed in PRs, found by search),
lean, and actively maintained.

### Consequences

- Good: decisions are reviewed and versioned with the code.
- Bad: someone must remember to write one; the PR checklist in `docs/ONBOARDING.md` says so.

## More information

[README](README.md), [template](0000-template.md), <https://adr.github.io/madr/>.
