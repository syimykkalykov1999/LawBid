import 'package:dio/dio.dart';
import 'package:lawbid/core/network/request_flags.dart';

/// String constants for EVERY `ErrorCode` value
/// (apps/api/src/common/errors/error-code.enum.ts — docs/01_FOUNDATION_AUTH.md
/// §7: "Коды ошибок только из общего enum (ErrorCode), одинаковый на
/// сервере и клиенте"). The same enum is generated into
/// `package:lawbid_api` (`ErrorCode`, from packages/api-contract/openapi.json);
/// test/core/network/api_error_codes_test.dart fails when [all] and the
/// generated enum drift apart. Call sites branch on these constants, never
/// on a string literal or on `message`.
abstract final class ApiErrorCodes {
  // Generic / infra (stage 1.2)
  static const validationError = 'VALIDATION_ERROR';
  static const internalError = 'INTERNAL_ERROR';
  static const notFound = 'NOT_FOUND';
  static const unauthorized = 'UNAUTHORIZED';
  static const forbidden = 'FORBIDDEN';
  static const rateLimited = 'RATE_LIMITED';
  static const idempotencyKeyRequired = 'IDEMPOTENCY_KEY_REQUIRED';
  static const idempotencyKeyConflict = 'IDEMPOTENCY_KEY_CONFLICT';

  // App lifecycle (stage 1.8) — handled globally by AppUpdateInterceptor
  // (426 -> forced-update screen).
  static const appUpdateRequired = 'APP_UPDATE_REQUIRED';

  /// Owner 2026-10-22 (client economy plan): `?updatedSince` / `afterId`
  /// older than the server keeps — reload the list from the first page.
  static const syncTooOld = 'SYNC_TOO_OLD';

  /// Owner 2026-10-25 (experiments, 409): the action does not fit the
  /// experiment's state (start a running one, ramp up a stopped one ...).
  static const experimentStateInvalid = 'EXPERIMENT_STATE_INVALID';

  /// A write sent an old `version` (409): somebody else saved first.
  static const staleVersion = 'STALE_VERSION';

  // Auth (docs/01 §10, stage 1.4). TOKEN_EXPIRED is the one code
  // AuthInterceptor's silent refresh keys off (§10.4).
  static const tokenExpired = 'TOKEN_EXPIRED';
  static const authOtpInvalid = 'AUTH_OTP_INVALID';
  static const authOtpExpired = 'AUTH_OTP_EXPIRED';
  static const authOtpLocked = 'AUTH_OTP_LOCKED';
  static const authOtpRequestLimit = 'AUTH_OTP_REQUEST_LIMIT';

  /// Owner 2026-10-25: a new password found in a breach / the common list.
  static const authPasswordCompromised = 'AUTH_PASSWORD_COMPROMISED';

  /// Owner 2026-10-16: the number is registered; an SMS code is only for new
  /// numbers (sign in with the password, or set one through the reset).
  static const authPhoneRegistered = 'AUTH_PHONE_REGISTERED';
  static const authRefreshInvalid = 'AUTH_REFRESH_INVALID';
  static const authRefreshExpired = 'AUTH_REFRESH_EXPIRED';
  static const authRefreshReuseDetected = 'AUTH_REFRESH_REUSE_DETECTED';
  static const authSessionRevoked = 'AUTH_SESSION_REVOKED';
  // Owner 2026-10-01: one phone + one website per account.
  static const authSignedInElsewhere = 'AUTH_SIGNED_IN_ELSEWHERE';
  static const authOtherDeviceActive = 'AUTH_OTHER_DEVICE_ACTIVE';
  static const authSocialTokenInvalid = 'AUTH_SOCIAL_TOKEN_INVALID';
  static const authSocialProviderUnavailable =
      'AUTH_SOCIAL_PROVIDER_UNAVAILABLE';
  static const authProviderDisabled = 'AUTH_PROVIDER_DISABLED';
  static const authInvalidCredentials = 'AUTH_INVALID_CREDENTIALS';
  static const postAttachmentsNotAllowed = 'POST_ATTACHMENTS_NOT_ALLOWED';
  static const accountExistsUseOtherMethod = 'ACCOUNT_EXISTS_USE_OTHER_METHOD';
  static const identifierAlreadyLinked = 'IDENTIFIER_ALREADY_LINKED';
  static const contactDomainBlocked = 'CONTACT_DOMAIN_BLOCKED';
  static const contactAlreadyExists = 'CONTACT_ALREADY_EXISTS';
  static const reauthRequired = 'REAUTH_REQUIRED';
  // Owner 2026-10-22 (passkeys, docs/runbooks/PASSKEYS.md).
  static const passkeyInvalid = 'PASSKEY_INVALID';
  static const passkeyNotFound = 'PASSKEY_NOT_FOUND';
  static const passkeyLimit = 'PASSKEY_LIMIT';
  static const reauthInvalid = 'REAUTH_INVALID';
  static const deviceAttestationRequired = 'DEVICE_ATTESTATION_REQUIRED';
  // 2026-10-24: web-only bot check; the app never sends it.
  static const turnstileFailed = 'TURNSTILE_FAILED';
  static const accountSuspended = 'ACCOUNT_SUSPENDED';
  // Owner 2026-10-05 (client fraud): limited while staff check the account.
  static const accountRestricted = 'ACCOUNT_RESTRICTED';
  static const accountDeleted = 'ACCOUNT_DELETED';

