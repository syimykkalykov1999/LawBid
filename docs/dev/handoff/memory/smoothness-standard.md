---
name: smoothness-standard
description: "Owner standard 2026-10-26: animations and scrolling in the app and web must feel like Instagram/Telegram/WhatsApp; smoothness work is allowed any time, visual look stays frozen"
metadata:
  type: feedback
---

Owner (2026-10-26 07:10): «С анимациями приложения и вебки тоже поработай, чтобы плавность была ахуенной, как в Инсте, Телеге, Вацап». Earlier: «по косметике ничего не меняй, только плавность».

**Why:** he judges quality by feel; jank or flicker reads as "cheap" to him, while any unasked visual change angers him.

**How to apply:** smoothness work (frame pacing, transitions, list performance, image decode, no flicker, haptics) is always in scope and must not change layout, colours, sizes or texts; measure before/after (perf suite #295, Chrome traces) and report numbers, not adjectives. See [[ui-frozen]], [[calls-like-whatsapp]].
