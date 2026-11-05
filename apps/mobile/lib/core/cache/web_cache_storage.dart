import 'package:lawbid/core/cache/web_blob_store.dart';

/// Owner 2026-11-03 (web gaps, audit §4.3 item 4; R-096, R-244): the
/// «Хранилище» numbers and «Очистить кэш» on the web. A browser has no
/// folder to measure, so every app cache is a named browser Cache Storage
/// cache ([WebBlobStore]) with the same key a phone folder has
/// (`lawbid_images`, `lawbid_chat_media`, `lawbid_video`). `MediaCacheDir`
/// calls this on the web, so `CacheMaintenance.measure()` / `clear()` (and
/// the storage screen on top of them) work unchanged.
///
/// The page-level HTTP cache of `<img>` / `<video>` cannot be listed or
/// emptied by a page; the browser owns it, and it is not counted here.
/// [estimate] is the browser's own figure for the whole site, for a
/// «занято сайтом» line.
class WebCacheStorage {
  WebCacheStorage({WebBlobStore? store}) : _store = store ?? WebBlobStore();

  /// The browser's store; one per app.
  static final WebCacheStorage instance = WebCacheStorage();

  final WebBlobStore _store;

  /// Bytes held by the cache [name].
  Future<int> sizeOf(String name) async {
    final blobs = await _store.list(name);
    return blobs.fold<int>(0, (a, b) => a + b.bytes);
  }

  /// Empties the cache [name]; true when nothing is left.
  Future<bool> clear(String name) async {
    await _store.clear(name);
    return (await _store.list(name)).isEmpty;
  }

  /// Deletes the oldest blobs of [name] until it fits [limitBytes]; answers
  /// how many bytes went.
  Future<int> trimTo(String name, int limitBytes) async {
    final blobs = await _store.list(name);
    var total = blobs.fold<int>(0, (a, b) => a + b.bytes);
    if (total <= limitBytes) return 0;
    blobs.sort((a, b) => a.written.compareTo(b.written));
    var freed = 0;
    for (final b in blobs) {
      if (total - freed <= limitBytes) break;
      await _store.delete(name, b.key);
      freed += b.bytes;
    }
    return freed;
  }

  /// Deletes blobs of [name] written before [maxAge] ago («Хранить медиа»).
  Future<int> dropOlderThan(String name, Duration maxAge) async {
    final cutoff = DateTime.now().subtract(maxAge);
    var freed = 0;
    for (final b in await _store.list(name)) {
      if (b.written.isBefore(cutoff)) {
        await _store.delete(name, b.key);
        freed += b.bytes;
      }
    }
    return freed;
  }

  /// The whole site's usage and quota as the browser counts them.
  Future<WebStorageEstimate?> estimate() => _store.estimate();
}
