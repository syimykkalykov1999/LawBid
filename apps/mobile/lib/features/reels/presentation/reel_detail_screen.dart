import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_attachments_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/social_routes.dart';

/// Owner 2026-10-05: the inside of a reel ("Смотреть" under the video):
/// the title, the whole text with #tags and @mentions, up to 9 photos and
/// up to 9 documents to download — what the author added when publishing.
class ReelDetailScreen extends ConsumerWidget {
  const ReelDetailScreen({required this.post, super.key});

  final Post post;

  static Future<void> open(BuildContext context, Post post) =>
      Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute<void>(builder: (_) => ReelDetailScreen(post: post)),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p =
        ref.watch(postOverridesProvider.select((m) => m[post.id])) ?? post;
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final title = (p.title ?? '').trim();
    final body = p.body.trim();

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppIconButton(
          icon: const AppIcon(AppIcons.arrowBackRounded),
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('reels.inside.title')),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            Row(
              children: [
                // Initials under the photo (an empty circle before).
                GestureDetector(
                  onTap: p.author.avatarUrl == null
                      ? null
                      : () => showPhotoGallery(
                            context,
                            urls: [p.author.avatarUrl!],
                            closeLabel: t.t('common.close'),
                          ),
                  child: AppAvatar(
                    size: 36,
                    initials: p.author.initials,
                    imageProvider: p.author.avatarUrl == null
                        ? null
                        : CachedNetworkImageProvider(p.author.avatarUrl!),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    p.author.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (p.author.verified)
                  AppIcon(
                    AppIcons.verifiedRounded,
                    size: 16,
                    color: colors.gold,
                  ),
              ],
            ),
            if (title.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.lg),
              PostBodyText(
                body: title,
                expanded: true,
                mentions: p.mentions,
                style: type.titleLarge.copyWith(
                  fontFamily: type.body.fontFamily,
                  color: colors.text,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            if (body.isNotEmpty && body != title) ...[
              const SizedBox(height: AppSpacing.md),
              PostBodyText(body: body, expanded: true, mentions: p.mentions),
            ],
            // Owner 2026-10-07 (bug 13): one «Посмотреть · N» button; the
            // photos and files open in a sheet.
            if (p.media.isNotEmpty || p.attachments.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.lg),
              PostAttachmentsButton(
                media: p.media,
                documents: p.attachments,
              ),
            ],
            if (p.commentsEnabled) ...[
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: t.t('post.comments'),
                icon: AppIcons.modeCommentOutlined,
                variant: AppButtonVariant.secondary,
                onPressed: () => context.push(SocialRoutes.post(p.id)),
              ),
            ],
            const SizedBox(height: AppSpacing.xl),
            const PostDisclaimer(),
          ],
        ),
      ),
    );
  }
}
