import 'package:flutter/material.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/star_rating.dart';

/// "4.5" in the interface language, or "—" when there are no reviews
/// (docs/03 §4.2 "вместо числа прочерк").
String ratingNumber(L10nFormats f, Translator t, double? average) =>
    average == null
        ? t.t('profile.rating.none')
        : f.number(double.parse(average.toStringAsFixed(1)));

/// One review (docs/03 §7.4): "Anna K.", stars, date, text, "Edited".
/// No reviewer avatar — a neutral quote seal instead (client privacy).
class ReviewCard extends ConsumerWidget {
  const ReviewCard({
    required this.review,
    super.key,
    this.onReport,
    this.onHelpful,
    this.onEdit,
    this.onDelete,
    this.onReply,
    this.onDeleteReply,
  });

  final Review review;

  /// Owner 2026-10-01 (Google-style): anyone but the author flags it.
  final VoidCallback? onReport;

  /// "Helpful" toggle; null = can't vote (mine / about me).
  final VoidCallback? onHelpful;

  /// My own review: edit / delete.
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  /// The reviewed attorney: write / edit / delete the public reply.
  final VoidCallback? onReply;
  final VoidCallback? onDeleteReply;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final hasMenu = onReport != null ||
        onEdit != null ||
        onDelete != null ||
        (onReply != null && review.reply == null);
    // Owner 2026-10-01: laid out like a Google Maps review.
    return MapsReviewTile(
      id: review.id,
      authorName: review.authorDisplayName ?? t.t('reviews.author.anonymous'),
      authorAvatarUrl: review.authorAvatarUrl,
      authorReviewCount: review.authorReviewCount,
      rating: review.rating,
      createdAt: review.createdAt,
      edited: review.isEdited,
      body: review.body,
      photos: review.photos,
      badges: [
        if (review.fromCase)
          ReviewBadge(
            label: t.t('reviews.badge.case'),
            icon: Icons.verified_rounded,
          ),
        ReviewBadge(label: t.t('reviews.role.${review.authorRole}')),
      ],
      helpfulCount: review.helpfulCount,
      helpfulByMe: review.helpfulByMe,
      onHelpful: onHelpful,
      reply: review.reply,
      replyAt: review.replyAt,
      replyLabel: t.t('reviews.reply.fromAttorney'),
      onEditReply: onReply,
      onDeleteReply: onDeleteReply,
      onMenu: hasMenu ? () => _menu(context, t) : null,
    );
  }

}

