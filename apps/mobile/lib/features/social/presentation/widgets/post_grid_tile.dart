import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/media/playback_visibility.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_media_width.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/application/grid_video_coordinator.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_cover.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// One square of a 3-column posts grid (the profile's Posts tab, Search
/// results): the first photo or a reel's frame with a small corner mark;
/// a text-only post is its text cover (owner 2026-10-05).
class PostGridTile extends StatelessWidget {
  const PostGridTile({
    required this.post,
    required this.onTap,
    required this.semanticLabel,
    this.showPin = true,
    this.autoplay = false,
    this.index = 0,
    this.warmAhead = const [],
    this.customCover = true,
    super.key,
  });

  /// Owner 2026-10-28: a video's custom cover (a frame or a gallery picture
  /// the author chose) belongs to the profile grid only. False (Search):
  /// the tile shows the video's own frame from the stream instead.
  final bool customCover;

  /// Search grid: the tile's place in the list and the next posts below it
  /// (their posters and first video bytes are warmed ahead of the scroll).
  final int index;
  final List<Post> warmAhead;

  /// Owner 2026-10-13 (Search): no pin; videos play on their own, muted and
  /// looping, with the view count small at the bottom left.
  final bool showPin;
  final bool autoplay;

  final Post post;
  final VoidCallback onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final p = post;
    Widget cover() => PostTextCover(post: p, density: PostCoverDensity.compact);
    Widget body({required bool previewing}) => Stack(
          fit: StackFit.expand,
          children: [
            _tile(colors, p, cover),
            if (autoplay &&
                p.video?.status == 'ready' &&
                p.video?.playbackUrl != null)
              _PreviewVideo(
                post: p,
                previewing: previewing,
                customCover: customCover,
              ),
            // Owner 2026-10-12: a pinned post wears a pin (Instagram).
            if (showPin && p.pinSlot != null)
              const PositionedDirectional(
                top: 6,
                end: 6,
                child: AppIcon(
                  AppIcons.pushPin,
                  size: 16,
                  color: Colors.white,
                ),
              ),
          ],
        );
    return Semantics(
      button: true,
      label: semanticLabel,
      child: AppPressable(
        onTap: onTap,
        child: autoplay
            ? GridTileProbe(
                post: p,
                index: index,
                warmAhead: warmAhead,
                customCover: customCover,
                builder: body,
              )
            : body(previewing: false),
      ),
    );
  }

  Widget _tile(
    AppColorTokens colors,
    Post p,
    Widget Function() cover,
  ) =>
      _posterUrl(p, customCover: customCover) == null
          ? cover()
          : Stack(
              fit: StackFit.expand,
              children: [
                CachedNetworkImage(
                  imageUrl: _posterUrl(p, customCover: customCover)!,
                  cacheKey: _posterKey(p, customCover: customCover),
                  cacheManager: AppImageCaches.feed,
                  fit: BoxFit.cover,
                  memCacheWidth: kGridPosterWidth,
                  // Owner 2026-10-23: the poster is there in the first
                  // frame (a warmed one is found in memory), no fade.
                  fadeInDuration: Duration.zero,
                  fadeOutDuration: Duration.zero,
                  placeholder: (_, __) =>
                      ColoredBox(color: colors.skeletonBase),
                  errorWidget: (_, __, ___) => cover(),
                ),
                if (p.media.length > 1 || p.video != null)
                  PositionedDirectional(
                    top: 6,
                    end: showPin && p.pinSlot != null ? 28 : 6,
                    child: AppIcon(
                      p.video != null
                          ? AppIcons.playArrowRounded
                          : AppIcons.collectionsRounded,
                      size: 16,
                      color: Colors.white,
                    ),
                  ),
              ],
            );
}

/// The profile grid's spacing: three columns, 2 px gutters, square tiles.
const kPostGridDelegate = SliverGridDelegateWithFixedCrossAxisCount(
  crossAxisCount: 3,
  mainAxisSpacing: 2,
  crossAxisSpacing: 2,
);

/// Owner 2026-10-16 (web): a profile's grid like Instagram's: three 3:4
/// tiles, a 1 px gap (measured: 311 x 414 in a 935 px container). Phones
/// keep the square tiles.
SliverGridDelegate profileGridDelegate() => webWideWindow
    ? const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: kWebGridGap,
        crossAxisSpacing: kWebGridGap,
        childAspectRatio: kWebGridTileAspect,
      )
    : kPostGridDelegate;

