import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/boost_wizard.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/team/application/team_providers.dart'
    show isAssistantProvider;

/// Owner 2026-10-18 (Instagram): under the author's own PHOTO / VIDEO post,
/// between the media and the likes row — «Статистика» as a text link on the
/// left (always: the post's statistics screen, which links to the
/// promotion's statistics once it was boosted) and a filled «Продвигать
/// публикацию» button over the right half (the boost wizard; a running
/// boost shows its state and opens its stats).
/// Briefs keep the Boost pill in their header. Only the author sees it.
class PostPromoRow extends ConsumerWidget {
  const PostPromoRow({required this.post, super.key});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hasMedia = post.video != null || post.media.isNotEmpty;
    if (!post.isMine || !hasMedia || ref.watch(isAssistantProvider)) {
      return const SizedBox.shrink();
    }
    final postId = post.id;
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(postPromotionProvider(postId)).value;
    final p = state?.promotion;
    final pending = p?.status == PromotionStatus.pendingPayment;
    final live = p != null && p.isRunning;
    // A paid promotion has its own statistics (reach, clicks, by day).
    final hasPromoStats = p != null && p.id.isNotEmpty && !pending;
    final canBoost = state != null &&
        state.quote.enabled &&
        (live || pending || state.canPromote);
    void refresh() => ref
      ..invalidate(postPromotionProvider(postId))
      ..invalidate(myPromotionsProvider);
    // Owner 2026-10-18: «Статистика» opens the post's own statistics for
    // every own post; a promoted post links to its promotion's statistics
    // from there («Продвижение»).
    Future<void> openStats() async {
      await context.push<void>(SocialRoutes.insights(postId), extra: post);
      refresh();
    }

    Future<void> openPromoStats() async {
      if (hasPromoStats) {
        await context.push<void>(AppRoutes.promotionStats(p.id));
        refresh();
      } else {
        await openStats();
      }
    }

    Future<void> openBoost() async {
      if (live) return openPromoStats();
      await PromoteSheet.show(
        context,
        target: PromotionTarget.post,
        id: postId,
        state: state!,
        // Owner 2026-10-19: «Завершить оплату» goes straight to the payment.
        resume: pending ? p : null,
      );
      refresh();
    }

    final boostLabel = pending
        ? 'promote.completePayment'
        : live
            ? 'promote.status.active'
            : 'promote.post.title';
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        AppSpacing.xs,
      ),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              button: true,
              child: AppPressable(
                onTap: openStats,
                child: SizedBox(
                  height: AppSizes.touchTarget,
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Text(
                      t.t('boost.stats.open'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: canBoost
                ? Semantics(
                    button: true,
                    child: AppPressable(
                      onTap: openBoost,
                      child: Container(
                        height: AppSizes.touchTarget - 8,
                        alignment: Alignment.center,
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                        ),
                        // The theme's own filled chip — never a gold fill.
                        decoration: BoxDecoration(
                          color: colors.chip,
                          borderRadius: BorderRadius.circular(AppRadii.button),
                          border: Border.all(color: colors.border),
                        ),
                        child: Text(
                          t.t(boostLabel),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

/// Owner 2026-10-18: the post's numbers, for its owner only (a short
/// sheet; «Статистика» now opens the full PostInsightsScreen).
Future<void> showPostStatsSheet(BuildContext context, Post post) {
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) => _PostStatsSheet(post: post),
  );
}

class _PostStatsSheet extends ConsumerWidget {
  const _PostStatsSheet({required this.post});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget cell(IconData icon, int n, String key) => Expanded(
          child: Column(
            children: [
              AppIcon(icon, color: colors.textSecondary),
              const SizedBox(height: AppSpacing.xs),
              Text(
                ref.watch(l10nFormatsProvider).number(n),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
              Text(
                t.t(key),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        );
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t.t('post.stats.title'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                cell(
                  AppIcons.favoriteBorderRounded,
                  post.likeCount,
                  'post.stats.likes',
                ),
                cell(
                  AppIcons.chatBubbleOutlineRounded,
                  post.commentCount,
                  'post.stats.comments',
                ),
                cell(
                  AppIcons.autoModeRounded,
                  post.repostCount,
                  'post.stats.reposts',
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('post.stats.soon'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
