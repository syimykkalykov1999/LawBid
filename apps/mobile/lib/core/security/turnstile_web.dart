import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:web/web.dart' as web;

/// The browser half of Cloudflare Turnstile (package:web + dart:js_interop,
/// compiles to JS and to wasm). Cloudflare's script is added to the page
/// the first time a token is needed, so with Turnstile off the page loads
/// nothing and nothing changes.
///
/// Each token is single-use (5 minutes), so every request renders its own
/// widget with `appearance: interaction-only`: Cloudflare keeps it
/// invisible and shows the box only when a person must click. The host
/// element is empty and fixed-position, so it never moves the layout.
/// Docs: developers.cloudflare.com/turnstile/get-started/client-side-
/// rendering (read 2026-10-24).

const _scriptUrl =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/// A non-interactive check normally takes about a second.
const _quietTimeout = Duration(seconds: 12);

/// Once the box is shown, the person needs time to click it.
const _interactiveTimeout = Duration(minutes: 2);

@JS('turnstile')
external _TurnstileApi? get _turnstile;

extension type _TurnstileApi._(JSObject _) implements JSObject {
  external JSString? render(web.Element container, JSObject params);
  external void remove(JSString widgetId);
}

Future<void>? _loading;

Future<bool> _ensureScript() async {
  if (_turnstile != null) return true;
  await (_loading ??= _load());
  return _turnstile != null;
}

Future<void> _load() {
  final done = Completer<void>();
  final script = web.document.createElement('script') as web.HTMLScriptElement
    ..src = _scriptUrl
    ..async = true
    ..addEventListener('load', ((web.Event _) => done.complete()).toJS)
    ..addEventListener(
      'error',
      ((web.Event _) {
        _loading = null; // the next request tries again
        done.complete();
      }).toJS,
    );
  web.document.head!.appendChild(script);
  return done.future.timeout(
    _quietTimeout,
    onTimeout: () => _loading = null,
  );
}

Future<String?> runTurnstile(String siteKey) async {
  try {
    if (!await _ensureScript()) return null;
  } on Object catch (e) {
    debugPrint('turnstile: script not loaded ($e)');
    return null;
  }
  final host = web.document.createElement('div') as web.HTMLElement;
  host.style.cssText = 'position:fixed;left:50%;top:50%;'
      'transform:translate(-50%,-50%);z-index:2147483647;';
  web.document.body!.appendChild(host);

  final result = Completer<String?>();
  Timer? timer;
  void finish(String? token) {
    timer?.cancel();
    if (!result.isCompleted) result.complete(token);
  }

  void arm(Duration d) {
    timer?.cancel();
    timer = Timer(d, () => finish(null));
  }

  JSString? widgetId;
  try {
    arm(_quietTimeout);
    final params = JSObject()
      ..['sitekey'] = siteKey.toJS
      ..['appearance'] = 'interaction-only'.toJS
      ..['callback'] = ((JSString token) => finish(token.toDart)).toJS
      ..['error-callback'] = ((JSAny? _) => finish(null)).toJS
      ..['expired-callback'] = (() => finish(null)).toJS
      ..['timeout-callback'] = (() => finish(null)).toJS
      ..['before-interactive-callback'] =
          (() => arm(_interactiveTimeout)).toJS;
    widgetId = _turnstile!.render(host, params);
    return await result.future;
  } on Object catch (e) {
    debugPrint('turnstile: no token ($e)');
    return null;
  } finally {
    timer?.cancel();
    try {
      if (widgetId != null) _turnstile?.remove(widgetId);
    } on Object catch (_) {
      // The widget is gone with its host element anyway.
    }
    host.remove();
  }
}
