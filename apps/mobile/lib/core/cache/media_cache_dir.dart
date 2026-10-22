import 'dart:io';

import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:lawbid/core/persistence/drift_web.dart' show isFlutterTest;
import 'package:path_provider/path_provider.dart';

/// Owner 2026-10-22 (client economy plan §5.1): the byte side of a
/// flutter_cache_manager cache (the package itself only counts files).
/// The cache's folder lives under the temporary directory, named by its
/// key; this measures it, trims the oldest files past a limit and empties
/// it. On the web the browser keeps media itself (nothing to measure).
class MediaCacheDir {
  const MediaCacheDir(this.key);

  final String key;

  Future<Directory?> _dir() async {
    // The web keeps media in the browser; a widget test has no temporary
    // directory (and its platform channel never answers).
    if (kIsWeb || isFlutterTest) return null;
    try {
      final tmp = await getTemporaryDirectory();
      final dir = Directory('${tmp.path}/$key');
      return dir.existsSync() ? dir : null;
    } on Object {
      return null;
    }
  }

  /// Bytes on disk (0 when the folder does not exist yet).
  Future<int> size() async {
    final dir = await _dir();
    if (dir == null) return 0;
    var total = 0;
    try {
      await for (final e in dir.list(recursive: true, followLinks: false)) {
        if (e is File) total += await e.length();
      }
    } on Object catch (e) {
      debugPrint('media cache size $key: $e');
    }
    return total;
  }

  /// Deletes the least recently changed files until the folder fits
  /// [limitBytes]; answers how many bytes went.
  Future<int> trimTo(int limitBytes) async {
    final dir = await _dir();
    if (dir == null) return 0;
    final files = <(File, DateTime, int)>[];
    var total = 0;
    try {
      await for (final e in dir.list(recursive: true, followLinks: false)) {
        if (e is! File) continue;
        final stat = e.statSync();
        files.add((e, stat.modified, stat.size));
        total += stat.size;
      }
    } on Object catch (e) {
      debugPrint('media cache scan $key: $e');
      return 0;
    }
    if (total <= limitBytes) return 0;
    files.sort((a, b) => a.$2.compareTo(b.$2));
    var freed = 0;
    for (final (file, _, size) in files) {
      if (total - freed <= limitBytes) break;
      try {
        await file.delete();
        freed += size;
      } on Object {
        // Busy or gone: the next pass tries again.
      }
    }
    return freed;
  }

  /// Deletes files older than [maxAge] (the «Хранить медиа» rule applied
  /// at once, not only on the next lookup).
  Future<int> dropOlderThan(Duration maxAge) async {
    final dir = await _dir();
    if (dir == null) return 0;
    final cutoff = DateTime.now().subtract(maxAge);
    var freed = 0;
    try {
      await for (final e in dir.list(recursive: true, followLinks: false)) {
        if (e is! File) continue;
        final stat = e.statSync();
        if (stat.modified.isBefore(cutoff)) {
          freed += stat.size;
          await e.delete();
        }
      }
    } on Object catch (e) {
      debugPrint('media cache sweep $key: $e');
    }
    return freed;
  }

  Future<void> clear() async {
    final dir = await _dir();
    if (dir == null) return;
    try {
      await dir.delete(recursive: true);
    } on Object catch (e) {
      debugPrint('media cache clear $key: $e');
    }
  }
}
