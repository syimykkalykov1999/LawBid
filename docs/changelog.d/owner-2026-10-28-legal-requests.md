## Owner 2026-10-28 — Legal requests: intake, preservation, signed productions, gag orders, transparency

Admin → Запросы госорганов (super_admin, fresh 2FA step-up for every write, every call an audit row):

- **Intake record**: request types now `subpoena, court_order, search_warrant, preservation, emergency, civil, other`; plus legal basis, country, subject person, due date. `legal.reminders` (hourly, `legal.reminders_enabled`, `legal.reminder_days`) pushes/e-mails the on-call admins before a due date.
- **Legal hold overrides ALL automatic deletion**: new `common/legal-hold/legal-holds.ts`. Hold targets: person, case, chat, group. Jobs that now skip held people/cases: `sessions.cleanup`, `notifications.retention`, `journal.retention`, `exports.cleanup`, `storage.retention` (login events, activity, views), `storage.gc` (file purge), `tasks.archive-purge`, `legal-qa.sweep`, `fraud.sweep` (identity hashes); already held: `legal.retention`, `privacy.anonymize`. A `preservation` request gets a 90-day hold by default (`legal.preservation_days`, 18 U.S.C. 2703(f)). One test per job in `legal-hold-jobs.spec.ts`.
- **Productions**: `manifest.json` now names the issuing authority, legal basis, who requested and when; it is signed (`manifest.sig` in the ZIP, same seal on the row). Ed25519 when `LEGAL_MANIFEST_SIGNING_KEY` is set, HMAC-SHA256 otherwise. Downloads are limited (`legal.export_max_downloads`, 5; 0 = no limit), counted atomically, each one an audit row; `GET …/exports/:id/custody` lists who built/downloaded when.
- **Gag orders**: `do_not_notify` + `nondisclosure_until` on the request; the server refuses the user notice while it is in force; an hourly reminder when it is about to end/has ended. Notice texts: `legal.notice_template_ru/en`.
- **Transparency**: `GET …/legal/transparency?year=` and the page «Отчёт прозрачности».
- Migration `20261028300000_legal_requests` (additive).
