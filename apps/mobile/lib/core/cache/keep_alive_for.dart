import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Owner 2026-11-04 (R-385, «только по изменению идти на сервер»): an
/// auto-dispose provider keeps its answer for a given time after it was
/// read, so leaving a screen and opening it again in that window asks the
/// server nothing. After the window the provider is dropped as soon as nobody
/// listens, and the next visit reads again (a 304 when nothing changed).
/// Invalidation (a save, a realtime event) still re-reads at once.
///
/// Copied from the Riverpod documentation, «Auto Dispose & State Disposal →
/// Example: keeping state alive for a specific amount of time»
/// (https://riverpod.dev/docs/concepts2/auto_dispose, MIT); only the name
/// differs, so it does not clash with the HTTP cache's `cacheFor`.
extension KeepAliveForRef on Ref {
  void keepAliveFor(Duration duration) {
    final link = keepAlive();
    final timer = Timer(duration, link.close);
    onDispose(timer.cancel);
  }
}

/// The windows of R-385 (docs/dev/SERVER_REQUESTS_AUDIT_2026-11-04.md §3).
abstract final class KeepWindows {
  /// Screens that realtime events or own actions already refresh: an open
  /// case, a bid, the client's contacts, the own profile, review summary.
  static const live = Duration(minutes: 5);

  /// The case workspace: no realtime listener, so a shorter window.
  static const workspace = Duration(minutes: 2);

  /// Settings the admin panel changes a few times a year.
  static const reference = Duration(hours: 1);
}