extension on ReviewCard {
  Future<void> _menu(BuildContext context, Translator t) async {
    final choice = await showAppBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            if (onReply != null && review.reply == null)
              AppListRow(
                key: const ValueKey('review-act-reply'),
                icon: Icons.reply_rounded,
                label: t.t('reviews.reply.action'),
                onTap: () => Navigator.of(sheet).pop('reply'),
              ),
            if (onEdit != null)
              AppListRow(
                key: const ValueKey('review-act-edit'),
                icon: Icons.edit_outlined,
                label: t.t('reviews.edit'),
                onTap: () => Navigator.of(sheet).pop('edit'),
              ),
            if (onDelete != null)
              AppListRow(
                key: const ValueKey('review-act-delete'),
                icon: Icons.delete_outline_rounded,
                label: t.t('reviews.delete'),
                destructive: true,
                onTap: () => Navigator.of(sheet).pop('delete'),
              ),
            if (onReport != null)
              AppListRow(
                key: const ValueKey('review-act-report'),
                icon: Icons.flag_outlined,
                label: t.t('reviews.report.action'),
                onTap: () => Navigator.of(sheet).pop('report'),
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    switch (choice) {
      case 'reply':
        onReply?.call();
      case 'edit':
        onEdit?.call();
      case 'delete':
        onDelete?.call();
      case 'report':
        onReport?.call();
    }
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
        : SocialFormat.plural(t, formats, 'profile.rating.count', rating.count);
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
                  style: typography.bodySmall
                      .copyWith(color: ink, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Container(
            constraints: const BoxConstraints(
                minWidth: AppSizes.stateMedallion - AppSpacing.lg),
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: ink,
              borderRadius: BorderRadius.circular(AppRadii.card),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(number,
                    style: typography.titleLarge
                        .copyWith(color: colors.goldLight)),
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
          : '$name. ${t.t('reviews.average.label', {
                  'rating': number
                })}. $countText',
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
    this.sort = ReviewsSort.newest,
    this.onSort,
  });

  final ReviewSummary summary;

  /// Star filter in effect (owner request): its bar is highlighted; a
  /// second tap clears it.
  final int? selectedStars;
  final ValueChanged<int>? onStarsTap;

  /// Date order; the small filter icon in the card's corner opens a
  /// sheet with "Newest / Oldest" (owner request).
  final ReviewsSort sort;
  final ValueChanged<ReviewsSort>? onSort;

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
        // The average starts level with the "5" bar; the filter icon sits
        // under it, part of the left column (owner request).
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Semantics(
                label: summary.isNew
                    ? t.t('profile.rating.new')
                    : t.t('reviews.average.label',
                        {'rating': ratingNumber(formats, t, summary.average)}),
                excludeSemantics: true,
                child: Column(
                  children: [
                    Text(
                      ratingNumber(formats, t, summary.average),
                      style: typography.titleLarge
                          .copyWith(color: colors.text, height: 1),
                    ),
                    StarRatingDisplay(
                        value: summary.average ?? 0, size: AppSpacing.md + 2),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      summary.isNew
                          ? t.t('profile.rating.new')
                          : SocialFormat.plural(
                              t, formats, 'profile.rating.count', total),
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
              if (onSort != null)
                Semantics(
                  button: true,
                  label: t.t('reviews.sort.label'),
                  excludeSemantics: true,
                  child: AppTapTarget(
                    child: AppPressable(
                      onTap: () => _pickSort(context, t),
                      child: SizedBox(
                        height: AppSizes.touchTarget - AppSpacing.sm,
                        width: AppSizes.touchTarget,
                        child: Icon(
                          Icons.tune_rounded,
                          size: AppSizes.iconSm,
                          color: sort == ReviewsSort.newest
                              ? colors.textSecondary
                              : colors.goldDark,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: AppSpacing.lg),
          Expanded(
            child: Padding(
              padding: EdgeInsets.zero,
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
                        onTap: onStarsTap == null
                            ? () {}
                            : () => onStarsTap!(stars),
                        child: AnimatedOpacity(
                          duration:
                              reduce ? Duration.zero : AppMotion.stateChange,
                          opacity:
                              selectedStars == null || selectedStars == stars
                                  ? 1
                                  : 0.4,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                                vertical: AppSpacing.xs + 1),
                            child: Row(
                              children: [
                                SizedBox(
                                  width: AppSpacing.md,
                                  child: Text(
                                    '$stars',
                                    textScaler: TextScaler.noScaling,
                                    style: typography.caption
                                        .copyWith(color: colors.textSecondary),
                                  ),
                                ),
                                Icon(Icons.star_rounded,
                                    size: AppSpacing.md, color: colors.gold),
                                const SizedBox(width: AppSpacing.sm),
                                Expanded(
                                  child: ClipRRect(
                                    borderRadius:
                                        BorderRadius.circular(AppRadii.pill),
                                    child: Container(
                                      height: AppSpacing.sm,
                                      color: colors.skeletonBase,
                                      alignment: Alignment.centerLeft,
                                      child: TweenAnimationBuilder<double>(
                                        tween: Tween(
                                          begin: reduce ? _share(stars) : 0,
                                          end: _share(stars),
                                        ),
                                        duration: reduce
                                            ? Duration.zero
                                            : AppMotion.entrance * 2,
                                        curve: AppMotion.enterCurve,
                                        builder: (context, v, _) =>
                                            FractionallySizedBox(
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
                                    SocialFormat.count(formats,
                                        summary.distribution[stars] ?? 0),
                                    textAlign: TextAlign.end,
                                    textScaler: TextScaler.noScaling,
                                    style: typography.caption.copyWith(
                                      color: selectedStars == stars
                                          ? colors.text
                                          : colors.textSecondary,
                                      fontWeight: selectedStars == stars
                                          ? FontWeight.w700
                                          : null,
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
          ),
        ],
      ),
    );
  }

  Future<void> _pickSort(BuildContext context, Translator t) async {
    final picked = await showAppBottomSheet<ReviewsSort>(
      context: context,
      builder: (sheet) {
        final colors = Theme.of(sheet).extension<AppColorTokens>()!;
        final typography = Theme.of(sheet).extension<AppTypographyTokens>()!;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                    AppSpacing.sm, AppSpacing.screenSide, AppSpacing.md),
                child: Text(t.t('reviews.sort.label'),
                    style: typography.titleMedium.copyWith(color: colors.text)),
              ),
              for (final v in ReviewsSort.values)
                AppListRow(
                  key: ValueKey('reviews-sort-${v.name}'),
                  icon: switch (v) {
                    ReviewsSort.relevant => Icons.auto_awesome_outlined,
                    ReviewsSort.newest => Icons.arrow_downward_rounded,
                    ReviewsSort.oldest => Icons.arrow_upward_rounded,
                    ReviewsSort.highest => Icons.star_rounded,
                    ReviewsSort.lowest => Icons.star_outline_rounded,
                    ReviewsSort.helpful => Icons.thumb_up_alt_outlined,
                  },
                  label: t.t('reviews.sort.${v.name}'),
                  selected: v == sort,
                  showChevron: false,
                  onTap: () => Navigator.of(sheet).pop(v),
                ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        );
      },
    );
    if (picked != null) onSort?.call(picked);
  }

  double _share(int stars) => summary.count == 0
      ? 0
      : (summary.distribution[stars] ?? 0) / summary.count;
}

/// "Report review" reasons sheet (docs/03 §7.2, `report_reason`).
Future<ReviewReportReason?> showReportReasonSheet(
    BuildContext context, Translator t) {
  return showAppBottomSheet<ReviewReportReason>(
    context: context,
    builder: (sheetContext) {
      final colors = Theme.of(sheetContext).extension<AppColorTokens>()!;
      final typography =
          Theme.of(sheetContext).extension<AppTypographyTokens>()!;
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

/// Owner 2026-10-01 (Google-style): "Helpful · 3" under a review. Off for
/// the author and the reviewed person (they see the count only).
class ReviewHelpfulButton extends ConsumerWidget {
  const ReviewHelpfulButton({
    required this.count,
    required this.mine,
    this.onToggle,
    super.key,
  });

  final int count;

  /// I marked it helpful.
  final bool mine;

  /// Null = can't vote (own review / about me).
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final label = count > 0
        ? t.t('reviews.helpful.count', {'n': '$count'})
        : t.t('reviews.helpful');
    final color = mine ? colors.goldDark : colors.textSecondary;
    final child = Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(mine ? Icons.thumb_up_alt_rounded : Icons.thumb_up_alt_outlined,
              size: 16, color: color),
          const SizedBox(width: 6),
          Text(label,
              style: type.caption.copyWith(
                  color: color, fontWeight: FontWeight.w600)),
        ],
      ),
    );
    if (onToggle == null) {
      return count == 0 ? const SizedBox.shrink() : child;
    }
    return Semantics(
      button: true,
      toggled: mine,
      label: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.pill),
        onTap: onToggle,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Center(widthFactor: 1, child: child),
        ),
      ),
    );
  }
}

/// Owner 2026-10-01 (Google-style): the reviewed person's public reply,
/// indented under the review; the owner may edit or delete it.
class ReviewReplyBlock extends ConsumerWidget {
  const ReviewReplyBlock({
    required this.reply,
    required this.replyAt,
    required this.ownerLabel,
    this.onEdit,
    this.onDelete,
    super.key,
  });

  final String reply;
  final DateTime? replyAt;

  /// "Response from the attorney" / "Response from the client".
  final String ownerLabel;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      key: const ValueKey('review-reply'),
      width: double.infinity,
      margin: const EdgeInsets.only(top: AppSpacing.md),
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.sm, AppSpacing.sm, AppSpacing.sm),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.field),
        border: Border(left: BorderSide(color: colors.gold, width: 2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.reply_rounded, size: 16, color: colors.goldDark),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  [
                    ownerLabel,
                    if (replyAt != null) f.date(replyAt!),
                  ].join(' · '),
                  style: type.caption.copyWith(
                    color: colors.goldDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (onEdit != null)
                AppIconButton(
                  plain: true,
                  icon: Icon(Icons.more_horiz_rounded,
                      color: colors.textSecondary, size: 18),
                  semanticLabel: t.t('reviews.reply.menu'),
                  onPressed: () async {
                    final choice = await showAppBottomSheet<String>(
                      context: context,
                      builder: (sheet) => SafeArea(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const AppSheetHandle(),
                            AppListRow(
                              icon: Icons.edit_outlined,
                              label: t.t('reviews.reply.edit'),
                              onTap: () => Navigator.of(sheet).pop('edit'),
                            ),
                            AppListRow(
                              icon: Icons.delete_outline_rounded,
                              label: t.t('reviews.reply.delete'),
                              destructive: true,
                              onTap: () => Navigator.of(sheet).pop('delete'),
                            ),
                            const SizedBox(height: AppSpacing.md),
                          ],
                        ),
                      ),
                    );
                    if (choice == 'edit') onEdit?.call();
                    if (choice == 'delete') onDelete?.call();
                  },
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(reply, style: type.bodySmall.copyWith(color: colors.text)),
        ],
      ),
    );
  }
}

