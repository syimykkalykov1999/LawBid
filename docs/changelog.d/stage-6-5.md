## Stage 6.5 — Admin: disputes, "Не могу связаться", government requests

docs/06_PRODUCTION.md §13 stage 6.5, §2.3 items 5, 11, 12, §5.4.

### API
- `modules/admin-cases` (support, super_admin — §2.2 "Кейсы"):
  `GET /admin/case-disputes` (open | resolved, oldest first, cursor) and
  `GET /admin/case-disputes/:id` with the `case_journal` chronology
  (last 200 rows) and the opener's other disputes; `GET
  /admin/contact-issues` (open | confirmed | rejected) and
  `GET /admin/contact-issues/:id` with the disclosed fields, the client's
  confirmed count against `contacts.suspend_after_confirmed_reports` and
  the client's other reports. Decisions stay on the file-04 routes
  (`POST /admin/case-disputes/:id/resolve`, `POST
  /admin/contact-issues/:id/resolve`).
- Dispute reopen (`in_progress`) now notifies both parties
  (`case_updated` with `disputeId`/`decision`); `closed` already did via
  `case_closed`. The §8.4 auto-suspension after the 3rd confirmed report
  now carries the §3.4 effects: every session revoked and the client's
  open cases archived (after commit).
- `modules/admin-data-requests` (super_admin): `GET/POST
  /admin/data-requests` (register a subpoena / court order: type,
  reference, agency, received date, scope, notes), `GET /:id` with the
  `data_access_log`, `PATCH /:id/status` (received → in_progress →
  fulfilled | rejected, `closed_at`), `POST /:id/package` behind
  `@Justification()`: sections `profile`, `contacts`, `cases`, `bids`,
  `contact_disclosures`, `messages` chosen per request; the JSON package
  is returned to the panel and every entity in it (user, cases, bids,
  disclosures, conversations) becomes a `data_access_log` row before the
  response; the request moves to `in_progress`; audit rows for create /
  package (with the justification) / status.
- Contract regenerated.

### apps/admin
- `/cases` with the two queues (tabs, "показать решённые"),
  `/cases/disputes/[id]` (reason, parties, journal timeline, close / back
  to work with a comment), `/cases/contact-issues/[id]` (attorney's
  report, disclosure details, client's confirmed count and history,
  confirm / reject with a comment).
- `/data-requests` registry with the registration form and
  `/data-requests/[id]`: scope, package builder (user id + sections →
  reason dialog → JSON download), status editor, `data_access_log` table.

### Tests
- e2e `stage-6-5.e2e-spec.ts`: attorney opens a dispute → queue row and
  card journal → `closed` (journal `dispute_resolved`, `case_closed` to
  both) and `in_progress` (`case_updated` to both); three "Не могу
  связаться" reports → queue, card (disclosure, history) → third
  confirmation suspends the client (sessions revoked, open case archived,
  in_progress cases kept); government request: register, package without
  a reason → 400, with a reason → data (profile, contacts, cases, bids,
  disclosures) and one `data_access_log` row per entity, status →
  `in_progress` → `fulfilled` with `closed_at`, audit trail; support is
  403 on data requests, verifier 403 on disputes.
