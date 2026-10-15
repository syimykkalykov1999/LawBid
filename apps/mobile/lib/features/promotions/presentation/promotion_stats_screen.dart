import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/boost_colors.dart';
import 'package:lawbid/features/promotions/presentation/boost_wizard.dart';
import 'package:lawbid/features/promotions/presentation/promote_case_card.dart';

/// Owner 2026-10-15 (mockup v4): the numbers of one boost — status and the
/// last paid day, reach, impressions, clicks, CTR, spend, the bars by day,
/// and Stop (while it runs) or Repeat (when it is over).
class PromotionStatsScreen extends ConsumerWidget {
  const PromotionStatsScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final stats = ref.watch(promotionStatsProvider(id));
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(title: Text(t.t('boost.stats.title'))),
      body: stats.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.screenSide),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  errorText(t, e),
                  textAlign: TextAlign.center,
                  style: type.body.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: t.t('promote.mine.retry'),
                  variant: AppButtonVariant.secondary,
                  onPressed: () => ref.invalidate(promotionStatsProvider(id)),
                ),
              ],
            ),
          ),
        ),
        data: (s) => _Body(stats: s),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.stats});

  final PromotionStats stats;

  Future<void> _repeat(
    BuildContext context,
    WidgetRef ref, {
    bool extend = false,
  }) async {
    final p = stats.promotion;
    final target = p.target;
    final tid = (target == PromotionTarget.post ? p.postId : p.caseId) ?? '';
    final t = ref.read(translatorProvider);
    try {
      final state = await ref
          .read(promotionsRepositoryProvider)
          .state(tid, target: target);
      if (!context.mounted) return;
      if (!state.quote.enabled || (!state.canPromote && !extend)) {
        showAppSnackBar(context, t.t('promote.unavailable'));
        return;
      }
      await PromoteSheet.show(
        context,
        target: target,
        id: tid,
        state: state,
        extend: extend,
      );
      ref
        ..invalidate(myPromotionsProvider)
        ..invalidate(promotionStatsProvider(p.id));
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = stats.promotion;
    final end = p.endsAt;
    final title = p.title.trim().isEmpty
        ? t.t(
            p.target == PromotionTarget.post
                ? 'promote.mine.post'
                : 'promote.mine.case',
          )
        : p.title.trim();

    Widget tile(String value, String label) => Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.md,
          ),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.border),
          ),
          child: Column(
            children: [
              FitText(
                value,
                style: type.titleMedium.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
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

    final ctr = '${(stats.ctr * 100).toStringAsFixed(1)}%';
    final tiles = [
      tile(f.number(p.reach), t.t('promote.stat.reach')),
      tile(f.number(p.impressions), t.t('promote.stat.impressions')),
      tile(f.number(p.clicks), t.t('promote.stat.clicks')),
      tile(ctr, t.t('boost.stat.ctr')),
      tile(f.currencyFromCents(stats.spentCents), t.t('boost.stat.spent')),
    ];
    final maxImp =
        stats.days.fold<int>(1, (m, d) => math.max(m, d.impressions));

    return ListView(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.xl + MediaQuery.paddingOf(context).bottom,
      ),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 140),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: p.isRunning ? colors.goldTint : colors.surface,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: FitText(
                  promotionStatusLabel(t, p.status),
                  style: type.caption.copyWith(
                    color:
                        p.isRunning ? colors.boostInk() : colors.textSecondary,
                  ),
                ),
              ),
            ),
          ],
        ),
        if (end != null) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('boost.ad.until', {'date': f.date(end)}),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            for (var i = 0; i < 3; i++) ...[
              if (i > 0) const SizedBox(width: AppSpacing.sm),
              Expanded(child: tiles[i]),
            ],
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            for (var i = 3; i < 5; i++) ...[
              if (i > 3) const SizedBox(width: AppSpacing.sm),
              Expanded(child: tiles[i]),
            ],
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          t.t('boost.stat.byDay'),
          style: type.body.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        if (stats.days.isEmpty)
          Text(
            t.t('boost.stat.noDays'),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          )
        else
          SizedBox(
            height: 120,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final d in stats.days)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Flexible(
                            child: FractionallySizedBox(
                              heightFactor:
                                  math.max(0.04, d.impressions / maxImp),
                              alignment: Alignment.bottomCenter,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: colors.boostMark(colors.bg),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: const SizedBox.expand(),
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${d.day.day}',
                            maxLines: 1,
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        const SizedBox(height: AppSpacing.xl),
        if (p.status == PromotionStatus.active) ...[
          AppButton(
            label: t.t('boost.extend'),
            onPressed: () => _repeat(context, ref, extend: true),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        if (p.isRunning)
          PromotionActions(
            promotion: p,
            showAll: false,
            onChanged: () {
              ref
                ..invalidate(promotionStatsProvider(p.id))
                ..invalidate(myPromotionsProvider);
            },
          )
        else
          AppButton(
            label: t.t('boost.repeat'),
            onPressed: () => _repeat(context, ref),
          ),
      ],
    );
  }
}
