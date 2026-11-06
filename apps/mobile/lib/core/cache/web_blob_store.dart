import 'dart:typed_data';

import 'package:lawbid/core/cache/web_blob_store_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/cache/web_blob_store_web.dart'
    as impl;

/// One stored blob: its key, size, and when it was written.
typedef WebBlob = ({String key, int bytes, DateTime written});

/// Owner 2026-11-03 (web gaps): the browser's own disk for the app. The
/// browser Cache Storage (`window.caches`, the same API every service
/// worker uses) holds named caches of bytes; the page can list, measure and
/// delete them, which the HTTP cache of `<img>` / `<video>` does not allow.
/// A seam so the web branches are tested on the VM with [MemoryBlobStore].
abstract interface class WebBlobStore {
  /// The browser's store, or an in-memory one where there is no browser.
  factory WebBlobStore() => impl.createWebBlobStore();

  Future<void> put(String cache, String key, Uint8List bytes);

  Future<Uint8List?> get(String cache, String key);

  Future<void> delete(String cache, String key);

  /// Every blob of [cache] (sizes and times only, no bodies are read).
  Future<List<WebBlob>> list(String cache);

  /// Drops the whole [cache].
  Future<void> clear(String cache);
}

/// The no-browser store (VM tests, desktop): bytes in memory.
class MemoryBlobStore implements WebBlobStore {
  final _caches = <String, Map<String, (Uint8List, DateTime)>>{};

  /// Test hook: the time stamped on writes.
  DateTime Function() now = DateTime.now;

  @override
  Future<void> put(String cache, String key, Uint8List bytes) async {
    (_caches[cache] ??= {})[key] = (bytes, now());
  }

  @override
  Future<Uint8List?> get(String cache, String key) async =>
      _caches[cache]?[key]?.$1;

  @override
  Future<void> delete(String cache, String key) async {
    _caches[cache]?.remove(key);
  }

  @override
  Future<List<WebBlob>> list(String cache) async => [
        for (final e in (_caches[cache] ?? const {}).entries)
          (key: e.key, bytes: e.value.$1.length, written: e.value.$2),
      ];

  @override
  Future<void> clear(String cache) async {
    _caches.remove(cache);
  }
}
