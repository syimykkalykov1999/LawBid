---
name: device-and-server-light
description: "Owner rule 2026-10-28 — every feature must be light on BOTH user phones and our server; uploads direct-to-storage, on-device hardware compression, no quality loss"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6d6b8c8c-3cb5-4d35-85a9-f97482dd18a3
  modified: 2026-10-28T12:52:40.996Z
---

Every feature (uploads, video, reels, calls, feeds, chats, maps) must: not crash/heat/drain user phones (hardware encoders, streaming not full-file RAM, one heavy job at a time, pause on low battery/thermal, weak devices fall back to the simple path); keep server load and cost minimal (bytes go direct to storage, server never proxies files, no server transcoding); keep quality at Instagram level (1080p, don't re-encode files already within limits); resumable uploads.

**Why:** owner 2026-10-28 found video uploads very slow and asked «почему ты ранее так не сделал» — wants it designed right from the start, not after phone tests.

**How to apply:** put this in every worker brief touching media/heavy work; verify on a low-end emulator profile and measure server load in load tests. Related: [[scaling-principle]], [[smoothness-standard]], [[working-not-just-code]].
