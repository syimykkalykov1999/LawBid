import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/connectivity/network_interface_monitor.dart';
import 'package:lawbid/core/platform/page_signals_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/page_signals_web.dart'
    as page;

/// Things that mean "check the connection and the token now" (Owner
/// 2026-10-23, part C9).
enum AppSignal { resumed, paused, networkBack }

/// One stream for the phone's lifecycle, the OS network signal and — on the
/// web — the tab's `visibilitychange` / `online`. Duplicates are harmless:
/// every consumer acts only when it has something to fix.
class AppSignals with WidgetsBindingObserver {
  AppSignals({
    required NetworkInterfaceMonitor monitor,
    Stream<page.PageSignal>? pageSignals,
  })  : _monitor = monitor,
        _page = pageSignals ?? page.pageSignals();

  final NetworkInterfaceMonitor _monitor;
  final Stream<page.PageSignal> _page;
  final _controller = StreamController<AppSignal>.broadcast();
  StreamSubscription<bool>? _netSub;
  StreamSubscription<page.PageSignal>? _pageSub;
  bool _started = false;
  bool _foreground = true;

  Stream<AppSignal> get signals => _controller.stream;

  /// False while the app / tab is in the background.
  bool get foreground => _foreground;

  void start() {
    if (_started) return;
    _started = true;
    try {
      WidgetsBinding.instance.addObserver(this);
    } on Object {
      // No Flutter binding (a plain unit test): the other signals remain.
    }
    _netSub = _monitor.changes.listen((up) {
      if (up) _emit(AppSignal.networkBack);
    });
    _pageSub = _page.listen((s) {
      switch (s) {
        case page.PageSignal.visible:
          _emit(AppSignal.resumed);
        case page.PageSignal.hidden:
          _emit(AppSignal.paused);
        case page.PageSignal.online:
          _emit(AppSignal.networkBack);
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _emit(AppSignal.resumed);
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        _emit(AppSignal.paused);
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        break;
    }
  }

  void _emit(AppSignal s) {
    if (s == AppSignal.resumed) _foreground = true;
    if (s == AppSignal.paused) _foreground = false;
    if (!_controller.isClosed) _controller.add(s);
  }

  /// Test hook: feed a signal as the platform would.
  @visibleForTesting
  void emitForTest(AppSignal s) => _emit(s);

  void dispose() {
    if (_started) {
      try {
        WidgetsBinding.instance.removeObserver(this);
      } on Object {
        // See [start].
      }
    }
    unawaited(_netSub?.cancel());
    unawaited(_pageSub?.cancel());
    unawaited(_controller.close());
  }
}

final appSignalsProvider = Provider<AppSignals>((ref) {
  final signals =
      AppSignals(monitor: ref.watch(networkInterfaceMonitorProvider))..start();
  ref.onDispose(signals.dispose);
  return signals;
});
