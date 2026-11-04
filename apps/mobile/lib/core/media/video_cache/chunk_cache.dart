import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

/// N-1: the on-disk store of video chunks (the first seconds of a video).
/// LRU with a byte ceiling: every read refreshes the entry, a write that
/// goes over [maxBytes] drops the least recently used entries first.
/// One file per chunk; the index lives in memory and is rebuilt from the
/// folder (oldest file first) at start, so a killed app loses nothing.
class ChunkCache {
  ChunkCache(this.dir, {required this.maxBytes});

  final Directory dir;
  int maxBytes;

  /// key -> size, in LRU order (first = oldest).
  final _index = <String, int>{};
  int _bytes = 0;
  Future<void>? _loading;

  int get totalBytes => _bytes;
  int get count => _index.length;
  bool contains(String key) => _index.containsKey(key);

  // One shared load: every caller waits for the same listing. The listing is
  // async (a sync `listSync` + `statSync` per file froze the UI thread on the
  // first video of a session, once per cached chunk).
  Future<void> _load() => _loading ??= _loadFiles();

  Future<void> _loadFiles() async {
    final path = dir.path;
    // The listing runs in a helper isolate (the sync calls are fine there).
    final found = await Isolate.run(() => _listChunks(path));
    for (final (key, size) in found) {
      _index[key] = size;
      _bytes += size;
    }
    await _evict();
  }

  File _file(String key) => File('${dir.path}/$key');

  /// The chunk, or null. Refreshes its place in the LRU order.
  Future<Uint8List?> get(String key) async {
    await _load();
    final size = _index.remove(key);
    if (size == null) return null;
    final f = _file(key);
    try {
      final bytes = await f.readAsBytes();
      _index[key] = size;
      // Touch, so the order survives a restart.
      await f.setLastModified(DateTime.now());
      return bytes;
    } on FileSystemException {
      _bytes -= size;
      return null;
    }
  }

  Future<void> put(String key, List<int> bytes) async {
    await _load();
    final old = _index.remove(key);
    if (old != null) _bytes -= old;
    if (bytes.length > maxBytes) return;
    try {
      await _file(key).writeAsBytes(bytes, flush: true);
    } on FileSystemException {
      return;
    }
    _index[key] = bytes.length;
    _bytes += bytes.length;
    await _evict();
  }

  /// New ceiling from the server: shrinks at once when lowered.
  Future<void> setMaxBytes(int value) async {
    maxBytes = value;
    await _load();
    await _evict();
  }

  /// One-off trim to [bytes] (oldest first) without moving the ceiling:
  /// the global «Максимальный размер кэша» asks for it.
  Future<void> trimTo(int bytes) async {
    await _load();
    while (_bytes > bytes && _index.isNotEmpty) {
      await _remove(_index.keys.first);
    }
  }

  /// Drops the chunks not played for [maxAge] («Автоудаление»); with
  /// [onlyKeys] only those whose key it accepts (the feed ones: chat
  /// videos are left alone). The time is the later of last read and last
  /// write (every read also touches the file).
  Future<void> dropOlderThan(
    Duration maxAge, {
    bool Function(String key)? onlyKeys,
  }) async {
    await _load();
    final cutoff = DateTime.now().subtract(maxAge);
    for (final k in _index.keys.toList()) {
      if (onlyKeys != null && !onlyKeys(k)) continue;
      try {
        final st = _file(k).statSync();
        final used =
            st.accessed.isAfter(st.modified) ? st.accessed : st.modified;
        if (used.isBefore(cutoff)) await _remove(k);
      } on FileSystemException {
        await _remove(k);
      }
    }
  }

  Future<void> clear() async {
    await _load();
    for (final k in _index.keys.toList()) {
      await _remove(k);
    }
  }

  Future<void> _evict() async {
    while (_bytes > maxBytes && _index.isNotEmpty) {
      await _remove(_index.keys.first);
    }
  }

  Future<void> _remove(String key) async {
    final size = _index.remove(key) ?? 0;
    _bytes -= size;
    try {
      await _file(key).delete();
    } on FileSystemException {
      // Already gone.
    }
  }
}

/// Name and size of each cached chunk, oldest first (the LRU order). Creates
/// the folder when it is missing. Top-level so it can run in an isolate.
List<(String, int)> _listChunks(String path) {
  final dir = Directory(path);
  if (!dir.existsSync()) {
    dir.createSync(recursive: true);
    return const [];
  }
  final files = <(File, FileStat)>[];
  for (final f in dir.listSync()) {
    if (f is File) files.add((f, f.statSync()));
  }
  files.sort((a, b) => a.$2.modified.compareTo(b.$2.modified));
  return [for (final (f, st) in files) (f.uri.pathSegments.last, st.size)];
}
