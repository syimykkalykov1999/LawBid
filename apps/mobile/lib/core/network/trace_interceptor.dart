import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/diagnostics/sentry_native.dart';

/// S12-2 / S12-5 (observability round 12): lets one slow request be followed
/// phone → API → database → queue.
///
/// * `traceparent` (W3C Trace Context) on a share of API calls
///   (`client.traceparent_percent`, default 5, 0 = never). The sampled flag
///   is set for exactly the calls the app chose, so the API's ParentBased
///   sampler follows the phone and the tracing bill stays at that share. The
///   header carries random ids only: nothing about the person. Not sent on
///   the web (a custom header would add a CORS preflight to every call).
/// * a Sentry span per call while the session is traced (consent +
///   `client.sentry_traces_percent`, see [SentryNative.tracesRate]); the path
///   has ids and the query removed.
class TraceInterceptor extends Interceptor {
  TraceInterceptor({Random? random, bool? web})
      : _random = random ?? Random.secure(),
        _web = web ?? kIsWeb;

  final Random _random;
  final bool _web;

  static const _spanKey = 'trace.sentry_span';

  /// `00-<32 hex>-<16 hex>-<01|00>`; null when the header must not be sent.
  String? newTraceparent(int percent) {
    if (_web || percent <= 0) return null;
    final sampled = percent >= 100 || _random.nextInt(100) < percent;
    return '00-${_hex(16)}-${_hex(8)}-${sampled ? '01' : '00'}';
  }

  String _hex(int bytes) {
    // All-zero ids are invalid in W3C Trace Context.
    final b = List<int>.generate(bytes, (_) => _random.nextInt(256));
    if (b.every((x) => x == 0)) b[bytes - 1] = 1;
    return b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  }

  /// `/users/8b1f…/posts?x=1` → `/users/:id/posts`.
  static String scrubPath(String path) {
    final noQuery = path.split('?').first.split('#').first;
    return noQuery.split('/').map((s) {
      final isId = RegExp(r'^[0-9a-fA-F-]{16,}$').hasMatch(s) ||
          RegExp(r'^\d+$').hasMatch(s);
      return isId ? ':id' : s;
    }).join('/');
  }

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final header = newTraceparent(ClientTuning.traceparentPercent);
    if (header != null) options.headers['traceparent'] = header;
    final span = SentryNative.startHttpSpan(
      options.method,
      scrubPath(options.path),
    );
    if (span != null) options.extra[_spanKey] = span;
    handler.next(options);
  }

  void _finish(RequestOptions options, int? status) {
    final span = options.extra.remove(_spanKey);
    if (span is SentryHttpSpan) {
      try {
        span.finish(status).catchError((_) {});
      } catch (_) {
        // Telemetry must never be the next crash.
      }
    }
  }

  @override
  void onResponse(
      Response<dynamic> response, ResponseInterceptorHandler handler) {
    _finish(response.requestOptions, response.statusCode);
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _finish(err.requestOptions, err.response?.statusCode);
    handler.next(err);
  }
}
