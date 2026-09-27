## leaf-1.7 — accounts & profiles (docs/01 §10.3, §11 3A/3B; docs/02 §4.C)

### Backend (apps/api, users module)
- `PATCH /users/me/onboarding` accepts a structured `profile` (names, client
  `stateCode`/`languages`/`contactMethod`/`contactNote` ≤200, attorney
  `bio` ≤300/`firmName`/`languages`/`licensedStates`). Validated (state
  exists and is active in `states`, ISO 639-1 language codes, lengths,
  fields of the other role rejected with `VALIDATION_ERROR` +
  `details.fields`/`details.states`) and upserted into `client_profiles` /
  `attorney_profiles` together with the names and step in one
  `withTxRetry` transaction.
- Attorney `username`/`username_lower` (NOT NULL) generated once from the
  name (`first.last`, numeric suffix if taken, skipping
  `app_config profile.reserved_usernames` via AppSettingsService; fallback
  `attorney` for non-latin names). Editing stays docs/03 stage 3.6.
- Licensed states (3B multi-select) are kept server-owned in
  `onboarding_state.data.licensedStates` — they cannot be
  `attorney_licenses` rows before verification collects bar numbers
  (docs/03); a raw `data` payload cannot overwrite them.
- `POST /users/me/onboarding/complete` upserts at completion too (migrates
  the old free-form `data.profile` of older app builds; always creates the
  attorney row) and now requires `state` (client) / `licensed_states`
  (attorney): `ONBOARDING_INCOMPLETE` with `details.missing`.
- `GET /users/me` returns `profile`; new `GET /users/me/identifiers`
  (Settings → Account). Replacing a verified phone/email via
  `contacts/verify` now also retires the old value as a sign-in method
  (same transaction; auth_event meta `replaced: true`).
- Photo (required for attorneys) is deferred to docs/03 stage 3.2 (owner).

### Mobile
- Onboarding profile step sends the structured `profile` (no visual
  change; goldens unchanged) and prefills from `GET /users/me.profile`.
  `MissingRequirement.profile` (`state`/`licensed_states`) keeps the guard
  on the profile step.
- Settings → Account (`/profile/settings/account`): contacts with Change /
  Add (reauth + code on the new contact, reusing
  ContactVerificationController), linked sign-in methods, link another
  phone / email (`POST /auth/identifiers`) and Apple / Google. Loading
  skeleton, empty, error + Retry, offline states; 200% text scale.
- New translation keys: `account.*` (see
  `apps/api/prisma/seed/pending_keys/leaf-1.7.csv`).
