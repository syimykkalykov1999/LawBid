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
    // Owner 27.11 («скачки везде»): one size from the first frame — the
    // card waits, opens or says «unavailable» in the same box, so the
    // bubble never grows when the post arrives.
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: FixedPostCard(card: card, mine: mine),
    );
  }
}

/// Owner 27.11: a post card of one fixed size (a message link's card that
/// loads after the message): the author row, a 4:5 picture (or the text on
/// the card's tint when the post has no picture), three lines of text.
/// [card] null: the post is still on its way.
class FixedPostCard extends ConsumerWidget {
  const FixedPostCard({required this.card, required this.mine, super.key});

  final SharedPostCard? card;
  final bool mine;

  /// Lines of text under the picture the card keeps room for.
  static const textLines = 3;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final meta = mine ? chat.mineMeta : chat.theirsMeta;
    final c = card;
    final nameStyle = type.bodySmall.copyWith(
      color: fg,
      fontWeight: FontWeight.w700,
    );
    final textStyle = type.bodySmall.copyWith(color: fg, height: 1.3);
    final name = c == null ? '' : (c.authorName ?? c.authorUsername ?? '');
    final title = c?.title?.trim() ?? '';
    final excerpt = c?.excerpt?.trim() ?? '';
    final thumb = c != null && c.available ? c.thumbnailUrl : null;
    final text = TextSpan(
      children: [
        if (title.isNotEmpty)
          TextSpan(
            text: excerpt.isEmpty ? title : '$title  ',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        if (excerpt.isNotEmpty) TextSpan(text: excerpt),
      ],
    );
    final Widget picture;
    if (c == null) {
      picture = ColoredBox(color: colors.skeletonBase);
    } else if (!c.available) {
      picture = Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(
                AppIcons.imageNotSupportedOutlined,
                size: 28,
                color: meta,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t('chat.post.unavailable'),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: type.bodySmall.copyWith(color: meta),
              ),
            ],
          ),
        ),
      );
    } else if (thumb != null) {
      picture = Stack(
        fit: StackFit.expand,
        children: [
          Image(
            image: appNetworkImage(thumb, decodeWidthFor(kChatPostCardWidth)),
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) =>
                ColoredBox(color: fg.withValues(alpha: 0.08)),
          ),
          if (c.isVideo)
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
      );
    } else {
      // A post of text only: its text on the card's tint (Instagram).
      picture = ColoredBox(
        color: fg.withValues(alpha: 0.06),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Text.rich(
            text,
            overflow: TextOverflow.fade,
            style: type.body.copyWith(color: fg, height: 1.3),
          ),
        ),
      );
    }
    final body = Container(
      key: ValueKey('chat-post-fixed-${c?.id ?? 'loading'}'),
      width: kChatPostCardWidth,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: fg.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
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
                  imageProvider: c?.authorAvatarUrl == null
                      ? null
                      : appNetworkImage(
                          c!.authorAvatarUrl!,
                          decodeWidthFor(26),
                        ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text.rich(
                    c == null
                        ? const TextSpan(text: ' ')
                        : nameWithCheck(
                            name,
                            verified: c.authorVerified,
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
          AspectRatio(aspectRatio: 4 / 5, child: ClipRect(child: picture)),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: Stack(
              children: [
                // The room of three lines, whatever the post says.
                ExcludeSemantics(
                  child: Opacity(
                    opacity: 0,
                    child: Text(
                      List.filled(textLines, ' ').join('\n'),
                      maxLines: textLines,
                      style: textStyle,
                    ),
                  ),
                ),
                if (thumb != null && (title.isNotEmpty || excerpt.isNotEmpty))
                  Positioned.fill(
                    child: Text.rich(
                      text,
                      maxLines: textLines,
                      overflow: TextOverflow.ellipsis,
                      style: textStyle,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
    if (c == null || !c.available) return body;
    return Semantics(
      button: true,
      label: [t.t('chat.post.label'), name, if (title.isNotEmpty) title]
          .join(', '),
      excludeSemantics: true,
      child: AppPressable(
        key: ValueKey('chat-post-${c.id}'),
        onTap: () => context.push(SocialRoutes.post(c.id)),
        child: body,
      ),
    );
  }
}

/// The host our own links use (`lawbid.dev`).
String lawbidLinkHost(WidgetRef ref) =>
    ref.read(appEnvironmentProvider).deepLinkHost;
