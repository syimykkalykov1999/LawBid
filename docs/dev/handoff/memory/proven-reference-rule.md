---
name: proven-reference-rule
description: "Owner rule 2026-10-28 — fragile areas (calls, reels/video, uploads, push, navigation/keyboard) must copy proven MIT/Apache open-source internals; our look stays"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6d6b8c8c-3cb5-4d35-85a9-f97482dd18a3
  modified: 2026-10-28T13:59:24.575Z
---

For any area that keeps breaking (calls, reels/video player, uploads, push notifications, navigation/back/keyboard insets, search): keep OUR UI exactly, but take the internal logic from a proven open-source implementation as close to verbatim as possible instead of inventing our own. Only MIT/Apache-2.0/BSD code may be copied (keep notices in THIRD_PARTY_NOTICES); GPL/AGPL (Signal, Element) read for ideas only. Official repo, pinned tag/commit recorded, every copied file read (no obfuscation, unknown hosts, install scripts), prefer a pinned published package over copying, gitleaks + dependency audit.

**Why:** owner 2026-10-28: «почему натыкаешься на одни и те же грабли» — calls broke repeatedly from patching symptoms; «так и сделай везде со всеми где так часто ломаются».

**How to apply:** every worker brief for these areas starts with a reference doc (docs/dev/*_REFERENCE_*.md) listing mismatches vs ours, then ports. Related: [[calls-like-whatsapp]], [[device-and-server-light]], [[ui-frozen]].

**Extended 2026-10-28 (owner):** same rule for caching, cost and speed everywhere — use proven open-source patterns/packages (HTTP/image/video disk caches, stale-while-revalidate, ETags/CDN cache headers, Redis caching, query batching) instead of home-made ones.

**Owner final decision 2026-10-28:** no rewrite/new repo. Finish THIS project item by item; only copy+adapt proven open-source (safety-checked); own code only when nothing exists anywhere, then to the limit with 1B-user tests.

**2026-10-28 add:** applies to iOS and Android native code too. GPL/AGPL/"open your code" licences: never copy — study and rebuild the same behaviour exactly, no inventing.

**2026-10-28 add:** only copy from now on. Own code forbidden unless nothing exists anywhere AND owner explicitly approves after being asked.

**2026-10-28 add (owner, angry, important):** breakage is caused by my half-working code mixed with copied fragments. Take proven implementations WHOLE, delete our replaced code, connect only at edges; never patch copied code with our own fixes.
