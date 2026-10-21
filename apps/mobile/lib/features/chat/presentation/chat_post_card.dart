import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart'
    show nameWithCheck;
import 'package:lawbid/features/social/social_routes.dart';

/// The width of a post card in a bubble (like the other chat cards).
const double kChatPostCardWidth = 240;

/// Owner 2026-10-21 (Instagram «Поделиться»): a post sent into a chat —
/// the author row, the first photo / the video cover (▶) or the start of
/// the text, the title. A tap opens the post. A post deleted or hidden
/// since says so and opens nothing.
class PostCardBody extends ConsumerWidget {
  const PostCardBody({required this.card, required this.mine, super.key});

  final SharedPostCard card;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final meta = mine ? chat.mineMeta : chat.theirsMeta;
    final frame = BoxDecoration(
      color: fg.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(12),
    );
    if (!card.available) {
      return Container(
        key: ValueKey('chat-post-gone-${card.id}'),
        width: kChatPostCardWidth,
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: frame,
        child: Row(
          children: [
            AppIcon(AppIcons.imageNotSupportedOutlined, size: 20, color: meta),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('chat.post.unavailable'),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: type.bodySmall.copyWith(color: meta),
              ),
            ),
          ],
        ),
      );
    }
    final name = card.authorName ?? card.authorUsername ?? '';
    final title = card.title?.trim() ?? '';
    final excerpt = card.excerpt?.trim() ?? '';
    final thumb = card.thumbnailUrl;
    final nameStyle = type.bodySmall.copyWith(
      color: fg,
      fontWeight: FontWeight.w700,
    );
    return Semantics(
      button: true,
      label: [t.t('chat.post.label'), name, if (title.isNotEmpty) title]
          .join(', '),
      excludeSemantics: true,
      child: AppPressable(
        key: ValueKey('chat-post-${card.id}'),
        onTap: () => context.push(SocialRoutes.post(card.id)),
        child: Container(
          width: kChatPostCardWidth,
          clipBehavior: Clip.antiAlias,
          decoration: frame,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: Row(
                  children: [
                    AppAvatar(
                      size: 26,
                      initials: avatarInitials(name.isEmpty ? '?' : name),
                      imageProvider: card.authorAvatarUrl == null
                          ? null
                          : appNetworkImage(
                              card.authorAvatarUrl!,
                              decodeWidthFor(26),
                            ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text.rich(
                        nameWithCheck(
                          name,
                          verified: card.authorVerified,
                          checkLabel: t.t('post.verified'),
                          style: nameStyle,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: nameStyle,
                      ),
                    ),
                  ],
                ),
              ),
              if (thumb != null)
                AspectRatio(
                  aspectRatio: 4 / 5,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image(
                        image: appNetworkImage(
                          thumb,
                          decodeWidthFor(kChatPostCardWidth),
                        ),
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) =>
                            ColoredBox(color: fg.withValues(alpha: 0.08)),
                      ),
                      if (card.isVideo)
                        Center(
                          child: Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.black.withValues(alpha: 0.45),
                            ),
                            child: const AppIcon(
                              AppIcons.playArrowRounded,
                              color: Colors.white,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              if (title.isNotEmpty || excerpt.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.sm,
                    AppSpacing.sm,
                    AppSpacing.sm,
                    AppSpacing.sm,
                  ),
                  child: Text.rich(
                    TextSpan(
                      children: [
                        if (title.isNotEmpty)
                          TextSpan(
                            text: excerpt.isEmpty ? title : '$title  ',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        if (excerpt.isNotEmpty) TextSpan(text: excerpt),
                      ],
                    ),
                    maxLines: thumb == null ? 4 : 3,
                    overflow: TextOverflow.ellipsis,
                    style: type.bodySmall.copyWith(color: fg, height: 1.3),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