/// Owner 2026-10-23: the width a grid tile's poster is decoded at.
const int kGridPosterWidth = 400;

/// The tile's picture: the first photo, else the video's custom cover
/// ([customCover], the profile grid) or its own frame (everywhere else).
String? _posterUrl(Post p, {required bool customCover}) => p.media.isNotEmpty
    ? p.media.first.previewUrl
    : customCover
        ? p.video?.thumbnailUrl
        : p.video?.frameThumbnailUrl;

/// The cache key: a frame's signed URL changes with its token, so it is
/// keyed by the video's folder (the URL without the token part).
String? _posterKey(Post p, {required bool customCover}) {
  if (p.media.isNotEmpty) return '${p.media.first.fileId}:320';
  if (customCover) return p.video?.thumbnailUrl;
  final frame = p.video?.frameThumbnailUrl;
  if (frame == null) return null;
  final cut =
      frame.lastIndexOf('/', frame.length - '/thumbnail.jpg'.length - 1);
  return 'frame:${cut < 0 ? frame : frame.substring(cut)}';
}

/// The tile's poster exactly as [PostGridTile] draws it (cache key and
/// decode size), for warming it before the tile is on screen.
ImageProvider? gridPosterProvider(Post p, {bool customCover = true}) {
  final url = _posterUrl(p, customCover: customCover);
  if (url == null) return null;
  return ResizeImage.resizeIfNeeded(
    kGridPosterWidth,
    null,
    CachedNetworkImageProvider(
      url,
      cacheKey: _posterKey(p, customCover: customCover),
      cacheManager: AppImageCaches.feed,
    ),
  );
}

final _postersWarmed = <String>{};

void _warmPosters(
  BuildContext context,
  Iterable<Post> posts, {
  required bool customCover,
}) {
  for (final p in posts) {
    final provider = gridPosterProvider(p, customCover: customCover);
    if (provider == null ||
        !_postersWarmed.add(_posterKey(p, customCover: customCover)!)) {
      continue;
    }
    if (_postersWarmed.length > 600) _postersWarmed.clear();
    unawaited(precacheImage(provider, context, onError: (_, __) {}));
  }
}

/// Search grid: reports how much of the tile is on screen to the
/// [GridVideoCoordinator] (prefetch + the muted previews), warms the
/// posters of this tile and of the next screen's worth, and tells its
/// [builder] whether this tile is one of the (at most two) previewing.
class GridTileProbe extends ConsumerStatefulWidget {
  const GridTileProbe({
    required this.post,
    required this.index,
    required this.warmAhead,
    required this.builder,
    this.customCover = true,
    super.key,
  });

  final Post post;
  final int index;
  final List<Post> warmAhead;

  /// See [PostGridTile.customCover].
  final bool customCover;
  final Widget Function({required bool previewing}) builder;

  @override
  ConsumerState<GridTileProbe> createState() => _GridTileProbeState();
}

class _GridTileProbeState extends ConsumerState<GridTileProbe>
    with PlaybackVisibility {
  late final GridVideoCoordinator _coordinator =
      ref.read(gridVideoCoordinatorProvider);
  double _fraction = 0;

  @override
  void didChangePlaybackVisibility({required bool visible}) => _report();

  /// Playlists of the videos among the next posts.
  List<String> get _ahead => [
        for (final p in widget.warmAhead)
          if (p.video?.ready ?? false) p.video!.playbackUrl!,
      ];

  void _report() {
    if (!mounted) return;
    final v = widget.post.video;
    _coordinator.report(
      widget.post.id,
      GridTileState(
        index: widget.index,
        fraction: _fraction,
        visible: playbackVisible,
        url: (v?.ready ?? false) ? v!.playbackUrl : null,
        ahead: _ahead,
      ),
    );
  }

  @override
  void dispose() {
    _coordinator.remove(widget.post.id);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return VisibilityDetector(
      key: ValueKey('grid-video-${widget.post.id}'),
      onVisibilityChanged: (i) {
        _fraction = i.visibleFraction;
        if (_fraction > 0 && playbackVisible) {
          _warmPosters(
            context,
            [widget.post, ...widget.warmAhead],
            customCover: widget.customCover,
          );
        }
        _report();
      },
      child: ListenableBuilder(
        listenable: _coordinator,
        builder: (_, __) => widget.builder(
          previewing: _coordinator.isPreviewing(widget.post.id),
        ),
      ),
    );
  }
}

