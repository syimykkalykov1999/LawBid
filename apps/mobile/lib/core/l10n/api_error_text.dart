import '../network/api_error.dart';
import 'translator.dart';

/// Localized, user-facing text for an [ApiException] — docs/01_FOUNDATION_
/// AUTH.md §7: "Клиент показывает локализованный текст по `code`, а не по
/// `message`". Every code the onboarding/contacts flows can surface has an
/// `error.api.<CODE>` key (en+ru, static_translator.dart + translations
/// seed); anything else falls back to the generic message.
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
  return t.t(key);
}

/// Same as [apiErrorText] for an arbitrary thrown object.
String errorText(Translator t, Object error) =>
    error is ApiException ? apiErrorText(t, error) : t.t('error.default.message');

bool isOfflineError(Object? error) => error is ApiException && error.isNetworkError;

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
  ApiErrorCodes.phoneCountryNotSupported: 'error.api.PHONE_COUNTRY_NOT_SUPPORTED',
  ApiErrorCodes.providerBudgetExceeded: 'error.api.PROVIDER_BUDGET_EXCEEDED',
  ApiErrorCodes.reauthRequired: 'error.api.REAUTH_REQUIRED',
  ApiErrorCodes.reauthInvalid: 'error.api.REAUTH_INVALID',
  ApiErrorCodes.clientContactsIncomplete: 'error.api.CLIENT_CONTACTS_INCOMPLETE',
  ApiErrorCodes.onboardingIncomplete: 'error.api.ONBOARDING_INCOMPLETE',
  ApiErrorCodes.roleAlreadySet: 'error.api.ROLE_ALREADY_SET',
  ApiErrorCodes.i18nLanguageNotFound: 'error.api.I18N_LANGUAGE_NOT_FOUND',
  ApiErrorCodes.accountSuspended: 'error.api.ACCOUNT_SUSPENDED',
  ApiErrorCodes.accountDeleted: 'error.api.ACCOUNT_DELETED',
  ApiErrorCodes.authProviderDisabled: 'error.api.AUTH_PROVIDER_DISABLED',
  // Client-side synthetic code (contact_verification_controller.dart).
  'NO_REAUTH_CONTACT': 'error.api.NO_REAUTH_CONTACT',
};
