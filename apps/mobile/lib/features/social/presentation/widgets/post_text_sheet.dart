import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/shell/content_column_frame.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_documents.dart';
import 'package:lawbid/features/social/social_routes.dart';

/// Owner 2026-10-13: «ещё» on a post or reel opens the whole description in
/// a sheet that rises from the bottom, like the comments: author, title,
/// text with paragraphs, hashtags — and (owner 2026-10-18) the attached
/// files.
Future<void> showPostTextSheet(BuildContext context, Post post) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    constraints: contentColumnSheetConstraints(context),
    useRootNavigator: true,
    useSafeArea: true,
    backgroundColor: sheetRouteColor(context, colors.sheet),
    elevation: sheetDrawnByColumn(context) ? 0 : null,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
    ),
    builder: (_) => ContentColumnFrame(
      surface: colors.sheet,
      radius: const BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
      child: PostTextSheet(post: post),
    ),
  );
}

class PostTextSheet extends ConsumerWidget {
  const PostTextSheet({required this.post, super.key});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = post.author;
    final (title, rest) = PostCard.titleAndRest(post);
    final (text, hashtags) = PostCard.splitTrailingTags(rest);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.55,
      minChildSize: 0.3,
      snap: true,
      snapSizes: const [0.55],
      builder: (context, controller) => Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          const AppSheetHandle(),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.xs,
              AppSpacing.lg,
              AppSpacing.sm,
            ),
            child: Row(
              children: [
                GoldRingAvatar(
                  url: a.avatarUrl,
                  initials: a.initials,
                  size: 32,
                  ring: a.verified,
                ),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: Text(
                    a.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (a.verified) ...[
                  const SizedBox(width: AppSpacing.xs),
                  VerifiedCheck(label: t.t('post.verified'), gold: a.isClient),
                ],
              ],
            ),
          ),
          Divider(height: 1, color: colors.border),
          Expanded(
            child: ListView(
              controller: controller,
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                MediaQuery.paddingOf(context).bottom + AppSpacing.xl,
              ),
              children: [
                // Owner 2026-10-15: the topic chips live here for a video.
                PostPracticeChips(post: post, inset: 0),
                if (title.isNotEmpty)
                  PostBodyText(
                    body: title,
                    expanded: true,
                    mentions: post.mentions,
                    // Owner 2026-10-20 (Instagram): bold, the caption's
                    // own size.
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                      height: 1.45,
                    ),
                  ),
                if (text.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  PostBodyText(
                    body: text,
                    expanded: true,
                    mentions: post.mentions,
                    large: true,
                  ),
                ],
                if (hashtags.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    spacing: AppSpacing.sm,
                    children: [
                      for (final h in hashtags)
                        AppPressable(
                          onTap: () {
                            Navigator.of(context).pop();
                            context.push(SocialRoutes.tag(h.substring(1)));
                          },
                          child: Text(
                            h,
                            style: type.body.copyWith(
                              color: colors.textSecondary,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
                // Owner 2026-10-18: the post's files live here, not under
                // the post in the feed.
                if (post.attachments.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.lg),
                  PostDocumentsList(documents: post.attachments),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
