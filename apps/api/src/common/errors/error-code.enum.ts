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
  // Owner 2026-10-01: one account, one device.
  AUTH_SIGNED_IN_ELSEWHERE = 'AUTH_SIGNED_IN_ELSEWHERE',
  // 409 on sign-in: confirm signing the other phone / browser out.
  AUTH_OTHER_DEVICE_ACTIVE = 'AUTH_OTHER_DEVICE_ACTIVE',
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
  /** Owner 2026-09-30: a client review was already appealed. */
  REVIEW_APPEAL_EXISTS = 'REVIEW_APPEAL_EXISTS',
  /** OQ-047: chat files open once the bid is accepted. */
  CHAT_ATTACHMENTS_LOCKED = 'CHAT_ATTACHMENTS_LOCKED',
  // OQ-048: attorney assistants.
  SUBSCRIPTION_PLAN_INCLUDES_SEATS = 'SUBSCRIPTION_PLAN_INCLUDES_SEATS',
  ASSISTANT_SEATS_IN_USE = 'ASSISTANT_SEATS_IN_USE',
  ASSISTANT_NO_FREE_SEAT = 'ASSISTANT_NO_FREE_SEAT',
  ASSISTANT_NOT_ALLOWED = 'ASSISTANT_NOT_ALLOWED',
  ASSISTANT_PHONE_TAKEN = 'ASSISTANT_PHONE_TAKEN',
  ASSISTANT_INVITE_NOT_FOUND = 'ASSISTANT_INVITE_NOT_FOUND',
  // OQ-049: granting bids / publish needs the attorney's acceptance.
  ASSISTANT_LIABILITY_REQUIRED = 'ASSISTANT_LIABILITY_REQUIRED',
  /** Owner 2026-10-01: a cancelled task takes no new steps. */
  TASK_CLOSED = 'TASK_CLOSED',
  /** A task holds up to 100 steps. */
  TASK_STEPS_LIMIT = 'TASK_STEPS_LIMIT',
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
  // 413: request body over BODY_LIMIT_KB (docs/06 §4.1).
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
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
  // Admin panel (docs/06 §2.1, stage 6.2)
  // 400: sensitive view without X-Justification (10–500 chars).
  JUSTIFICATION_REQUIRED = 'JUSTIFICATION_REQUIRED',
  // 401: the pre-auth ticket (between email code and TOTP) is missing,
  // expired, already used or burned after too many wrong codes.
  ADMIN_TICKET_INVALID = 'ADMIN_TICKET_INVALID',
  // 401: wrong authenticator code; details.remainingAttempts.
  ADMIN_TOTP_INVALID = 'ADMIN_TOTP_INVALID',
  // 401: unknown or already used recovery code.
  ADMIN_RECOVERY_CODE_INVALID = 'ADMIN_RECOVERY_CODE_INVALID',
  // 503: ADMIN_TOTP_ENC_KEY is not set on this deployment.
  ADMIN_AUTH_NOT_CONFIGURED = 'ADMIN_AUTH_NOT_CONFIGURED',
  // 409: an account with this email already exists.
  ADMIN_EMAIL_TAKEN = 'ADMIN_EMAIL_TAKEN',
  // 401: wrong login or password (never says which).
  ADMIN_CREDENTIALS_INVALID = 'ADMIN_CREDENTIALS_INVALID',
  // 409: this login belongs to another admin.
  ADMIN_LOGIN_TAKEN = 'ADMIN_LOGIN_TAKEN',
  // 401: password recovery by the security question did not work.
  ADMIN_RECOVERY_FAILED = 'ADMIN_RECOVERY_FAILED',
  // Moderation (docs/06 §3, stage 6.4)
  // 422: the rule-based check (blocked terms) refused the publication.
  CONTENT_BLOCKED = 'CONTENT_BLOCKED',
  // 409: the action does not apply to this object / state (e.g. remove a
  // user, restore something that is not hidden).
  MODERATION_ACTION_NOT_APPLICABLE = 'MODERATION_ACTION_NOT_APPLICABLE',
  // Admin config (docs/06 §2.3 items 7–10, stage 6.6)
  // 409: a paid-service flag can't be enabled without the provider keys;
  // details.missingKeys.
  FLAG_PROVIDER_KEYS_MISSING = 'FLAG_PROVIDER_KEYS_MISSING',
  // 409: publishing a legal document version that is already current, or
  // a draft that has no content.
  LEGAL_DOCUMENT_INVALID_STATE = 'LEGAL_DOCUMENT_INVALID_STATE',
  // Subscriptions / Stripe (docs/06 §1, stage 6.7)
  // 503: STRIPE_SECRET_KEY / STRIPE_PRICE_ID are not configured.
  PAYMENTS_NOT_CONFIGURED = 'PAYMENTS_NOT_CONFIGURED',
  // 409: the attorney already has a trialing / active / past_due subscription.
  SUBSCRIPTION_ALREADY_ACTIVE = 'SUBSCRIPTION_ALREADY_ACTIVE',
  // 409: no trial for this attorney or card (§1.1); the app must confirm
  // "будет списано $399 сейчас" and repeat with chargeNow = true.
  SUBSCRIPTION_TRIAL_UNAVAILABLE = 'SUBSCRIPTION_TRIAL_UNAVAILABLE',
  // 409: the SetupIntent is not succeeded / has no payment method yet.
  SUBSCRIPTION_SETUP_INCOMPLETE = 'SUBSCRIPTION_SETUP_INCOMPLETE',
  // 404: the attorney has no subscription.
  SUBSCRIPTION_NOT_FOUND = 'SUBSCRIPTION_NOT_FOUND',
  // 400: Stripe-Signature missing or invalid on POST /webhooks/stripe.
  WEBHOOK_SIGNATURE_INVALID = 'WEBHOOK_SIGNATURE_INVALID',

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

  // --- docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md §15 (stage 5.1) ---
  // 404: no such post, or deleted / hidden / removed for this viewer.
  POST_NOT_FOUND = 'POST_NOT_FOUND',
  // 403: posting needs a verified, active attorney (§3.1).
  POST_NOT_ALLOWED = 'POST_NOT_ALLOWED',
  // 404: no such comment (or deleted).
  COMMENT_NOT_FOUND = 'COMMENT_NOT_FOUND',
  // 422: follow a client or yourself (§6.1).
  FOLLOW_NOT_ALLOWED = 'FOLLOW_NOT_ALLOWED',
  // 404: not a participant, or no such conversation.
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
  // 409: the conversation is closed (read only, §8.2).
  CONVERSATION_CLOSED = 'CONVERSATION_CLOSED',
  // 400: a message longer than 2000 characters (§8.2).
  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',
  // 403: the feature is off by a feature flag (video posts, §3.6).
  FEATURE_DISABLED = 'FEATURE_DISABLED',
  // 400: search needs at least 2 characters (§7.1).
  SEARCH_QUERY_TOO_SHORT = 'SEARCH_QUERY_TOO_SHORT',
  // 403: one of the two users blocked the other (OQ-028).
  USER_BLOCKED = 'USER_BLOCKED',
  // 404: no such call, or the caller is not one of its two members (OQ-041).
  CALL_NOT_FOUND = 'CALL_NOT_FOUND',
  // 409: calls open once the bid is accepted (contacts unlocked) (OQ-041).
  CALL_NOT_ALLOWED = 'CALL_NOT_ALLOWED',
  // 409: the caller is already in another call (OQ-041).
  CALL_IN_PROGRESS = 'CALL_IN_PROGRESS',
  // 409: the call already ended / was answered elsewhere (OQ-041).
  CALL_STATE_CONFLICT = 'CALL_STATE_CONFLICT',
  // 409: direct chats are between an attorney and a client (OQ-043).
  DIRECT_CHAT_NOT_ALLOWED = 'DIRECT_CHAT_NOT_ALLOWED',
  // 403: the recipient declined this message request (OQ-043).
  MESSAGE_REQUEST_DECLINED = 'MESSAGE_REQUEST_DECLINED',
  // 409: up to 3 messages until the request is accepted (OQ-043).
  MESSAGE_REQUEST_LIMIT = 'MESSAGE_REQUEST_LIMIT',
  // 503: the integrations admin needs SECRETS_MASTER_KEYS (owner 2026-10-01).
  INTEGRATIONS_NOT_CONFIGURED = 'INTEGRATIONS_NOT_CONFIGURED',
  // 409: an integration key change needs a passed test / raced (2026-10-01).
  INTEGRATION_CONFLICT = 'INTEGRATION_CONFLICT',
  // 403: a sensitive admin action needs a fresh 2FA code (owner 2026-10-01).
  ADMIN_STEP_UP_REQUIRED = 'ADMIN_STEP_UP_REQUIRED',
  // 403 / 409: video posts are off, not configured or over a limit.
  VIDEO_UNAVAILABLE = 'VIDEO_UNAVAILABLE',
  VIDEO_TOO_LONG = 'VIDEO_TOO_LONG',
  VIDEO_NOT_READY = 'VIDEO_NOT_READY',
  // Owner 2026-10-01: stickers — 409: over a pack/sticker/install limit.
  STICKER_LIMIT_REACHED = 'STICKER_LIMIT_REACHED',
  // Owner 2026-10-02: 409 — a closed support ticket can't get replies.
  SUPPORT_TICKET_CLOSED = 'SUPPORT_TICKET_CLOSED',
  // Owner 2026-10-02 referrals — 404: no such referral code.
  REFERRAL_CODE_INVALID = 'REFERRAL_CODE_INVALID',
  // 409: self-referral, already referred, sign-up window passed, no role.
  REFERRAL_NOT_ALLOWED = 'REFERRAL_NOT_ALLOWED',
  // 409: admin action not valid for the referral's current status.
  REFERRAL_INVALID_STATE = 'REFERRAL_INVALID_STATE',
  // Owner 2026-10-02 case promotion — 409: the case already has one.
  PROMOTION_ALREADY_ACTIVE = 'PROMOTION_ALREADY_ACTIVE',
  // 409: promotion action not valid for its current status.
  PROMOTION_INVALID_STATE = 'PROMOTION_INVALID_STATE',
  // Owner 2026-10-02: 400 — promo code unknown, expired, used up or not
  // valid for this purchase.
  PROMO_CODE_INVALID = 'PROMO_CODE_INVALID',
  // Owner 2026-10-02 (admin billing): 409 a promo code with this code
  // exists (PROMO_CODE_INVALID above is the 400 for using one).
  PROMO_CODE_EXISTS = 'PROMO_CODE_EXISTS',
  // 409: the user is not a live attorney (contract grants).
  CONTRACT_GRANT_NOT_ATTORNEY = 'CONTRACT_GRANT_NOT_ATTORNEY',
  // 409: the grant was revoked (no extend / revoke again).
  CONTRACT_GRANT_REVOKED = 'CONTRACT_GRANT_REVOKED',
  // 409: refund above what is left of the payment; payment not refundable.
  REFUND_AMOUNT_EXCEEDED = 'REFUND_AMOUNT_EXCEEDED',
  REFUND_NOT_ALLOWED = 'REFUND_NOT_ALLOWED',
  // 502: the payment provider refused the refund.
  REFUND_PROVIDER_FAILED = 'REFUND_PROVIDER_FAILED',
  // Admin 2026-10-02 — 409: restore/hide/takedown not valid for the
  // content's current state (e.g. restoring a post its author deleted).
  CONTENT_INVALID_STATE = 'CONTENT_INVALID_STATE',
  // 409: an official sticker pack with this short name exists.
  STICKER_PACK_NAME_TAKEN = 'STICKER_PACK_NAME_TAKEN',
}
