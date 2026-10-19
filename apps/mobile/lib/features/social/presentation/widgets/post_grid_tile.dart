import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_media_width.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
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
    super.key,
  });

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
    return Semantics(
      button: true,
      label: semanticLabel,
      child: AppPressable(
        onTap: onTap,
        child: Stack(
          fit: StackFit.expand,
          children: [
            _tile(colors, p, cover),
            if (autoplay &&
                p.video?.status == 'ready' &&
                p.video?.playbackUrl != null)
              _AutoplayVideo(post: p),
            // Owner 2026-10-12: a pinned post wears a pin (Instagram).
            if (showPin && p.pinSlot != null)
              const Positioned(
                top: 6,
                right: 6,
                child: AppIcon(
                  AppIcons.pushPin,
                  size: 16,
                  color: Colors.white,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tile(
    AppColorTokens colors,
    Post p,
    Widget Function() cover,
  ) =>
      p.media.isEmpty && p.video?.thumbnailUrl == null
          ? cover()
          : Stack(
              fit: StackFit.expand,
              children: [
                CachedNetworkImage(
                  imageUrl: p.media.isNotEmpty
                      ? p.media.first.previewUrl
                      : p.video!.thumbnailUrl!,
                  cacheKey: p.media.isNotEmpty
                      ? '${p.media.first.fileId}:320'
                      : p.video!.thumbnailUrl,
                  fit: BoxFit.cover,
                  memCacheWidth: 400,
                  placeholder: (_, __) =>
                      ColoredBox(color: colors.skeletonBase),
                  errorWidget: (_, __, ___) => cover(),
                ),
                if (p.media.length > 1 || p.video != null)
                  Positioned(
                    top: 6,
                    right: showPin && p.pinSlot != null ? 28 : 6,
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
SliverGridDelegate profileGridDelegate() => adaptiveShellOn
    ? const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: kWebGridGap,
        crossAxisSpacing: kWebGridGap,
        childAspectRatio: kWebGridTileAspect,
      )
    : kPostGridDelegate;

/// A video tile that plays by itself (muted, looping) while at least 60 % of
/// it is on screen, and lets go of the player when it leaves — at most a
/// handful of players run at once.
class _AutoplayVideo extends ConsumerStatefulWidget {
  const _AutoplayVideo({required this.post});

  final Post post;

  @override
  ConsumerState<_AutoplayVideo> createState() => _AutoplayVideoState();
}

class _AutoplayVideoState extends ConsumerState<_AutoplayVideo> {
  static const _maxPlayers = 6;
  static final _playing = <Object>{};
  bool _on = false;

  void _set(bool want) {
    if (want == _on) return;
    if (want) {
      if (_playing.length >= _maxPlayers) return;
      _playing.add(this);
    } else {
      _playing.remove(this);
    }
    if (mounted) setState(() => _on = want);
  }

  @override
  void dispose() {
    _playing.remove(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.post.video!;
    final f = ref.watch(l10nFormatsProvider);
    return VisibilityDetector(
      key: ValueKey('grid-video-${widget.post.id}'),
      onVisibilityChanged: (i) => _set(i.visibleFraction >= 0.6),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Owner 2026-10-18: no black box over the tile — its cover stays
          // until the video's first frame is drawn over it.
          if (_on) ReelVideo(video: v, active: _on, backdrop: false),
          if (widget.post.viewCount > 0)
            Positioned(
              left: 6,
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
                    SocialFormat.count(f, widget.post.viewCount),
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
      ),
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
