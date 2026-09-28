// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ErrorCode {
  @JsonValue('VALIDATION_ERROR')
  validationError('VALIDATION_ERROR'),
  @JsonValue('INTERNAL_ERROR')
  internalError('INTERNAL_ERROR'),
  @JsonValue('NOT_FOUND')
  notFound('NOT_FOUND'),
  @JsonValue('UNAUTHORIZED')
  unauthorized('UNAUTHORIZED'),
  @JsonValue('FORBIDDEN')
  forbidden('FORBIDDEN'),
  @JsonValue('RATE_LIMITED')
  rateLimited('RATE_LIMITED'),
  @JsonValue('IDEMPOTENCY_KEY_REQUIRED')
  idempotencyKeyRequired('IDEMPOTENCY_KEY_REQUIRED'),
  @JsonValue('IDEMPOTENCY_KEY_CONFLICT')
  idempotencyKeyConflict('IDEMPOTENCY_KEY_CONFLICT'),
  @JsonValue('APP_UPDATE_REQUIRED')
  appUpdateRequired('APP_UPDATE_REQUIRED'),
  @JsonValue('TOKEN_EXPIRED')
  tokenExpired('TOKEN_EXPIRED'),
  @JsonValue('AUTH_OTP_INVALID')
  authOtpInvalid('AUTH_OTP_INVALID'),
  @JsonValue('AUTH_OTP_EXPIRED')
  authOtpExpired('AUTH_OTP_EXPIRED'),
  @JsonValue('AUTH_OTP_LOCKED')
  authOtpLocked('AUTH_OTP_LOCKED'),
  @JsonValue('AUTH_OTP_REQUEST_LIMIT')
  authOtpRequestLimit('AUTH_OTP_REQUEST_LIMIT'),
  @JsonValue('AUTH_REFRESH_INVALID')
  authRefreshInvalid('AUTH_REFRESH_INVALID'),
  @JsonValue('AUTH_REFRESH_EXPIRED')
  authRefreshExpired('AUTH_REFRESH_EXPIRED'),
  @JsonValue('AUTH_REFRESH_REUSE_DETECTED')
  authRefreshReuseDetected('AUTH_REFRESH_REUSE_DETECTED'),
  @JsonValue('AUTH_SESSION_REVOKED')
  authSessionRevoked('AUTH_SESSION_REVOKED'),
  @JsonValue('AUTH_SOCIAL_TOKEN_INVALID')
  authSocialTokenInvalid('AUTH_SOCIAL_TOKEN_INVALID'),
  @JsonValue('AUTH_SOCIAL_PROVIDER_UNAVAILABLE')
  authSocialProviderUnavailable('AUTH_SOCIAL_PROVIDER_UNAVAILABLE'),
  @JsonValue('AUTH_PROVIDER_DISABLED')
  authProviderDisabled('AUTH_PROVIDER_DISABLED'),
  @JsonValue('ACCOUNT_EXISTS_USE_OTHER_METHOD')
  accountExistsUseOtherMethod('ACCOUNT_EXISTS_USE_OTHER_METHOD'),
  @JsonValue('IDENTIFIER_ALREADY_LINKED')
  identifierAlreadyLinked('IDENTIFIER_ALREADY_LINKED'),
  @JsonValue('CONTACT_DOMAIN_BLOCKED')
  contactDomainBlocked('CONTACT_DOMAIN_BLOCKED'),
  @JsonValue('CONTACT_ALREADY_EXISTS')
  contactAlreadyExists('CONTACT_ALREADY_EXISTS'),
  @JsonValue('REAUTH_REQUIRED')
  reauthRequired('REAUTH_REQUIRED'),
  @JsonValue('REAUTH_INVALID')
  reauthInvalid('REAUTH_INVALID'),
  @JsonValue('DEVICE_ATTESTATION_REQUIRED')
  deviceAttestationRequired('DEVICE_ATTESTATION_REQUIRED'),
  @JsonValue('ACCOUNT_SUSPENDED')
  accountSuspended('ACCOUNT_SUSPENDED'),
  @JsonValue('ACCOUNT_DELETED')
  accountDeleted('ACCOUNT_DELETED'),
  @JsonValue('CLIENT_CONTACTS_INCOMPLETE')
  clientContactsIncomplete('CLIENT_CONTACTS_INCOMPLETE'),
  @JsonValue('ONBOARDING_INCOMPLETE')
  onboardingIncomplete('ONBOARDING_INCOMPLETE'),
  @JsonValue('ROLE_ALREADY_SET')
  roleAlreadySet('ROLE_ALREADY_SET'),
  @JsonValue('NOT_IMPLEMENTED')
  notImplemented('NOT_IMPLEMENTED'),
  @JsonValue('I18N_LANGUAGE_NOT_FOUND')
  i18nLanguageNotFound('I18N_LANGUAGE_NOT_FOUND'),
  @JsonValue('I18N_IMPORT_INVALID')
  i18nImportInvalid('I18N_IMPORT_INVALID'),
  @JsonValue('PROVIDER_BUDGET_EXCEEDED')
  providerBudgetExceeded('PROVIDER_BUDGET_EXCEEDED'),
  @JsonValue('PHONE_COUNTRY_NOT_SUPPORTED')
  phoneCountryNotSupported('PHONE_COUNTRY_NOT_SUPPORTED'),
  @JsonValue('ATTORNEY_NOT_VERIFIED')
  attorneyNotVerified('ATTORNEY_NOT_VERIFIED'),
  @JsonValue('USERNAME_TAKEN')
  usernameTaken('USERNAME_TAKEN'),
  @JsonValue('USERNAME_RESERVED')
  usernameReserved('USERNAME_RESERVED'),
  @JsonValue('USERNAME_CHANGE_TOO_SOON')
  usernameChangeTooSoon('USERNAME_CHANGE_TOO_SOON'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ErrorCode(this.json);

  factory ErrorCode.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to String. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ErrorCode> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
