# Call screens — reference spec (written before the rework, 2026-10-26)

Owner: «the call screens must look and behave like WhatsApp / FaceTime /
Telegram — nothing cheap, nothing that blinks or jumps». For each screen:
the best reference, then the exact behaviour we copy. Our own tokens stay
(navy + gold, AppIcons, AppSpacing, AppMotion); only the call screens
change (owner scope guard 2026-10-26).

## References (2025-26)
1. WhatsApp call screen revamp (beta 2025): Back → «Minimize» chevron, the
   bottom bar becomes a **floating island**, secondary actions in a menu,
   a larger centred photo on voice calls, pill-shaped voice↔video switch —
   [HuaweiCentral, redesigned call menu](https://www.huaweicentral.com/whatsapp-to-bring-redesigned-call-menu-for-individual-and-group-chats/amp/),
   [MyMobileIndia, call screen update](https://www.mymobileindia.com/whatsapp-call-screen-update/),
   [SamMobile, Apr 2025: routing + pinch-to-zoom](https://www.sammobile.com/news/whatsapp-big-new-update-clearer-audio-video-calls/).
2. Telegram group video calls: tap any video to make it fullscreen, pinned
   video stays in focus as others join —
   [telegram.org/blog/group-video-calls](https://telegram.org/blog/group-video-calls).
3. Zoom mobile: active speaker by default, gallery of ~4 per page on a
   phone, swipe between them —
   [Indiana University KB «Manage Zoom meeting views»](https://kb.iu.edu/d/bgii),
   [Tom's Guide](https://www.tomsguide.com/news/how-to-see-everyone-on-zoom).
4. FaceTime (iOS 17-18): self view is a small rounded card that snaps to
   the four corners with a spring, tap swaps; controls float over the
   video and fade away; the camera-off state shows a big blurred photo.

## Global rules (every call screen)
| Thing | Spec |
|---|---|
| Background | full bleed, edge to edge; the picture or a **blurred enlargement of the person's photo** (σ 40 + 45 % navy wash), never a flat black box |
| Top overlay | no bar: a 160 px **gradient scrim** (black 45 % → 0), SafeArea only for the overlay content |
| Name / timer | name 17/600 white, status / timer 13/400 white 72 %, tabular figures; one line each, **space reserved** — status text cross-fades (200 ms), never collapses; no «0:00» flash (the timer shows «Connecting…» until `connectedAt`) |
| Status words | «Calling…», «Ringing…»/«Incoming call», «Connecting…», «Reconnecting…», «Call ended» — the existing `call.status.*` keys (plain Russian / English) |
| Controls | one floating **island**: 64 px circles, 16 px gaps, 12 px inner padding, radius 999, navy 72 % + 1 px white 8 % border; pressed = scale 0.92 in 120 ms + light haptic; End = solid danger red, press scale 250 ms |
| Auto-hide | **video only**: after 4 s without a touch, top + bottom overlays fade (300 ms ease-out) and slide 12 px; any tap brings them back at once; never in voice calls, never while a sheet / prompt / notice shows |
| Motion | 300 ms `easeOutCubic` (AppMotion.enterCurve) for layout; 200 ms cross-fades for text; the screen enters with a 220 ms fade + 0.98→1 scale; `reduceMotion` = no motion |
| Tiles | radius 20, 1 px white 10 % border, 4 px gap, gold 2 px ring (animated) on the speaker, name pill = navy 55 % with 12/600 white text + mic-off icon; camera off = blurred photo + big avatar; RepaintBoundary per tile |
| Touch | every control ≥ 44 px; no Material ink splashes over video (InkWell off, AppPressable scale instead) |
| Theme | the call is dark navy in every app theme (light and dark), RTL mirrored (start/end) |

## Screens
### Outgoing (reference: WhatsApp voice / FaceTime)
Blurred photo background; avatar 132 px centred at 38 % height with 3 soft
gold rings pulsing (1.8 s, opacity 0.55 → 0); name 28/600 under it;
status «Calling…» 15/400 72 %. Controls island at the bottom (Speaker ·
Video · Mute · End). Top: minimise chevron (start).

### Incoming in app (reference: WhatsApp)
Same stage as outgoing with «Incoming voice/video call». Two 72 px round
buttons — Decline (red, start) / Accept (green, end, camera icon for video)
— with a 12/400 label under each; they **slide up 24 px + fade in 300 ms**
when the screen opens. Accept pulses gently (scale 1 → 1.06, 1.2 s).

### Incoming on the lock screen
iOS: CallKit's own sheet (name; Apple shows no photo) — PushKit VoIP.
Android: full-screen intent notification with the caller's photo as the
large icon. See CALL_FLOW.md.

### 1:1 audio (reference: WhatsApp)
As outgoing, but the avatar does not pulse; the status is the running
timer (13 → 15 px tabular); a gold ring around the avatar glows while the
other person speaks.

### 1:1 video (reference: FaceTime + WhatsApp)
The other side's picture fills the whole screen (cover). Our camera = a
**96 × 136 card, radius 16**, 1 px white 15 % border, shadow 12 px, in a
corner 16 px from the edges (below the top overlay / above the island);
drag with the finger, release → **spring** (stiffness 600, damping 0.8) to
the nearest corner, a fling picks the corner in its direction; tap swaps
big ↔ small with a 300 ms cross-fade. Our camera off: the card shows our
avatar on blur. Their camera off: their blurred photo + big avatar.

### Group grid (reference: WhatsApp group video, Zoom gallery)
Full-bleed tiles filling the screen: 1 → full, 2 → split top / bottom,
3 → 2 on top + 1 wide below, 4 → 2 × 2, 5-6 → 3 rows of 2, 7-9 → 3 × 3
(the last row widens to fill), > 9 → 3 columns, scrolls. The grid makes
room for the island while it shows and grows into it when it hides (300
ms). Joining / leaving tiles fade + scale (0.9 → 1). Tiles move to their
new place (AnimatedPositioned, same widget → the video never restarts).

### Focused (reference: Telegram «tap to fullscreen» + Zoom speaker view)
Tap a tile: it **grows from its place to full bleed** (300 ms), the others
shrink into a strip of 64 × 88 cards along the bottom (above the island),
same motion. A small chip «⊞ Participants» at the top start returns to
everyone; so do a tap on the big picture, a swipe down, and Back.

### Add participant
The existing add panel (sheet) — unchanged behaviour, opened from the
top-end «person +» button.

### Reconnecting
No banner for the first 3 s of a drop (seamless failover); after that the
status line cross-fades to «Reconnecting…» with a small spinner; the
picture stays (frozen frame), no layout change.

### Ended
The status line cross-fades to «Call ended» (or the reason), the island
fades out, 1.5 s later the screen fades away (no jump cut).