/// The reply editor (≤ 1000 characters); returns the text or null.
Future<String?> showReviewReplySheet(
  BuildContext context, {
  String initial = '',
}) =>
    showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ReplySheet(initial: initial),
    );

class _ReplySheet extends ConsumerStatefulWidget {
  const _ReplySheet({required this.initial});

  final String initial;

  @override
  ConsumerState<_ReplySheet> createState() => _ReplySheetState();
}

class _ReplySheetState extends ConsumerState<_ReplySheet> {
  late final _text = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppSheetHandle(),
          Text(t.t('reviews.reply.title'),
              style: type.titleMedium.copyWith(color: colors.text)),
          const SizedBox(height: AppSpacing.xs),
          Text(t.t('reviews.reply.hint'),
              style: type.bodySmall.copyWith(color: colors.textSecondary)),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            key: const ValueKey('review-reply-field'),
            controller: _text,
            hintText: t.t('reviews.reply.placeholder'),
            semanticLabel: t.t('reviews.reply.placeholder'),
            maxLength: 1000,
            maxLines: 5,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            key: const ValueKey('review-reply-send'),
            label: t.t('reviews.reply.send'),
            onPressed: _text.text.trim().isEmpty
                ? null
                : () => Navigator.of(context).pop(_text.text.trim()),
          ),
        ],
      ),
    );
  }
}

