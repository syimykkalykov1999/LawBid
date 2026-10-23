import 'dart:js_interop';

import 'package:lawbid/core/platform/web_lifecycle.dart';
import 'package:web/web.dart' as web;

/// The browser half of [WebLifecycle] (package:web, compiles to wasm).
bool browserIsOnline() => web.window.navigator.onLine;

void attach(
  void Function(WebLifecycleKind kind) report, {
  required bool initialOnline,
}) {
  void on(web.EventTarget target, String type, WebLifecycleKind kind) {
    target.addEventListener(type, ((web.Event _) => report(kind)).toJS);
  }

  on(web.window, 'online', WebLifecycleKind.online);
  on(web.window, 'offline', WebLifecycleKind.offline);
  on(web.window, 'pagehide', WebLifecycleKind.pageHide);
  on(web.window, 'pageshow', WebLifecycleKind.pageShow);
  // Page Lifecycle API (Chromium): a long-hidden tab is frozen.
  on(web.document, 'freeze', WebLifecycleKind.freeze);
  on(web.document, 'resume', WebLifecycleKind.resume);
  web.document.addEventListener(
    'visibilitychange',
    ((web.Event _) => report(
          web.document.visibilityState == 'hidden'
              ? WebLifecycleKind.hidden
              : WebLifecycleKind.visible,
        )).toJS,
  );
  // The page may have been opened already offline / in a background tab.
  if (!initialOnline) report(WebLifecycleKind.offline);
  if (web.document.visibilityState == 'hidden') {
    report(WebLifecycleKind.hidden);
  }
}
