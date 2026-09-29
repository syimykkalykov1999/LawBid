import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/star_rating.dart';

/// "4.5" in the interface language, or "—" when there are no reviews
/// (docs/03 §4.2 "вместо числа прочерк").
String ratingNumber(L10nFormats f, Translator t, double? average) => average == null
    ? t.t('profile.rating.none')
    : f.number(double.parse(average.toStringAsFixed(1)));

/// One review (docs/03 §7.4): "Anna K.", stars, date, text, "Edited".
/// No reviewer avatar — a neutral quote seal instead (client privacy).
class ReviewCard extends ConsumerWidget {
  const ReviewCard({required this.review, super.key, this.onReport});

  final Review review;

  /// Shown for the reviewed attorney on their own profile (§7.2 report).
  final VoidCallback? onReport;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final author = review.authorDisplayName ?? t.t('reviews.author.anonymous');
    final body = review.body?.trim();

    return Semantics(
      container: true,
      label: [
        author,
        t.t('reviews.stars.label', {'rating': '${review.rating}'}),
        formats.date(review.createdAt),
        if (review.isEdited) t.t('reviews.edited'),
        if (body != null && body.isNotEmpty) body,
      ].join('. '),
      child: AppCard(
        elevated: true,
        child: ExcludeSemantics(
          excluding: onReport == null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: AppSizes.cardAvatar,
                    height: AppSizes.cardAvatar,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: colors.goldTint,
                      border: Border.all(color: colors.goldStroke.withValues(alpha: 0.5)),
                    ),
                    child: Icon(Icons.format_quote_rounded, color: colors.goldStroke, size: AppSizes.iconSm),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          author,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: typography.roleTitle.copyWith(color: colors.text),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: AppSpacing.sm,
                          runSpacing: AppSpacing.xs,
                          children: [
                            StarRatingDisplay(value: review.rating.toDouble(), size: AppSpacing.lg),
                            Text(
                              formats.date(review.createdAt),
                              style: typography.bodySmall.copyWith(color: colors.textSecondary),
                            ),
                            if (review.isEdited)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.sm,
                                  vertical: AppSpacing.xs / 2,
                                ),
                                decoration: BoxDecoration(
                                  color: colors.goldTint,
                                  borderRadius: BorderRadius.circular(AppRadii.pill),
                                ),
                                child: Text(
                                  t.t('reviews.edited'),
                                  style: typography.badge.copyWith(color: colors.text),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (onReport != null)
                    Semantics(
                      button: true,
                      label: t.t('reviews.report.action'),
                      excludeSemantics: true,
                      child: AppPressable(
                        onTap: onReport,
                        child: SizedBox.square(
                          dimension: AppSizes.touchTarget,
                          child: Icon(Icons.flag_outlined, color: colors.textSecondary, size: AppSizes.iconSm),
                        ),
                      ),
                    ),
                ],
              ),
              if (body != null && body.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.md),
                Text(body, style: typography.body.copyWith(color: colors.text)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Skeleton in the shape of a [ReviewCard].
class ReviewCardSkeleton extends StatelessWidget {
  const ReviewCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const AppContentCardSkeleton();
}

/// Gold rating card (docs/03 §4.2 item 2): full name, stars, number of
/// reviews, rating as a number. Without reviews: empty stars, "New — no
/// reviews", a dash instead of the number. Tap opens the Reviews tab.
class RatingCard extends ConsumerWidget {
  const RatingCard({
    required this.name,
    required this.rating,
    super.key,
    this.onTap,
  });

  final String name;
  final RatingInfo rating;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final isNew = rating.isNew;
    final number = ratingNumber(formats, t, isNew ? null : rating.average);
    final countText = isNew
        ? t.t('profile.rating.new')
        : t.plural('profile.rating.count', rating.count);
    final ink = colors.navy;

    final card = Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadii.card),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [colors.goldLight, colors.gold, colors.goldStroke],
        ),
        boxShadow: [
          BoxShadow(
            color: colors.shadow,
            blurRadius: AppSizes.cardShadowBlur,
            offset: const Offset(0, AppSizes.cardShadowOffsetY),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: typography.titleWelcome.copyWith(color: ink),
                ),
                const SizedBox(height: AppSpacing.sm),
                StarRatingDisplay(
                  value: isNew ? 0 : rating.average ?? 0,
                  size: AppSizes.iconMd,
                  color: ink,
                  emptyColor: ink.withValues(alpha: 0.45),
                  animate: true,
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  countText,
                  style: typography.bodySmall.copyWith(color: ink, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Container(
            constraints: const BoxConstraints(minWidth: AppSizes.stateMedallion - AppSpacing.lg),
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: ink,
              borderRadius: BorderRadius.circular(AppRadii.card),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(number, style: typography.titleLarge.copyWith(color: colors.goldLight)),
                Text(
                  t.t('profile.rating.outOf'),
                  style: typography.caption.copyWith(color: colors.goldLight),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    return Semantics(
      button: onTap != null,
      label: isNew
          ? '$name. ${t.t('profile.rating.new')}'
          : '$name. ${t.t('reviews.average.label', {'rating': number})}. $countText',
      onTap: onTap,
      excludeSemantics: true,
      child: onTap == null ? card : AppPressable(onTap: onTap, child: card),
    );
  }
}

/// Reviews tab header (docs/03 §7.4): average, count, distribution 5 → 1
/// with bars that grow in (instant under reduce-motion).
class ReviewSummaryPanel extends ConsumerWidget {
  const ReviewSummaryPanel({
    required this.summary,
    super.key,
    this.selectedStars,
    this.onStarsTap,
  });

  final ReviewSummary summary;

  /// Star filter in effect (owner request): its bar is highlighted; a
  /// second tap clears it.
  final int? selectedStars;
  final ValueChanged<int>? onStarsTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final reduce = context.reduceMotion;
    final total = summary.count;

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Semantics(
            label: summary.isNew
                ? t.t('profile.rating.new')
                : t.t('reviews.average.label', {'rating': ratingNumber(formats, t, summary.average)}),
            excludeSemantics: true,
            child: Column(
              children: [
                Text(
                  ratingNumber(formats, t, summary.average),
                  style: typography.titleLarge.copyWith(color: colors.text),
                ),
                StarRatingDisplay(value: summary.average ?? 0, size: AppSpacing.md + 2),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  summary.isNew ? t.t('profile.rating.new') : t.plural('profile.rating.count', total),
                  style: typography.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.lg),
          Expanded(
            child: Column(
              children: [
                for (var stars = 5; stars >= 1; stars--)
                  Semantics(
                    label: t.t('reviews.distribution.row', {
                      'stars': '$stars',
                      'count': '${summary.distribution[stars] ?? 0}',
                    }),
                    button: onStarsTap != null,
                    selected: selectedStars == stars,
                    excludeSemantics: true,
                    child: AppPressable(
                      onTap: onStarsTap == null ? () {} : () => onStarsTap!(stars),
                      child: AnimatedOpacity(
                        duration: reduce ? Duration.zero : AppMotion.stateChange,
                        opacity: selectedStars == null || selectedStars == stars ? 1 : 0.4,
                        child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs + 1),
                      child: Row(
                        children: [
                          SizedBox(
                            width: AppSpacing.md,
                            child: Text(
                              '$stars',
                              textScaler: TextScaler.noScaling,
                              style: typography.caption.copyWith(color: colors.textSecondary),
                            ),
                          ),
                          Icon(Icons.star_rounded, size: AppSpacing.md, color: colors.gold),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(AppRadii.pill),
                              child: Container(
                                height: AppSpacing.sm,
                                color: colors.skeletonBase,
                                alignment: Alignment.centerLeft,
                                child: TweenAnimationBuilder<double>(
                                  tween: Tween(
                                    begin: reduce ? _share(stars) : 0,
                                    end: _share(stars),
                                  ),
                                  duration: reduce ? Duration.zero : AppMotion.entrance * 2,
                                  curve: AppMotion.enterCurve,
                                  builder: (context, v, _) => FractionallySizedBox(
                                    widthFactor: v,
                                    child: Container(color: colors.gold),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          SizedBox(
                            width: AppSpacing.xl,
                            child: Text(
                              formats.number(summary.distribution[stars] ?? 0),
                              textAlign: TextAlign.end,
                              textScaler: TextScaler.noScaling,
                              style: typography.caption.copyWith(
                                color: selectedStars == stars ? colors.text : colors.textSecondary,
                                fontWeight: selectedStars == stars ? FontWeight.w700 : null,
                              ),
                            ),
                          ),
                        ],
                      ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  double _share(int stars) =>
      summary.count == 0 ? 0 : (summary.distribution[stars] ?? 0) / summary.count;
}

/// "Report review" reasons sheet (docs/03 §7.2, `report_reason`).
Future<ReviewReportReason?> showReportReasonSheet(BuildContext context, Translator t) {
  return showAppBottomSheet<ReviewReportReason>(
    context: context,
    builder: (sheetContext) {
      final colors = Theme.of(sheetContext).extension<AppColorTokens>()!;
      final typography = Theme.of(sheetContext).extension<AppTypographyTokens>()!;
      return SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AppSheetHandle(),
                Semantics(
                  header: true,
                  child: Text(
                    t.t('reviews.report.title'),
                    style: typography.titleMedium.copyWith(color: colors.text),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                for (final r in ReviewReportReason.values) ...[
                  AppListRow(
                    label: t.t('reviews.report.reason.${r.name}'),
                    showChevron: false,
                    onTap: () => Navigator.of(sheetContext).pop(r),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                ],
              ],
            ),
          ),
        ),
      );
    },
  );
}