/// "Verified case" / role chip next to a reviewer's name.
class ReviewBadge extends StatelessWidget {
  const ReviewBadge({required this.label, this.icon, super.key});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: colors.goldDark),
            const SizedBox(width: 3),
          ],
          Text(label, style: type.badge.copyWith(color: colors.goldDark)),
        ],
      ),
    );
  }
}

/// Owner 2026-10-01: one review laid out like Google Maps — avatar, name
/// and "12 reviews", the stars with "3 weeks ago", the text (folded after
/// five lines with "More"), a strip of photos, "Helpful" and the owner's
/// response. Used for reviews of attorneys and of clients / assistants.
class MapsReviewTile extends ConsumerStatefulWidget {
  const MapsReviewTile({
    required this.id,
    required this.authorName,
    required this.rating,
    required this.createdAt,
    super.key,
    this.authorAvatarUrl,
    this.authorReviewCount = 0,
    this.badges = const [],
    this.edited = false,
    this.body,
    this.photos = const [],
    this.helpfulCount = 0,
    this.helpfulByMe = false,
    this.onHelpful,
    this.reply,
    this.replyAt,
    this.replyLabel = '',
    this.onEditReply,
    this.onDeleteReply,
    this.onMenu,
    this.onAuthor,
  });

  final String id;
  final String authorName;
  final String? authorAvatarUrl;
  final int authorReviewCount;
  final List<Widget> badges;
  final int rating;
  final DateTime createdAt;
  final bool edited;
  final String? body;
  final List<ReviewPhoto> photos;
  final int helpfulCount;
  final bool helpfulByMe;
  final VoidCallback? onHelpful;
  final String? reply;
  final DateTime? replyAt;
  final String replyLabel;
  final VoidCallback? onEditReply;
  final VoidCallback? onDeleteReply;

  /// The ⋮ menu (edit / delete / reply / report); null hides it.
  final VoidCallback? onMenu;
  final VoidCallback? onAuthor;

  @override
  ConsumerState<MapsReviewTile> createState() => _MapsReviewTileState();
}

class _MapsReviewTileState extends ConsumerState<MapsReviewTile> {
  bool _expanded = false;

