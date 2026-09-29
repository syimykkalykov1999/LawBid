## Stage 6.3 — Admin: verification UI and users

docs/06_PRODUCTION.md §13 stage 6.3, §2.3 items 2–3, §3.4.

### API
- `modules/admin-users` (`/admin/users`, roles super_admin / moderator /
  support per §2.2): `GET /admin/users` search by name (trigram on
  `full_name_lower`), email, phone (any format → E.164), `@username`, id,
  with role/status filters and cursor; `GET /admin/users/:id` card (role,
  status, profile, licenses, subscription, active sessions/devices with
  push-token counts, last 20 cases or bids, warning count — no contacts);
  `GET /admin/users/:id/contacts` behind `@Justification()` (audited with
  the reason); `POST …/sessions/revoke` (all three roles); `POST …/warn`,
  `…/suspend`, `…/restore` (super_admin, moderator).
- §3.4 sanctions (`AdminUsersService`): warn → `moderation_actions`
  (`warn`) + `moderation_notice` notification (payload carries only the
  action id); suspend → `users.status = suspended` + `suspended_reason`,
  every session revoked (`admin_block`), `moderation_actions`; a client's
  `open` cases → `archived` with active bids `rejected_auto` (shared
  `CaseLifecycleService.archiveInTx`, journal + notifications + chats
  closed), `in_progress` untouched; an attorney gets the file-03 §2.5
  effects (`VerificationAdminService.suspendInTx`: profile suspended, bids
  withdrawn). Restore → `active`, cases stay archived, attorney profile
  restored (`restoreInTx`). Sign-in of a suspended user is refused
  (`ACCOUNT_SUSPENDED`, unchanged from file 01). Every action writes its
  own audit row with before/after; admins can't be sanctioned here.
- Contract regenerated.

### apps/admin
- `/users`: search + filters + cursor list; `/users/[id]`: card, contacts
  reveal through the reason dialog (X-Justification), actions by role
  (revoke sessions; warn / suspend / restore with a reason).
- `/verification`: queue with status/state filters; `/verification/[id]`:
  take, per-license decision (verified / rejected with code + note),
  re-check, documents opened by signed link after a reason, approve /
  request info / reject (rejection code + comment), attorney suspend /
  restore, checks and past requests.
- `useReason()` dialog shared by every "enter a reason" step; nav entries
  for Users and Verification enabled.
- Fixes found in the browser smoke run: CSP allows `'unsafe-eval'` only
  outside production (Next dev react-refresh); the openapi-fetch reroute
  middleware rebuilds requests with a materialized body (Chrome sends
  streaming bodies only over HTTP/2 → `ERR_ALPN_NEGOTIATION_FAILED`).

### Tests
- Unit: `parseUserQuery`. e2e `stage-6-3.e2e-spec.ts`: search by each
  shape + filters + matrix (verifier 403, mobile token 401); card without
  contacts, contacts need a reason and are audited; support revokes a real
  OTP session (token → 401), moderator warns (notification + action, support
  403); client suspension (sessions, `ACCOUNT_SUSPENDED` at sign-in, open
  cases archived + bid rejected_auto, in_progress kept, 409 on repeat,
  restore keeps the archive); attorney suspension (profile suspended, bid
  withdrawn, restore → verified); admins are 403.
- Browser smoke (built-in browser against the isolated e2e DB): sign-in
  with QR enrollment and recovery codes, dashboard, verification queue →
  take → license verified → approved, document link with a reason, users
  search → card → contacts with a reason.
