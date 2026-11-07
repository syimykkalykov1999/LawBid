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

/// Owner 2026-11-04 (R-405): the width of the preview the server stores next
/// to every avatar (`<key>_w256`, files.policy `AVATAR_VARIANT_PX`) — the
/// picture every list link (`avatarUrl`) points at.
const int kAvatarPreviewPx = 256;

/// The avatar link to draw at [logicalSize] points on a screen of
/// [devicePixelRatio]: the preview ([url]) while it holds enough pixels, the
/// full 1024 px picture ([fullUrl], else the preview's own full picture —
/// [fullPictureOf]) once the frame needs more than [kAvatarPreviewPx]. A
/// 256 px preview stretched over a 112 pt circle on a 3× screen (336 px)
/// looks soft; the 1024 px picture in a 40 pt list avatar only costs bytes.
String avatarUrlFor(
  String url, {
  required double logicalSize,
  required double devicePixelRatio,
  String? fullUrl,
}) {
  if (logicalSize * devicePixelRatio <= kAvatarPreviewPx) return url;
  return avatarFullUrlFor(url, fullUrl: fullUrl);
}

/// The full-size picture of an avatar (the full-screen view): [fullUrl],
/// else the preview's own full picture, else the preview itself.
String avatarFullUrlFor(String url, {String? fullUrl}) {
  if (fullUrl != null && fullUrl.isNotEmpty) return fullUrl;
  return fullPictureOf(url) ?? url;
}