  void _openPhoto(int index) {
    final photos = widget.photos;
    showGeneralDialog<void>(
      context: context,
      barrierColor: Colors.black,
      barrierDismissible: true,
      barrierLabel: 'photo',
      pageBuilder: (ctx, _, __) => SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: PageController(initialPage: index),
              itemCount: photos.length,
              itemBuilder: (_, i) => InteractiveViewer(
                child: Center(
                  child: Image.network(photos[i].url, fit: BoxFit.contain),
                ),
              ),
            ),
            Positioned(
              top: AppSpacing.sm,
              right: AppSpacing.sm,
              child: IconButton(
                icon: const Icon(Icons.close_rounded, color: Colors.white),
                onPressed: () => Navigator.of(ctx).pop(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final w = widget;
    final body = w.body?.trim() ?? '';
    final long = body.length > 280 || '\n'.allMatches(body).length > 4;
    final initials = w.authorName.isEmpty
        ? '?'
        : w.authorName.trim().split(RegExp(r'\s+')).take(2).map((p) {
            return p.isEmpty ? '' : p[0].toUpperCase();
          }).join();
    return Container(
      key: ValueKey('maps-review-${w.id}'),
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg, AppSpacing.md, AppSpacing.sm, AppSpacing.sm),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: w.onAuthor,
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.navy,
                    image: w.authorAvatarUrl == null
                        ? null
                        : DecorationImage(
                            image: NetworkImage(w.authorAvatarUrl!),
                            fit: BoxFit.cover,
                          ),
                  ),
                  alignment: Alignment.center,
                  child: w.authorAvatarUrl == null
                      ? Text(initials,
                          style: type.bodySmall.copyWith(
                              color: colors.gold,
                              fontWeight: FontWeight.w700))
                      : null,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: GestureDetector(
                  onTap: w.onAuthor,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        w.authorName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (w.authorReviewCount > 0)
                        Text(
                          SocialFormat.plural(t, f, 'reviews.authorCount',
                              w.authorReviewCount),
                          style: type.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                    ],
                  ),
                ),
              ),
              if (w.onMenu != null)
                IconButton(
                  key: ValueKey('review-menu-${w.id}'),
                  tooltip: t.t('reviews.menu'),
                  icon: Icon(Icons.more_vert_rounded,
                      color: colors.textSecondary),
                  onPressed: w.onMenu,
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            children: [
              StarRatingDisplay(value: w.rating.toDouble(), size: 16),
              Text(
                SocialFormat.ago(t, f, w.createdAt),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              if (w.edited)
                Text(t.t('reviews.edited'),
                    style:
                        type.caption.copyWith(color: colors.textSecondary)),
              ...w.badges,
            ],
          ),
          if (body.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.sm),
              child: Text(
                body,
                maxLines: _expanded ? null : 5,
                overflow:
                    _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
                style: type.body.copyWith(color: colors.text, height: 1.4),
              ),
            ),
            if (long && !_expanded)
              GestureDetector(
                onTap: () => setState(() => _expanded = true),
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(t.t('reviews.more'),
                      style: type.bodySmall.copyWith(
                          color: colors.goldDark,
                          fontWeight: FontWeight.w700)),
                ),
              ),
          ],
          if (w.photos.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            SizedBox(
              height: 96,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: w.photos.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(width: AppSpacing.xs),
                itemBuilder: (_, i) => GestureDetector(
                  key: ValueKey('review-photo-${w.id}-$i'),
                  onTap: () => _openPhoto(i),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadii.field),
                    child: Image.network(
                      w.photos[i].previewUrl,
                      width: 96,
                      height: 96,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                          width: 96, height: 96, color: colors.goldTint),
                    ),
                  ),
                ),
              ),
            ),
          ],
          Align(
            alignment: Alignment.centerLeft,
            child: ReviewHelpfulButton(
              key: ValueKey('review-helpful-${w.id}'),
              count: w.helpfulCount,
              mine: w.helpfulByMe,
              onToggle: w.onHelpful,
            ),
          ),
          if (w.reply != null)
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.sm),
              child: ReviewReplyBlock(
                reply: w.reply!,
                replyAt: w.replyAt,
                ownerLabel: w.replyLabel,
                onEdit: w.onEditReply,
                onDelete: w.onDeleteReply,
              ),
            ),
          const SizedBox(height: AppSpacing.xs),
        ],
      ),
    );
  }
}
