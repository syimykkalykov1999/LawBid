import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_blurhash/flutter_blurhash.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:material_ui/material_ui.dart';

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
    this.blurhash,
    this.semanticLabel,
    this.excludeFromSemantics = false,
    super.key,
  });

  final String fileId;
  final String previewUrl;
  final String url;
  final BoxFit fit;
  final int decodeWidth;
  final Duration? fadeIn;

  /// The API's BlurHash of the picture; drawn first, before the 320 px copy.
  final String? blurhash;

  /// Owner row 111 (like Image.semanticLabel): what a screen reader says
  /// for this photo. Null: the photo is not announced on its own.
  final String? semanticLabel;

  /// Owner row 111 (like Image.excludeFromSemantics): a decorative photo
  /// (the row beside it already says what it is) is hidden from readers.
  final bool excludeFromSemantics;

  /// The widget key of the soft stand-in (tests look for it).
  static const previewKey = ValueKey('progressive-photo-preview');

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final photo = _photo(context, colors);
    if (excludeFromSemantics) return ExcludeSemantics(child: photo);
    if (semanticLabel == null) return photo;
    return Semantics(
      image: true,
      label: semanticLabel,
      child: ExcludeSemantics(child: photo),
    );
  }

  Widget _photo(BuildContext context, AppColorTokens colors) {
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
        placeholder: (_, __) => blurhashStandIn(blurhash, colors.skeletonBase),
        errorWidget: (_, __, ___) =>
            blurhashStandIn(blurhash, colors.skeletonBase),
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

/// The picture's BlurHash as a soft stand-in; the flat skeleton colour when
/// the file has none (older uploads) or the hash is malformed.
Widget blurhashStandIn(String? hash, Color fallback) {
  if (hash == null || hash.length < 6) return ColoredBox(color: fallback);
  return BlurHash(
    hash: hash,
    color: fallback,
    duration: Duration.zero,
    errorBuilder: (_, __, ___) => ColoredBox(color: fallback),
  );
}
