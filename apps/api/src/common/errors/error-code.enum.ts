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
}
