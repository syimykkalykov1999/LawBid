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
}
