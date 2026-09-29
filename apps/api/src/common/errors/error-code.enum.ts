/**
 * docs/01_FOUNDATION_AUTH.md §7: "Коды ошибок только из общего enum
 * (ErrorCode), одинаковый на сервере и клиенте." Add codes here as each
 * stage introduces new failure modes — never invent an ad-hoc string in a
 * controller/service. When packages/api-contract exists, this enum is the
 * source that gets mirrored into the generated Dart client.
 */
export enum ErrorCode {
  // Generic / infra (stage 1.2)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMITED = 'RATE_LIMITED',
  IDEMPOTENCY_KEY_REQUIRED = 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_CONFLICT = 'IDEMPOTENCY_KEY_CONFLICT',

  // App lifecycle (docs/01_FOUNDATION_AUTH.md §7, stage 1.8)
  APP_UPDATE_REQUIRED = 'APP_UPDATE_REQUIRED',

  // Auth (docs/01_FOUNDATION_AUTH.md §10, stage 1.4)
  //
  // TOKEN_EXPIRED is load-bearing: the spec (§10.4) says the mobile
  // client's dio interceptor keys off this EXACT string to trigger its
  // silent-refresh flow. It must only ever be thrown for a genuinely
  // expired access token — never for a malformed/blacklisted/wrong-
  // signature one (those use UNAUTHORIZED / AUTH_SESSION_REVOKED), or the
  // client enters an infinite refresh loop on a token that refreshing
  // can't fix.
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  AUTH_OTP_INVALID = 'AUTH_OTP_INVALID',
  AUTH_OTP_EXPIRED = 'AUTH_OTP_EXPIRED',
  AUTH_OTP_LOCKED = 'AUTH_OTP_LOCKED',
  AUTH_OTP_REQUEST_LIMIT = 'AUTH_OTP_REQUEST_LIMIT',
  AUTH_REFRESH_INVALID = 'AUTH_REFRESH_INVALID',
  AUTH_REFRESH_EXPIRED = 'AUTH_REFRESH_EXPIRED',
  AUTH_REFRESH_REUSE_DETECTED = 'AUTH_REFRESH_REUSE_DETECTED',
  AUTH_SESSION_REVOKED = 'AUTH_SESSION_REVOKED',
  AUTH_SOCIAL_TOKEN_INVALID = 'AUTH_SOCIAL_TOKEN_INVALID',
  AUTH_SOCIAL_PROVIDER_UNAVAILABLE = 'AUTH_SOCIAL_PROVIDER_UNAVAILABLE',
  AUTH_PROVIDER_DISABLED = 'AUTH_PROVIDER_DISABLED',
  ACCOUNT_EXISTS_USE_OTHER_METHOD = 'ACCOUNT_EXISTS_USE_OTHER_METHOD',
  IDENTIFIER_ALREADY_LINKED = 'IDENTIFIER_ALREADY_LINKED',
  CONTACT_DOMAIN_BLOCKED = 'CONTACT_DOMAIN_BLOCKED',
  CONTACT_ALREADY_EXISTS = 'CONTACT_ALREADY_EXISTS',
  REAUTH_REQUIRED = 'REAUTH_REQUIRED',
  REAUTH_INVALID = 'REAUTH_INVALID',
  DEVICE_ATTESTATION_REQUIRED = 'DEVICE_ATTESTATION_REQUIRED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',

  // Onboarding (docs/01_FOUNDATION_AUTH.md §11, stage 1.7)
  CLIENT_CONTACTS_INCOMPLETE = 'CLIENT_CONTACTS_INCOMPLETE',
  ONBOARDING_INCOMPLETE = 'ONBOARDING_INCOMPLETE',
  ROLE_ALREADY_SET = 'ROLE_ALREADY_SET',
  // Endpoint exists as a stub until the stage that owns it (e.g. POST
  // /cases until file 04).
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',

  // i18n (docs/01_FOUNDATION_AUTH.md §9, stage 1.6)
  I18N_LANGUAGE_NOT_FOUND = 'I18N_LANGUAGE_NOT_FOUND',
  I18N_IMPORT_INVALID = 'I18N_IMPORT_INVALID',

