## Stage 3.8: Flutter — verification wizard and status screen — docs/03 §2, §6, §8, §11 — 2026-09-27

**Mobile (`apps/mobile/lib/features/verification`)**
- `/verification` (was a placeholder) → `VerificationStatusScreen` on
  `GET /verification/me`: start (what is needed + "Start verification"),
  saved draft ("N of M parts complete", Continue), pending (submitted → in
  review → decision timeline), `needs_more_info` (verifier message + "Add
  information"), rejected (localized `verification.reject.<code>` + verifier
  comment + per-license reasons + "Submit a new request", disabled with a
  message when the 30-day limit is used), verified (blue check, license
  statuses, "Add a state"), suspended; skeleton / error + Retry / offline
  (auto-reload on reconnect) / pull-to-refresh.
- `/verification/wizard` → `VerificationWizardScreen`: intro → licenses
  (several states; add sheet with state picker, bar number with the API's
  pattern, optional expiry; remove with confirm) → identity document (driver
  license / passport / state ID, front + back where needed) → selfie (camera
  only) → review (summary with Edit links, missing-items list, comment for
  the reviewer ≤500, autosaved via PATCH) → submit. Animated stepper (gold
  rail, tappable done steps, "Step N of M"), step slide/fade transitions,
  all motion off under reduce-motion. Identity/selfie steps are skipped for
  an already verified attorney adding a state (`identityRequired`).
- Draft lives on the server: reopening resumes at the first incomplete step
  (`resumeStep`), so closing the app at step 3 returns to step 3 with the
  uploaded files. An answer to `needs_more_info` opens at review with the
  verifier's message; files can only be added (up to 3 per document).
- Uploads: `POST /files/presign` (sha256, purpose) → direct multipart POST
  to storage through a bare Dio (`storageUploadDioProvider`, no bearer
  token) with progress bar and cancel → `POST /files/:id/confirm` → poll
  `GET /files/:id` until the scan leaves `pending` (timeout → retry that
  re-polls without re-uploading) → attach. Infected/failed files are marked
  on the card and can only be removed; any unfinished or failed upload blocks
  submit with a clear message; `VERIFICATION_INCOMPLETE.details.missing` is
  shown as a list.
- In-app camera (`camera` package) with a guide overlay (ID-1 card frame,
  page frame, face oval; breathing gold outline, static under
  reduce-motion), shot review (Retake / Use photo), denied/unavailable
  states. Files from the photo library / Files via `file_picker` (PDF allowed
  only for licenses).
- Guard: `/verification/wizard` is reachable from the onboarding
  verification step like `/verification`. The Mine (Cases) tab CTA already
  pushes `/verification`; stage 3.9 owns the tab gates.
- Removed `VerificationPlaceholderScreen`, its keys and goldens.

**Platform**
- iOS: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, localized
  in new `en.lproj` / `ru.lproj` `InfoPlist.strings` (registered in the Xcode
  project, `ru` added to known regions; texts = keys `permission.*.ios`).
- Android: `CAMERA` permission, camera feature optional.
- New dependencies: `camera`, `file_picker`.

**Contract issue (not changed, reported)** — the generated
`AddLicenseDto.expiresAt` is a `DateTime` serialized as a full ISO timestamp,
but the API accepts only `YYYY-MM-DD`; the app sends that endpoint as a plain
map (response still parsed with the generated envelope). Fix in the API
schema (`format: date` → string) and regenerate.

**Keys**: 154 new en+ru keys (`verification.*`, `permission.*.ios`) in
static_translator.dart and `apps/api/prisma/seed/pending_keys/stage-3-8.csv`.

**Tests**: acceptance widget tests (two-state wizard; close at step 3 and
resume; needs_more_info re-upload + resubmit; rejected reason + new request,
limit reached; unfinished and infected upload block submit), controller
unit tests (resume, polling, timeout/retry, cancel, infected, too large,
missing items), repository tests (date format, Idempotency-Key, sha256,
storage POST without auth), goldens light+dark for 6 wizard views and 9
status views + infected card, 200% text scale, reduce-motion.
