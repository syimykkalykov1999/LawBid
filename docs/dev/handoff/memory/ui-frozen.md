---
name: ui-frozen
description: App look is FROZEN — never change layout, buttons, colors, screens of the app without the owner's explicit ask
metadata:
  type: feedback
---
The owner (2026-10-24): do NOT change the app's look in any way. That covers the layout, button positions, colors, sizes and screens. Under-the-hood work, such as calls via Cloudflare or R2, must keep every screen pixel-identical. The only allowed visible additions are ones he asked for himself, such as the outage message «На сервере идут работы…».
**Why:** he spent a long time getting the design right and is afraid it gets spoiled.
**How to apply:**
- Tell every worker touching apps/mobile or apps/admin UI: no visual changes, reuse existing widgets.
- Review diffs for layout, style or theme edits before merging.
- If a feature seems to need a UI change, ask him first.
Related: [[owner-working-rules]], [[cosmetics-backlog-2026-10-22]]
- 2026-10-24: when the owner asks to raise or enlarge something «чуть чуть», change it MINIMALLY (about 20px). He was furious when the picker sheets became half the screen. Keep the old size and position, add a small padding, and show him before going bigger.


Owner 2026-10-26: the cosmetics backlog is finished; "по косметике ничего не меняй — только плавность анимаций". Any proposal to redo cosmetics makes him angry.

Clarification (2026-10-26): the owner DOES still want his LATEST small cosmetics requests done (after 22 Oct: Android «+» button a bit lower, checkmark colours, animation smoothness…) — but only those, built on the current accepted look; never revert to the look of two weeks ago.

Exception (owner 2026-10-26): CALL screens (audio/video, 1:1, group, focused, add-participant) are explicitly re-opened for rework — full-bleed video like WhatsApp/Telegram/Zoom, overlay controls, draggable self PiP. Everything else stays frozen.

Exception 2 (owner 2026-10-26): push NOTIFICATIONS (payload + how they render on Android/iOS, avatars, grouping) are re-opened for a WhatsApp-grade rework. Chats and the rest stay frozen; the chat avatar glitch is a bug fix, not a redesign.

FINAL (owner 2026-10-26 11:25): "меня всё устраивает и нравится, кроме того, что я попросил исправить" — the only allowed visual changes are: call screens (audio/video), push notification rendering, checkmark colours. Nothing else, ever, without a new explicit ask.
