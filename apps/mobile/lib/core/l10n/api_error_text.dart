import '../network/api_error.dart';
import 'translator.dart';

/// Localized, user-facing text for an [ApiException] — docs/01_FOUNDATION_
/// AUTH.md §7: "Клиент показывает локализованный текст по `code`, а не по
/// `message`". Every code a user can run into has a key (en+ru,
/// static_translator.dart + translations seed) — mostly `error.api.<CODE>`,
/// several codes may share one text; codes that never reach a screen
/// (TOKEN_EXPIRED -> silent refresh, APP_UPDATE_REQUIRED -> forced-update
/// screen, INTERNAL_ERROR, ...) fall back to the generic message.
String apiErrorText(Translator t, ApiException error) {
  final key = _keys[error.code];
  if (key == null) return t.t('error.default.message');
  if (error.code == ApiErrorCodes.authOtpRequestLimit ||
      error.code == ApiErrorCodes.rateLimited) {
    final retry = error.details?['retryAfterSeconds'];
    if (retry is int && retry > 0) {
      return t.t('error.api.retryAfter', {'seconds': '$retry'});
    }
  }
  // docs/03 §4.1 / OQ-012: say which requirement blocks completion when
  // it is the attorney photo.
  if (error.code == ApiErrorCodes.onboardingIncomplete) {
    final missing = error.details?['missing'];
    if (missing is List && missing.contains('photo')) {
      return t.t('onboarding.profile.error.photoRequired');
    }
  }
  // The cost guard's phone check says *why* a +1 number was refused
  // (apps/api modules/auth/dto/validators.ts checkSmsDestination): a non-existent US number, a
  // non-mobile/premium line, or a non-US +1 country (Canada, Caribbean).
  if (error.code == ApiErrorCodes.phoneCountryNotSupported) {
    final reason = error.details?['reason'];
    if (reason == 'invalid') return t.t('error.api.PHONE_INVALID_US');
    if (reason == 'number_type_not_allowed') {
      return t.t('error.api.PHONE_TYPE_NOT_ALLOWED');
    }
  }
  return t.t(key);
}

/// Same as [apiErrorText] for an arbitrary thrown object.
String errorText(Translator t, Object error) => error is ApiException
    ? apiErrorText(t, error)
    : t.t('error.default.message');

bool isOfflineError(Object? error) =>
    error is ApiException && error.isNetworkError;

