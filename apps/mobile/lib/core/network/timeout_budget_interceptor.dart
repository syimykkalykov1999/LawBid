import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:lawbid/core/config/client_tuning.dart';

/// S15-12: a per-route time budget. Every call used to wait up to 15 s for
/// an answer, so a bad network (or a captive portal holding the socket)
/// took that long to be declared "offline". The latency-critical READS of the
/// start (`/me/session`, `/config/bootstrap`) get the server-tunable
/// [ClientTuning.fastTimeout]; everything else, and every write (a lost
/// answer to `/auth/refresh` would look like token reuse), keeps the default.
///
/// Stage 2 SRE (Б5, 25.11): deadline propagation (SRE Book ch. 22). Every
/// call also tells the server how long the app waits —
/// `X-Request-Timeout-Ms`, the job Envoy's `x-envoy-expected-rq-timeout-ms`
/// does (Apache-2.0) — so a read the app already gave up on stops on the
/// server too (database, outbound calls) instead of finishing for nobody.
/// The website sends it only once the bootstrap of this server allows it
/// (CORS); the admin switch `client.deadline_header_enabled` off = never.
class TimeoutBudgetInterceptor extends Interceptor {
  TimeoutBudgetInterceptor({bool Function()? deadlineAllowed})
      : _deadlineAllowed = deadlineAllowed ??
            (() => ClientTuning.deadlineHeaderAllowed(web: kIsWeb));

  static const _fastPaths = ['/me/session', '/config/bootstrap'];

  /// The header name (as Envoy spells its own: lower case on the wire).
  static const deadlineHeader = 'X-Request-Timeout-Ms';

  final bool Function() _deadlineAllowed;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.method.toUpperCase() == 'GET' &&
        _fastPaths.any(options.path.endsWith)) {
      final fast = ClientTuning.fastTimeout;
      final current = options.receiveTimeout;
      if (current == null || current > fast) options.receiveTimeout = fast;
    }
    final wait = options.receiveTimeout;
    if (wait != null && wait > Duration.zero && _deadlineAllowed()) {
      options.headers[deadlineHeader] = '${wait.inMilliseconds}';
    }
    handler.next(options);
  }
}
