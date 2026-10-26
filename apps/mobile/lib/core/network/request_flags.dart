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

  /// Owner 2026-10-22: a caller-chosen `Idempotency-Key` (a String) for a
  /// [createsResource] POST that may be repeated after the app restarts —
  /// e.g. publishing a queued reel: the same key, the same post.
  static const idempotencyKey = 'idempotencyKey';

  /// Opt a request out of RetryInterceptor entirely (e.g. a call whose
  /// retry would re-send a paid SMS even with a key).
  static const noRetry = 'noRetry';

  /// Owner 2026-10-05 (docs/ops/demo-world.md): this request belongs to a demo
  /// session even though no demo session is in memory yet — the refresh of
  /// a stored demo refresh token. AuthInterceptor adds [demoHeader].
  static const demo = 'demo';

  /// Every request of a demo session carries `X-LawBid-Demo: 1`; a demo
  /// token without it (or a real token with it) is a 401 server-side.
  static const demoHeader = 'X-LawBid-Demo';

  /// Owner 2026-10-22 (guest browsing): AuthInterceptor stamps a request
  /// sent with no bearer token (a guest on an optional-auth read). A 401 or
  /// 429 on it is a «sign in» / «try later» note, never «session expired».
  static const guest = 'guest';

  /// A route that legitimately answers HTML: the captive-portal check skips it.
  static const expectsHtml = 'expectsHtml';

  /// Internal: attempt counter RetryInterceptor keeps across re-fetches.
  static const retryAttempt = 'retryAttempt';

  /// `Options` for a resource-creating POST.
  static Options createOptions({Map<String, dynamic>? headers}) =>
      Options(extra: const {createsResource: true}, headers: headers);
}
