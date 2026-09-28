## File 03 stages 3.5–3.6: practices, license expiry, profiles API — 2026-09-27

docs/03_VERIFICATION_PROFILES.md §3 (practices/states), §2.6 (license
expiry), §4 (attorney profile), §5 (client profile), §6 (status display),
§9 (`profile.*`, `verification.license_expiry_notify_days`).

**API — stage 3.5**
- `GET /practice-areas` (public): active categories → active leaves with
  i18n keys, sorted; Redis-cached 5 min, `ETag` + 304 on `If-None-Match`.
- `GET/PUT /attorneys/me/practice-areas`: PUT replaces the whole set in
  one `withTxRetry` transaction; only `verification_status = verified`
  (403 `ATTORNEY_NOT_VERIFIED`, re-checked inside the transaction); only
  active leaves under an active category (400 `VALIDATION_ERROR`,
  `details.invalidIds`). Each change writes `audit_log`
  (`attorney.practice_areas.replace`, actor = the attorney, §3.2).
- Nightly BullMQ job `licenses.expiry` (05:05 UTC): verified licenses
  with `expires_at` ≤ today → `expired`; when no verified license is left
  a `verified` profile → `unverified`; reminders at
  `verification.license_expiry_notify_days` (30/7; the smallest due
  threshold, once per license+expiry date+threshold). All events are
  `verification_update` notifications (`kind`: `license_expiring`,
  `license_expired`, `profile_unverified`) in the same transaction as the
  change. The worker process now imports AppSettingsModule and
  NotificationsModule.
- New `NotificationsService.emit()` seam (`modules/notifications`,
  global): persists the `notifications` row with the type's category;
  delivery is docs/05.

**API — stage 3.6**
- `GET/PATCH /attorneys/me/profile`: own profile incl. own licenses with
  bar numbers, badge, rating, counters, `usernameNextChangeAt`. PATCH:
  names (1–50), bio (≤300), firm (≤80), languages (ISO 639-1),
  `username` (docs/03 §4.1 rules; cooldown
  `profile.username_change_cooldown_days` → 409
  `USERNAME_CHANGE_TOO_SOON` with `details.nextChangeAt`; reserved
  `profile.reserved_usernames` → 400 `USERNAME_RESERVED`; taken,
  case-insensitive → 409 `USERNAME_TAKEN`). The onboarding-generated
  username counts as never changed.
- `GET /attorneys/username-available?u=` (30/min per IP):
  `{available, reason: invalid|reserved|taken|null}`.
- `GET /attorneys/:username`: public profile — verified-license states
  only, practices, rating, counters, `verifiedBadge` (§6.3); never bar
  numbers, documents or contacts. 404 for unknown, suspended profile,
  blocked/deleted account.
- `GET/PATCH /users/me/profile`, `PATCH /users/me/contact-preferences`
  (client, own only; reuses UserProfilesService). Non-clients get 404; no
  route reads another user's client profile.
- Name re-check (§4.1): a `verified` attorney whose first/last name
  changes (via `/attorneys/me/profile`, `PATCH /users/me` or the
  onboarding profile step) goes to `pending`, and a `submitted`
  verification request (admin_note `name_change_recheck: "old" -> "new"`)
  enters the verifier queue unless one is already open.

**Error codes** (server enum, `ApiErrorCodes`, en+ru texts):
`ATTORNEY_NOT_VERIFIED`, `USERNAME_TAKEN`, `USERNAME_RESERVED`,
`USERNAME_CHANGE_TOO_SOON`. Also `notif.verification.license_expiring |
license_expired | profile_unverified` keys
(`prisma/seed/pending_keys/stage-3-5-3-6.csv`).

**Contract:** openapi.json + Dart client regenerated (AttorneysClient,
PracticeAreasClient, ProfilesClient).

**Tests:** unit (tree builder, practice replace policy, username
cooldown/reserved/taken/availability, public-profile 404 rules, name
re-check, license expiry thresholds/dedup) and
`test/profiles-practices.e2e-spec.ts` (all acceptance items against real
CockroachDB/Redis, incl. the §5.4 canonical query).
