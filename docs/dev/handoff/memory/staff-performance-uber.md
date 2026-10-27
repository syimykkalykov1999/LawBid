---
name: staff-performance-uber
description: "Approved 2026-10-26 — Uber-style self-controlling staff system for admins (KPI, quality, rating, auto-flags, piecework pay), owner sees only the short \"bad/best\" list"
metadata:
  node_type: memory
  type: project
  originSessionId: 6d6b8c8c-3cb5-4d35-85a9-f97482dd18a3
  modified: 2026-10-27T03:26:16.282Z
---

Owner approved (2026-10-26 ~23:25) a staff-performance package so he can hand mass work (document checks, moderation, support, accounting) to up to ~1000 admins without watching anyone: per-admin KPIs from existing audit/queue events, quality signals (complaint/appeal/repeat ticket after their close, overturned decisions, user 👍/👎 after a ticket, random sampling re-check), rolling 30/90-day rating, automatic flags with suggestions (warn / remove from queue / replace), queue routing by rating, piecework pay (rate per unit × quality → payroll_accruals), everything OFF by default with thresholds in admin, nightly snapshot ($0), guide on «Инструкции».

**Why:** «я не хочу за каждым следить… система сама будет контролировать наших работников, чтобы я мог довериться и отдать эту сферу другим людям».

**How to apply:** research first (Uber rating/deactivation, Zendesk/Intercom QA, Upwork JSS, call-center sampling). Build after the merge train, in the "systems" block before desktop web. Roles already isolate areas (apps/admin/src/lib/rbac.ts: each admin sees only toggled areas; money/keys owner-only) — reuse, don't rebuild. Never four-eyes ([[no-second-admin]]); numbers from snapshots ([[admin-stats-snapshot]]); owner rules [[owner-working-rules]].
