import 'dart:io';
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
  bool _loaded = false;

  int get totalBytes => _bytes;
  int get count => _index.length;
  bool contains(String key) => _index.containsKey(key);

  Future<void> _load() async {
    if (_loaded) return;
    _loaded = true;
    if (!dir.existsSync()) {
      dir.createSync(recursive: true);
      return;
    }
    final files = <(FileSystemEntity, FileStat)>[];
    for (final f in dir.listSync()) {
      if (f is File) files.add((f, f.statSync()));
    }
    files.sort((a, b) => a.$2.modified.compareTo(b.$2.modified));
    for (final (f, st) in files) {
      final key = f.uri.pathSegments.last;
      _index[key] = st.size;
      _bytes += st.size;
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
