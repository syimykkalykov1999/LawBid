import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/boost_colors.dart';
import 'package:lawbid/features/promotions/presentation/boost_wizard.dart';

/// The own-post menu's "Promote": the sheet, or "My promotions" when one
/// already runs.
Future<void> openPostPromotion(
  BuildContext context,
  WidgetRef ref,
  String postId,
) async {
  final t = ref.read(translatorProvider);
  try {
    final state = await ref.read(postPromotionProvider(postId).future);
    if (!context.mounted) return;
    final p = state.promotion;
    if (p != null && p.isRunning) {
      await context.push(AppRoutes.myPromotions);
    } else if (state.quote.enabled && state.canPromote) {
      await PromoteSheet.show(
        context,
        target: PromotionTarget.post,
        id: postId,
        state: state,
      );
    } else {
      showAppSnackBar(context, t.t('promote.unavailable'));
    }
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
  }
}

/// "Stop" + "All promotions" under a running promotion.
class PromotionActions extends ConsumerWidget {
  const PromotionActions({
    required this.promotion,
    this.onChanged,
    this.showAll = true,
    super.key,
  });

  final CasePromotion promotion;
  final VoidCallback? onChanged;
  final bool showAll;

  Future<void> _stop(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('promote.stop.title'),
      message: t.t('promote.stop.message'),
      confirmLabel: t.t('promote.stop'),
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(promotionsRepositoryProvider).stop(promotion.id);
      ref.invalidate(myPromotionsProvider);
      onChanged?.call();
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final stop = AppButton(
      label: t.t('promote.stop'),
      variant: AppButtonVariant.secondary,
      onPressed: () => _stop(context, ref),
    );
    if (!showAll) return stop;
    return Row(
      children: [
        Expanded(child: stop),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: AppButton(
            label: t.t('promote.all'),
            variant: AppButtonVariant.secondary,
            onPressed: () => context.push(AppRoutes.myPromotions),
          ),
        ),
      ],
    );
  }
}

/// Progress of the bought impressions + impressions / reach / clicks.
class PromotionStatsBlock extends ConsumerWidget {
  const PromotionStatsBlock({required this.promotion, super.key});

  final CasePromotion promotion;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = promotion;
    final progress = p.progress;
    Widget stat(String value, String label) => Expanded(
          child: Column(
            children: [
              FitText(
                value,
                style: type.titleMedium.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                label,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (progress != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.pill),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: AppSizes.progressSegment,
              color: colors.gold,
              backgroundColor: colors.surface,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('promote.progress', {
              'shown': f.number(p.impressions),
              'total': f.number(p.targetImpressions ?? 0),
            }),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            stat(f.number(p.impressions), t.t('promote.stat.impressions')),
            stat(f.number(p.reach), t.t('promote.stat.reach')),
            stat(f.number(p.clicks), t.t('promote.stat.clicks')),
          ],
        ),
      ],
    );
  }
}

String promotionStatusLabel(Translator t, PromotionStatus s) =>
    t.t('promote.status.${s.wire}');

/// Owner 2026-10-07: a small «Продвигать» / «Boost» button at the bottom
/// right under the author's own post, in place of the big promote card.
/// A running promotion opens its stats and actions in a sheet.
class BoostButton extends ConsumerWidget {
  const BoostButton({
    required this.postId,
    this.target = PromotionTarget.post,
    this.onDark = false,
    super.key,
  });

  /// The post's id, or the case's with [target] = case.
  final String postId;
  final PromotionTarget target;

  /// Over a video: white text on a dark plate, readable on any frame.
  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(promotionStateProvider(target, postId)).value;
    if (state == null || !state.quote.enabled) return const SizedBox.shrink();
    final p = state.promotion;
    final pending = p?.status == PromotionStatus.pendingPayment;
    final live = p != null && p.isRunning;
    if (!live && !pending && !state.canPromote) return const SizedBox.shrink();
    void refresh() => ref
      ..invalidate(promotionStateProvider(target, postId))
      ..invalidate(myPromotionsProvider);
    Future<void> onTap() async {
      if (live) {
        // Owner 2026-10-15: a running boost opens its stats (reach, clicks,
        // by day, Stop).
        await context.push<void>(AppRoutes.promotionStats(p.id));
      } else {
        await PromoteSheet.show(
          context,
          target: target,
          id: postId,
          state: state,
        );
      }
      refresh();
    }

    return Semantics(
      button: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 28),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: 2,
          ),
          decoration: BoxDecoration(
            color: onDark
                ? Colors.black54
                : live
                    ? colors.goldTint
                    : null,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(
              color: onDark ? Colors.white70 : colors.goldStroke,
            ),
          ),
          // Small: as wide as its text, centred in its 28 px height.
          child: Align(
            widthFactor: 1,
            heightFactor: 1,
            child: Text(
              t.t(
                pending
                    ? 'promote.completePayment'
                    : live
                        ? 'boost.stats.open'
                        : 'promote.cta',
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.bodySmall.copyWith(
                color: onDark ? Colors.white : colors.boostInk(),
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
