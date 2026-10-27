import 'package:flutter/widgets.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/media/stable_network_image.dart';

export 'package:lawbid/core/media/stable_network_image.dart'
    show StableNetworkImage, fullPictureOf, stableImageCacheKey;

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
///
/// Owner 2026-10-26 (avatars that sometimes did not show): loaded through
/// [StableNetworkImage] — a fresh link retries a failed picture, a missing
/// preview falls back to the full picture ([fallbackUrls] too).
ImageProvider appNetworkImage(
  String url,
  int decodeWidth, {
  BaseCacheManager? cache,
  List<String> fallbackUrls = const [],
}) =>
    ResizeImage.resizeIfNeeded(
      decodeWidth,
      null,
      stableNetworkImage(url, cache: cache, fallbackUrls: fallbackUrls),
    );

/// [StableNetworkImage] in the feed cache (or [cache]), without resizing —
/// for widgets that decode at their own size (AppAvatar).
StableNetworkImage stableNetworkImage(
  String url, {
  BaseCacheManager? cache,
  List<String> fallbackUrls = const [],
}) =>
    StableNetworkImage(
      url,
      fallbackUrls: fallbackUrls,
      cacheManager: cache ?? AppImageCaches.feed,
    );

/// Decode width for a square avatar/thumbnail of [logicalSize] points.
int decodeWidthFor(double logicalSize) => (logicalSize * 3).round();
