import 'package:dio/dio.dart';

/// String constants for the [ErrorCode] values
/// (apps/api/src/common/errors/error-code.enum.ts) that Flutter code
/// branches on directly. NOT the full enum — `packages/api-contract` is an
/// empty stub (README only, no generator wired), so these are hand-copied
/// rather than shared; add more here as more call sites need to switch on a
/// specific code, instead of inventing a string literal at the call site.
abstract final class ApiErrorCodes {
  static const tokenExpired = 'TOKEN_EXPIRED';
  static const unauthorized = 'UNAUTHORIZED';
  static const authSessionRevoked = 'AUTH_SESSION_REVOKED';
  static const authOtpInvalid = 'AUTH_OTP_INVALID';
  static const authOtpExpired = 'AUTH_OTP_EXPIRED';
  static const authOtpLocked = 'AUTH_OTP_LOCKED';
  static const authOtpRequestLimit = 'AUTH_OTP_REQUEST_LIMIT';
  static const rateLimited = 'RATE_LIMITED';

  // Social login (Phase 3 of the auth networking work, docs/CHANGELOG.md)
  // — copied verbatim from apps/api/src/common/errors/error-code.enum.ts.
  static const authSocialTokenInvalid = 'AUTH_SOCIAL_TOKEN_INVALID';
  static const authSocialProviderUnavailable = 'AUTH_SOCIAL_PROVIDER_UNAVAILABLE';
  static const authProviderDisabled = 'AUTH_PROVIDER_DISABLED';
  static const accountExistsUseOtherMethod = 'ACCOUNT_EXISTS_USE_OTHER_METHOD';
  static const accountSuspended = 'ACCOUNT_SUSPENDED';
  static const accountDeleted = 'ACCOUNT_DELETED';
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
