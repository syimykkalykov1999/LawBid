import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';

import 'request_flags.dart';

/// Retries transient failures with exponential backoff + jitter
/// (docs/01_FOUNDATION_AUTH.md §15 "Этап 1.7": "dio interceptors (auth,
/// single-flight refresh, idempotency, retry)").
///
/// A request is retried only when BOTH hold:
/// - it is safe to repeat: an idempotent HTTP method (GET/HEAD/OPTIONS/PUT/
///   DELETE) or a POST carrying an `Idempotency-Key` (see
///   IdempotencyInterceptor) — never a plain POST like `/auth/refresh`,
///   whose replay would look like refresh-token reuse server-side;
/// - the failure is transient: no response at all (timeout, connection
///   error) or a 502/503/504 WITHOUT a domain error code. A 503
///   `PROVIDER_BUDGET_EXCEEDED` is a deliberate server decision, not a
///   blip, so it is surfaced immediately.
class RetryInterceptor extends Interceptor {
  RetryInterceptor(
    this._dio, {
    this.maxRetries = 3,
    this.baseDelay = const Duration(milliseconds: 400),
    Future<void> Function(Duration)? sleep,
    Random? random,
  })  : _sleep = sleep ?? ((d) => Future<void>.delayed(d)),
        _random = random ?? Random();

  final Dio _dio;
  final int maxRetries;
  final Duration baseDelay;
  final Future<void> Function(Duration) _sleep;
  final Random _random;

  static const _idempotentMethods = {'GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'};
  static const _retryableStatuses = {502, 503, 504};

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final attempt = (options.extra[RequestFlags.retryAttempt] as int?) ?? 0;
    if (attempt >= maxRetries || !isRetryable(err)) {
      handler.next(err);
      return;
    }

    await _sleep(backoffFor(attempt));
    options.extra = {...options.extra, RequestFlags.retryAttempt: attempt + 1};
    try {
      final response = await _dio.fetch<dynamic>(options);
      handler.resolve(response);
    } on DioException catch (e) {
      handler.next(e);
    }
  }

  /// Exponential backoff (base × 2^attempt) with up to 30% jitter so a
  /// fleet of clients coming back online doesn't retry in lockstep.
  Duration backoffFor(int attempt) {
    final exp = baseDelay * pow(2, attempt).toInt();
    final jitterMs = (exp.inMilliseconds * 0.3 * _random.nextDouble()).round();
    return exp + Duration(milliseconds: jitterMs);
  }

  static bool isRetryable(DioException err) {
    final options = err.requestOptions;
    if (options.extra[RequestFlags.noRetry] == true) return false;
    if (!_isSafeToRepeat(options)) return false;

    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
      case DioExceptionType.connectionError:
        return true;
      case DioExceptionType.badResponse:
        final status = err.response?.statusCode;
        if (status == null || !_retryableStatuses.contains(status)) return false;
        return !_hasDomainErrorCode(err.response?.data);
      case DioExceptionType.unknown:
        return err.response == null;
      case DioExceptionType.cancel:
      case DioExceptionType.badCertificate:
        return false;
    }
  }

  static bool _isSafeToRepeat(RequestOptions options) {
    final method = options.method.toUpperCase();
    if (_idempotentMethods.contains(method)) return true;
    return options.headers.keys.any((k) => k.toLowerCase() == 'idempotency-key');
  }

  static bool _hasDomainErrorCode(Object? data) {
    if (data is! Map<String, dynamic>) return false;
    final error = data['error'];
    return error is Map<String, dynamic> && error['code'] is String;
  }
}
