import 'package:flutter/foundation.dart';
import 'package:lawbid/core/uploads/upload_leave_guard_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/uploads/upload_leave_guard_web.dart'
    as impl;

/// B-c2 (a), 2026-11-09: a browser tab has no background transfer (no
/// Android WorkManager / iOS background URLSession; the Background Fetch API
/// needs a service worker, which the owner put off), so a tab closed or
/// reloaded while a file goes up stops that upload. The queue keeps the job
/// (drift in the browser + Cache Storage, `upload_files_web.dart`) and goes
/// on at the next visit, and the card / strip on the screen shows the
/// progress as on the phone. What the browser can add is what Google Drive,
/// YouTube Studio and Telegram Web do: the browser's own «Leave site?»
/// dialog (`beforeunload`) while something is being sent, and only then.
class UploadLeaveGuard {
  UploadLeaveGuard({required ValueListenable<bool> sending})
      : _sending = sending {
    impl.attachLeaveGuard(this);
  }

  final ValueListenable<bool> _sending;
  bool _disposed = false;

  /// Whether closing the tab now would stop an upload.
  bool get shouldWarn => !_disposed && _sending.value;

  void dispose() {
    _disposed = true;
    impl.detachLeaveGuard(this);
  }
}