  // Cost protection (owner-approved spec extension 2026-09-27, see
  // docs/OPEN_QUESTIONS.md and docs/COST_PROTECTION.md).
  // 503: the global budget/velocity cap of a paid provider (SMS, email,
  // identity checks, ...) is exhausted, or the guard can't verify the
  // budget (Redis down -> fail closed). Retry later.
  PROVIDER_BUDGET_EXCEEDED = 'PROVIDER_BUDGET_EXCEEDED',
  // 400: SMS destination outside sms.allowed_country_codes (US-only
  // product; docs/01_FOUNDATION_AUTH.md §10.6 "блок подозрительных
  // префиксов стран") or a premium/toll-free/shared-cost number type.
  PHONE_COUNTRY_NOT_SUPPORTED = 'PHONE_COUNTRY_NOT_SUPPORTED',

  // Reviews (docs/03_VERIFICATION_PROFILES.md §7, stage 3.7). All 409.
  // The case is not `closed` yet (§7.1).
  REVIEW_CASE_NOT_CLOSED = 'REVIEW_CASE_NOT_CLOSED',
  // The case has no accepted bid, so there is no attorney to review.
  REVIEW_NO_ACCEPTED_BID = 'REVIEW_NO_ACCEPTED_BID',
  // One review per case (UQ reviews.case_id).
  REVIEW_ALREADY_EXISTS = 'REVIEW_ALREADY_EXISTS',
  // review.edit_window_days after publication have passed (§7.2).
  REVIEW_EDIT_WINDOW_EXPIRED = 'REVIEW_EDIT_WINDOW_EXPIRED',
  // A moderator hid or removed the review; it can't be edited.
  REVIEW_NOT_EDITABLE = 'REVIEW_NOT_EDITABLE',
  // Practices and profiles (docs/03_VERIFICATION_PROFILES.md §3–§4,
  // stages 3.5–3.6)
  // 403: the action needs verification_status = verified (practices).
  ATTORNEY_NOT_VERIFIED = 'ATTORNEY_NOT_VERIFIED',
  // 409: another attorney holds this @username (case-insensitive).
  USERNAME_TAKEN = 'USERNAME_TAKEN',
  // 400: the @username is on profile.reserved_usernames.
  USERNAME_RESERVED = 'USERNAME_RESERVED',
  // 409: @username changed less than profile.username_change_cooldown_days
  // ago; details.nextChangeAt says when it is allowed again.
  USERNAME_CHANGE_TOO_SOON = 'USERNAME_CHANGE_TOO_SOON',
  // Files (docs/03_VERIFICATION_PROFILES.md §2.2, stage 3.2)
  // 400: the declared or the real (magic bytes) type is not allowed for
  // this purpose, or the real type differs from the declared one.
  FILE_TYPE_NOT_ALLOWED = 'FILE_TYPE_NOT_ALLOWED',
  // 400: over files.max_size_mb / files.avatar_max_size_mb.
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  // 400: the uploaded object's size or SHA-256 differs from the declared.
  FILE_CHECKSUM_MISMATCH = 'FILE_CHECKSUM_MISMATCH',
  // 409: confirm called before the object was uploaded to S3.
  FILE_NOT_UPLOADED = 'FILE_NOT_UPLOADED',
  // 409: the file can't be attached (wrong purpose, or scan_status is not
  // clean: pending / infected / failed).
  FILE_NOT_ATTACHABLE = 'FILE_NOT_ATTACHABLE',
  // 503: file storage (S3) is not configured or not reachable.
  FILE_STORAGE_UNAVAILABLE = 'FILE_STORAGE_UNAVAILABLE',
  // Verification (docs/03_VERIFICATION_PROFILES.md §2, stages 3.3–3.4)
  // 409: the attorney already has a draft/submitted/in_review/
  // needs_more_info request (§2.3: one at a time).
  VERIFICATION_ALREADY_PENDING = 'VERIFICATION_ALREADY_PENDING',
  // 429: verification.max_submissions_30d requests were already submitted
  // in the last 30 days (§2.3, §9); details.retryAfterSeconds.
  VERIFICATION_SUBMISSION_LIMIT = 'VERIFICATION_SUBMISSION_LIMIT',
  // 409: the request's status does not allow this action (e.g. editing a
  // submitted request, approving a request not in review).
  VERIFICATION_INVALID_STATUS = 'VERIFICATION_INVALID_STATUS',
  // 400: submit without the required licenses/documents/selfie;
  // details.missing lists what is missing.
  VERIFICATION_INCOMPLETE = 'VERIFICATION_INCOMPLETE',
  // 409: another verifier has taken this request into work.
  VERIFICATION_REQUEST_LOCKED = 'VERIFICATION_REQUEST_LOCKED',
  // 409: approve while a license of the request is still undecided, or no
  // license is verified; details.pendingLicenseIds.
  VERIFICATION_DECISION_INCOMPLETE = 'VERIFICATION_DECISION_INCOMPLETE',
  // 409: this bar number in this state belongs to another attorney
  // (UQ attorney_licenses(state_code, bar_number)).
  LICENSE_ALREADY_REGISTERED = 'LICENSE_ALREADY_REGISTERED',
  // 409: the request already has a license in this state.
  LICENSE_ALREADY_ADDED = 'LICENSE_ALREADY_ADDED',
  // 403: a suspended attorney can't create or change verification requests.
  ATTORNEY_SUSPENDED = 'ATTORNEY_SUSPENDED',