  // Onboarding (docs/01 §11, stage 1.7)
  static const clientContactsIncomplete = 'CLIENT_CONTACTS_INCOMPLETE';
  static const onboardingIncomplete = 'ONBOARDING_INCOMPLETE';
  static const roleAlreadySet = 'ROLE_ALREADY_SET';
  static const notImplemented = 'NOT_IMPLEMENTED';

  // i18n (docs/01 §9, stage 1.6)
  static const i18nLanguageNotFound = 'I18N_LANGUAGE_NOT_FOUND';
  static const i18nImportInvalid = 'I18N_IMPORT_INVALID';

  // Cost protection (docs/COST_PROTECTION.md)
  static const providerBudgetExceeded = 'PROVIDER_BUDGET_EXCEEDED';
  static const phoneCountryNotSupported = 'PHONE_COUNTRY_NOT_SUPPORTED';

  // Countries (owner 2026-10-05): LawBid is not open there yet.
  static const countryNotAvailable = 'COUNTRY_NOT_AVAILABLE';

  // Reviews (docs/03 §7, stage 3.7)
  static const reviewCaseNotClosed = 'REVIEW_CASE_NOT_CLOSED';
  static const reviewNoAcceptedBid = 'REVIEW_NO_ACCEPTED_BID';
  static const reviewAlreadyExists = 'REVIEW_ALREADY_EXISTS';
  static const reviewAppealExists = 'REVIEW_APPEAL_EXISTS';
  static const consultationSlotTaken = 'CONSULTATION_SLOT_TAKEN';
  static const consultationNotAvailable = 'CONSULTATION_NOT_AVAILABLE';
  static const consultationStateConflict = 'CONSULTATION_STATE_CONFLICT';
  static const qaAnswersEnough = 'QA_ANSWERS_ENOUGH';
  static const qaQuestionClosed = 'QA_QUESTION_CLOSED';
  // Owner 2026-10-21 (Telegram «Переслать» / «Запретить копирование»).
  static const forwardNotAllowed = 'FORWARD_NOT_ALLOWED';
  static const contentProtected = 'CONTENT_PROTECTED';
  static const unsupportedInTarget = 'UNSUPPORTED_IN_TARGET';
  static const chatAttachmentsLocked = 'CHAT_ATTACHMENTS_LOCKED';
  // OQ-048 plans and assistants.
  static const subscriptionPlanIncludesSeats =
      'SUBSCRIPTION_PLAN_INCLUDES_SEATS';
  static const assistantSeatsInUse = 'ASSISTANT_SEATS_IN_USE';
  static const assistantNoFreeSeat = 'ASSISTANT_NO_FREE_SEAT';
  // Owner 2026-10-22: seats charged now; at most N duties per assistant.
  static const assistantTooManyDuties = 'ASSISTANT_TOO_MANY_DUTIES';
  static const seatsTrialNotAllowed = 'SEATS_TRIAL_NOT_ALLOWED';
  static const seatsNotPaidYet = 'SEATS_NOT_PAID_YET';
  static const seatsPreviewStale = 'SEATS_PREVIEW_STALE';
  static const assistantNotAllowed = 'ASSISTANT_NOT_ALLOWED';
  static const assistantPhoneTaken = 'ASSISTANT_PHONE_TAKEN';
  static const assistantInviteNotFound = 'ASSISTANT_INVITE_NOT_FOUND';
  static const assistantCodeInvalid = 'ASSISTANT_CODE_INVALID';
  static const assistantLiabilityRequired = 'ASSISTANT_LIABILITY_REQUIRED';
  static const taskClosed = 'TASK_CLOSED';
  static const taskStepsLimit = 'TASK_STEPS_LIMIT';
  static const filesCountLimit = 'FILES_COUNT_LIMIT';
  static const reviewEditWindowExpired = 'REVIEW_EDIT_WINDOW_EXPIRED';
  static const reviewNotEditable = 'REVIEW_NOT_EDITABLE';
  // Practices and profiles (docs/03 §3–§4, stages 3.5–3.6)
  static const attorneyNotVerified = 'ATTORNEY_NOT_VERIFIED';
  static const usernameTaken = 'USERNAME_TAKEN';
  static const usernameReserved = 'USERNAME_RESERVED';
  static const usernameChangeTooSoon = 'USERNAME_CHANGE_TOO_SOON';
  // Files (docs/03 §2.2, stage 3.2)
  static const fileTypeNotAllowed = 'FILE_TYPE_NOT_ALLOWED';
  static const fileTooLarge = 'FILE_TOO_LARGE';
  static const fileChecksumMismatch = 'FILE_CHECKSUM_MISMATCH';
  static const fileNotUploaded = 'FILE_NOT_UPLOADED';
  // Owner 2026-10-05 (storage like Telegram): per-user and per-chat caps.
  static const storageQuotaExceeded = 'STORAGE_QUOTA_EXCEEDED';
  static const chatStorageFull = 'CHAT_STORAGE_FULL';
  // 2026-10-24: daily upload-bytes cap per person.
  static const dailyUploadLimitExceeded = 'DAILY_UPLOAD_LIMIT_EXCEEDED';
  static const fileNotAttachable = 'FILE_NOT_ATTACHABLE';
  static const fileStorageUnavailable = 'FILE_STORAGE_UNAVAILABLE';
  // Verification (docs/03 §2, stages 3.3–3.4)
  static const verificationAlreadyPending = 'VERIFICATION_ALREADY_PENDING';
  static const verificationSubmissionLimit = 'VERIFICATION_SUBMISSION_LIMIT';
  static const verificationInvalidStatus = 'VERIFICATION_INVALID_STATUS';
  static const verificationIncomplete = 'VERIFICATION_INCOMPLETE';
  static const verificationRequestLocked = 'VERIFICATION_REQUEST_LOCKED';
  static const verificationDecisionIncomplete =
      'VERIFICATION_DECISION_INCOMPLETE';
  static const licenseAlreadyRegistered = 'LICENSE_ALREADY_REGISTERED';
  static const licenseAlreadyAdded = 'LICENSE_ALREADY_ADDED';
  static const attorneySuspended = 'ATTORNEY_SUSPENDED';
  // Cases and bids (docs/04 §15, stage 4.1)
  static const caseNotFound = 'CASE_NOT_FOUND';
  static const caseInvalidState = 'CASE_INVALID_STATE';
  static const bidInvalidState = 'BID_INVALID_STATE';
  static const bidNotYourTurn = 'BID_NOT_YOUR_TURN';
  static const bidMaxRoundsReached = 'BID_MAX_ROUNDS_REACHED';
  static const bidCounterNotAllowed = 'BID_COUNTER_NOT_ALLOWED';
  // Bids and negotiation (docs/04 §5–§6, stage 4.4)
  static const subscriptionRequired = 'SUBSCRIPTION_REQUIRED';
  // Stars and gifts (owner 2026-10-20)
  static const insufficientStars = 'INSUFFICIENT_STARS';
  static const stickerPackNotOwned = 'STICKER_PACK_NOT_OWNED';
  static const caseNotAvailable = 'CASE_NOT_AVAILABLE';
  static const postNotFound = 'POST_NOT_FOUND';
  static const postNotAllowed = 'POST_NOT_ALLOWED';
  static const storyLimitReached = 'STORY_LIMIT_REACHED';
  static const channelLimitReached = 'CHANNEL_LIMIT_REACHED';
  static const channelUsernameTaken = 'CHANNEL_USERNAME_TAKEN';
  static const repostOwnPost = 'REPOST_OWN_POST';
  static const commentNotFound = 'COMMENT_NOT_FOUND';
  static const followNotAllowed = 'FOLLOW_NOT_ALLOWED';
  static const conversationNotFound = 'CONVERSATION_NOT_FOUND';
  static const conversationClosed = 'CONVERSATION_CLOSED';
  static const groupNotFound = 'GROUP_NOT_FOUND';
  static const groupForbidden = 'GROUP_FORBIDDEN';
  static const groupFull = 'GROUP_FULL';
  static const groupUsernameTaken = 'GROUP_USERNAME_TAKEN';
  static const pollClosed = 'POLL_CLOSED';
  static const messageTooLong = 'MESSAGE_TOO_LONG';
  static const messageWindowExpired = 'MESSAGE_WINDOW_EXPIRED';
  static const textTooLong = 'TEXT_TOO_LONG';
  static const featureDisabled = 'FEATURE_DISABLED';
  static const searchQueryTooShort = 'SEARCH_QUERY_TOO_SHORT';
  static const userBlocked = 'USER_BLOCKED';

