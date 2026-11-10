import 'package:flutter/foundation.dart';
import 'package:lawbid/core/cache/cache_limits.dart' show CacheStore;
import 'package:lawbid/core/cache/web_blob_store.dart';
import 'package:lawbid/core/cache/web_storage_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/cache/web_storage_web.dart'
    as impl;

/// The browser's own numbers for the site's storage.
abstract interface class WebStorageInfo {
  /// The browser's, or nothing where there is no browser.
  factory WebStorageInfo() => impl.createWebStorageInfo();

  /// `navigator.storage.estimate()`: what the site holds (Cache Storage,
  /// IndexedDB, OPFS: the databases of the app) and what the browser lets it
  /// hold. Null when the browser does not say.
  Future<({int usage, int quota})?> estimate();

  /// The names of the site's Cache Storage caches (`caches.keys()`).
  Future<List<String>> cacheNames();
}

/// B-c2 (e), 2026-11-09: «Данные и память» on the site. A phone app reads
/// its folders; a page cannot see the browser's HTTP cache (the pictures and
/// videos `<img>` / `<video>` keep), so on the web the screen measured only
/// the databases and showed 0 for the rest (`MediaCacheDir` has no folder
/// there). What a page CAN measure and empty is its own Cache Storage (the
/// `lawbid_*` caches: voice notes, ...) and the browser's estimate of the
/// whole site: those go on the same rows, «Очистить» empties them, and the
/// daily pass frees them when the site nears the browser's quota — a site
/// over it is evicted whole by the browser, its unsent upload queue too
/// (Storage Standard, «best effort» buckets; web.dev «Storage for the web»).
class WebCaches {
  WebCaches({WebStorageInfo? info, WebBlobStore? store, this.pressure = 0.8})
      : _info = info ?? WebStorageInfo(),
        _store = store ?? WebBlobStore();

  /// The site's caches on the web build, null on the phones.
  static WebCaches? forPlatform() => kIsWeb ? WebCaches() : null;

  /// Never emptied from here: the files of posts and messages still waiting
  /// to be sent (`WebUploadFiles.cacheName`).
  static const kept = {'lawbid_upload_queue'};

  final WebStorageInfo _info;
  final WebBlobStore _store;

  /// The share of the browser's quota above which the daily pass frees the
  /// cleanable caches.
  final double pressure;

  /// The row a cache of the site belongs to.
  static CacheStore storeOf(String name) {
    if (name.contains('voice') || name.contains('chat')) {
      return CacheStore.chatMedia;
    }
    if (name.contains('video')) return CacheStore.video;
    if (name.contains('image') || name.contains('photo')) {
      return CacheStore.images;
    }
    return CacheStore.other;
  }

  Future<List<String>> _cleanable() async {
    try {
      return [
        for (final n in await _info.cacheNames())
          if (n.startsWith('lawbid_') && !kept.contains(n)) n,
      ];
    } on Object catch (e) {
      debugPrint('web caches: $e');
      return const [];
    }
  }

  /// The bytes of the site's own caches, by row.
  Future<Map<CacheStore, int>> sizes() async {
    final out = <CacheStore, int>{};
    for (final name in await _cleanable()) {
      var bytes = 0;
      for (final b in await _store.list(name)) {
        bytes += b.bytes;
      }
      final s = storeOf(name);
      out[s] = (out[s] ?? 0) + bytes;
    }
    return out;
  }

  /// Empties the site's caches of [stores].
  Future<void> clear(Iterable<CacheStore> stores) async {
    final wanted = stores.toSet();
    for (final name in await _cleanable()) {
      if (wanted.contains(storeOf(name))) await _store.clear(name);
    }
  }

  /// The daily pass: when the site holds more than [pressure] of what the
  /// browser allows, the cleanable caches go (true when they did).
  Future<bool> relieve() async {
    final e = await _info.estimate();
    if (e == null || e.quota <= 0 || e.usage < e.quota * pressure) {
      return false;
    }
    await clear(CacheStore.values);
    return true;
  }
}
