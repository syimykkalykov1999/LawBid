import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:lawbid/core/files/open_local_file_stub.dart'
    if (dart.library.io) 'package:lawbid/core/files/open_local_file_native.dart'
    as impl;

/// What the system said about opening a file.
enum OpenLocalResult { opened, fileGone, noApp, failed }

/// Tests answer here instead of the system.
@visibleForTesting
Future<OpenLocalResult> Function(String path, String mime)? debugOpenLocalFile;

/// Opens a file of this device in the system viewer (package open_filex,
/// BSD-3). The browser has no such thing: see `core/files/browser_download`.
Future<OpenLocalResult> openLocalFile(String path, String mime) =>
    debugOpenLocalFile?.call(path, mime) ?? impl.openFile(path, mime);
