import 'package:dio/dio.dart';

/// `RequestOptions.extra` keys the app's interceptors understand. Kept in
/// one place so repositories opt in by name instead of string literals.
abstract final class RequestFlags {
  /// Skip the bearer token (token-issuing endpoints) — see AuthInterceptor.
  static const skipAuth = 'skipAuth';

  /// This POST creates a resource / has a side effect that must not be
  /// applied twice (`.cursorrules`: "Все POST, создающие ресурс/деньги:
  /// Idempotency-Key"). IdempotencyInterceptor stamps a key; RetryInterceptor
  /// may then safely retry it.
  static const createsResource = 'createsResource';

  /// Opt a request out of RetryInterceptor entirely (e.g. a call whose
  /// retry would re-send a paid SMS even with a key).
  static const noRetry = 'noRetry';

  /// Internal: attempt counter RetryInterceptor keeps across re-fetches.
  static const retryAttempt = 'retryAttempt';

  /// `Options` for a resource-creating POST.
  static Options createOptions({Map<String, dynamic>? headers}) =>
      Options(extra: const {createsResource: true}, headers: headers);
}