  // Cases and bids (docs/04_CASES_BIDS.md §15, stage 4.1 state machines
  // and access policy).
  // 404: no such case, or the caller may not see it (deny by default —
  // CaseAccessPolicy never reveals that a hidden case exists).
  CASE_NOT_FOUND = 'CASE_NOT_FOUND',
  // 404: attorney-facing variant of the same deny-by-default decision
  // (docs/04 §4.1, §15 "нет лицензии/практики"; stage 4.3 acceptance:
  // hitting an ineligible case's id directly gets this, not
  // CASE_NOT_FOUND). Used by CaseAccessPolicy.assertVisibleToAttorney —
  // still opaque about whether the case exists at all.
  CASE_NOT_AVAILABLE = 'CASE_NOT_AVAILABLE',
  // 409: the case's status does not allow this action (§10.1).
  CASE_INVALID_STATE = 'CASE_INVALID_STATE',
  // 409: the bid's status does not allow this action (§6.3).
  BID_INVALID_STATE = 'BID_INVALID_STATE',
  // 409: it is the other party's turn in the negotiation (§6.1, §6.3).
  BID_NOT_YOUR_TURN = 'BID_NOT_YOUR_TURN',
  // 409: 5 counter-offers were already made on this bid (§6.1, §6.2).
  BID_MAX_ROUNDS_REACHED = 'BID_MAX_ROUNDS_REACHED',
  // 409: free-consultation bids can only be accepted or declined (§6.1).
  BID_COUNTER_NOT_ALLOWED = 'BID_COUNTER_NOT_ALLOWED',

  // Bids and negotiation (docs/04_CASES_BIDS.md §5–§6, stage 4.4).
  // 403: SubscriptionAccessService.isActive(attorneyId) is false (§2: no
  // active subscription/trial) when bidding or messaging a client.
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  // 409: UQ bids(case_id, attorney_id) — a second bid by the same
  // attorney on this case, including after the first was withdrawn (§5.1).
  BID_ALREADY_EXISTS = 'BID_ALREADY_EXISTS',
  // Case creation and management (docs/04_CASES_BIDS.md §3, stage 4.2)
  // 400: title/description/city matched the §3.3 phone/email/link
  // detector; details.field names which one.
  CASE_CONTAINS_CONTACT_INFO = 'CASE_CONTAINS_CONTACT_INFO',
  // 403: the client has never granted the client_contact_sharing consent
  // (§3.1 step 5) and this request doesn't grant it either.
  CLIENT_CONTACT_SHARING_CONSENT_REQUIRED = 'CLIENT_CONTACT_SHARING_CONSENT_REQUIRED',
  // Bid acceptance and client contacts (docs/04_CASES_BIDS.md §7–§8,
  // stage 4.5).
  // 409: at the moment of acceptance the bid's attorney is no longer
  // verified / licensed in a state of the case / subscribed (§7 step 2);
  // the bid has been withdrawn — the client picks another one.
  BID_ATTORNEY_INACTIVE = 'BID_ATTORNEY_INACTIVE',
  // 403: the attorney has no accepted bid on this case, so the client's
  // contacts were never disclosed to them (§8.1). Also for "Не могу
  // связаться" before any disclosure (§8.4).
  CONTACTS_LOCKED = 'CONTACTS_LOCKED',
  // 409: the attorney already has an open "Не могу связаться" report on
  // this case awaiting support (§8.4).
  CONTACT_ISSUE_ALREADY_OPEN = 'CONTACT_ISSUE_ALREADY_OPEN',
  // 409: the report is already resolved (confirmed/rejected).
  CONTACT_ISSUE_INVALID_STATE = 'CONTACT_ISSUE_INVALID_STATE',
}
