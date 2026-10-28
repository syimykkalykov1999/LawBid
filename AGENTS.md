# Rules for every AI agent, helper and session working on LawBid

**Start with [`docs/dev/PROJECT_MAP.md`](docs/dev/PROJECT_MAP.md) — the current plan and state. Work from the map, not from old chat transcripts.**

## RULE #1 — THE MOST IMPORTANT RULE (owner, 2026-10-28)

**Do not invent the alphabet when a ready language exists.**

- If a proven, widely used open-source solution exists, **take it as is** (as close to verbatim as possible) instead of writing our own. This applies to the whole system: app, server, admin, infrastructure. It applies above all to the areas that keep breaking: calls, reels/video, uploads, push notifications, navigation/back/keyboard, search, caching, cost and speed.
- **Our look stays ours.** Only the screens' appearance and the things nobody else has are written by us. The internals come from the proven source.
- **Licenses:**
  - MIT / Apache-2.0 / BSD: copy whole. Keep the copyright and license notice in `THIRD_PARTY_NOTICES`. That is all the license asks.
  - GPL / AGPL / closed code (e.g. Signal, Element): **never copy, not even "slightly changed"**. Small edits do not make it ours, and a court compares substance. Read for the idea only, write our own code, and test it against the same cases.
- **From now on we only copy.** Writing our own code is FORBIDDEN by default. If no proven source exists anywhere in the world, STOP and ask the owner first. Write own code only after the owner explicitly says yes.
- **Both platforms:** the rule applies equally to iPhone (Swift/iOS) and Android (Kotlin) native code, not only to Flutter/Dart.
- **GPL / AGPL / code that forces us to open our source:** never copy it. Study it and build exactly the same behaviour for us, in our own code. Do not invent: follow the studied reference step by step.
- **Safety of copied code:**
  - Take it only from the official repository, at a pinned release tag or commit.
  - Record the URL and commit in a `docs/dev/<AREA>_REFERENCE_<date>.md` file, together with a list of every mismatch against our code.
  - Read every copied file: no obfuscation, no calls to unknown hosts, no install scripts.
  - Prefer depending on the published package (pinned version and lockfile) over copying.
  - Run gitleaks and a dependency audit.
- **Before building anything:** search GitHub and the docs for the proven way first, and write down which reference you follow.

**Why:** we kept hitting the same bugs and spending tokens on rewrites of our own inventions, especially in calls. The owner had asked from the start to take proven solutions.

## Rule #2 — Light on phones and server
Every feature must not heat, crash or drain user phones. It must keep server load and cost minimal: bytes go straight to storage and the server never proxies files. Quality stays at Instagram level.

## Rule #3 — Known errors
Before any change, PR or deploy, read [`docs/dev/KNOWN_ERRORS.md`](docs/dev/KNOWN_ERRORS.md). Append every new cause of a red PR, failed deploy or prod outage there in the same hour.

Put these rules in every subagent / helper prompt.
