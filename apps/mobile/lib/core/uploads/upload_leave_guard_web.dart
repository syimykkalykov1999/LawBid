import 'dart:js_interop';

import 'package:lawbid/core/uploads/upload_leave_guard.dart';
import 'package:web/web.dart' as web;

/// The browser half of [UploadLeaveGuard] (package:web, compiles to wasm).
/// One `beforeunload` listener for the page; it asks the guard of the
/// current queue (a new account gets a new queue and a new guard).
UploadLeaveGuard? _current;
bool _listening = false;

void attachLeaveGuard(UploadLeaveGuard guard) {
  _current = guard;
  if (_listening) return;
  _listening = true;
  web.window.addEventListener(
    'beforeunload',
    ((web.Event e) {
      if (!(_current?.shouldWarn ?? false)) return;
      // The standard way to ask: preventDefault; returnValue for the
      // browsers that still read it (the text itself is the browser's own).
      e.preventDefault();
      if (e.isA<web.BeforeUnloadEvent>()) {
        (e as web.BeforeUnloadEvent).returnValue = '';
      }
    }).toJS,
  );
}

void detachLeaveGuard(UploadLeaveGuard guard) {
  if (identical(_current, guard)) _current = null;
}
