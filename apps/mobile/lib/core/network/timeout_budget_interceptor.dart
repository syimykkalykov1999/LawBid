import 'package:dio/dio.dart';
import 'package:lawbid/core/config/client_tuning.dart';

/// S15-12: a per-route time budget. Every call used to wait up to 15 s for
/// an answer, so a bad network (or a captive portal holding the socket)
/// took that long to be declared "offline". The latency-critical READS of the
/// start (`/me/session`, `/config/bootstrap`) get the server-tunable
/// [ClientTuning.fastTimeout]; everything else, and every write (a lost
/// answer to `/auth/refresh` would look like token reuse), keeps the default.
class TimeoutBudgetInterceptor extends Interceptor {
  static const _fastPaths = ['/me/session', '/config/bootstrap'];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.method.toUpperCase() == 'GET' &&
        _fastPaths.any(options.path.endsWith)) {
      final fast = ClientTuning.fastTimeout;
      final current = options.receiveTimeout;
      if (current == null || current > fast) options.receiveTimeout = fast;
    }
    handler.next(options);
  }
}
