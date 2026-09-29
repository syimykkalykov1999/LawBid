## Stage 4.7 — Case history (API)

docs/04_CASES_BIDS.md §16 stage 4.7, §12.

- `CaseHistoryModule` (`modules/case-history`):
  `GET /users/me/case-history?cursor=&limit=`, `GET /users/me/case-history/:caseId`
  (timeline from `case_journal`), `POST /users/me/case-history/export` (202,
  BullMQ queue `case-history-export`), `GET /users/me/case-history/export/:exportId`
  (status; when ready a signed S3 link valid 10 minutes).
- Client: cases where `client_id` = user; attorney: cases they bid on —
  including closed, archived and deleted-from-feed cases. Read-only: no
  update/delete route. Attorney timelines hide other attorneys' bid events;
  the client's name shows only if contacts were disclosed to that attorney
  (else null → "Client"); accepted bid shown to an attorney only if theirs.
  Payload reduced to display fields (no IP/device from contacts_disclosed).
- Reauth: viewing needs a valid `X-Reauth-Token` for its 5-minute life
  (`ReauthVerifier.assertValid`, non-consuming; a consumed token is still
  refused); export and every download link consume one (ReauthGuard) —
  "при повторном скачивании нужен новый reauth". Entry into the section
  and each timeline write `history_viewed` to auth_events.
- PDF: pdfkit (MIT) with Inter (`apps/api/assets/fonts`, Latin + Cyrillic),
  up to 1000 most recent cases per file, private `documents` bucket
  (`exports/case-history/<userId>/<exportId>.pdf`); export state in Redis
  24 h; jobId = exportId (no double render). Worker process runs the queue
  too (`CaseHistoryModule.register({ mode: 'worker' })`).
- Deviation (no migration allowed outside 4.1): there is no
  `notification_type` for "PDF ready" yet, so the app polls the export
  status; TODO(docs/05) adds the push.

Tests: e2e `stage-4-7.e2e-spec.ts` 3/3 (REAUTH_REQUIRED; deleted case stays
in history; same token for list+timeline; history_viewed rows; attorney
name/bid visibility; PDF `%PDF` via a link with `X-Amz-Expires=600`;
reused token → REAUTH_INVALID; foreign export 404); API unit 695/695.
