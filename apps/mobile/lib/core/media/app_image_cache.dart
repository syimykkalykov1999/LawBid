import 'package:flutter_cache_manager/flutter_cache_manager.dart';

/// Owner 2026-10-22 (load audit finding 8): the phone's picture caches.
/// flutter_cache_manager's default keeps only 200 files, so scrolling the
/// feed downloaded the same pictures again. Two caches, so chat photos do
/// not push feed pictures and avatars out (and the other way round).
// TODO(owner): Telegram-style limits — a size cap (about 500 MB), «Keep
// media» and a storage screen come in the media-storage task
// (docs/perf/SERVER_LOAD_AUDIT_2026-10-22.md, finding 8, «Do first» 7).
abstract final class AppImageCaches {
  /// Feed pictures, avatars, stories, reels thumbnails.
  static final CacheManager feed = CacheManager(
    Config(
      'lawbid_images',
      stalePeriod: const Duration(days: 7),
      maxNrOfCacheObjects: 2000,
    ),
  );

  /// Photos, video previews and files of chats.
  static final CacheManager chatMedia = CacheManager(
    Config(
      'lawbid_chat_media',
      stalePeriod: const Duration(days: 7),
      maxNrOfCacheObjects: 1000,
    ),
  );
}
