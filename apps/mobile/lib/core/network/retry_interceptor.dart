import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';

import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/network/request_priority.dart';
import 'package:lawbid/core/network/retry_budget.dart';

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
///
/// At most 2 retries (3 attempts): a struggling server isn't hammered. A
/// `Retry-After` header (seconds) replaces the backoff, capped at
/// [maxRetryAfter].
///
/// Stage 2 SRE (Б5, 25.11) — two more brakes so repeats never multiply the
/// load on a sick server (before: every refusal was repeated twice, up to
/// ×3 the load, also during load shedding):
/// - a retry budget for the whole client, gRFC A6 retry throttling
///   ([RetryThrottle], Apache-2.0): failures take tokens, answers give
///   them back, no repeat while half or fewer are left;
/// - client-side adaptive throttling, SRE ch. 21 ([AdaptiveThrottle]):
///   while the server refuses work, the app drops part of its own prefetch
///   and background requests before they are sent. A request a person
///   waits for ([RequestPriority.user]) is never dropped.
class RetryInterceptor extends Interceptor {
  RetryInterceptor(
    this._dio, {
    int? maxRetries,
    Duration? baseDelay,
    Duration? maxRetryAfter,
    Future<void> Function(Duration)? sleep,
    Random? random,
    AdaptiveThrottle? throttle,
  })  : _maxRetries = maxRetries,
        _baseDelay = baseDelay,
        _maxRetryAfter = maxRetryAfter,
        _sleep = sleep ?? Future<void>.delayed,
        _random = random ?? Random(),
        throttle = throttle ??
            AdaptiveThrottle(
              k: () => ClientTuning.throttleK,
              window: () => ClientTuning.throttleWindow,
              random: random,
            );

  /// Client-side adaptive throttling (SRE ch. 21) of this client.
  final AdaptiveThrottle throttle;

  RetryThrottle? _budget;
  (double, double)? _budgetOf;

  /// The retry budget of this client (one per Dio, as gRPC has one per
  /// channel); rebuilt full when the server changes its numbers.
  RetryThrottle get budget {
    final want = (ClientTuning.retryTokensMax, ClientTuning.retryTokenRatio);
    if (_budget == null || _budgetOf != want) {
      _budget = RetryThrottle(maxTokens: want.$1, tokenRatio: want.$2);
      _budgetOf = want;
    }
    return _budget!;
  }

  /// `DioException.error` of a request the app dropped itself (SRE ch. 21).
  static const clientThrottled = 'client_throttled';

  final Dio _dio;
  final int? _maxRetries;
  final Duration? _baseDelay;
  final Duration? _maxRetryAfter;

  /// Scale audit 2026-10-23: unless a test pins them, the server decides
  /// (`client.retry_*`, core/config/client_tuning.dart).
  int get maxRetries => _maxRetries ?? ClientTuning.retryMax;
  Duration get baseDelay => _baseDelay ?? ClientTuning.retryBase;
  Duration get maxRetryAfter => _maxRetryAfter ?? ClientTuning.retryAfterMax;
  final Future<void> Function(Duration) _sleep;
  final Random _random;

  static const _idempotentMethods = {'GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'};
  static const _retryableStatuses = {502, 503, 504};

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final mayReject = RequestPriority.of(options) != RequestPriority.user;
    if (!throttle.admit(mayReject: mayReject)) {
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.cancel,
          error: clientThrottled,
          message: 'Dropped by the app: the server is refusing work.',
        ),
      );
      return;
    }
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    throttle.settle(accepted: true);
    budget.onSuccess();
    handler.next(response);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final options = err.requestOptions;
    if (err.error == clientThrottled) {
      handler.next(err);
      return;
    }
    _settle(err);
    final attempt = (options.extra[RequestFlags.retryAttempt] as int?) ?? 0;
    final retryable = isRetryable(err);
    // gRFC A6: every failed attempt of a retryable kind takes a token, the
    // last one too; any answer from the server gives tokens back.
    final budgetLeft = retryable
        ? budget.onQualifiedFailureThenCheckIsAboveThreshold()
        : _answered(err);
    if (attempt >= maxRetries || !retryable || !budgetLeft) {
      handler.next(err);
      return;
    }

    await _sleep(retryAfter(err.response) ?? backoffFor(attempt));
    options.extra = {...options.extra, RequestFlags.retryAttempt: attempt + 1};
    try {
      final response = await _dio.fetch<dynamic>(options);
      handler.resolve(response);
    } on DioException catch (e) {
      handler.next(e);
    }
  }

  /// SRE ch. 21: the server «accepted» every answer but an overload
  /// refusal (429, or a 502/503/504 without a domain code, SERVER_BUSY).
  void _settle(DioException err) {
    if (err.type == DioExceptionType.cancel) {
      throttle.forget();
      return;
    }
    final status = err.response?.statusCode;
    final refused = status == null ||
        status == 429 ||
        (_retryableStatuses.contains(status) &&
            (_isServerBusy(err.response?.data) ||
                !_hasDomainErrorCode(err.response?.data)));
    throttle.settle(accepted: !refused);
  }

  /// A non-retryable failure that still is an answer (a 404, a 409 …)
  /// gives tokens back like a success, as in grpc-java (only a retryable
  /// status takes them). Returns false: nothing to repeat anyway.
  bool _answered(DioException err) {
    if (err.response != null) budget.onSuccess();
    return false;
  }

  /// Exponential backoff (base × 2^attempt) with up to 30% jitter so a
  /// fleet of clients coming back online doesn't retry in lockstep.
  Duration backoffFor(int attempt) {
    return ClientTuning.withJitter(
      baseDelay * pow(2, attempt).toInt(),
      _random,
    );
  }

  /// The server's `Retry-After` in seconds (an HTTP date is ignored),
  /// capped at [maxRetryAfter]; null when absent or unparseable.
  Duration? retryAfter(Response<dynamic>? response) {
    final d = ClientTuning.parseRetryAfter(response?.headers['retry-after']);
    if (d == null) return null;
    return d > maxRetryAfter ? maxRetryAfter : d;
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
        if (status == null || !_retryableStatuses.contains(status)) {
          return false;
        }
        // 503 SERVER_BUSY (docs/runbooks/REALTIME_LIFECYCLE.md §5.6): the
        // server sheds load and says when to come back (`Retry-After`) -
        // repeat, do not give up and do not call it offline.
        return _isServerBusy(err.response?.data) ||
            !_hasDomainErrorCode(err.response?.data);
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
    return options.headers.keys
        .any((k) => k.toLowerCase() == 'idempotency-key');
  }

  static bool _isServerBusy(Object? data) {
    if (data is! Map<String, dynamic>) return false;
    final error = data['error'];
    return error is Map<String, dynamic> && error['code'] == 'SERVER_BUSY';
  }

  static bool _hasDomainErrorCode(Object? data) {
    if (data is! Map<String, dynamic>) return false;
    final error = data['error'];
    return error is Map<String, dynamic> && error['code'] is String;
  }
}
