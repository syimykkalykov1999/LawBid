import 'dart:async';

import 'package:dio/dio.dart';

/// Real-world "can we reach the LawBid API" signal fed by the app's actual
/// traffic (docs/01 §8.3 offline state): every HTTP response proves the
/// server is reachable; every connection-level failure proves it is not.
/// Owns no dependencies, so the dio stack can feed it without creating a
/// provider cycle with `ConnectivityService` (which also uses dio for its
/// health probe).
class ReachabilitySignal {
  final StreamController<bool> _controller =
      StreamController<bool>.broadcast(sync: true);

  bool? _last;

  /// Last observed reachability, or null before any request finished.
  bool? get lastKnown => _last;

  /// Emits only on change (a busy screen doesn't flood listeners).
  Stream<bool> get changes => _controller.stream;

  void markReachable() => _set(true);

  void markUnreachable() => _set(false);

  void _set(bool value) {
    if (_last == value) return;
    _last = value;
    if (!_controller.isClosed) _controller.add(value);
  }

  Future<void> dispose() => _controller.close();
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
