import 'package:lawbid/core/network/api_error.dart';

/// What a failed `/auth/refresh` says about the stored refresh token
/// (S15-1, mobile systems round 15; RFC 6749 §5.2: wipe the credential only
/// on a definitive grant rejection, never on a transient failure).
enum RefreshFailureKind {
  /// The server said the refresh token is dead (invalid / expired / reused /
  /// revoked, 401 or 403 with an auth error code): sign out.
  definitive,

  /// The server (or something in front of it) is busy or broken right now:
  /// 408, 429, 5xx, `SERVER_BUSY`. The token may be fine: keep it, retry.
  transient,

  /// The request never got a real answer (offline, timeout, captive portal,
  /// a body that is not our JSON envelope): keep the token.
  network,

  /// Anything else (a 4xx that is not an auth rejection, a local decode or
  /// keystore error): says nothing about the token, so keep it.
  unknown,
}

/// Error codes that mean "this refresh token will never work again".
const definitiveRefreshCodes = <String>{
  ApiErrorCodes.authRefreshInvalid,
  ApiErrorCodes.authRefreshExpired,
  ApiErrorCodes.authRefreshReuseDetected,
  ApiErrorCodes.authSessionRevoked,
  ApiErrorCodes.authSignedInElsewhere,
  ApiErrorCodes.unauthorized,
  ApiErrorCodes.tokenExpired,
  ApiErrorCodes.accountDeleted,
  ApiErrorCodes.accountSuspended,
};

/// Server answers that are not the token's fault.
const transientServerCodes = <String>{
  'SERVER_BUSY',
  ApiErrorCodes.internalError,
  ApiErrorCodes.rateLimited,
};

RefreshFailureKind classifyRefreshFailure(Object error) {
  if (error is! ApiException) return RefreshFailureKind.unknown;
  final status = error.statusCode;
  if (error.isNetworkError) {
    // A bare ALB/HTML 5xx also lands here (not our JSON envelope).
    return RefreshFailureKind.network;
  }
  if ((status == 401 || status == 403) &&
      definitiveRefreshCodes.contains(error.code)) {
    return RefreshFailureKind.definitive;
  }
  if (status == 408 ||
      status == 429 ||
      (status != null && status >= 500) ||
      transientServerCodes.contains(error.code)) {
    return RefreshFailureKind.transient;
  }
  return RefreshFailureKind.unknown;
}

/// Whether trying the refresh again a moment later can help.
bool isRetryableRefreshFailure(Object error) =>
    classifyRefreshFailure(error) == RefreshFailureKind.transient;
