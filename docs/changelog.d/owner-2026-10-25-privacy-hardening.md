## Privacy hardening (round 13, 2026-10-25)

- Erasure ledger (`erasure_ledger` + one object per person in the private bucket) and a restore step: `npm run privacy:reapply-erasures` (docs/runbooks/backups.md).
- Anonymization also deletes the phone-book upload, scrubs message edit history / file names / assistant and forwarded names, blanks session network data, case private details, client contact note and bar numbers (hashed).
- «Delete for everyone» releases the attachment (when unreferenced and not held), clears the file name, asks the CDN seam to invalidate.
- Retention jobs: `privacy.retention` (audit_log, data_access_log, session IP, contact-disclosure IP), policy text aligned; settings `privacy.*`.
- One hold helper (`common/privacy/legal-hold.ts`) used by every purge job; hold targets `case` and `file` added.
- Admin «minor confirmed» (2FA, audit): erase now, fraud hashes keep blocking.
- Data export streamed (multipart upload) and extended to the missing product areas.
- `deletion_steps` per vendor (Twilio message log deleted; others documented retention), nightly `privacy.reconcile` (ledger copy, search index re-delete, failed steps).
- Deletion request: push + e-mail at day 0 and day 13 with a cancel link; a sign-in no longer cancels (`privacy.login_cancels_deletion`, default off); `POST /users/me/deletion/cancel`.
- Breach tool `npm run breach:affected`, deadline table and templates in docs/runbooks/BREACH.md; CI check for zero third-party web tags.
