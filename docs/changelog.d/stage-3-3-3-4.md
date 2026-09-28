## Stages 3.3–3.4: Verification requests and verifier admin API — docs/03 §2, §6, §9, §10 — 2026-09-27

**Attorney API (`modules/verification`, own attorney profile only; someone
else's request id → 404)**
- `GET /verification/me` — profile status, latest request, whether ID +
  selfie are required (not for an already verified attorney adding a
  state, §2.1), submissions used / `verification.max_submissions_30d`.
- `POST /verification/requests` — draft. 409 `VERIFICATION_ALREADY_PENDING`
  while a draft/submitted/in_review/needs_more_info request exists; 429
  `VERIFICATION_SUBMISSION_LIMIT` (details.retryAfterSeconds) when 5
  requests were submitted in 30 days (system-opened name/license re-checks
  don't count).
- `PATCH /verification/requests/:id` — `applicantComment` ≤500.
- `POST|DELETE /verification/requests/:id/licenses[/:licenseId]` — state +
  bar number (upper-cased). UQ (state, bar number) across attorneys → 409
  `LICENSE_ALREADY_REGISTERED`; one license per state per request → 409
  `LICENSE_ALREADY_ADDED`. The attorney's own earlier row with the same
  number (rejected/expired, or a renewal of a verified one, §2.6) returns to
  `pending` with the new expiry. Licenses in `pending` belong to the open
  request (there is only one). A renewal of a once-verified license can't
  be withdrawn by the attorney (409 `VERIFICATION_INVALID_STATUS`).
- `POST|DELETE /verification/requests/:id/documents[/:documentId]` —
  `bar_license` (needs `stateCode` of a pending license), `drivers_license` /
  `state_id` (side front/back), `passport` (front), `selfie`
  (`verification_selfie` file), `other`. Only the owner's `clean` file of the
  right purpose (`FilesService.assertAttachable` → 409 `FILE_NOT_ATTACHABLE`);
  up to 3 files per document. Removal only in `draft`; after an info request
  the attorney can only add.
- `POST /verification/requests/:id/submit` — draft → submitted after the
  completeness check (400 `VERIFICATION_INCOMPLETE`, `details.missing`:
  `license`, `bar_license:<STATE>`, `identity_document`,
  `identity_document_back`, `selfie`, `file_not_clean:<docId>`);
  needs_more_info → submitted keeps the original `submitted_at`.
- A suspended attorney gets 403 `ATTORNEY_SUSPENDED` on every write.
- §2.3 status sync (`verification.helpers.ts`): draft → unverified,
  submitted/in_review/needs_more_info → pending, approved → verified,
  rejected → rejected; never overrides `suspended`, and a `verified` attorney
  stays verified during/after an add-state request (a rejection leaving no
  verified license → `unverified`).

**Checks (§2.4)** — `VerificationProviderSelector` reads the flags on every
call: `auto_bar_check` → `AutoBarLookupProvider` routing by state to
`StateBarAdapter`s (none registered yet; `StubStateBarAdapter` is the
template; no adapter / adapter error → `manual_review`); `stripe_identity`
(wins) / `persona_verification` → structured stub adapters that
`CostGuard.consume('id_check')` before the (future) provider call. With all
flags off nothing runs and the request is purely manual. Results go to
`verification_checks` and `attorney_licenses.auto_check_result`; an
exhausted budget or provider error is recorded as `manual_review` and never
blocks the attorney.

**Verifier API `/admin/verification/*`** — `AdminRolesGuard`
(`modules/admin-access`, interim until docs/06 stage 6.2): `users.role =
admin`, active, and `admin_profiles.admin_role` ∈ {verifier, super_admin};
everything else 403 `FORBIDDEN` (deny by default, read from the DB).
- `GET requests` (queue: submitted + needs_more_info by default, `status`,
  `stateCode`, oldest first, keyset cursor on `submitted_at`), `GET
  requests/:id` (card: attorney, all licenses with bar numbers and
  auto-check result, document metadata, checks, history).
- `POST documents/:documentId/url` — 5-min signed link
  (`verification.signed_url_ttl_sec`), audit `verification.document_view`.
- `POST requests/:id/take` (submitted → in_review, locked to the verifier;
  others get 409 `VERIFICATION_REQUEST_LOCKED`), `…/licenses/:licenseId/
  decision` (verified | rejected + `rejection_code`/`rejection_note`),
  `…/approve` (409 `VERIFICATION_DECISION_INCOMPLETE` while a license is
  pending or none is verified; partial approval allowed), `…/request-info`
  (`info_request_message`), `…/reject` (`rejection_code` from §2.5.4 +
  comment → `rejection_reason`; pending licenses rejected with the code).
- `POST licenses/:licenseId/recheck` — bar lookup with the current
  provider; not `pass` → license `pending` in the open request or a new
  `submitted` request (`admin_note: license_recheck: …`).
- `POST attorneys/:attorneyId/suspend` (reason) → `suspended` (public
  profile 404, out of search) and active bids → `withdrawn` in one
  transaction (direct update — file 04's BidStateMachine doesn't exist yet);
  `…/restore` → the pre-suspension status from the audit row (`verified`
  → `unverified` if no verified license is left).
- Every action writes `audit_log` (before/after, IP) in its transaction and
  attorney-facing events emit `verification_update` with `payload.kind` ∈
  `in_review`, `needs_more_info` (+`message`), `approved` (+`partial`),
  `rejected` (+`rejectionCode`), `suspended`, `restored`.

**Error codes**: `VERIFICATION_ALREADY_PENDING`, `VERIFICATION_SUBMISSION_LIMIT`,
`VERIFICATION_INVALID_STATUS`, `VERIFICATION_INCOMPLETE`,
`VERIFICATION_REQUEST_LOCKED`, `VERIFICATION_DECISION_INCOMPLETE`,
`LICENSE_ALREADY_REGISTERED`, `LICENSE_ALREADY_ADDED`, `ATTORNEY_SUSPENDED`
(API enum, mobile `ApiErrorCodes`, en/ru texts).

**Translation keys** (`prisma/seed/pending_keys/stage-3-3-3-4.csv`):
`error.api.*` above, `notif.verification.{in_review,needs_more_info,approved,
approved_partial,rejected,suspended,restored}`, `verification.reject.<code>`.

**Not in scope / follow-ups**: docs/06 "reason for viewing" (`audit_log.
justification`) needs a file-06 schema change; real state bar adapters and
Stripe Identity/Persona sessions (keys); bid withdrawal via BidStateMachine
+ case journal once file 04 exists.

Tests: `test/verification.e2e-spec.ts` (13), unit specs for the guard,
providers/selector, checks service, document rules and status sync.
