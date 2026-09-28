## Stage 3.9: Flutter — practices, profiles, reviews — docs/03 §3–§8, §11 — 2026-09-27

**Mobile (`apps/mobile`, feature `profile`)** — all network calls through the
generated `lawbid_api` clients on the app's `dio` (`guardApiCall`), domain
models in `features/profile/domain`, repositories swappable in tests.

- **Public attorney profile** `/lawyer/:username` (§4.2), also the landing of
  the `lawbid.app/lawyer/:username` deep link (placeholder replaced): header
  card (photo, @username + blue check from `verifiedBadge` §6.3, Posts /
  Followers / Following), gold rating card (name, half-stars, count, number;
  "New — no reviews" with empty stars and a dash), "Attorney" chip + bio,
  chip rows (firm, practices grouped by category with a full-list sheet,
  verified license states, languages), Edit+Share (own) / Follow+Share
  (others; Follow is a file-05 stub, no "Message"), Posts / Reviews tabs.
  Reviews tab: summary with animated 5→1 distribution, cursor-paginated
  "Anna K." cards (`Edited` label), report action on one's own profile
  (`POST /reviews/:id/report`). 404 (unknown / suspended / a client) →
  "Profile unavailable". Share copies the link to the clipboard.
- **Profile tab**: attorney → own public profile (+ "Complete verification"
  banner before verification); client → private profile (§5: photo, name,
  state, "My cases" with lock + "Visible only to you" + empty state).
- **Edit**: attorney (§4.1: photo, name 1–50 with re-check hint once
  verified, @username with debounced availability check and 30-day cooldown
  message, bio ≤ 300, firm ≤ 80, languages, practices link, licenses with
  status); client (name, photo, state, languages, contact method + note).
- **Photo upload** (`AvatarUploadController`): image_picker (1024 px) → magic
  bytes / 5 MB check → `POST /files/presign` → multipart POST to storage via
  a bare `storageDioProvider` (no auth headers) with progress ring →
  `POST /files/:id/confirm` → scan polling → `PATCH /users/me {avatarFileId}`;
  Retry reruns with the same bytes. Also added as the one new field of the
  attorney onboarding profile step (OQ-012), in its existing style.
- **My practices** `/profile/practices` (§3.2): search, expandable categories,
  "Select all"/"Clear all", checkboxes, animated selected chips, Save =
  `PUT /attorneys/me/practice-areas`. Locked with an explanation before
  verification.
- **My contacts** (Settings → My contacts, §5): confirmed phone/email with
  status, change via the existing Account flows; clients also edit contact
  preferences (`PATCH /users/me/contact-preferences`).
- **Review form** `/profile/review/:caseId` (§7): star picker, text ≤ 1000,
  mandatory notice, create (Idempotency-Key) → published preview "Anna K." →
  edit within `editableUntil` (14 days), read-only afterwards. Reachable from
  a non-production placeholder entry on the client profile until file 04
  lists closed cases.
- **Gates**: `attorneyNeedsVerification` (unverified / pending / rejected /
  suspended). Cases tab shows "Complete verification"; `AppRouterGuard`
  redirects "+" (`/create`, Post to feed) to `/create/verification-required`;
  both lead to `/verification` (stage 3.8).
- Design: navy/gold, serif headings, staggered entrances, star fill and
  distribution animations, chip pop-in, tab indicator slide, Hero-tagged
  avatars, skeletons, pull-to-refresh — all instant under reduce-motion.
- `CurrentUser.avatarUrl` added (from `MeDto`). iOS photo/camera usage
  strings added. New dependency: `image_picker`.
- Tests: `test/features/profile/profile_screens_test.dart` (29 widget/unit
  tests) and goldens (light+dark) for the public profile with reviews and
  "New — no reviews", practices, review card, review form. Updated goldens:
  onboarding attorney profile step (photo field), Cases gate, settings.
- Translation keys: `apps/api/prisma/seed/pending_keys/stage-3-9.csv`.

**API gaps found (not changed):** the public attorney profile has no avatar
URL (own photo is taken from `GET /users/me`); there is no endpoint to read
the client's own review of a case (the form can edit only a review it just
created or is handed); the server does not require the attorney photo that
§4.1 calls mandatory.
