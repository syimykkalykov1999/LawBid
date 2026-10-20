## Owner 2026-10-20 — Government requests: account lookup, evidence archives, legal holds

Admin → Запросы госорганов → a request now has a workspace (super_admin only,
fresh step-up for every write, every call an audit row):

- **Lookup** (`GET admin/data-requests/legal/lookup`): phone, e-mail, @username,
  name or user id → one account card (profile, handles with history, direct
  chats, groups, channels, devices/sessions, counts). Prefix/exact matches only.
- **Archive** (`POST …/requests/:id/exports`): the `legal.exports` cron job
  (every minute, one archive at a time, row cap `legal.export_max_rows`) builds
  a ZIP — `report.pdf`, `data/*.json`, `media.json` (signed links, 7 days, no
  copies), `manifest.json`, `SHA256SUMS.txt` — into the documents bucket
  (`legal-exports/`), 30 days (`legal.export_ttl_days`), entities written to
  `data_access_log`. No daily counter; the queue is capped at 50 waiting.
- **Retention**: `legal.retention` (03:20 UTC) scrubs the text of content deleted
  more than `legal.deleted_retention_days` (90; 0 = keep) ago — messages and
  their edits, group and channel messages, posts, stories, questions, answers —
  unless a **legal hold** (user / chat / group, optional end date) covers it.
- Terraform: `legal-exports/` expires after 31 days in the documents bucket and
  its replica (second net behind the worker).
- Migration `20261021020000_legal_exports` (tables `legal_exports`, `legal_holds`).
