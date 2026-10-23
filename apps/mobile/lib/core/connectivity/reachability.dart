import 'dart:async';

import 'package:dio/dio.dart';
import 'package:lawbid/core/realtime/realtime_timings.dart';
import 'package:lawbid/core/realtime/reconnect_controller.dart';

/// Real-world "can we reach the LawBid API" signal fed by the app's actual
/// traffic (docs/01 §8.3 offline state): every HTTP response proves the
/// server is reachable; every connection-level failure proves it is not.
/// Owns no dependencies, so the dio stack can feed it without creating a
/// provider cycle with `ConnectivityService` (which also uses dio for its
/// health probe).
///
/// Owner 2026-10-23 (part C4): a single failed request is not "offline".
/// The signal turns unreachable only after `offlineFailures` failures in a
/// row, or when `offlineSeconds` pass after the first failure with no
/// success in between; the first success turns it back at once. Failures
/// while the app is in the background are ignored (a sleeping radio is not
/// a dead server).
class ReachabilitySignal {
  ReachabilitySignal({
    RealtimeTimings Function()? timings,
    DateTime Function()? now,
    TimerFactory? timer,
  })  : _timings = timings ?? (() => const RealtimeTimings()),
        _now = now ?? DateTime.now,
        _timer = timer ?? Timer.new;

  final RealtimeTimings Function() _timings;
  final DateTime Function() _now;
  final TimerFactory _timer;

  final StreamController<bool> _controller =
      StreamController<bool>.broadcast(sync: true);

  bool? _last;
  int _failures = 0;
  DateTime? _firstFailureAt;
  Timer? _graceTimer;
  bool _background = false;

  /// Last observed reachability, or null before any request finished.
  bool? get lastKnown => _last;

  /// Emits only on change (a busy screen doesn't flood listeners).
  Stream<bool> get changes => _controller.stream;

  void markReachable() {
    _resetFailures();
    _set(true);
  }

  void markUnreachable() {
    if (_background || _last == false) return;
    _failures++;
    final first = _firstFailureAt ??= _now();
    final t = _timings();
    if (_failures >= t.offlineFailures) {
      _resetFailures();
      _set(false);
      return;
    }
    if (_graceTimer?.isActive ?? false) return;
    final left = Duration(seconds: t.offlineSeconds) - _now().difference(first);
    _graceTimer = _timer(left.isNegative ? Duration.zero : left, () {
      _graceTimer = null;
      if (_background || _failures == 0) return;
      _resetFailures();
      _set(false);
    });
  }

  /// The app went to the background (true) or came back (false): failures
  /// seen in the background are forgotten.
  // ignore: avoid_positional_boolean_parameters
  void setBackground(bool background) {
    _background = background;
    if (background) _resetFailures();
  }

  void _resetFailures() {
    _failures = 0;
    _firstFailureAt = null;
    _graceTimer?.cancel();
    _graceTimer = null;
  }

  void _set(bool value) {
    if (_last == value) return;
    _last = value;
    if (!_controller.isClosed) _controller.add(value);
  }

  Future<void> dispose() {
    _graceTimer?.cancel();
    return _controller.close();
  }
}

/// Feeds [ReachabilitySignal] from dio. Added LAST in the chain (after
/// RetryInterceptor), so on the error path it only sees failures that
/// survived the retries.
///
/// Classification:
/// - any HTTP response, including 4xx/5xx error envelopes → reachable (the
///   request made it to a server);
/// - `connectionError` / `connectionTimeout` / `sendTimeout` → unreachable
///   (the request never got there: no route, DNS, refused, captive portal);
/// - `receiveTimeout` (server accepted but is slow), `cancel`,
///   `badCertificate` and other `unknown` errors → no signal: they don't
///   prove the network is gone, and claiming "offline" on a slow endpoint
///   would be wrong.
class ReachabilityInterceptor extends Interceptor {
  ReachabilityInterceptor(this._signal);

  final ReachabilitySignal Function() _signal;

  static bool isConnectivityFailure(DioException error) {
    if (error.response != null) return false;
    return switch (error.type) {
      DioExceptionType.connectionError ||
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout =>
        true,
      _ => false,
    };
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    _signal().markReachable();
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response != null) {
      _signal().markReachable();
    } else if (isConnectivityFailure(err)) {
      _signal().markUnreachable();
    }
    handler.next(err);
  }
}
