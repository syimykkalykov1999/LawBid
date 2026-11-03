import 'dart:io';
import 'dart:isolate';

import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:lawbid/core/persistence/drift_web.dart' show isFlutterTest;
import 'package:path_provider/path_provider.dart';

/// One cached file: where it is, when it was last used, how big.
typedef CachedFile = (File file, DateTime lastUsed, int bytes);

/// Owner 2026-11-03 (cache like Telegram: oldest-unused first): a file was
/// used when it was written or when it was last read, whichever is later
/// (flutter_cache_manager serves a hit by reading the file, so the access
/// time moves; where the system does not keep it, the write time stands).
DateTime lastUsedOf(FileStat stat) =>
    stat.accessed.isAfter(stat.modified) ? stat.accessed : stat.modified;

/// A place with cached files, so one limit can be kept across several of
/// them (chat pictures and voice notes are one store).
// ignore: one_member_abstracts
abstract interface class CachedFiles {
  Future<List<CachedFile>> entries();
}

/// Owner 2026-10-22 (client economy plan §5.1): the byte side of a
/// flutter_cache_manager cache (the package itself only counts files).
/// The cache's folder lives under the temporary directory, named by its
/// key; this measures it, trims the oldest files past a limit and empties
/// it. On the web the browser keeps media itself (nothing to measure).
class MediaCacheDir implements CachedFiles {
  const MediaCacheDir(this.key, {this.root});

  final String key;

  /// Where the folders live; the temporary directory unless a test gives
  /// its own.
  final Future<Directory> Function()? root;

  Future<Directory?> _dir() async {
    final custom = root;
    if (custom != null) {
      final dir = Directory('${(await custom()).path}/$key');
      return dir.existsSync() ? dir : null;
    }
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
    final files = await entries();
    return files.fold<int>(0, (a, f) => a + f.$3);
  }

  /// Every file with its last use and size. The folder is walked in a
  /// background isolate: a cache of thousands of files is never scanned on
  /// the UI thread.
  @override
  Future<List<CachedFile>> entries() async {
    final dir = await _dir();
    if (dir == null) return const [];
    try {
      final path = dir.path;
      final found = await Isolate.run(() => _scan(path));
      return [
        for (final (path, usedMs, bytes) in found)
          (File(path), DateTime.fromMillisecondsSinceEpoch(usedMs), bytes),
      ];
    } on Object catch (e) {
      debugPrint('media cache scan $key: $e');
      return const [];
    }
  }

  /// Deletes the least recently used files until the folder fits
  /// [limitBytes]; answers how many bytes went.
  Future<int> trimTo(int limitBytes) => trimPoolTo([this], limitBytes);

  /// Deletes files not used for [maxAge] («Автоудаление»: applied at once,
  /// not only on the next lookup).
  Future<int> dropOlderThan(Duration maxAge) async {
    final cutoff = DateTime.now().subtract(maxAge);
    var freed = 0;
    for (final (file, used, bytes) in await entries()) {
      if (!used.isBefore(cutoff)) continue;
      try {
        await file.delete();
        freed += bytes;
      } on Object catch (e) {
        debugPrint('media cache sweep $key: $e');
      }
    }
    return freed;
  }

  /// Empties the folder but keeps it (a cache that is already running
  /// writes into it and never recreates it).
  Future<void> clearContents() async {
    final dir = await _dir();
    if (dir == null) return;
    try {
      await for (final e in dir.list(followLinks: false)) {
        try {
          await e.delete(recursive: true);
        } on Object {
          // Busy or gone.
        }
      }
    } on Object catch (e) {
      debugPrint('media cache empty $key: $e');
    }
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

/// 2026-11-02: loose files in the temporary directory that carry one name
/// prefix and suffix (voice notes: `voice_cache_<messageId>.m4a`; the
/// suffix keeps a half-downloaded `….m4a.part` out of the sweep). They are
/// chat media too, but live outside a cache folder, so «Данные и память»
/// never counted or swept them. Measured, aged out and emptied like
/// [MediaCacheDir].
class PrefixedTempFiles implements CachedFiles {
  const PrefixedTempFiles(this.prefix, {this.suffix = '', this.root});

  final String prefix;
  final String suffix;

  /// The directory to look in; the temporary directory unless a test gives
  /// its own.
  final Future<Directory> Function()? root;

  bool _matches(String name) =>
      name.startsWith(prefix) && name.endsWith(suffix);

  Future<List<File>> _files() async {
    if (root == null && (kIsWeb || isFlutterTest)) return const [];
    try {
      final tmp = await (root ?? getTemporaryDirectory)();
      return [
        await for (final e in tmp.list(followLinks: false))
          if (e is File && _matches(e.uri.pathSegments.last)) e,
      ];
    } on Object catch (e) {
      debugPrint('temp files $prefix: $e');
      return const [];
    }
  }

  Future<int> size() async {
    var total = 0;
    for (final f in await _files()) {
      try {
        total += await f.length();
      } on Object {
        // Gone meanwhile.
      }
    }
    return total;
  }

  @override
  Future<List<CachedFile>> entries() async {
    final files = <CachedFile>[];
    for (final f in await _files()) {
      try {
        final st = f.statSync();
        files.add((f, lastUsedOf(st), st.size));
      } on Object {
        // Gone meanwhile.
      }
    }
    return files;
  }

  /// Deletes the oldest files until the rest fits [limitBytes].
  Future<int> trimTo(int limitBytes) => trimPoolTo([this], limitBytes);

  Future<int> dropOlderThan(Duration maxAge) async {
    final cutoff = DateTime.now().subtract(maxAge);
    var freed = 0;
    for (final f in await _files()) {
      try {
        final stat = f.statSync();
        if (lastUsedOf(stat).isBefore(cutoff)) {
          await f.delete();
          freed += stat.size;
        }
      } on Object {
        // Busy or gone: the next pass tries again.
      }
    }
    return freed;
  }

  Future<void> clear() async {
    for (final f in await _files()) {
      try {
        await f.delete();
      } on Object {
        // Already gone.
      }
    }
  }
}

/// Keeps the files of all [pools] together within [limitBytes]: the least
/// recently used go first, whichever pool they are in (see [lastUsedOf]).
/// Answers how many bytes went.
Future<int> trimPoolTo(Iterable<CachedFiles> pools, int limitBytes) async {
  final files = <CachedFile>[for (final p in pools) ...await p.entries()];
  final total = files.fold(0, (a, f) => a + f.$3);
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

/// The folder walk of [MediaCacheDir.entries], run in an isolate:
/// (path, last use in ms since epoch, bytes) per file.
List<(String, int, int)> _scan(String dir) {
  final out = <(String, int, int)>[];
  for (final e in Directory(dir).listSync(recursive: true)) {
    if (e is! File) continue;
    try {
      final stat = e.statSync();
      out.add((e.path, lastUsedOf(stat).millisecondsSinceEpoch, stat.size));
    } on Object {
      // Gone meanwhile.
    }
  }
  return out;
}
