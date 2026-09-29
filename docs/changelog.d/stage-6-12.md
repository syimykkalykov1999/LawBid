## Stage 6.12 — Testing, load, launch readiness

docs/06_PRODUCTION.md §13 stage 6.12, §9, §11.

- Security (§9.3): new e2e `security-contact-leak` — before acceptance
  no attorney-facing response (case feed and detail, own bid, pre-
  acceptance chat list/detail/messages with a phone and e-mail typed by
  the client, case search, notifications, contacts endpoint) carries the
  client's name, phone or e-mail; after acceptance without an active
  subscription the contacts endpoint is `SUBSCRIPTION_REQUIRED` and the
  work list stays clean. Together with the existing `authz-matrix`
  (roles + IDOR), `auth-hardening` (tokens, refresh reuse, attestation),
  `security-hardening` (headers, readiness, idempotency), `files` (MIME,
  size, EICAR), `stage-6-2` (mobile token on `/admin`) and the chat
  masking suites this is the automated part of §9.3.
- Load (§9.4): `apps/api/k6/` — feed, search, attorney cases, bid, chat
  (+ Socket.IO), OTP login, Stripe webhooks, and `all.js` mixing them at
  the 5k RPS peak (`STAGE=peak`) and the 1-hour soak (`STAGE=soak`), with
  the §9.4 thresholds; `docs/perf/README.md` (accounts, procedure,
  results table).
- Launch (§11): `docs/LAUNCH_CHECKLIST.md` — the §11.1 checklist, closed
  beta, store data and the store-payment decision, all owner-ticked.
- Critical flows (§9.2) are covered by the stage suites of files 1–6
  (49 e2e suites); the pentest, the real load run and the restore drill
  need the staging environment and are the owner's acceptance items.
