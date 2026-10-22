import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:lawbid/core/media/app_image_cache.dart';

/// A network picture for avatars and list thumbnails (owner 2026-10-15,
/// "the app flies, costs less"): kept on the phone's disk after the first
/// download (no second download of the same avatar on every list or app
/// start) and decoded at [decodeWidth] pixels instead of full size (a 4000 px
/// photo in a 40 px avatar costs ~60 MB of memory otherwise). Pass about
/// three times the logical size for sharp pictures on dense screens.
///
/// Owner 2026-10-18 (speed): cached under [stableImageCacheKey] — a signed
/// link changes with every response, its path (the file) does not.
///
/// Owner 2026-10-22 (load audit finding 8): kept in [AppImageCaches.feed]
/// (2 000 pictures / 7 days instead of the package's 200); chat photos pass
/// `cache: AppImageCaches.chatMedia`.
ImageProvider appNetworkImage(
  String url,
  int decodeWidth, {
  BaseCacheManager? cache,
}) =>
    ResizeImage.resizeIfNeeded(
      decodeWidth,
      null,
      CachedNetworkImageProvider(
        url,
        cacheKey: stableImageCacheKey(url),
        cacheManager: cache ?? AppImageCaches.feed,
      ),
    );

/// Decode width for a square avatar/thumbnail of [logicalSize] points.
int decodeWidthFor(double logicalSize) => (logicalSize * 3).round();

/// Owner 2026-10-18 (speed): the cache key of a picture link. A signed
/// storage link (S3/R2/MinIO `X-Amz-…`, CDN `Signature`/`Expires`, GCS
/// `X-Goog-…`) gets a new query on every API response, so caching by the
/// whole link missed the disk and memory caches every time; its path
/// names the file (`purpose/user/fileId[/variant]`), so that is the key —
/// the same key the feed avatars already use. Any other link keeps its
/// whole address as the key (null), since its query may name the picture.
String? stableImageCacheKey(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || !uri.hasQuery || uri.path.isEmpty) return null;
  final params = uri.queryParameters.keys;
  final signed = params.any(
    (k) =>
        k.startsWith('X-Amz-') ||
        k.startsWith('X-Goog-') ||
        k == 'Signature' ||
        k == 'Expires' ||
        k == 'Key-Pair-Id',
  );
  return signed ? uri.path : null;
}
