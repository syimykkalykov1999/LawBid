## Stage 6.6 — Admin: flags, config, localization, legal documents

docs/06_PRODUCTION.md §13 stage 6.6, §2.3 items 7–10.

### API (`modules/admin-config`, super_admin)
- Feature flags: `GET /admin/feature-flags` (enabled, rollout percent,
  description, `paid`, `requiredKeys`, `missingKeys`), `PATCH
  /admin/feature-flags/:key` {enabled?, rolloutPercent?}. Paid flags
  (`stripe_identity`, `persona_verification`, `profile_promotion`,
  `video_posts`, `auto_bar_check`) need their provider keys in env
  (`STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID`, `PERSONA_API_KEY`,
  `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET`, `BAR_LOOKUP_API_KEY` — new optional
  env keys) or enabling is `409 FLAG_PROVIDER_KEYS_MISSING`. The flags
  cache is dropped on every write, so `GET /config/bootstrap` reflects the
  change at once; audit before/after.
- `app_config` editor: `GET /admin/config` lists every editable key with
  its schema (type, min/max, default, current value, stored?) — the typed
  `APP_SETTINGS` tunables, the cost-guard `budget.*` caps,
  `sms.allowed_country_codes`, `min_app_version_ios|android`; `PUT
  /admin/config/:key` validates against the schema (unknown keys and wrong
  types/ranges → 400), drops the config cache, audits before/after.
- Localization: `GET /admin/i18n/languages` (all, with translation counts
  and bundle versions), `PATCH /admin/i18n/languages/:code` {isActive,
  sort} (`en` can't be disabled), bootstrap cache dropped. The existing
  xlsx/csv import already creates a language from a new column; it now
  also drops the bootstrap cache so the app sees the language without a
  release.
- Legal documents: `GET /admin/legal-documents` (+ `/:id` with the full
  text), `POST /admin/legal-documents` (draft version per type + locale,
  Markdown or URL), `POST /admin/legal-documents/:id/publish` (becomes
  current for its type + locale, previous current archived, bootstrap
  cache dropped). Re-acceptance: `OnboardingService` now requires that the
  accepted `terms` / `privacy` / `disclaimer` consent points at the
  current version for the user's locale (fallback `en`); otherwise
  `consents` is back in `missing` and the app's guard shows the consents
  step on the next sign-in.
- Contract regenerated.

### apps/admin
- `/flags` (switches with the paid-service warning and key status,
  rollout percent), `/config` (typed inline editor with client-side
  parsing and server validation), `/i18n` (languages on/off, import
  dry-run → apply with the report, export link), `/legal` (versions table
  with current/draft/archive, text preview, draft form, publish).

### Tests
- e2e `stage-6-6.e2e-spec.ts`: paid flag lists missing keys and refuses to
  enable (409) while rollout edits work; a free flag flip shows up in the
  next `/config/bootstrap`; finance is 403; config schema list, wrong
  type / range / unknown key / bad country code → 400, a valid write is
  visible through `AppSettingsService` and audited; xlsx import with a new
  language column (dry-run adds nothing, apply adds the language and
  bootstrap lists it), language switch-off removes it from bootstrap, `en`
  can't be disabled; a user who accepted the current documents stays
  complete after a draft is created and loses `requiredConsentsGranted`
  once the new terms version is published, until they accept the new
  document id.
