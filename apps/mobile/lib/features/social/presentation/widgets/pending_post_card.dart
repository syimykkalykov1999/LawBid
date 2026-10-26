import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/social/application/pending_posts.dart';

/// Owner 2026-10-23 (Instagram): the posts being published, as cards at the
/// top of a feed or a profile. A thin line runs along the bottom edge of
/// each (no bar over the app, no spinner holding a screen); a failed one
/// says why and offers «Retry» and «×».
class PendingPostsStrip extends ConsumerWidget {
  const PendingPostsStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(pendingPostsProvider);
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final p in items) PendingPostCard(key: ValueKey(p.id), post: p),
      ],
    );
  }
}

class PendingPostCard extends ConsumerWidget {
  const PendingPostCard({required this.post, super.key});

  final PendingPost post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final failed = post.failed;
    final error = post.error;
    final status = failed
        ? (error is ApiException
            ? apiErrorText(t, error)
            : t.t('error.default.message'))
        : t.t('reels.posting');
    final thumb = post.thumbnail;
    final controller = ref.read(pendingPostsProvider.notifier);
    return Container(
      key: const ValueKey('pending-post-card'),
      margin: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.sm,
      ),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: failed ? colors.danger : colors.border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: Row(
              children: [
                if (thumb != null && thumb.isNotEmpty) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(
                      thumb,
                      width: 40,
                      height: 40,
                      cacheWidth:
                          (40 * MediaQuery.devicePixelRatioOf(context)).round(),
                      fit: BoxFit.cover,
                      gaplessPlayback: true,
                      errorBuilder: (_, __, ___) => SizedBox(
                        width: 40,
                        height: 40,
                        child: ColoredBox(color: colors.border),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        status,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(
                          color: failed ? colors.danger : colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (post.preview.isNotEmpty)
                        Text(
                          post.preview,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall
                              .copyWith(color: colors.textSecondary),
                        ),
                    ],
                  ),
                ),
                if (failed) ...[
                  InkWell(
                    key: const ValueKey('pending-post-retry'),
                    onTap: () => controller.retry(post.id),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.sm,
                        vertical: AppSpacing.xs,
                      ),
                      child: Text(
                        t.t('error.retry'),
                        style: type.bodySmall.copyWith(
                          color: colors.goldDark,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    key: const ValueKey('pending-post-dismiss'),
                    onPressed: () => controller.dismiss(post.id),
                    tooltip: t.t('common.cancel'),
                    visualDensity: VisualDensity.compact,
                    icon: AppIcon(
                      AppIcons.closeRounded,
                      size: 20,
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (!failed)
            LinearProgressIndicator(
              key: const ValueKey('pending-post-progress'),
              minHeight: 2,
              color: colors.gold,
              backgroundColor: colors.border,
            ),
        ],
      ),
    );
  }
}
