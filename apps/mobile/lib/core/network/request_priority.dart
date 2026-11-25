import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

/// Holes re-check (25.11, item 21): how much a person waits for a request,
/// sent as `X-Request-Priority` so an overloaded API sheds prefetch and
/// background work before what someone is looking at (Netflix prioritized
/// load shedding, InfoQ 23.11.2024; Google SRE «Handling Overload»
/// criticality). The server reads only these values and only ever LOWERS a
/// route's level with them (api/common/resilience/shed-priority.ts), so a
/// client can never claim «critical».
enum RequestPriority {
  /// Someone is waiting for it (the default).
  user('user'),

  /// Asked for before anyone needs it: the next page of a list.
  prefetch('prefetch'),

  /// Nobody is waiting: analytics, the daily contacts pass.
  background('background');

  const RequestPriority(this.wire);

  /// The header value.
  final String wire;

  static const header = 'X-Request-Priority';

  /// `RequestOptions.extra` key of a per-call priority (wins over the zone).
  static const extraKey = 'requestPriority';

  static const _zoneKey = #lawbidRequestPriority;

  /// Runs [body] so every API call it starts (also the ones its futures
  /// start later) carries [priority]. A call may still set its own with
  /// [options].
  static T run<T>(RequestPriority priority, T Function() body) =>
      runZoned(body, zoneValues: {_zoneKey: priority});

  /// The priority of a call: its own extra, else the zone's, else [user].
  static RequestPriority of(RequestOptions options) {
    final own = options.extra[extraKey];
    if (own is RequestPriority) return own;
    final zone = Zone.current[_zoneKey];
    return zone is RequestPriority ? zone : RequestPriority.user;
  }

  /// `Options` of one call with this priority.
  Options options() => Options(extra: {extraKey: this});

  /// Phones always may send the header (no CORS; an older server ignores
  /// it). The website only after the bootstrap of THIS server said it allows
  /// the header in CORS (`client.request_priority_enabled` = true): an older
  /// API would fail the browser's preflight. The admin switch off = never.
  static bool allowed(Map<String, String>? appConfig) {
    final v = appConfig?['client.request_priority_enabled'];
    if (v == 'false') return false;
    return !kIsWeb || v == 'true';
  }

  /// The bootstrap's answer, set by ClientTuning.apply.
  static Map<String, String>? lastConfig;
}

/// Adds `X-Request-Priority` to every call of the app's API client.
class RequestPriorityInterceptor extends Interceptor {
  RequestPriorityInterceptor({bool Function()? allowed})
      : _allowed = allowed ??
            (() => RequestPriority.allowed(
                  RequestPriority.lastConfig,
                ));

  final bool Function() _allowed;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (_allowed()) {
      options.headers[RequestPriority.header] =
          RequestPriority.of(options).wire;
    }
    handler.next(options);
  }
}