  /// Owner 2026-10-20: the person's privacy settings keep this user out.
  static const privacyRestricted = 'PRIVACY_RESTRICTED';

  /// Owner 2026-10-20: the moderation decision cannot be appealed (again).
  static const appealNotAllowed = 'APPEAL_NOT_ALLOWED';
  // OQ-041 in-app calls.
  static const callNotFound = 'CALL_NOT_FOUND';
  static const callNotAllowed = 'CALL_NOT_ALLOWED';
  static const callInProgress = 'CALL_IN_PROGRESS';
  static const callStateConflict = 'CALL_STATE_CONFLICT';
  // Group calls via Cloudflare SFU: the media server is unreachable right now.
  static const callMediaUnavailable = 'CALL_MEDIA_UNAVAILABLE';
  // OQ-043 direct chats / message requests.
  static const directChatNotAllowed = 'DIRECT_CHAT_NOT_ALLOWED';
  static const messageRequestDeclined = 'MESSAGE_REQUEST_DECLINED';
  static const messageRequestLimit = 'MESSAGE_REQUEST_LIMIT';
  static const contingencyNotAllowed = 'CONTINGENCY_NOT_ALLOWED';
  static const bidAttorneyInactive = 'BID_ATTORNEY_INACTIVE';
  static const contactsLocked = 'CONTACTS_LOCKED';
  static const contactIssueAlreadyOpen = 'CONTACT_ISSUE_ALREADY_OPEN';
  static const contactIssueInvalidState = 'CONTACT_ISSUE_INVALID_STATE';
  static const bidAlreadyExists = 'BID_ALREADY_EXISTS';
  // Owner 2026-10-05: client → attorney case invites.
  static const inviteNotFound = 'INVITE_NOT_FOUND';
  static const inviteInvalidState = 'INVITE_INVALID_STATE';
  static const inviteAlreadyPending = 'INVITE_ALREADY_PENDING';
  static const seatLimitRequestPending = 'SEAT_LIMIT_REQUEST_PENDING';
  static const seatLimitRequestDecided = 'SEAT_LIMIT_REQUEST_DECIDED';
  static const inviteAttorneyUnavailable = 'INVITE_ATTORNEY_UNAVAILABLE';
  static const inviteLimitReached = 'INVITE_LIMIT_REACHED';
  // Case creation and management (docs/04 §3, stage 4.2)
  static const caseContainsContactInfo = 'CASE_CONTAINS_CONTACT_INFO';
  static const clientContactSharingConsentRequired =
      'CLIENT_CONTACT_SHARING_CONSENT_REQUIRED';
  // Owner 2026-10-05 (legal documents): publishing a case / placing a bid
  // needs the updated legal documents to be accepted first.
  static const legalReacceptRequired = 'LEGAL_REACCEPT_REQUIRED';
  // Subscription / Stripe (docs/06 §1, stage 6.7)
  static const paymentsNotConfigured = 'PAYMENTS_NOT_CONFIGURED';
  static const subscriptionAlreadyActive = 'SUBSCRIPTION_ALREADY_ACTIVE';
  static const subscriptionTrialUnavailable = 'SUBSCRIPTION_TRIAL_UNAVAILABLE';
  static const subscriptionSetupIncomplete = 'SUBSCRIPTION_SETUP_INCOMPLETE';
  static const subscriptionNotFound = 'SUBSCRIPTION_NOT_FOUND';
  static const webhookSignatureInvalid = 'WEBHOOK_SIGNATURE_INVALID';
  // Request limits, admin panel, moderation, flags, legal (docs/06)
  static const payloadTooLarge = 'PAYLOAD_TOO_LARGE';
  static const justificationRequired = 'JUSTIFICATION_REQUIRED';
  static const reasonRequired = 'REASON_REQUIRED';
  static const adminTicketInvalid = 'ADMIN_TICKET_INVALID';
  static const adminTotpInvalid = 'ADMIN_TOTP_INVALID';
  static const adminRecoveryCodeInvalid = 'ADMIN_RECOVERY_CODE_INVALID';
  static const adminAuthNotConfigured = 'ADMIN_AUTH_NOT_CONFIGURED';
  static const adminEmailTaken = 'ADMIN_EMAIL_TAKEN';
  static const contentBlocked = 'CONTENT_BLOCKED';
  static const moderationActionNotApplicable =
      'MODERATION_ACTION_NOT_APPLICABLE';
  static const flagProviderKeysMissing = 'FLAG_PROVIDER_KEYS_MISSING';
  static const legalDocumentInvalidState = 'LEGAL_DOCUMENT_INVALID_STATE';
  // Owner 2026-10-01: integrations (admin), reels, stickers.
  static const integrationsNotConfigured = 'INTEGRATIONS_NOT_CONFIGURED';
  static const integrationConflict = 'INTEGRATION_CONFLICT';
  static const adminStepUpRequired = 'ADMIN_STEP_UP_REQUIRED';
  static const videoUnavailable = 'VIDEO_UNAVAILABLE';
  static const translationUnavailable = 'TRANSLATION_UNAVAILABLE';
  static const videoTooLong = 'VIDEO_TOO_LONG';
  static const videoNotReady = 'VIDEO_NOT_READY';
  static const commentsDisabled = 'COMMENTS_DISABLED';
  static const licenseStateRequired = 'LICENSE_STATE_REQUIRED';
  // Owner 2026-10-05: attorney trust levels — an attorney bids while the
  // level is too low / a hold is active (details {gate, required, current}).
  static const trustLevelRequired = 'TRUST_LEVEL_REQUIRED';
  static const attorneyOnHold = 'ATTORNEY_ON_HOLD';
  static const barNumberBlocked = 'BAR_NUMBER_BLOCKED';
  static const stickerLimitReached = 'STICKER_LIMIT_REACHED';
  // Audit 2026-10-02: support, referrals, promotions, promo codes.
  static const supportTicketClosed = 'SUPPORT_TICKET_CLOSED';
  // Admin panel sign-in (never shown in the app, kept so the list matches).
  static const adminCredentialsInvalid = 'ADMIN_CREDENTIALS_INVALID';
  static const adminLoginTaken = 'ADMIN_LOGIN_TAKEN';
  static const adminRecoveryFailed = 'ADMIN_RECOVERY_FAILED';
  // Owner 2026-10-22: mandatory authenticator.
  static const adminTotpSetupRequired = 'ADMIN_TOTP_SETUP_REQUIRED';
  static const referralCodeInvalid = 'REFERRAL_CODE_INVALID';
  static const referralNotAllowed = 'REFERRAL_NOT_ALLOWED';
  static const referralInvalidState = 'REFERRAL_INVALID_STATE';
  static const promotionAlreadyActive = 'PROMOTION_ALREADY_ACTIVE';
  static const promotionInvalidState = 'PROMOTION_INVALID_STATE';
  static const promoCodeInvalid = 'PROMO_CODE_INVALID';
  // Owner 2026-10-05: client → attorney payments.
  static const payoutAccountNotReady = 'PAYOUT_ACCOUNT_NOT_READY';
  static const paymentInvalidState = 'PAYMENT_INVALID_STATE';
  static const paymentAmountInvalid = 'PAYMENT_AMOUNT_INVALID';
  static const paymentFeeMaxRoundsReached = 'PAYMENT_FEE_MAX_ROUNDS_REACHED';
  static const promoCodeExists = 'PROMO_CODE_EXISTS';
  static const contractGrantNotAttorney = 'CONTRACT_GRANT_NOT_ATTORNEY';
  static const contractGrantRevoked = 'CONTRACT_GRANT_REVOKED';
  static const refundAmountExceeded = 'REFUND_AMOUNT_EXCEEDED';
  static const refundNotAllowed = 'REFUND_NOT_ALLOWED';
  static const refundProviderFailed = 'REFUND_PROVIDER_FAILED';
  static const contentInvalidState = 'CONTENT_INVALID_STATE';
  static const stickerPackNameTaken = 'STICKER_PACK_NAME_TAKEN';
  // Owner 2026-10-05: plan builder.
  static const bidLimitReached = 'BID_LIMIT_REACHED';
  static const bidMonthlyLimitReached = 'BID_MONTHLY_LIMIT_REACHED';
  static const bidTrialLimitReached = 'BID_TRIAL_LIMIT_REACHED';
  static const barNumberFormatInvalid = 'BAR_NUMBER_FORMAT_INVALID';
  static const barAttemptsCooldown = 'BAR_ATTEMPTS_COOLDOWN';
  static const bidLicensePending = 'BID_LICENSE_PENDING';
  static const firmAlreadyMember = 'FIRM_ALREADY_MEMBER';
  static const firmFull = 'FIRM_FULL';
  static const caseLimitReached = 'CASE_LIMIT_REACHED';
  static const planNotAvailable = 'PLAN_NOT_AVAILABLE';
  static const planCodeExists = 'PLAN_CODE_EXISTS';
  static const planInUse = 'PLAN_IN_USE';
  static const entitlementRequired = 'ENTITLEMENT_REQUIRED';
  // Owner 2026-10-05: partner program.
  static const partnerInvalidState = 'PARTNER_INVALID_STATE';
  // Owner 2026-10-05: outreach (cold calls and emails).
  static const outreachImportInvalid = 'OUTREACH_IMPORT_INVALID';
  static const outreachInvalidState = 'OUTREACH_INVALID_STATE';
  static const outreachEmailLimit = 'OUTREACH_EMAIL_LIMIT';
  // Owner 2026-10-05 (legal): TCPA/DNC call blocks, consumer leads off.
  static const outreachContactBlocked = 'OUTREACH_CONTACT_BLOCKED';
  static const outreachClientsDisabled = 'OUTREACH_CLIENTS_DISABLED';
  // Owner 2026-10-05 (legal): DMCA notice in the wrong status.
  static const dmcaInvalidState = 'DMCA_INVALID_STATE';
  // Owner 2026-10-05: demo mode («Продвижение») — docs/ops/demo-world.md
  static const demoDisabled = 'DEMO_DISABLED';
  static const demoLimitReached = 'DEMO_LIMIT_REACHED';
  static const demoUnavailable = 'DEMO_UNAVAILABLE';
  static const demoCodeInvalid = 'DEMO_CODE_INVALID';

