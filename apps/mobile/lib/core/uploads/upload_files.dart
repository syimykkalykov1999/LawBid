import 'dart:typed_data';

import 'package:lawbid/core/uploads/upload_files_memory.dart'
    if (dart.library.io) 'package:lawbid/core/uploads/upload_files_io.dart'
    if (dart.library.js_interop) 'package:lawbid/core/uploads/upload_files_web.dart';

/// Owner 2026-10-22 (audit #4 §3): where queued media waits — the app's
/// support folder `upload_queue/` on the phone (it survives a restart, the
/// OS does not clean it like the temp folder), the browser's Cache Storage
/// (with a copy in memory) in the browser.
abstract class UploadFiles {
  /// The platform's store.
  factory UploadFiles() => createUploadFiles();

  /// Keeps [bytes] (or the file at [fromPath], moved when [move]) as
  /// [name]; returns the name.
  Future<String> keep(
    String name, {
    Uint8List? bytes,
    String? fromPath,
    bool move = false,
  });

  /// The absolute path of a kept [name] (null when it is gone, or in the
  /// browser).
  Future<String?> pathOf(String name);

  Future<Uint8List?> read(String name);

  Future<void> remove(String name);

  /// The folder name inside the app's support directory.
  static const folder = 'upload_queue';
}
