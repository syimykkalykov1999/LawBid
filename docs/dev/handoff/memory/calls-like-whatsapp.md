---
name: calls-like-whatsapp
description: "Owner's final decision 2026-10-26: audio and video call screens must copy WhatsApp exactly, every detail; no custom layouts, carousels or variants until after release"
metadata:
  type: feedback
---

Owner (2026-10-26, after reviewing several mockups and an interactive prototype): «сделай как в вацапе точь в точь, всё до единого! Заебался выбирать, выдумывать макет. Быстрее завершим и сделаем релиз, потом с обновлением может сделаем другой макет».

**Why:** choosing between custom designs cost hours and blocked the release; WhatsApp's call UI is the known-good reference he trusts.

**How to apply:** for any call-screen work (1:1/group, audio/video, minimised call, incoming on locked screen) copy WhatsApp's current iOS/Android behaviour and look exactly; do not propose variants or mockups unless he asks after release. Functional fixes (hang-up bug, auto-end alone, Cloudflare primary + failover, CallKit) stay. See [[ui-frozen]], [[cosmetics-backlog-2026-10-22]].

**Auto-end rule (owner, 2026-10-26 06:45):** 1:1 call ends immediately when the other party leaves (as WhatsApp); group call keeps the 3-second auto-end when you are the last one (owner chose this over WhatsApp's "stay alone until you hang up").

**Never again (owner, 2026-10-26 09:20):** the double-listener bug — two CallKit handlers made iPhone drop the call on «Ответить», and Samsung kept ringing after the caller cancelled. Any calls change must keep exactly one CallKit/ConnectionService event subscriber (architecture test) and must have regression tests for: iOS answer keeps the call; remote cancel stops the Android ring at once; iOS cancel push stops CallKit ringing at once.
