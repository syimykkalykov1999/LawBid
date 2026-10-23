import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/platform/web_lifecycle_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/web_lifecycle_web.dart'
    as impl;

/// Owner 2026-10-23 (web speed pass): what a browser tab does that a phone
/// app does not, in one place the connectivity / realtime code can listen
/// to. Nothing here changes behaviour by itself; on the phones the stream
/// never emits and [WebLifecycle.isVisible] is true.
///
/// * [visible] / [hidden]: `visibilitychange` (tab switch, minimise, lock).
/// * [online] / [offline]: the browser's `online` / `offline` events.
/// * [pageHide] / [pageShow]: the page leaves / returns (also from the
///   back-forward cache; a socket opened before `pageHide` is dead after
///   `pageShow`).
/// * [freeze] / [resume]: the browser suspends a long-hidden tab
///   (Page Lifecycle API); timers and sockets stop without any event.
///
/// Every event that brings the page back ([visible], [pageShow], [resume],
/// [online]) carries how long the page was away in [WebLifecycleEvent.awayFor]
/// so a handler can decide: a 3-second tab switch needs nothing, five
/// minutes away needs a catch-up (reconnect the socket, fetch the deltas).
///
/// "Connection lost" must never show because of a tab switch: while
/// [WebLifecycle.settling] is true (the first seconds after the page came
/// back) the offline banner should wait before it appears — the socket is
/// reconnecting, not gone.
enum WebLifecycleKind {
  visible,
  hidden,
  online,
  offline,
  pageHide,
  pageShow,
  freeze,
  resume,
}

@immutable
class WebLifecycleEvent {
  const WebLifecycleEvent(this.kind, {this.awayFor = Duration.zero});

  final WebLifecycleKind kind;

  /// For the events that bring the page back: how long it was hidden /
  /// frozen / offline. [Duration.zero] otherwise.
  final Duration awayFor;

  /// The page just came (back) to the foreground or the network is back.
  bool get isComingBack =>
      kind == WebLifecycleKind.visible ||
      kind == WebLifecycleKind.pageShow ||
      kind == WebLifecycleKind.resume ||
      kind == WebLifecycleKind.online;

  @override
  String toString() => 'WebLifecycleEvent($kind, awayFor: $awayFor)';
}

/// Keeps the little state behind the events (when the page went away) and
/// fans them out. Public so tests can drive it without a browser.
class WebLifecycleBus {
  WebLifecycleBus({DateTime Function()? now}) : _now = now ?? DateTime.now;

  /// The grace window after the page came back (see [settling]).
  static const Duration settleWindow = Duration(seconds: 5);

  final DateTime Function() _now;
  final StreamController<WebLifecycleEvent> _controller =
      StreamController<WebLifecycleEvent>.broadcast();

  DateTime? _hiddenAt;
  DateTime? _offlineAt;
  DateTime? _backAt;
  bool _visible = true;
  bool _online = true;

  Stream<WebLifecycleEvent> get events => _controller.stream;

  bool get isVisible => _visible;

  /// The browser's own idea of "online"; true until told otherwise.
  bool get isOnline => _online;

  /// True for [settleWindow] after the page came back: sockets are still
  /// reconnecting, so a "connection lost" banner should wait.
  bool get settling {
    final back = _backAt;
    return back != null && _now().difference(back) < settleWindow;
  }

  void report(WebLifecycleKind kind) {
    final now = _now();
    var away = Duration.zero;
    switch (kind) {
      case WebLifecycleKind.hidden:
      case WebLifecycleKind.pageHide:
      case WebLifecycleKind.freeze:
        _hiddenAt ??= now;
        _visible = false;
      case WebLifecycleKind.visible:
      case WebLifecycleKind.pageShow:
      case WebLifecycleKind.resume:
        final since = _hiddenAt;
        if (since != null) away = now.difference(since);
        _hiddenAt = null;
        _visible = true;
        _backAt = now;
      case WebLifecycleKind.offline:
        _offlineAt ??= now;
        _online = false;
      case WebLifecycleKind.online:
        final since = _offlineAt;
        if (since != null) away = now.difference(since);
        _offlineAt = null;
        _online = true;
        _backAt = now;
    }
    if (!_controller.isClosed) {
      _controller.add(WebLifecycleEvent(kind, awayFor: away));
    }
  }

  Future<void> dispose() => _controller.close();
}

/// The one bus of the page. On the phones it exists but nothing feeds it.
abstract final class WebLifecycle {
  static final WebLifecycleBus bus = WebLifecycleBus();
  static bool _attached = false;

  /// Starts listening to the browser (idempotent; a no-op outside the
  /// browser). Call once at startup.
  static void attach() {
    if (_attached) return;
    _attached = true;
    impl.attach(bus.report, initialOnline: impl.browserIsOnline());
  }

  static Stream<WebLifecycleEvent> get events => bus.events;
  static bool get isVisible => bus.isVisible;
  static bool get isOnline => bus.isOnline;
  static bool get settling => bus.settling;
}

/// Riverpod view of [WebLifecycle.events] (empty stream on the phones).
final webLifecycleProvider = StreamProvider<WebLifecycleEvent>((ref) {
  WebLifecycle.attach();
  return WebLifecycle.events;
});
