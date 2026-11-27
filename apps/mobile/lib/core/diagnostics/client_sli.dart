import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/diagnostics/app_event_names.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/diagnostics/web_vitals_bridge_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/diagnostics/web_vitals_bridge_web.dart'
    as vitals;
import 'package:lawbid/core/network/trace_interceptor.dart';

/// Б6 (25.11, docs/dev/STAGE2_SRE_CLOUD_2026-11-25.md, gap №10; Google SRE
/// Workbook ch. 2 «measure close to the user», GCP Well-Architected
/// reliability «user-experience goals»): the six SLO flows as the PERSON
/// sees them, on the phone and on the website.
///
/// The server already measures each flow on its side (`{metric:"slo"}`); a
/// broken network path, a CDN or DNS fault, or a client bug is invisible
/// there. Here the app's own HTTP layer counts, AFTER its own retries, what
/// the person got: ok, slow, or failed (a 5xx or a timeout; a 4xx is the
/// caller's mistake and an offline phone is not an outage, neither counts).
///
/// The counts leave the device only as anonymous usage events
/// (`sli_<flow>_<ok|slow|fail>`, [AppEvents]: batched about once a minute,
/// only after the person allowed usage statistics, the `app_events` flag
/// and `client.events_enabled`), and only while `client.sli_enabled` is on.
/// The server adds them to its minute line `{metric:"slo_client"}`
/// (apps/api/src/modules/analytics/client-sli-metrics.service.ts).
enum SliFlow { login, feed, message, pay, call, push }

enum SliOutcome { ok, slow, fail }

abstract final class ClientSli {
  /// Where the counts go ([AppEvents.track]); replaced in tests.
  @visibleForTesting
  static void Function(String name) sink = AppEvents.track;

  /// Counts one result of [flow]. Never throws.
  static void record(SliFlow flow, SliOutcome outcome) {
    if (!ClientTuning.sliEnabled) return;
    try {
      sink(AppEventNames.sli(flow, outcome));
    } catch (_) {
      // Counting must never be a problem for the app.
    }
  }

  /// `METHOD path` (path relative to the API, ids removed) → the flow.
  static const _routes = <String, SliFlow>{
    'POST /auth/otp/verify': SliFlow.login,
    'POST /auth/password/login': SliFlow.login,
    'POST /auth/social': SliFlow.login,
    'GET /feed': SliFlow.feed,
    'POST /conversations/:id/messages': SliFlow.message,
    'POST /subscriptions/checkout': SliFlow.pay,
    'POST /pay/session': SliFlow.pay,
    'POST /conversations/:id/calls': SliFlow.call,
    'POST /groups/:id/calls': SliFlow.call,
    'POST /calls/:id/accept': SliFlow.call,
    'POST /calls/:id/join': SliFlow.call,
  };

  /// The flow of one API call, or null.
  static SliFlow? flowOf(String method, String path) {
    var p = path;
    if (p.startsWith('http://') || p.startsWith('https://')) {
      p = Uri.tryParse(p)?.path ?? p;
    }
    p = TraceInterceptor.scrubPath(p);
    final i = p.indexOf('/api/v1/');
    if (i >= 0) p = p.substring(i + '/api/v1'.length);
    if (p.length > 1 && p.endsWith('/')) p = p.substring(0, p.length - 1);
    return _routes['${method.toUpperCase()} $p'];
  }

  /// Б6 / G8: hands the website's Core Web Vitals glue its endpoint and
  /// whether it may send (same consent and switches as the counts above,
  /// plus `client.web_vitals_enabled`). A no-op off the web.
  static void syncWebVitals({required String apiBaseUrl}) {
    if (!kIsWeb) return;
    try {
      final base = apiBaseUrl.endsWith('/')
          ? apiBaseUrl.substring(0, apiBaseUrl.length - 1)
          : apiBaseUrl;
      vitals.setWebVitalsConfig(
        endpoint: '$base/app-events',
        allowed:
            AppEvents.enabled &&
            ClientTuning.eventsEnabled &&
            ClientTuning.webVitalsEnabled &&
            (AppEvents.consent ?? false),
      );
    } catch (_) {
      // Telemetry must never be a problem for the page.
    }
  }
}

/// Counts the result of the SLO flows' API calls (see [ClientSli]). Sits
/// AFTER `RetryInterceptor`: a repeated request reuses its [RequestOptions],
/// so the first-attempt start time stays and the result is counted once,
/// for what the person finally got.
class ClientSliInterceptor extends Interceptor {
  static const _startKey = 'sli.start_us';
  static const _doneKey = 'sli.done';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (ClientSli.flowOf(options.method, options.path) != null) {
      options.extra.putIfAbsent(
        _startKey,
        () => DateTime.now().microsecondsSinceEpoch,
      );
    }
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    _count(response.requestOptions, status: response.statusCode, error: null);
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _count(err.requestOptions, status: err.response?.statusCode, error: err);
    handler.next(err);
  }

  void _count(
    RequestOptions options, {
    required int? status,
    required DioException? error,
  }) {
    final flow = ClientSli.flowOf(options.method, options.path);
    if (flow == null || options.extra[_doneKey] == true) return;
    final outcome = outcomeOf(
      flow,
      status: status,
      error: error?.type,
      elapsed: _elapsed(options),
    );
    if (outcome == null) return;
    options.extra[_doneKey] = true;
    ClientSli.record(flow, outcome);
  }

  static Duration _elapsed(RequestOptions options) {
    final start = options.extra[_startKey];
    if (start is! int) return Duration.zero;
    return Duration(
      microseconds: DateTime.now().microsecondsSinceEpoch - start,
    );
  }

  /// null = not counted (a 4xx, the phone offline, a cancelled request).
  @visibleForTesting
  static SliOutcome? outcomeOf(
    SliFlow flow, {
    required int? status,
    required DioExceptionType? error,
    required Duration elapsed,
  }) {
    if (status != null && status >= 500) return SliOutcome.fail;
    if (status != null && status >= 400) return null;
    if (error != null && status == null) {
      return switch (error) {
        DioExceptionType.connectionTimeout ||
        DioExceptionType.sendTimeout ||
        DioExceptionType.receiveTimeout => SliOutcome.fail,
        _ => null,
      };
    }
    final slowAfter = switch (flow) {
      SliFlow.feed => ClientTuning.sliFeedSlow,
      SliFlow.message => ClientTuning.sliMessageSlow,
      _ => null,
    };
    if (slowAfter != null && elapsed > slowAfter) return SliOutcome.slow;
    return SliOutcome.ok;
  }
}
