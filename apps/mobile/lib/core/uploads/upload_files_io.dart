import 'dart:io';
import 'dart:typed_data';

import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:path_provider/path_provider.dart';

UploadFiles createUploadFiles() => IoUploadFiles();

/// The phone: `<application support>/upload_queue/<name>`.
class IoUploadFiles implements UploadFiles {
  IoUploadFiles({Future<Directory> Function()? root})
      : _root = root ?? getApplicationSupportDirectory;

  final Future<Directory> Function() _root;
  Future<Directory>? _dir;

  /// Resolved once (calls made at the same time share it).
  Future<Directory> _folder() => _dir ??= () async {
        final dir = Directory('${(await _root()).path}/${UploadFiles.folder}');
        if (!dir.existsSync()) await dir.create(recursive: true);
        return dir;
      }();

  @override
  Future<String> keep(
    String name, {
    Uint8List? bytes,
    String? fromPath,
    bool move = false,
  }) async {
    final target = File('${(await _folder()).path}/$name');
    if (bytes != null) {
      await target.writeAsBytes(bytes, flush: true);
    } else if (fromPath != null) {
      final src = File(fromPath);
      if (move) {
        try {
          await src.rename(target.path);
          return name;
        } on FileSystemException {
          // Another volume: copy, then remove.
        }
      }
      await src.copy(target.path);
      if (move) {
        try {
          await src.delete();
        } on Object {
          // Left for the OS to clean.
        }
      }
    }
    return name;
  }

  @override
  Future<String?> pathOf(String name) async {
    final f = File('${(await _folder()).path}/$name');
    return f.existsSync() ? f.path : null;
  }

  @override
  Future<Uint8List?> read(String name) async {
    final p = await pathOf(name);
    if (p == null) return null;
    try {
      return await File(p).readAsBytes();
    } on FileSystemException {
      // Removed between the check and the read (job finished, folder cleaned).
      return null;
    }
  }

  @override
  Future<void> remove(String name) async {
    try {
      await File('${(await _folder()).path}/$name').delete();
    } on Object {
      // Already gone.
    }
  }
}