const _keys = <String, String>{
  ApiException.networkErrorCode: 'error.api.NETWORK_ERROR',
  ApiErrorCodes.validationError: 'error.api.VALIDATION_ERROR',
  ApiErrorCodes.rateLimited: 'error.api.RATE_LIMITED',
  ApiErrorCodes.authOtpInvalid: 'error.api.AUTH_OTP_INVALID',
  ApiErrorCodes.authOtpExpired: 'error.api.AUTH_OTP_EXPIRED',
  ApiErrorCodes.authOtpLocked: 'error.api.AUTH_OTP_LOCKED',
  ApiErrorCodes.authOtpRequestLimit: 'error.api.AUTH_OTP_REQUEST_LIMIT',
  ApiErrorCodes.contactDomainBlocked: 'error.api.CONTACT_DOMAIN_BLOCKED',
  ApiErrorCodes.contactAlreadyExists: 'error.api.CONTACT_ALREADY_EXISTS',
  ApiErrorCodes.identifierAlreadyLinked: 'error.api.CONTACT_ALREADY_EXISTS',
  ApiErrorCodes.phoneCountryNotSupported:
      'error.api.PHONE_COUNTRY_NOT_SUPPORTED',
  ApiErrorCodes.providerBudgetExceeded: 'error.api.PROVIDER_BUDGET_EXCEEDED',
  ApiErrorCodes.reviewCaseNotClosed: 'error.api.REVIEW_CASE_NOT_CLOSED',
  ApiErrorCodes.reviewNoAcceptedBid: 'error.api.REVIEW_NO_ACCEPTED_BID',
  ApiErrorCodes.reviewAlreadyExists: 'error.api.REVIEW_ALREADY_EXISTS',
  ApiErrorCodes.reviewEditWindowExpired: 'error.api.REVIEW_EDIT_WINDOW_EXPIRED',
  ApiErrorCodes.reviewNotEditable: 'error.api.REVIEW_NOT_EDITABLE',
  // Uploads (docs/03 §2.2). A checksum mismatch or a missing upload means
  // the transfer broke: "try uploading again".
  ApiErrorCodes.fileTypeNotAllowed: 'error.api.FILE_TYPE_NOT_ALLOWED',
  ApiErrorCodes.fileTooLarge: 'error.api.FILE_TOO_LARGE',
  ApiErrorCodes.fileChecksumMismatch: 'error.api.FILE_UPLOAD_FAILED',
  ApiErrorCodes.fileNotUploaded: 'error.api.FILE_UPLOAD_FAILED',
  ApiErrorCodes.fileNotAttachable: 'error.api.FILE_NOT_ATTACHABLE',
  ApiErrorCodes.fileStorageUnavailable: 'error.api.FILE_STORAGE_UNAVAILABLE',
  // Verification (docs/03 §2.3). Verifier-only codes (lock, decisions)
  // never reach the app but share the generic status text.
  ApiErrorCodes.verificationAlreadyPending:
      'error.api.VERIFICATION_ALREADY_PENDING',
  ApiErrorCodes.verificationSubmissionLimit:
      'error.api.VERIFICATION_SUBMISSION_LIMIT',
  ApiErrorCodes.verificationInvalidStatus:
      'error.api.VERIFICATION_INVALID_STATUS',
  ApiErrorCodes.verificationIncomplete: 'error.api.VERIFICATION_INCOMPLETE',
  ApiErrorCodes.verificationRequestLocked:
      'error.api.VERIFICATION_INVALID_STATUS',
  ApiErrorCodes.verificationDecisionIncomplete:
      'error.api.VERIFICATION_INVALID_STATUS',
  ApiErrorCodes.licenseAlreadyRegistered:
      'error.api.LICENSE_ALREADY_REGISTERED',
  ApiErrorCodes.licenseAlreadyAdded: 'error.api.LICENSE_ALREADY_ADDED',
  ApiErrorCodes.attorneySuspended: 'error.api.ATTORNEY_SUSPENDED',
  // Cases and bids (docs/04 §15, stage 4.1)
  ApiErrorCodes.caseNotFound: 'error.api.CASE_NOT_FOUND',
  ApiErrorCodes.caseInvalidState: 'error.api.CASE_INVALID_STATE',
  ApiErrorCodes.bidInvalidState: 'error.api.BID_INVALID_STATE',
  ApiErrorCodes.bidNotYourTurn: 'error.api.BID_NOT_YOUR_TURN',
  ApiErrorCodes.bidMaxRoundsReached: 'error.api.BID_MAX_ROUNDS_REACHED',
  ApiErrorCodes.bidCounterNotAllowed: 'error.api.BID_COUNTER_NOT_ALLOWED',
  ApiErrorCodes.subscriptionRequired: 'error.api.SUBSCRIPTION_REQUIRED',
  ApiErrorCodes.caseNotAvailable: 'error.api.CASE_NOT_AVAILABLE',
  ApiErrorCodes.postNotFound: 'error.api.POST_NOT_FOUND',
  ApiErrorCodes.postNotAllowed: 'error.api.POST_NOT_ALLOWED',
  ApiErrorCodes.commentNotFound: 'error.api.COMMENT_NOT_FOUND',
  ApiErrorCodes.followNotAllowed: 'error.api.FOLLOW_NOT_ALLOWED',
  ApiErrorCodes.conversationNotFound: 'error.api.CONVERSATION_NOT_FOUND',
  ApiErrorCodes.conversationClosed: 'error.api.CONVERSATION_CLOSED',
  ApiErrorCodes.messageTooLong: 'error.api.MESSAGE_TOO_LONG',
  ApiErrorCodes.featureDisabled: 'error.api.FEATURE_DISABLED',
  ApiErrorCodes.searchQueryTooShort: 'error.api.SEARCH_QUERY_TOO_SHORT',
  ApiErrorCodes.userBlocked: 'error.api.USER_BLOCKED',
  ApiErrorCodes.directChatNotAllowed: 'error.api.DIRECT_CHAT_NOT_ALLOWED',
  ApiErrorCodes.messageRequestDeclined: 'error.api.MESSAGE_REQUEST_DECLINED',
  ApiErrorCodes.messageRequestLimit: 'error.api.MESSAGE_REQUEST_LIMIT',
  ApiErrorCodes.callNotAllowed: 'call.notAllowed',
  ApiErrorCodes.callInProgress: 'call.inProgress',
  ApiErrorCodes.bidAttorneyInactive: 'error.api.BID_ATTORNEY_INACTIVE',
  ApiErrorCodes.contactsLocked: 'error.api.CONTACTS_LOCKED',
  ApiErrorCodes.contactIssueAlreadyOpen: 'error.api.CONTACT_ISSUE_ALREADY_OPEN',
  ApiErrorCodes.contactIssueInvalidState:
      'error.api.CONTACT_ISSUE_INVALID_STATE',
  ApiErrorCodes.bidAlreadyExists: 'error.api.BID_ALREADY_EXISTS',
  ApiErrorCodes.caseContainsContactInfo: 'error.api.CASE_CONTAINS_CONTACT_INFO',
  ApiErrorCodes.clientContactSharingConsentRequired:
      'error.api.CLIENT_CONTACT_SHARING_CONSENT_REQUIRED',
  ApiErrorCodes.paymentsNotConfigured: 'error.api.PAYMENTS_NOT_CONFIGURED',
  ApiErrorCodes.subscriptionAlreadyActive:
      'error.api.SUBSCRIPTION_ALREADY_ACTIVE',
  ApiErrorCodes.subscriptionTrialUnavailable:
      'error.api.SUBSCRIPTION_TRIAL_UNAVAILABLE',
  ApiErrorCodes.subscriptionSetupIncomplete:
      'error.api.SUBSCRIPTION_SETUP_INCOMPLETE',
  ApiErrorCodes.subscriptionNotFound: 'error.api.SUBSCRIPTION_NOT_FOUND',
  ApiErrorCodes.payloadTooLarge: 'error.api.PAYLOAD_TOO_LARGE',
  ApiErrorCodes.contentBlocked: 'error.api.CONTENT_BLOCKED',
  ApiErrorCodes.reauthRequired: 'error.api.REAUTH_REQUIRED',
  ApiErrorCodes.reauthInvalid: 'error.api.REAUTH_INVALID',
  ApiErrorCodes.clientContactsIncomplete:
      'error.api.CLIENT_CONTACTS_INCOMPLETE',
  ApiErrorCodes.onboardingIncomplete: 'error.api.ONBOARDING_INCOMPLETE',
  ApiErrorCodes.roleAlreadySet: 'error.api.ROLE_ALREADY_SET',
  ApiErrorCodes.i18nLanguageNotFound: 'error.api.I18N_LANGUAGE_NOT_FOUND',
  ApiErrorCodes.accountSuspended: 'error.api.ACCOUNT_SUSPENDED',
  ApiErrorCodes.accountDeleted: 'error.api.ACCOUNT_DELETED',
  ApiErrorCodes.authProviderDisabled: 'error.api.AUTH_PROVIDER_DISABLED',
  ApiErrorCodes.deviceAttestationRequired:
      'error.api.DEVICE_ATTESTATION_REQUIRED',
  // Refresh-token theft signal (docs/01 §10.4): every session was revoked.
  ApiErrorCodes.authRefreshReuseDetected:
      'error.api.AUTH_REFRESH_REUSE_DETECTED',
  // The session can't be continued; the user has to sign in again.
  ApiErrorCodes.authSessionRevoked: 'error.api.AUTH_SESSION_REVOKED',
  ApiErrorCodes.authRefreshExpired: 'error.api.AUTH_SESSION_REVOKED',
  ApiErrorCodes.authRefreshInvalid: 'error.api.AUTH_SESSION_REVOKED',
  ApiErrorCodes.authSocialTokenInvalid: 'auth.social.error.invalidToken',
  ApiErrorCodes.authSocialProviderUnavailable:
      'auth.social.error.providerDisabled',
  ApiErrorCodes.idempotencyKeyConflict: 'error.api.IDEMPOTENCY_KEY_CONFLICT',
  ApiErrorCodes.forbidden: 'error.api.FORBIDDEN',
  ApiErrorCodes.notFound: 'error.api.NOT_FOUND',
  ApiErrorCodes.notImplemented: 'error.api.NOT_IMPLEMENTED',
  ApiErrorCodes.attorneyNotVerified: 'error.api.ATTORNEY_NOT_VERIFIED',
  ApiErrorCodes.usernameTaken: 'error.api.USERNAME_TAKEN',
  ApiErrorCodes.usernameReserved: 'error.api.USERNAME_RESERVED',
  ApiErrorCodes.usernameChangeTooSoon: 'error.api.USERNAME_CHANGE_TOO_SOON',
  // Client-side synthetic code (contact_verification_controller.dart).
  'NO_REAUTH_CONTACT': 'error.api.NO_REAUTH_CONTACT',
};
