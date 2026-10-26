import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// The post sticker's width at scale 1, as a fraction of the frame's width.
const double kStoryPostStickerWidth = 0.62;

/// The picture of a post for its sticker: the first photo, else the video
/// cover; null for a text post.
String? storyPostImageUrl(Post post) => post.media.isNotEmpty
    ? post.media.first.mediumUrl
    : post.video?.thumbnailUrl;

/// Owner 2026-10-21 (Instagram «Добавить в историю»): a post as a story
/// sticker — the author row and the photo / video cover (4:5), or the
/// title and the start of the text. Drawn at the frame's size like every
/// story element, in fixed light colours: the story is baked into a
/// picture that each viewer sees in their own theme.
class StoryPostSticker extends StatelessWidget {
  const StoryPostSticker({
    required this.post,
    required this.frameWidth,
    super.key,
  });

  final Post post;
  final double frameWidth;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final w = frameWidth * kStoryPostStickerWidth;
    final pad = w * 0.05;
    final image = storyPostImageUrl(post);
    final title = post.title?.trim() ?? '';
    final body = post.body.trim();
    final name = post.author.displayName;
    final small = type.body.copyWith(
      color: AppColorsLight.text,
      fontSize: w * 0.06,
      height: 1.3,
    );
    final radius = BorderRadius.circular(w * 0.06);
    final card = DecoratedBox(
      decoration: BoxDecoration(
        color: AppColorsLight.surface,
        borderRadius: radius,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.28),
            blurRadius: w * 0.08,
            offset: Offset(0, w * 0.02),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: MediaQuery.withNoTextScaling(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: EdgeInsets.all(pad),
                child: Row(
                  children: [
                    AppAvatar(
                      size: w * 0.12,
                      initials: post.author.initials,
                      imageProvider: post.author.avatarUrl == null
                          ? null
                          : appNetworkImage(
                              post.author.avatarUrl!,
                              decodeWidthFor(w * 0.12),
                            ),
                    ),
                    SizedBox(width: pad),
                    Expanded(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: small.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ),
              if (image != null)
                AspectRatio(
                  aspectRatio: 4 / 5,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      const ColoredBox(color: AppColorsLight.border),
                      Image(
                        image: appNetworkImage(image, decodeWidthFor(w)),
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                      if (post.video != null)
                        Center(
                          child: Container(
                            width: w * 0.18,
                            height: w * 0.18,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.black.withValues(alpha: 0.45),
                            ),
                            child: AppIcon(
                              AppIcons.playArrowRounded,
                              size: w * 0.11,
                              color: Colors.white,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              if (image == null || title.isNotEmpty)
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    pad,
                    image == null ? 0 : pad,
                    pad,
                    pad * 1.4,
                  ),
                  child: Text.rich(
                    TextSpan(
                      children: [
                        if (title.isNotEmpty)
                          TextSpan(
                            text: image != null || body.isEmpty
                                ? title
                                : '$title\n',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        if (image == null && body.isNotEmpty)
                          TextSpan(text: body),
                      ],
                    ),
                    maxLines: image == null ? 6 : 2,
                    overflow: TextOverflow.ellipsis,
                    style: small,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    return SizedBox(
      key: ValueKey('story-post-sticker-${post.id}'),
      width: w,
      child: card,
    );
  }
}