  /// Every server code, in enum order.
  static const messagePinLimit = 'MESSAGE_PIN_LIMIT';
  static const all = <String>[
    validationError,
    internalError,
    notFound,
    unauthorized,
    forbidden,
    rateLimited,
    idempotencyKeyRequired,
    idempotencyKeyConflict,
    appUpdateRequired,
    syncTooOld,
    experimentStateInvalid,
    staleVersion,
    tokenExpired,
    authOtpInvalid,
    authOtpExpired,
    authOtpLocked,
    authOtpRequestLimit,
    authPhoneRegistered,
    authRefreshInvalid,
    authRefreshExpired,
    authRefreshReuseDetected,
    authSignedInElsewhere,
    authOtherDeviceActive,
    authSessionRevoked,
    authSocialTokenInvalid,
    authSocialProviderUnavailable,
    authProviderDisabled,
    authInvalidCredentials,
    authPasswordCompromised,
    postAttachmentsNotAllowed,
    accountExistsUseOtherMethod,
    identifierAlreadyLinked,
    contactDomainBlocked,
    contactAlreadyExists,
    reauthRequired,
    reauthInvalid,
    passkeyInvalid,
    passkeyNotFound,
    passkeyLimit,
    deviceAttestationRequired,
    turnstileFailed,
    accountSuspended,
    accountRestricted,
    accountDeleted,
    clientContactsIncomplete,
    onboardingIncomplete,
    roleAlreadySet,
    notImplemented,
    i18nLanguageNotFound,
    i18nImportInvalid,
    providerBudgetExceeded,
    phoneCountryNotSupported,
    countryNotAvailable,
    reviewCaseNotClosed,
    reviewNoAcceptedBid,
    reviewAlreadyExists,
    reviewAppealExists,
    consultationSlotTaken,
    consultationNotAvailable,
    consultationStateConflict,
    qaAnswersEnough,
    qaQuestionClosed,
    forwardNotAllowed,
    contentProtected,
    unsupportedInTarget,
    chatAttachmentsLocked,
    subscriptionPlanIncludesSeats,
    assistantSeatsInUse,
    assistantNoFreeSeat,
    assistantTooManyDuties,
    seatsTrialNotAllowed,
    seatsNotPaidYet,
    seatsPreviewStale,
    assistantNotAllowed,
    assistantPhoneTaken,
    assistantInviteNotFound,
    assistantCodeInvalid,
    assistantLiabilityRequired,
    taskClosed,
    taskStepsLimit,
    filesCountLimit,
    reviewEditWindowExpired,
    reviewNotEditable,
    attorneyNotVerified,
    usernameTaken,
    usernameReserved,
    usernameChangeTooSoon,
    fileTypeNotAllowed,
    fileTooLarge,
    fileChecksumMismatch,
    fileNotUploaded,
    storageQuotaExceeded,
    chatStorageFull,
    dailyUploadLimitExceeded,
    fileNotAttachable,
    fileStorageUnavailable,
    verificationAlreadyPending,
    verificationSubmissionLimit,
    verificationInvalidStatus,
    verificationIncomplete,
    verificationRequestLocked,
    verificationDecisionIncomplete,
    licenseAlreadyRegistered,
    licenseAlreadyAdded,
    attorneySuspended,
    caseNotFound,
    caseInvalidState,
    bidInvalidState,
    bidNotYourTurn,
    bidMaxRoundsReached,
    bidCounterNotAllowed,
    subscriptionRequired,
    insufficientStars,
    stickerPackNotOwned,
    caseNotAvailable,
    postNotFound,
    postNotAllowed,
    repostOwnPost,
    commentNotFound,
    followNotAllowed,
    conversationNotFound,
    conversationClosed,
    groupNotFound,
    groupForbidden,
    groupFull,
    groupUsernameTaken,
    pollClosed,
    messageTooLong,
    textTooLong,
    featureDisabled,
    searchQueryTooShort,
    userBlocked,
    privacyRestricted,
    appealNotAllowed,
    callNotFound,
    callNotAllowed,
    callInProgress,
    callStateConflict,
    callMediaUnavailable,
    directChatNotAllowed,
    messageRequestDeclined,
    messageRequestLimit,
    contingencyNotAllowed,
    bidAttorneyInactive,
    contactsLocked,
    contactIssueAlreadyOpen,
    contactIssueInvalidState,
    bidAlreadyExists,
    inviteNotFound,
    inviteInvalidState,
    inviteAlreadyPending,
    seatLimitRequestPending,
    seatLimitRequestDecided,
    inviteAttorneyUnavailable,
    inviteLimitReached,
    caseContainsContactInfo,
    clientContactSharingConsentRequired,
    legalReacceptRequired,
    paymentsNotConfigured,
    subscriptionAlreadyActive,
    subscriptionTrialUnavailable,
    subscriptionSetupIncomplete,
    subscriptionNotFound,
    webhookSignatureInvalid,
    payloadTooLarge,
    justificationRequired,
    reasonRequired,
    adminTicketInvalid,
    adminTotpInvalid,
    adminRecoveryCodeInvalid,
    adminAuthNotConfigured,
    adminEmailTaken,
    contentBlocked,
    moderationActionNotApplicable,
    flagProviderKeysMissing,
    legalDocumentInvalidState,
    integrationsNotConfigured,
    integrationConflict,
    adminStepUpRequired,
    videoUnavailable,
    translationUnavailable,
    videoTooLong,
    videoNotReady,
    commentsDisabled,
    licenseStateRequired,
    trustLevelRequired,
    attorneyOnHold,
    barNumberBlocked,
    stickerLimitReached,
    supportTicketClosed,
    adminCredentialsInvalid,
    adminLoginTaken,
    adminRecoveryFailed,
    adminTotpSetupRequired,
    referralCodeInvalid,
    referralNotAllowed,
    referralInvalidState,
    promotionAlreadyActive,
    promotionInvalidState,
    promoCodeInvalid,
    promoCodeExists,
    payoutAccountNotReady,
    paymentInvalidState,
    paymentAmountInvalid,
    paymentFeeMaxRoundsReached,
    contractGrantNotAttorney,
    contractGrantRevoked,
    refundAmountExceeded,
    refundNotAllowed,
    refundProviderFailed,
    contentInvalidState,
    stickerPackNameTaken,
    bidLimitReached,
    bidMonthlyLimitReached,
    bidTrialLimitReached,
    barNumberFormatInvalid,
    barAttemptsCooldown,
    bidLicensePending,
    firmAlreadyMember,
    firmFull,
    caseLimitReached,
    planNotAvailable,
    planCodeExists,
    planInUse,
    entitlementRequired,
    partnerInvalidState,
    outreachImportInvalid,
    outreachInvalidState,
    outreachEmailLimit,
    outreachContactBlocked,
    outreachClientsDisabled,
    dmcaInvalidState,
    demoDisabled,
    demoLimitReached,
    demoUnavailable,
    demoCodeInvalid,
    storyLimitReached,
    channelLimitReached,
    channelUsernameTaken,
    messageWindowExpired,
    messagePinLimit,
  ];
}

