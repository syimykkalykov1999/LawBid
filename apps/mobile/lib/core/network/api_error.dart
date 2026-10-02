import 'package:dio/dio.dart';

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

  // Auth (docs/01 §10, stage 1.4). TOKEN_EXPIRED is the one code
  // AuthInterceptor's silent refresh keys off (§10.4).
  static const tokenExpired = 'TOKEN_EXPIRED';
  static const authOtpInvalid = 'AUTH_OTP_INVALID';
  static const authOtpExpired = 'AUTH_OTP_EXPIRED';
  static const authOtpLocked = 'AUTH_OTP_LOCKED';
  static const authOtpRequestLimit = 'AUTH_OTP_REQUEST_LIMIT';
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
  static const accountExistsUseOtherMethod = 'ACCOUNT_EXISTS_USE_OTHER_METHOD';
  static const identifierAlreadyLinked = 'IDENTIFIER_ALREADY_LINKED';
  static const contactDomainBlocked = 'CONTACT_DOMAIN_BLOCKED';
  static const contactAlreadyExists = 'CONTACT_ALREADY_EXISTS';
  static const reauthRequired = 'REAUTH_REQUIRED';
  static const reauthInvalid = 'REAUTH_INVALID';
  static const deviceAttestationRequired = 'DEVICE_ATTESTATION_REQUIRED';
  static const accountSuspended = 'ACCOUNT_SUSPENDED';
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

  // Reviews (docs/03 §7, stage 3.7)
  static const reviewCaseNotClosed = 'REVIEW_CASE_NOT_CLOSED';
  static const reviewNoAcceptedBid = 'REVIEW_NO_ACCEPTED_BID';
  static const reviewAlreadyExists = 'REVIEW_ALREADY_EXISTS';
  static const reviewAppealExists = 'REVIEW_APPEAL_EXISTS';
  static const chatAttachmentsLocked = 'CHAT_ATTACHMENTS_LOCKED';
  // OQ-048 plans and assistants.
  static const subscriptionPlanIncludesSeats = 'SUBSCRIPTION_PLAN_INCLUDES_SEATS';
  static const assistantSeatsInUse = 'ASSISTANT_SEATS_IN_USE';
  static const assistantNoFreeSeat = 'ASSISTANT_NO_FREE_SEAT';
  static const assistantNotAllowed = 'ASSISTANT_NOT_ALLOWED';
  static const assistantPhoneTaken = 'ASSISTANT_PHONE_TAKEN';
  static const assistantInviteNotFound = 'ASSISTANT_INVITE_NOT_FOUND';
  static const assistantLiabilityRequired = 'ASSISTANT_LIABILITY_REQUIRED';
  static const taskClosed = 'TASK_CLOSED';
  static const taskStepsLimit = 'TASK_STEPS_LIMIT';
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
  static const caseNotAvailable = 'CASE_NOT_AVAILABLE';
  static const postNotFound = 'POST_NOT_FOUND';
  static const postNotAllowed = 'POST_NOT_ALLOWED';
  static const commentNotFound = 'COMMENT_NOT_FOUND';
  static const followNotAllowed = 'FOLLOW_NOT_ALLOWED';
  static const conversationNotFound = 'CONVERSATION_NOT_FOUND';
  static const conversationClosed = 'CONVERSATION_CLOSED';
  static const messageTooLong = 'MESSAGE_TOO_LONG';
  static const featureDisabled = 'FEATURE_DISABLED';
  static const searchQueryTooShort = 'SEARCH_QUERY_TOO_SHORT';
  static const userBlocked = 'USER_BLOCKED';
  // OQ-041 in-app calls.
  static const callNotFound = 'CALL_NOT_FOUND';
  static const callNotAllowed = 'CALL_NOT_ALLOWED';
  static const callInProgress = 'CALL_IN_PROGRESS';
  static const callStateConflict = 'CALL_STATE_CONFLICT';
  // OQ-043 direct chats / message requests.
  static const directChatNotAllowed = 'DIRECT_CHAT_NOT_ALLOWED';
  static const messageRequestDeclined = 'MESSAGE_REQUEST_DECLINED';
  static const messageRequestLimit = 'MESSAGE_REQUEST_LIMIT';
  static const bidAttorneyInactive = 'BID_ATTORNEY_INACTIVE';
  static const contactsLocked = 'CONTACTS_LOCKED';
  static const contactIssueAlreadyOpen = 'CONTACT_ISSUE_ALREADY_OPEN';
  static const contactIssueInvalidState = 'CONTACT_ISSUE_INVALID_STATE';
  static const bidAlreadyExists = 'BID_ALREADY_EXISTS';
  // Case creation and management (docs/04 §3, stage 4.2)
  static const caseContainsContactInfo = 'CASE_CONTAINS_CONTACT_INFO';
  static const clientContactSharingConsentRequired =
      'CLIENT_CONTACT_SHARING_CONSENT_REQUIRED';
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
  static const videoTooLong = 'VIDEO_TOO_LONG';
  static const videoNotReady = 'VIDEO_NOT_READY';
  static const stickerLimitReached = 'STICKER_LIMIT_REACHED';

  /// Every server code, in enum order.
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
    tokenExpired,
    authOtpInvalid,
    authOtpExpired,
    authOtpLocked,
    authOtpRequestLimit,
    authRefreshInvalid,
    authRefreshExpired,
    authRefreshReuseDetected,
    authSignedInElsewhere,
    authOtherDeviceActive,
    authSessionRevoked,
    authSocialTokenInvalid,
    authSocialProviderUnavailable,
    authProviderDisabled,
    accountExistsUseOtherMethod,
    identifierAlreadyLinked,
    contactDomainBlocked,
    contactAlreadyExists,
    reauthRequired,
    reauthInvalid,
    deviceAttestationRequired,
    accountSuspended,
    accountDeleted,
    clientContactsIncomplete,
    onboardingIncomplete,
    roleAlreadySet,
    notImplemented,
    i18nLanguageNotFound,
    i18nImportInvalid,
    providerBudgetExceeded,
    phoneCountryNotSupported,
    reviewCaseNotClosed,
    reviewNoAcceptedBid,
    reviewAlreadyExists,
    reviewAppealExists,
    chatAttachmentsLocked,
    subscriptionPlanIncludesSeats,
    assistantSeatsInUse,
    assistantNoFreeSeat,
    assistantNotAllowed,
    assistantPhoneTaken,
    assistantInviteNotFound,
    assistantLiabilityRequired,
    taskClosed,
    taskStepsLimit,
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
    caseNotAvailable,
    postNotFound,
    postNotAllowed,
    commentNotFound,
    followNotAllowed,
    conversationNotFound,
    conversationClosed,
    messageTooLong,
    featureDisabled,
    searchQueryTooShort,
    userBlocked,
    callNotFound,
    callNotAllowed,
    callInProgress,
    callStateConflict,
    directChatNotAllowed,
    messageRequestDeclined,
    messageRequestLimit,
    bidAttorneyInactive,
    contactsLocked,
    contactIssueAlreadyOpen,
    contactIssueInvalidState,
    bidAlreadyExists,
    caseContainsContactInfo,
    clientContactSharingConsentRequired,
    paymentsNotConfigured,
    subscriptionAlreadyActive,
    subscriptionTrialUnavailable,
    subscriptionSetupIncomplete,
    subscriptionNotFound,
    webhookSignatureInvalid,
    payloadTooLarge,
    justificationRequired,
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
    videoTooLong,
    videoNotReady,
    stickerLimitReached,
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
  });

  /// Synthetic code for a failure that never reached the backend at all
  /// (timeout, no connectivity, or a response body that isn't the expected
  /// `{error: {...}}` JSON shape) — not part of the backend's `ErrorCode`
  /// enum, but every call site that switches on `.code` needs a bucket for
  /// "the request never got a real answer".
  static const networkErrorCode = 'NETWORK_ERROR';

  final String code;
  final String message;
  final Map<String, dynamic>? details;
  final String? requestId;
  final int? statusCode;

  bool get isNetworkError => code == networkErrorCode;

  /// Always succeeds — falls back to [networkErrorCode] for anything that
  /// isn't the backend's JSON error envelope, since a thrown [ApiException]
  /// is the one contract every interceptor/repository relies on.
  factory ApiException.fromDioException(DioException e) {
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
          );
        }
      }
    }
    return ApiException(
      code: networkErrorCode,
      message: e.message ?? 'Network error',
      statusCode: e.response?.statusCode,
    );
  }

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
