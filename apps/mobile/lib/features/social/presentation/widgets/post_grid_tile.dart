import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_cover.dart';

/// One square of a 3-column posts grid (the profile's Posts tab, Search
/// results): the first photo or a reel's frame with a small corner mark;
/// a text-only post is its text cover (owner 2026-10-05).
class PostGridTile extends StatelessWidget {
  const PostGridTile({
    required this.post,
    required this.onTap,
    required this.semanticLabel,
    super.key,
  });

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
        child: p.media.isEmpty && p.video?.thumbnailUrl == null
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
                    placeholder: (_, __) =>
                        ColoredBox(color: colors.skeletonBase),
                    errorWidget: (_, __, ___) => cover(),
                  ),
                  if (p.media.length > 1 || p.video != null)
                    Positioned(
                      top: 6,
                      right: 6,
                      child: AppIcon(
                        p.video != null
                            ? AppIcons.playArrowRounded
                            : AppIcons.collectionsRounded,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

/// The profile grid's spacing: three columns, 2 px gutters, square tiles.
const kPostGridDelegate = SliverGridDelegateWithFixedCrossAxisCount(
  crossAxisCount: 3,
  mainAxisSpacing: 2,
  crossAxisSpacing: 2,
);
