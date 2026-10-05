import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/promote_case_card.dart';
import 'package:lawbid/features/social/social_routes.dart';

/// Owner 2026-10-05 — "My promotions": every promoted post / case with
/// its status, budget, progress, impressions, reach and clicks.
class MyPromotionsScreen extends ConsumerWidget {
  const MyPromotionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final page = ref.watch(myPromotionsProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(title: Text(t.t('promote.mine.title'))),
      body: page.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.screenSide),
            child: AppButton(
              label: t.t('promote.mine.retry'),
              variant: AppButtonVariant.secondary,
              onPressed: () => ref.invalidate(myPromotionsProvider),
            ),
          ),
        ),
        data: (p) => p.items.isEmpty
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  child: Text(
                    t.t('promote.mine.empty'),
                    textAlign: TextAlign.center,
                    style: type.body.copyWith(color: colors.textSecondary),
                  ),
                ),
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(myPromotionsProvider),
                child: ListView.separated(
                  padding: EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.md,
                    AppSpacing.screenSide,
                    AppSpacing.lg + MediaQuery.paddingOf(context).bottom,
                  ),
                  itemCount: p.items.length,
                  separatorBuilder: (_, __) =>
                      const SizedBox(height: AppSpacing.md),
                  itemBuilder: (_, i) => _PromotionTile(p.items[i]),
                ),
              ),
      ),
    );
  }
}

class _PromotionTile extends ConsumerWidget {
  const _PromotionTile(this.p);

  final CasePromotion p;

  void _open(BuildContext context) {
    final post = p.postId;
    final kase = p.caseId;
    if (post != null) {
      context.push(SocialRoutes.post(post));
    } else if (kase != null) {
      context.push(AppRoutes.myCase(kase));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final isPost = p.target == PromotionTarget.post;
    final kind = t.t(isPost ? 'promote.mine.post' : 'promote.mine.case');
    final title = p.title.trim().isEmpty ? kind : p.title.trim();
    final end = p.endsAt;
    return AppPressable(
      onTap: () => _open(context),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: colors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                // The badge keeps its place; a long status shrinks.
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 140),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: p.isRunning ? colors.goldTint : colors.bg,
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                    child: FitText(
                      promotionStatusLabel(t, p.status),
                      style: type.caption.copyWith(
                        color: p.isRunning
                            ? colors.goldDark
                            : colors.textSecondary,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              [
                kind,
                f.currencyFromCents(p.totalCents),
                t.t('promote.days', {'days': '${p.days}'}),
                if (end != null) f.date(end),
              ].join(' · '),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            PromotionStatsBlock(promotion: p),
            if (p.isRunning) ...[
              const SizedBox(height: AppSpacing.md),
              PromotionActions(promotion: p, showAll: false),
            ],
          ],
        ),
      ),
    );
  }
}
