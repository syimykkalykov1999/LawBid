import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/data/link_preview_repository.dart'
    show firstUrlIn;
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show postProvider;
import 'package:lawbid/features/social/domain/social_models.dart' show Post;
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart'
    show nameWithCheck;
import 'package:lawbid/features/social/social_routes.dart';
import 'package:material_ui/material_ui.dart';

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

/// Owner 26.11 (Instagram / the 1:1 chat): the LawBid post a message's
/// first link points to (`https://<our host>/post/<id>`, read by the app's
/// own deep-link parser), or null.
String? lawbidPostIdIn(String body, {required String host}) {
  final url = firstUrlIn(body);
  if (url == null) return null;
  final uri = Uri.tryParse(url);
  if (uri == null) return null;
  final link = parseDeepLink(uri, host: host);
  return link is ContentDeepLink && link.kind == ContentKind.post
      ? link.id
      : null;
}

/// The shared-post card of [p], as the server builds it for a 1:1 chat
/// (apps/api/src/modules/posts/shared-post-cards.service.ts: the title,
/// the first 200 characters of the text, the video cover or first photo).
SharedPostCard sharedPostCardOf(Post p) {
  final a = p.author;
  final name = [a.firstName, a.lastName]
      .whereType<String>()
      .where((x) => x.trim().isNotEmpty)
      .join(' ');
  final text = p.body.trim();
  final chars = text.characters;
  final thumb = p.video?.thumbnailUrl ??
      (p.media.isEmpty ? null : p.media.first.previewUrl);
  return SharedPostCard(
    id: p.id,
    available: true,
    authorId: a.id,
    authorName: name.isEmpty ? a.username : name,
    authorUsername: a.username,
    authorAvatarUrl: a.avatarUrl,
    authorVerified: a.verified,
    title: (p.title?.trim().isEmpty ?? true) ? null : p.title!.trim(),
    excerpt: text.isEmpty
        ? null
        : chars.length > 200
            ? chars.take(200).toString()
            : text,
    thumbnailUrl: (thumb?.isEmpty ?? true) ? null : thumb,
    isVideo: p.video != null,
  );
}

/// Owner 26.11: a message carrying a LawBid post link (a group gets a
/// shared post as its link) shows the same post card as a post shared into
/// a 1:1 chat ([PostCardBody]). Nothing is drawn until the post came; a
/// post deleted or hidden since says so; offline draws nothing.
class PostLinkCard extends ConsumerWidget {
  const PostLinkCard({required this.postId, required this.mine, super.key});

  final String postId;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final post = ref.watch(postProvider(postId));
    final card = switch (post) {
      AsyncData(:final value) => sharedPostCardOf(value),
      AsyncError(:final error)
          when error is ApiException &&
              (error.statusCode == 404 ||
                  error.statusCode == 403 ||
                  error.statusCode == 410) =>
        SharedPostCard(id: postId, available: false),
      _ => null,
    };
    if (card == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: PostCardBody(card: card, mine: mine),
    );
  }
}

/// The host our own links use (`lawbid.dev`).
String lawbidLinkHost(WidgetRef ref) =>
    ref.read(appEnvironmentProvider).deepLinkHost;
