import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/media/app_image_cache.dart';

/// Owner 2026-10-23 (Instagram): a photo never opens as an empty grey box.
/// The small 320 px copy (the one the grids and the blurred backdrop
/// already downloaded — the media service serves 320 / 1080 / full
/// variants of every post image) is drawn at once, soft, and the sharp
/// 1080 px copy fades in over it when it is there. No blurhash is stored
/// by the API; the 320 px variant is ~10–20 KB and does the same job.
class ProgressivePhoto extends StatelessWidget {
  const ProgressivePhoto({
    required this.fileId,
    required this.previewUrl,
    required this.url,
    this.fit = BoxFit.cover,
    this.decodeWidth = 1080,
    this.fadeIn,
    super.key,
  });

  final String fileId;
  final String previewUrl;
  final String url;
  final BoxFit fit;
  final int decodeWidth;
  final Duration? fadeIn;

  /// The widget key of the soft stand-in (tests look for it).
  static const previewKey = ValueKey('progressive-photo-preview');

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return CachedNetworkImage(
      imageUrl: url,
      cacheKey: '$fileId:$decodeWidth',
      cacheManager: AppImageCaches.feed,
      // Screen width is enough; never decode the original.
      memCacheWidth: decodeWidth,
      fit: fit,
      fadeInDuration: fadeIn ??
          (context.reduceMotion ? Duration.zero : AppMotion.stateChange),
      placeholder: (_, __) => CachedNetworkImage(
        key: previewKey,
        imageUrl: previewUrl,
        cacheKey: '$fileId:320',
        cacheManager: AppImageCaches.feed,
        memCacheWidth: 320,
        fit: fit,
        fadeInDuration: Duration.zero,
        placeholder: (_, __) => ColoredBox(color: colors.skeletonBase),
        errorWidget: (_, __, ___) => ColoredBox(color: colors.skeletonBase),
      ),
      errorWidget: (_, __, ___) => ColoredBox(
        color: colors.skeletonBase,
        child: AppIcon(
          AppIcons.imageNotSupportedOutlined,
          color: colors.textSecondary,
        ),
      ),
    );
  }
}
