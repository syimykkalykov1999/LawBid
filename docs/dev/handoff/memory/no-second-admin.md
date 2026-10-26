---
name: no-second-admin
description: Owner forbids four-eyes / second-admin approvals; one 2FA code is enough for every admin action
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6d6b8c8c-3cb5-4d35-85a9-f97482dd18a3
  modified: 2026-10-25T06:58:19.993Z
---

Never design admin actions that need a second admin's approval (four-eyes / maker-checker). The owner works alone and runs the company; a fresh 2FA code from the acting admin is the only confirmation. Dual control stays only as a setting `admin.dual_control`, default off.

**Why:** 2026-10-25 the owner said «Убери эту вещь вообще с корня, не хочу чтобы ограничивал сам себя… я же один работаю» — with one admin, four-eyes buttons could never be confirmed.

**How to apply:** in any new admin feature (ops buttons, money actions), use RBAC + 2FA step-up + audit log, no approval queue. Related: [[owner-working-rules]], [[scaling-principle]].
