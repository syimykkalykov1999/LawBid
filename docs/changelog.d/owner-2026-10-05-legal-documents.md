## Owner 2026-10-05 — legal documents in the admin

- One admin section «Система → Юридические документы» (`/legal-documents`)
  edits every legal document (terms, privacy, attorney / client agreements,
  EULA, refunds, cookies, third-party services, partner terms, DMCA policy)
  in Russian and English: draft, markdown preview, publish (super admin only),
  history and rollback (a rollback is a new version). Versions are dated
  (`2026-10-05.1`). Each publish has a «require re-acceptance» switch
  (default on) and a change note; all actions are audited.
- Default texts (English from the site pages, Russian written for the app) are
  seeded as drafts when missing. They are drafts for review by a licensed US
  attorney, not legal advice.
- API: `GET /legal/documents`, `GET /legal/documents/:type?locale=` (public),
  `GET /legal/pending`, `POST /legal/accept` (records ip and device),
  `/admin/legal/documents/*`. `GET /users/me` returns `pendingLegalDocuments`
  by role. Publishing a case and placing a bid return
  `403 LEGAL_REACCEPT_REQUIRED` until pending documents are accepted
  (assistants are skipped).
- Migrations `20261006140000..220200`: new `LegalDocType` / `ConsentType`
  values, draft/history/rollback columns, backfill of `status`.
- Mobile: acceptance screen after sign-in (one unticked box per document,
  «Accept» disabled until all are ticked), Settings → About lists all current
  documents; strings in `legal_docs_strings.dart`
  (`tmp-import/legal-docs-keys-update.xlsx`).
