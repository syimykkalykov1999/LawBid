import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

/// What the browser tells about the tab (the web build only).
enum PageSignal { visible, hidden, online }

/// Owner 2026-10-23: the tab going to the background / coming back
/// (`visibilitychange`) and the browser regaining a network (`online`) —
/// the same resume / network-back handling the phone gets from
/// `AppLifecycleState` and connectivity_plus.
Stream<PageSignal> pageSignals() {
  late StreamController<PageSignal> controller;
  final onVisibility = ((web.Event _) {
    controller.add(
      web.document.visibilityState == 'hidden'
          ? PageSignal.hidden
          : PageSignal.visible,
    );
  }).toJS;
  final onOnline = ((web.Event _) => controller.add(PageSignal.online)).toJS;
  controller = StreamController<PageSignal>.broadcast(
    onListen: () {
      web.document.addEventListener('visibilitychange', onVisibility);
      web.window.addEventListener('online', onOnline);
    },
    onCancel: () {
      web.document.removeEventListener('visibilitychange', onVisibility);
      web.window.removeEventListener('online', onOnline);
    },
  );
  return controller.stream;
}