/// Parsed form of the backend's error envelope (docs/01_FOUNDATION_AUTH.md
/// §7): `{error: {code, message, details, requestId}}`. Every network
/// failure in the app should end up as one of these — screens/notifiers
/// branch on [code] (one of [ApiErrorCodes]), never on [message] (free
/// text, not guaranteed stable or localized — `AllExceptionsFilter` on the
/// backend makes no promise about it beyond "readable").
class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.details,
    this.requestId,
    this.statusCode,
    this.guest = false,
  });

  /// Always succeeds — falls back to [networkErrorCode] for anything that
  /// isn't the backend's JSON error envelope, since a thrown [ApiException]
  /// is the one contract every interceptor/repository relies on.
  factory ApiException.fromDioException(DioException e) {
    final guest = e.requestOptions.extra[RequestFlags.guest] == true;
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final error = data['error'];
      if (error is Map<String, dynamic>) {
        final code = error['code'];
        final message = error['message'];
        if (code is String && message is String) {
          return ApiException(
            code: code,
            message: message,
            details: error['details'] is Map<String, dynamic>
                ? error['details'] as Map<String, dynamic>
                : null,
            requestId: error['requestId'] as String?,
            statusCode: e.response?.statusCode,
            guest: guest,
          );
        }
      }
    }
    return ApiException(
      // S15-13: a Wi-Fi sign-in page answering instead of the API is still a
      // network failure for every caller (`isNetworkError`), but screens
      // that want to can tell it apart.
      code: isCaptivePortalResponse(e.response)
          ? captivePortalCode
          : networkErrorCode,
      message: e.message ?? 'Network error',
      statusCode: e.response?.statusCode,
      guest: guest,
    );
  }

  /// Synthetic code for a failure that never reached the backend at all
  /// (timeout, no connectivity, or a response body that isn't the expected
  /// `{error: {...}}` JSON shape) — not part of the backend's `ErrorCode`
  /// enum, but every call site that switches on `.code` needs a bucket for
  /// "the request never got a real answer".
  static const networkErrorCode = 'NETWORK_ERROR';

  /// S15-13: an HTML page (2xx/3xx or 511) came back from a JSON route: a
  /// captive portal (Wi-Fi sign-in) sits in front of the API. Counts as a
  /// network failure ([isNetworkError]); never retried.
  static const captivePortalCode = 'CAPTIVE_PORTAL';

  final String code;
  final String message;
  final Map<String, dynamic>? details;
  final String? requestId;
  final int? statusCode;

  /// Owner 2026-10-22 (guest browsing): the request went out with no bearer
  /// token. A 401 on it means «sign in to see this», a 429 «try later».
  final bool guest;

  bool get isNetworkError =>
      code == networkErrorCode || code == captivePortalCode;

  bool get isCaptivePortal => code == captivePortalCode;

  @override
  String toString() => 'ApiException($code: $message)';
}

