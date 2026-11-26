import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;

/// `navigator.connection` (Network Information API). Chrome, Edge, Samsung
/// Internet and Opera have it; Safari and Firefox do not (then «off»).
JSObject? _connection() {
  final navigator = web.window.navigator as JSObject;
  if (!navigator.has('connection')) return null;
  final c = navigator['connection'];
  return c.isA<JSObject>() ? c! as JSObject : null;
}

/// `navigator.connection.saveData`: the browser's «use less data» switch
/// (Chrome Lite mode / the `Save-Data: on` request header).
bool browserSaveData() {
  final c = _connection();
  if (c == null) return false;
  final v = c['saveData'];
  return v.isA<JSBoolean>() && (v! as JSBoolean).toDart;
}

/// The connection's `change` event, re-read each time.
Stream<bool> browserSaveDataChanges() {
  final c = _connection();
  if (c == null || !c.has('addEventListener')) {
    return const Stream<bool>.empty();
  }
  final target = c as web.EventTarget;
  JSFunction? listener;
  late final StreamController<bool> controller;
  controller = StreamController<bool>.broadcast(
    onListen: () {
      listener = ((web.Event _) => controller.add(browserSaveData())).toJS;
      target.addEventListener('change', listener);
    },
    onCancel: () {
      final l = listener;
      if (l != null) target.removeEventListener('change', l);
      listener = null;
    },
  );
  return controller.stream;
}