/// How long a muted preview plays before it loops back (owner 2026-10-23:
/// Instagram Explore loops a 3-5 s fragment, never the whole video).
const kGridPreviewLength = Duration(seconds: 4);

/// The muted preview of a video tile (its poster stays under it until the
/// first frame moves) and the view count at the bottom left.
class _PreviewVideo extends ConsumerWidget {
  const _PreviewVideo({
    required this.post,
    required this.previewing,
    required this.customCover,
  });

  final Post post;
  final bool previewing;

  /// See [PostGridTile.customCover]: false — a player that cannot play
  /// shows the video's own frame, never the custom cover.
  final bool customCover;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final v = post.video!;
    final f = ref.watch(l10nFormatsProvider);
    // A few seconds from where the author's clip starts, looping.
    final end = v.playStart + kGridPreviewLength;
    final cut = v.playEnd == null || v.playEnd! > end;
    final clip = (cut || !customCover)
        ? PostVideo(
            status: v.status,
            playbackUrl: v.playbackUrl,
            fallbackUrl: v.fallbackUrl,
            thumbnailUrl: customCover ? v.thumbnailUrl : v.frameThumbnailUrl,
            durationSec: v.durationSec,
            width: v.width,
            height: v.height,
            trimStartMs: v.trimStartMs,
            trimEndMs: cut ? end.inMilliseconds : v.trimEndMs,
          )
        : v;
    return Stack(
      fit: StackFit.expand,
      children: [
        // Owner 2026-10-18: no black box over the tile — its cover stays
        // until the video's first frame is drawn over it.
        if (previewing) ReelVideo(video: clip, active: true, backdrop: false),
        if (post.viewCount > 0)
          PositionedDirectional(
            start: 6,
            bottom: 5,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AppIcon(
                  AppIcons.playArrowRounded,
                  size: 14,
                  color: Colors.white,
                ),
                const SizedBox(width: 2),
                Text(
                  SocialFormat.count(f, post.viewCount),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    shadows: [Shadow(blurRadius: 4, color: Colors.black54)],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Owner 2026-10-13 (Search): every tile the same size, 3:4, like
/// Instagram's Explore.
const kSearchPostGridDelegate = SliverGridDelegateWithFixedCrossAxisCount(
  crossAxisCount: 3,
  mainAxisSpacing: 2,
  crossAxisSpacing: 2,
  childAspectRatio: 0.75,
);

/// Owner 2026-10-18: the profile's «Рилсы» grid like Instagram's — three
/// vertical 9:16 tiles a row.
SliverGridDelegate reelsGridDelegate() =>
    const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 3,
      mainAxisSpacing: 2,
      crossAxisSpacing: 2,
      childAspectRatio: 9 / 16,
    );

/// Owner 2026-10-18: one tile of the profile's «Рилсы» tab — the reel's
/// cover (or its text cover while it has none) with the view count at the
/// bottom left, as Instagram shows it. A count the author hid (0 from the
/// server) shows nothing.
class ReelGridTile extends ConsumerWidget {
  const ReelGridTile({
    required this.post,
    required this.onTap,
    required this.semanticLabel,
    super.key,
  });

  final Post post;
  final VoidCallback onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final f = ref.watch(l10nFormatsProvider);
    final thumb = post.video?.thumbnailUrl;
    Widget cover() =>
        PostTextCover(post: post, density: PostCoverDensity.compact);
    return Semantics(
      button: true,
      label: semanticLabel,
      child: AppPressable(
        onTap: onTap,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (thumb == null)
              cover()
            else
              CachedNetworkImage(
                imageUrl: thumb,
                cacheKey: thumb,
                cacheManager: AppImageCaches.feed,
                fit: BoxFit.cover,
                memCacheWidth: 400,
                placeholder: (_, __) => ColoredBox(color: colors.skeletonBase),
                errorWidget: (_, __, ___) => cover(),
              ),
            if (post.viewCount > 0)
              PositionedDirectional(
                start: 6,
                bottom: 5,
                child: Row(
                  key: ValueKey('reel-views-${post.id}'),
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const AppIcon(
                      AppIcons.playArrowRounded,
                      size: 16,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 2),
                    Text(
                      SocialFormat.count(f, post.viewCount),
                      style: Theme.of(context)
                          .extension<AppTypographyTokens>()!
                          .caption
                          .copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        shadows: const [
                          Shadow(blurRadius: 4, color: Colors.black54),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