/// Runs one call of the generated API client (`package:lawbid_api`) and
/// normalizes every failure into an [ApiException], the one error contract
/// repositories and interceptors rely on:
/// - a [DioException] (transport failure or an error envelope) →
///   [ApiException.fromDioException];
/// - a 2xx body the generated model can't parse (not the contract's shape)
///   → [ApiException.networkErrorCode], the same bucket as "the request
///   never got a real answer".
Future<T> guardApiCall<T>(Future<T> Function() call) async {
  try {
    return await call();
  } on DioException catch (e) {
    throw ApiException.fromDioException(e);
  } on ApiException {
    rethrow;
  } on Object {
    throw const ApiException(
      code: ApiException.networkErrorCode,
      message: 'Unexpected response shape from the server.',
    );
  }
}

/// S15-13: true when [response] is an HTML page where the API speaks JSON and
/// the status is one a Wi-Fi sign-in page uses (200-399, or 511 "network
/// authentication required"). A bare ALB 502/503 HTML page is NOT captive.
bool isCaptivePortalResponse(Response<dynamic>? response) {
  if (response == null) return false;
  final status = response.statusCode ?? 0;
  if (!((status >= 200 && status < 400) || status == 511)) return false;
  final type = response.headers.value(Headers.contentTypeHeader) ?? '';
  return type.toLowerCase().contains('text/html');
}
