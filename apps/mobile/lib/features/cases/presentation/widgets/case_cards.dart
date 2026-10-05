import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_actions_bar.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cover.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_dossier.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_facts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_urgency_picker.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/trust/presentation/trust_level_chip.dart';

/// Shared card shell for docs/04 lists: surface, hairline border, soft
/// shadow, 16 radius, press feedback (AppCard) and a single semantic label.
class _CaseCardShell extends StatelessWidget {
  const _CaseCardShell({
    required this.child,
    required this.onTap,
    required this.semanticLabel,
    this.header,
  });

  final Widget child;
  final Widget? header;
  final VoidCallback? onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: semanticLabel,
      onTap: onTap,
      excludeSemantics: true,
      child: AppCard(
        elevated: true,
        onTap: onTap,
        padding: EdgeInsets.zero,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.card),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (header != null) header!,
              Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: child,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// docs/04 §4.2 "цветная шапка с названием категории": a navy band with a
/// gold hairline underneath — the case card's one memorable detail.
class CategoryBand extends StatelessWidget {
  const CategoryBand({
    required this.label,
    this.isNew = false,
    this.newLabel,
    super.key,
  });

  final String label;
  final bool isNew;
  final String? newLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [colors.navy, Color.lerp(colors.navy, colors.gold, 0.18)!],
        ),
        border: Border(bottom: BorderSide(color: colors.gold)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          children: [
            AppIcon(
              AppIcons.balanceRounded,
              size: AppSpacing.lg,
              color: colors.goldLight,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: typography.bodySmall.copyWith(
                  color: colors.goldLight,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (isNew && newLabel != null)
              AppTrailingCap(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: colors.gold,
                    borderRadius: BorderRadius.circular(AppRadii.proBadge),
                  ),
                  child: Text(
                    newLabel!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.badge.copyWith(color: colors.navy),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _IconStat extends StatelessWidget {
  const _IconStat({required this.icon, required this.value});

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppIcon(icon, size: AppSpacing.lg, color: colors.textSecondary),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}

/// Money in the brand serif — the number the user scans for.
class MoneyText extends StatelessWidget {
  const MoneyText(this.text, {this.large = false, super.key});

  final String text;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final base = large ? typography.titleMedium : typography.roleTitle;
    return Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: base.copyWith(
        color: colors.text,
        fontFeatures: const [
          FontFeature.tabularFigures(),
        ],
      ),
    );
  }
}

/// Attorney "Кейсы" card (docs/04 §4.2): category band + NEW, title,
/// "city, state +N", Open, views, bids, budget, "Вы сделали бид".
class FeedCaseCard extends StatelessWidget {
  const FeedCaseCard({
    required this.item,
    required this.t,
    required this.formats,
    required this.onTap,
    this.feedHeight,
    super.key,
  });

  final FeedCase item;

  final Translator t;
  final L10nFormats formats;
  final VoidCallback onTap;

  /// Owner 2026-09-30: in the attorney's case feed a card fills the
  /// visible area down to the nav bar, like a post: text on top, our
  /// practice photo full-bleed below. Null = the compact card.
  final double? feedHeight;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final category = CaseFormat.practice(
      t,
      item.practice.categoryI18nKey ?? item.practice.i18nKey,
      item.practice.categoryNameEn ?? item.practice.nameEn,
    );
    final place = CaseFormat.place(
      item.city,
      item.primaryStateCode,
      item.additionalStateCodes.length,
    );
    final budget = CaseFormat.budget(t, formats, item.budget);
    final radius = BorderRadius.circular(AppRadii.card + 2);
    // Owner 2026-10-04: state, urgency and budget, large.
    final extraStates = item.additionalStateCodes.length;
    final facts = CaseKeyFacts(
      t: t,
      formats: formats,
      stateCode: item.primaryStateCode,
      stateSub: [
        if (item.city != null && item.city!.trim().isNotEmpty)
          item.city!.trim(),
        if (extraStates > 0) '+$extraStates',
      ].join(' · '),
      urgency: item.urgencyInfo,
      budget: item.budget.isClarifyLater
          ? null
          : CaseFormat.money(formats, item.budget.amountCents!),
    );
    final urgency = CaseUrgencyText.label(t, formats, item.urgencyInfo);
    final urgencyFull = CaseUrgencyText.full(t, formats, item.urgencyInfo);
    final dossier = CaseDossierScore.of(item);
    final dossierLabel = [
      '${t.t('cases.dossier.title')} ${dossier.score(t)}',
      dossier.files(t),
      if (item.status == CaseStatus.open) t.t('cases.dossier.ruleShort'),
    ].join(', ');
    Widget stats() => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _IconStat(
              icon: AppIcons.visibilityOutlined,
              value: SocialFormat.count(formats, item.viewCount),
            ),
            const SizedBox(width: AppSpacing.md),
            _IconStat(
              icon: AppIcons.gavelRounded,
              value: SocialFormat.count(formats, item.bidsCount),
            ),
          ],
        );

    final semantics = [
      category,
      if (item.promoted) t.t('cases.card.promoted'),
      if (item.priorityClient && !item.promoted) t.t('plan.feed.priority'),
      if (item.isNew) t.t('cases.card.new'),
      item.title,
      place,
      urgencyFull,
      budget,
      dossierLabel,
      t.t('cases.card.bidsCount', {'count': '${item.bidsCount}'}),
      if (item.hasOwnBid) t.t('cases.card.youBid'),
    ].join(', ');
    final fill =
        feedHeight != null && MediaQuery.textScalerOf(context).scale(10) <= 13;
    if (fill) {
      return Semantics(
        button: true,
        label: semantics,
        excludeSemantics: true,
        child: AppPressable(
          onTap: onTap,
          child: Container(
            height: feedHeight,
            clipBehavior: Clip.antiAlias,
            // Owner 2026-09-30: edge to edge like the post feed.
            decoration: BoxDecoration(
              color: colors.surface,
              border: Border.symmetric(
                horizontal: BorderSide(
                  color: item.isNew
                      ? colors.gold.withValues(alpha: 0.55)
                      : colors.border,
                ),
              ),
              boxShadow: [
                BoxShadow(
                  color: colors.shadow,
                  blurRadius: AppSizes.cardShadowBlur,
                  offset: const Offset(0, AppSizes.cardShadowOffsetY),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.lg,
                    AppSpacing.lg,
                    AppSpacing.lg,
                    AppSpacing.md,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          // Owner 2026-09-30: the chips on the left,
                          // "NEW" flush with the right edge (in line with
                          // the Save button below).
                          Expanded(
                            child: Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: _GoldChip(
                                icon: practiceGlyph(item.practice.artCode),
                                label: category,
                              ),
                            ),
                          ),
                          if (item.promoted ||
                              item.priorityClient ||
                              item.isNew) ...[
                            const SizedBox(width: AppSpacing.sm),
                            // Capped so a long translation can't squeeze
                            // the chips away.
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 120),
                              child: Text(
                                // Owner 2026-10-02: a paid promotion leads;
                                // owner 2026-10-05: then the plan's priority.
                                t.t(
                                  item.promoted
                                      ? 'cases.card.promoted'
                                      : item.priorityClient
                                          ? 'plan.feed.priority'
                                          : 'cases.card.new',
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: typography.caption.copyWith(
                                  color: colors.goldDark,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        item.title,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        // Owner 2026-10-04: smaller type, more of the story.
                        style: typography.titleMedium.copyWith(
                          fontFamily: typography.body.fontFamily,
                          color: colors.text,
                          fontWeight: FontWeight.w700,
                          fontSize: 20,
                          height: 1.25,
                        ),
                      ),
                      if (item.excerpt.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          item.excerpt,
                          maxLines: 6,
                          overflow: TextOverflow.ellipsis,
                          style: typography.body.copyWith(
                            color: colors.text,
                            fontSize: 15,
                            height: 1.4,
                          ),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.md),
                      facts,
                      // Owner 2026-10-05: how complete the case is and
                      // when its files open.
                      const SizedBox(height: AppSpacing.md),
                      CaseDossierStrip(kase: item, t: t),
                      const SizedBox(height: AppSpacing.sm),
                      Row(
                        children: [
                          Expanded(
                            child: Wrap(
                              spacing: AppSpacing.sm,
                              runSpacing: AppSpacing.sm,
                              children: [
                                if (item.status != CaseStatus.open)
                                  CaseStatusPill(status: item.status, t: t),
                                if (item.hasOwnBid)
                                  StatusPill(
                                    label: t.t('cases.card.youBid'),
                                    tone: StatusTone.gold,
                                  ),
                              ],
                            ),
                          ),
                          stats(),
                        ],
                      ),
                    ],
                  ),
                ),
                // Our photo for the practice; the client's own case
                // photos are private until a bid is accepted (OQ-031).
                Expanded(
                  child: CaseCover(
                    categoryCode: item.practice.artCode,
                    practiceCode: item.practice.code,
                    coverKey: item.coverKey,
                    seed: item.id,
                  ),
                ),
                // OQ-034: comments, share, time, Save — like a post.
                CaseActionsBar(item: item),
              ],
            ),
          ),
        ),
      );
    }

    final light = Theme.of(context).brightness == Brightness.light;
    final champagneLo = Color.lerp(colors.surface, colors.gold, 0.12)!;
    final badge = item.promoted || item.priorityClient || item.isNew
        ? t.t(
            item.promoted
                ? 'cases.card.promoted'
                : item.priorityClient
                    ? 'plan.feed.priority'
                    : 'cases.card.new',
          )
        : null;
    // Facts in one line with gold hairlines.
    final urgencyColor =
        CaseUrgencyText.tone(colors, item.urgencyInfo, light: light);
    final money = item.budget.isClarifyLater
        ? t.t('cases.facts.negotiable')
        : CaseFormat.money(formats, item.budget.amountCents!);
    final serif = typography.titleMedium.fontFamily;
    Widget inlineFacts() {
      Widget col(
        String label,
        String value, {
        String? sub,
        Color? tone,
        bool wrap = false,
      }) =>
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.caption.copyWith(
                    color: light ? colors.goldDark : colors.gold,
                    fontSize: 10,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                if (wrap)
                  Text(
                    value,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: typography.titleMedium.copyWith(
                      fontFamily: serif,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: tone ?? colors.text,
                      height: 1.15,
                    ),
                  )
                else
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      value,
                      maxLines: 1,
                      style: typography.titleMedium.copyWith(
                        fontFamily: serif,
                        fontSize: 19,
                        fontWeight: FontWeight.w700,
                        color: tone ?? colors.text,
                        height: 1.1,
                      ),
                    ),
                  ),
                if (sub != null && sub.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ],
              ],
            ),
          );
      final line = Container(
        width: 1,
        margin: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
        color: colors.gold.withValues(alpha: 0.4),
      );
      return IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            col(
              t.t('cases.facts.state'),
              item.primaryStateCode,
              sub: item.city?.trim(),
            ),
            line,
            col(
              t.t('cases.facts.urgency'),
              urgency,
              sub: CaseUrgencyText.sub(t, item.urgencyInfo),
              tone: urgencyColor,
              wrap: true,
            ),
            line,
            col(
              t.t('cases.facts.budget'),
              money,
              tone: light ? colors.goldDark : colors.goldLight,
            ),
          ],
        ),
      );
    }

    Widget smallCaps(String text) => Text(
          text.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: typography.caption.copyWith(
            color: light ? colors.goldDark : colors.gold,
            fontSize: 11,
            letterSpacing: 1.6,
            fontWeight: FontWeight.w700,
          ),
        );
    Widget serifTitle({Color? color, double size = 20}) => Text(
          item.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: typography.titleMedium.copyWith(
            fontFamily: serif,
            fontSize: size,
            fontWeight: FontWeight.w700,
            color: color ?? colors.text,
            height: 1.22,
          ),
        );
    Widget excerpt({int lines = 3}) => item.excerpt.isEmpty
        ? const SizedBox.shrink()
        : Text(
            item.excerpt,
            maxLines: lines,
            overflow: TextOverflow.ellipsis,
            style: typography.bodySmall.copyWith(
              color: colors.textSecondary,
              height: 1.4,
            ),
          );
    Widget medallion({double size = 44}) => Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [
                colors.gold.withValues(alpha: 0.22),
                colors.gold.withValues(alpha: 0.04),
              ],
            ),
            border: Border.all(color: colors.gold, width: 1.2),
          ),
          child: AppIcon(
            practiceGlyph(item.practice.artCode),
            size: size * 0.48,
            color: light ? colors.goldDark : colors.goldLight,
          ),
        );
    Widget newMark() => badge == null
        ? const SizedBox.shrink()
        : Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: colors.gold,
              borderRadius: BorderRadius.circular(AppRadii.pill),
            ),
            constraints: const BoxConstraints(maxWidth: 120),
            child: Text(
              badge,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: typography.caption.copyWith(
                color: colors.navy,
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
              ),
            ),
          );
    final ink = Color.lerp(colors.navy, Colors.black, 0.72)!;
    final ivory = Color.lerp(colors.surface, colors.gold, 0.07)!;

    // Owner 2026-09-30 design: chips, bold title and a short excerpt on the
    // left, the practice artwork dissolving into the card on the right.
    return Semantics(
      button: true,
      label: [
        category,
        if (item.isNew) t.t('cases.card.new'),
        item.title,
        place,
        urgencyFull,
        budget,
        dossierLabel,
        t.t('cases.card.bidsCount', {'count': '${item.bidsCount}'}),
        if (item.hasOwnBid) t.t('cases.card.youBid'),
      ].join(', '),
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: radius,
            border: Border.all(
              color: item.isNew
                  ? colors.gold.withValues(alpha: 0.55)
                  : colors.border,
            ),
            boxShadow: [
              BoxShadow(
                color: colors.shadow,
                blurRadius: AppSizes.cardShadowBlur,
                offset: const Offset(0, AppSizes.cardShadowOffsetY),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: radius,
            // Owner 2026-10-04 picked the framed dossier: a double gold
            // frame, serif type, facts in one line with gold hairlines.
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: light ? [ivory, champagneLo] : [colors.navy, ink],
                ),
              ),
              child: Container(
                margin: const EdgeInsets.all(6),
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg - 2,
                  AppSpacing.md + 2,
                  AppSpacing.lg - 2,
                  AppSpacing.md,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppRadii.card - 4),
                  border: Border.all(
                    color: colors.gold.withValues(alpha: 0.35),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        medallion(size: 40),
                        const SizedBox(width: AppSpacing.sm + 2),
                        Expanded(child: smallCaps(category)),
                        newMark(),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    serifTitle(),
                    const SizedBox(height: AppSpacing.xs + 2),
                    excerpt(),
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            height: 1,
                            color: colors.gold.withValues(alpha: 0.4),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.sm,
                          ),
                          child: Transform.rotate(
                            angle: 0.785,
                            child: Container(
                              width: 6,
                              height: 6,
                              color: colors.gold,
                            ),
                          ),
                        ),
                        Expanded(
                          child: Container(
                            height: 1,
                            color: colors.gold.withValues(alpha: 0.4),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    inlineFacts(),
                    const SizedBox(height: AppSpacing.md),
                    CaseDossierStrip(kase: item, t: t),
                    const SizedBox(height: AppSpacing.sm),
                    Align(alignment: Alignment.centerRight, child: stats()),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Gold-outlined chip with an icon (practice area).
class _GoldChip extends StatelessWidget {
  const _GoldChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm + 2,
        vertical: AppSpacing.xs + 1,
      ),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: colors.gold.withValues(alpha: 0.7)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppIcon(icon, size: 15, color: colors.goldDark),
          const SizedBox(width: AppSpacing.xs),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: typography.caption.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Client "Мои кейсы" card (docs/04 §11.1). Owner 2026-09-30: styled like
/// the feed — practice photo banner with the practice chip and status,
/// title, place and date, then bids (+ new) in the footer.
class ClientCaseCard extends StatelessWidget {
  const ClientCaseCard({
    required this.item,
    required this.unseenBids,
    required this.t,
    required this.formats,
    required this.onTap,
    super.key,
  });

  final CaseSummary item;
  final int unseenBids;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final practice =
        CaseFormat.practice(t, item.practice.i18nKey, item.practice.nameEn);
    final place = CaseFormat.place(
      item.city,
      item.primaryStateCode,
      item.additionalStateCount,
    );
    final bids = t.t(
      'cases.card.bidsCount',
      {'count': SocialFormat.count(formats, item.bidsCount)},
    );
    final fresh = unseenBids > 0
        ? t.t('cases.card.newBids', {'count': '$unseenBids'})
        : null;
    return _MineCardFrame(
      onTap: onTap,
      semanticLabel: [
        practice,
        item.title,
        place,
        caseStatusLabel(t, item.status),
        bids,
        if (fresh != null) fresh,
        formats.date(item.createdAt),
      ].join(', '),
      artCode: item.practice.artCode,
      practiceCode: item.practice.code,
      coverKey: item.coverKey,
      coverSeed: item.id,
      practiceLabel: practice,
      status: CaseStatusPill(status: item.status, t: t),
      title: item.title,
      meta: [
        _MineMeta(icon: AppIcons.placeOutlined, label: place),
        _MineMeta(
          icon: AppIcons.eventOutlined,
          label: formats.date(item.createdAt),
        ),
      ],
      footer: Row(
        children: [
          AppIcon(
            AppIcons.gavelRounded,
            size: AppSizes.iconSm,
            color: colors.goldDark,
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(child: _FooterText(bids)),
          if (fresh != null) ...[
            const SizedBox(width: AppSpacing.sm),
            Flexible(child: StatusPill(label: fresh, tone: StatusTone.gold)),
          ],
          AppIcon(AppIcons.chevronRightRounded, color: colors.textSecondary),
        ],
      ),
    );
  }
}

/// Owner 2026-09-30 ("карточки раздела mine … по красивее и по
/// грамотнее"): one frame for every "Mine" card — the practice photo as a
/// banner (practice chip bottom-left, status top-right), a bold title, a
/// meta line with icons and a footer under a hairline.
class _MineCardFrame extends StatelessWidget {
  const _MineCardFrame({
    required this.onTap,
    required this.semanticLabel,
    required this.artCode,
    required this.practiceCode,
    required this.practiceLabel,
    required this.status,
    required this.title,
    required this.meta,
    required this.footer,
    this.note,
    this.coverKey,
    this.coverSeed,
  });

  /// Owner 2026-10-04: the case's cover, as attorneys see it (client
  /// cards); without a seed the practice photo.
  final String? coverKey;
  final String? coverSeed;

  final VoidCallback onTap;
  final String semanticLabel;
  final String? artCode;
  final String? practiceCode;
  final String practiceLabel;
  final Widget status;
  final String title;
  final List<_MineMeta> meta;
  final Widget footer;

  /// An optional quiet line under the meta (e.g. the last bid message).
  final String? note;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final banner = SizedBox(
      height: 104,
      child: Stack(
        fit: StackFit.expand,
        children: [
          CaseCover(
            categoryCode: artCode,
            practiceCode: practiceCode,
            coverKey: coverKey,
            seed: coverSeed,
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.05),
                  Colors.black.withValues(alpha: 0.55),
                ],
              ),
            ),
          ),
          // A solid backing keeps the status readable on any photo.
          // Bounded on both sides so a long status label ellipsizes.
          PositionedDirectional(
            top: AppSpacing.sm,
            start: AppSpacing.sm,
            end: AppSpacing.sm,
            child: Align(
              alignment: AlignmentDirectional.centerEnd,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.18),
                      blurRadius: 6,
                    ),
                  ],
                ),
                child: status,
              ),
            ),
          ),
          Positioned(
            left: AppSpacing.md,
            right: AppSpacing.md,
            bottom: AppSpacing.sm + 2,
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm + 2,
                  vertical: AppSpacing.xs + 1,
                ),
                decoration: BoxDecoration(
                  color: colors.navy.withValues(alpha: 0.78),
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                  border: Border.all(color: colors.gold.withValues(alpha: 0.8)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AppIcon(
                      practiceGlyph(artCode),
                      size: 15,
                      color: colors.goldLight,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Flexible(
                      child: Text(
                        practiceLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.caption.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
    return _CaseCardShell(
      onTap: onTap,
      semanticLabel: semanticLabel,
      header: banner,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: typography.body.copyWith(
              color: colors.text,
              fontSize: 17,
              fontWeight: FontWeight.w700,
              height: 1.3,
            ),
          ),
          if (meta.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.md,
              runSpacing: AppSpacing.xs,
              children: meta,
            ),
          ],
          if (note != null && note!.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              note!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: typography.bodySmall.copyWith(
                color: colors.textSecondary,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          Container(height: 1, color: colors.border),
          const SizedBox(height: AppSpacing.md),
          footer,
        ],
      ),
    );
  }
}

/// Icon + quiet text for a "Mine" card's meta line.
class _MineMeta extends StatelessWidget {
  const _MineMeta({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppIcon(icon, size: 15, color: colors.goldDark),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}

/// Semi-bold footer text of a "Mine" card.
class _FooterText extends StatelessWidget {
  const _FooterText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: typography.bodySmall
          .copyWith(color: colors.text, fontWeight: FontWeight.w600),
    );
  }
}

String? _artOf(String? practiceCode) =>
    practiceCode == null || practiceCode.isEmpty
        ? null
        : practiceCode.split('.').first;

/// Initials for an avatar without a photo.
String initialsOf(String? first, String? last) {
  final a = (first ?? '').trim();
  final b = (last ?? '').trim();
  final s = '${a.isNotEmpty ? a[0] : ''}${b.isNotEmpty ? b[0] : ''}';
  return s.isEmpty ? '·' : s.toUpperCase();
}

/// Attorney line: photo, name, blue check, rating (docs/04 §5.2).
class AttorneyLine extends StatelessWidget {
  const AttorneyLine({
    required this.attorney,
    required this.t,
    required this.formats,
    this.onTap,
    super.key,
  });

  final BidAttorney attorney;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final name =
        attorney.fullName.isEmpty ? '@${attorney.username}' : attorney.fullName;
    final rating = attorney.ratingCount == 0
        ? t.t('cases.attorney.noReviews')
        : t.t('cases.attorney.rating', {
            'avg': attorney.ratingAvg.toStringAsFixed(1),
            'count': SocialFormat.count(formats, attorney.ratingCount),
          });
    final row = Row(
      children: [
        AppAvatar(
          imageProvider: attorney.avatarUrl == null
              ? null
              : NetworkImage(attorney.avatarUrl!),
          initials: initialsOf(attorney.firstName, attorney.lastName),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (attorney.verifiedBadge) ...[
                    const SizedBox(width: AppSpacing.xs),
                    AppIcon(
                      AppIcons.verifiedRounded,
                      size: AppSpacing.lg,
                      color: colors.info,
                    ),
                  ],
                  // Owner 2026-10-05: trust level (docs/ATTORNEY_TRUST.md).
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: TrustLevelChip(
                      level: attorney.trustLevel,
                      attorneyId: attorney.id,
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  if (attorney.ratingCount > 0) ...[
                    AppIcon(
                      AppIcons.starRounded,
                      size: AppSpacing.md + 2,
                      color: colors.gold,
                    ),
                    const SizedBox(width: 2),
                  ],
                  Flexible(
                    child: Text(
                      rating,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
    if (onTap == null) return row;
    return Semantics(
      button: true,
      label: '$name, $rating',
      excludeSemantics: true,
      onTap: onTap,
      child: AppPressable(onTap: onTap, child: row),
    );
  }
}

/// Owner 2026-09-30: a bid on a case outside the attorney's practices —
/// the client is asked to discuss it first; the attorney is told the
/// client will see this.
class OutsidePracticeNote extends StatelessWidget {
  const OutsidePracticeNote({
    required this.t,
    required this.forClient,
    super.key,
  });

  final Translator t;
  final bool forClient;

  @override
  Widget build(BuildContext context) => BidInfoNote(
        text: t.t(
          forClient
              ? 'cases.outsidePractice.client'
              : 'cases.outsidePractice.attorney',
        ),
      );
}

/// Owner 2026-10-04: an attorney may bid in any state. When none of their
/// verified licences is in the case's states, the client sees where they
/// are licensed ([states], 2-letter codes; may be unknown on screens that
/// only have the bid); the attorney is told the client will see it.
class OutsideStatesNote extends StatelessWidget {
  const OutsideStatesNote({
    required this.t,
    required this.forClient,
    this.states = const [],
    super.key,
  });

  final Translator t;
  final bool forClient;
  final List<String> states;

  @override
  Widget build(BuildContext context) => BidInfoNote(
        key: const ValueKey('outside-states-note'),
        text: !forClient
            ? t.t('cases.outsideStates.attorney')
            : states.isEmpty
                ? t.t('cases.outsideStates.clientNoList')
                : t.t('cases.outsideStates.client', {
                    'states': states.join(', '),
                  }),
      );
}

/// Gold info box used by the bid mismatch notes.
class BidInfoNote extends StatelessWidget {
  const BidInfoNote({required this.text, super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      container: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.goldTint,
          borderRadius: BorderRadius.circular(AppRadii.field),
          border: Border.all(color: colors.goldStroke),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppIcon(
              AppIcons.infoOutlineRounded,
              size: AppSizes.iconSm,
              color: colors.goldDark,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                text,
                style: typography.bodySmall.copyWith(color: colors.text),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A bid in the client's list (docs/04 §5.2).
class BidCard extends StatelessWidget {
  const BidCard({
    required this.bid,
    required this.t,
    required this.formats,
    required this.onTap,
    this.onAttorneyTap,
    super.key,
  });

  final CaseBid bid;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback onTap;
  final VoidCallback? onAttorneyTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final terms = CaseFormat.terms(t, formats, bid.feeType, bid.amountCents);
    final start =
        CaseFormat.startLabel(t, formats, bid.startAvailability, bid.startDate);
    final highlighted = bid.isTurnOf(PartyRole.client);
    return _CaseCardShell(
      onTap: onTap,
      semanticLabel: [
        bid.attorney?.fullName ?? '',
        terms,
        start,
        bid.message,
      ].join(', '),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (bid.attorney != null)
            AttorneyLine(
              attorney: bid.attorney!,
              t: t,
              formats: formats,
              onTap: onAttorneyTap,
            ),
          if (bid.outsideLicensedStates) ...[
            const SizedBox(height: AppSpacing.sm),
            OutsideStatesNote(
              t: t,
              forClient: true,
              states: bid.attorney?.licensedStates ?? const [],
            ),
          ],
          if (bid.outsidePractice) ...[
            const SizedBox(height: AppSpacing.sm),
            OutsidePracticeNote(t: t, forClient: true),
          ],
          const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: MoneyText(terms)),
              const SizedBox(width: AppSpacing.sm),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 160),
                child: BidStatusPill(bid: bid, viewer: PartyRole.client, t: t),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            start,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            bid.message,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: typography.body.copyWith(color: colors.text),
          ),
          if (bid.isActive && !bid.isFreeConsultation) ...[
            const SizedBox(height: AppSpacing.md),
            RoundCounter(used: bid.roundCount, t: t),
          ],
          if (highlighted) ...[
            const SizedBox(height: AppSpacing.md),
            Container(height: 1, color: colors.gold.withValues(alpha: 0.4)),
          ],
        ],
      ),
    );
  }
}

/// "Мои биды" card (docs/04 §11.2): the case ("Re: …") on the practice
/// banner with the bid status, terms, round counter, last message.
class MyBidCard extends StatelessWidget {
  const MyBidCard({
    required this.item,
    required this.t,
    required this.formats,
    required this.onTap,
    super.key,
  });

  final MyBid item;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final bid = item.bid;
    final terms = CaseFormat.terms(t, formats, bid.feeType, bid.amountCents);
    final re = t.t('cases.myBids.re', {'title': item.caseTitle});
    final practice = CaseFormat.practice(
      t,
      item.casePracticeI18nKey,
      item.casePracticeNameEn,
    );
    final lastMessage = item.lastOffer.message;
    final practiceCode = item.casePracticeCode ??
        item.casePracticeI18nKey.replaceFirst('practice.', '');
    return _MineCardFrame(
      onTap: onTap,
      semanticLabel: [re, practice, terms, if (lastMessage != null) lastMessage]
          .join(', '),
      artCode: _artOf(practiceCode),
      practiceCode: practiceCode,
      practiceLabel: practice,
      status: BidStatusPill(bid: bid, viewer: PartyRole.attorney, t: t),
      title: re,
      meta: [
        _MineMeta(icon: AppIcons.placeOutlined, label: item.primaryStateCode),
        _MineMeta(
          icon: AppIcons.scheduleRounded,
          label: formats.date(bid.createdAt),
        ),
      ],
      note: lastMessage,
      footer: Row(
        children: [
          AppIcon(
            AppIcons.paymentsOutlined,
            size: AppSizes.iconSm,
            color: colors.goldDark,
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(child: MoneyText(terms)),
          if (!bid.isFreeConsultation) ...[
            const SizedBox(width: AppSpacing.sm),
            Flexible(child: RoundCounter(used: bid.roundCount, t: t)),
          ],
        ],
      ),
    );
  }
}

/// "В работе" card (docs/04 §11.2): practice banner with the case status,
/// title, client (or a lock while contacts are closed), terms.
class WorkCard extends StatelessWidget {
  const WorkCard({
    required this.item,
    required this.t,
    required this.formats,
    required this.onTap,
    super.key,
  });

  final WorkItem item;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final terms = CaseFormat.terms(t, formats, item.feeType, item.amountCents);
    final client = item.clientName ?? t.t('cases.work.clientLocked');
    final practice = item.practiceI18nKey == null
        ? ''
        : CaseFormat.practice(
            t,
            item.practiceI18nKey!,
            item.practiceNameEn ?? '',
          );
    final since = item.closedAt ?? item.acceptedAt;
    return _MineCardFrame(
      onTap: onTap,
      semanticLabel: [
        item.title,
        if (practice.isNotEmpty) practice,
        client,
        caseStatusLabel(t, item.status),
        terms,
      ].join(', '),
      artCode: _artOf(item.practiceCode),
      practiceCode: item.practiceCode,
      practiceLabel:
          practice.isEmpty ? caseStatusLabel(t, item.status) : practice,
      status: CaseStatusPill(status: item.status, t: t),
      title: item.title,
      meta: [
        _MineMeta(
          icon: item.clientName == null
              ? AppIcons.lockOutlineRounded
              : AppIcons.personOutlineRounded,
          label: client,
        ),
        if (item.primaryStateCode != null)
          _MineMeta(
            icon: AppIcons.placeOutlined,
            label: item.primaryStateCode!,
          ),
        if (since != null)
          _MineMeta(icon: AppIcons.eventOutlined, label: formats.date(since)),
      ],
      footer: Row(
        children: [
          AppIcon(
            AppIcons.paymentsOutlined,
            size: AppSizes.iconSm,
            color: colors.goldDark,
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(child: MoneyText(terms)),
          AppIcon(AppIcons.chevronRightRounded, color: colors.textSecondary),
        ],
      ),
    );
  }
}

/// A saved case that is closed or no longer visible (docs/04 §11.2).
class UnavailableCaseCard extends StatelessWidget {
  const UnavailableCaseCard({
    required this.title,
    required this.t,
    required this.onRemove,
    super.key,
  });

  final String? title;
  final Translator t;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Opacity(
      opacity: 0.72,
      child: AppCard(
        child: Row(
          children: [
            const AppIconMedallion(
              icon: AppIcons.blockRounded,
              tone: AppMedallionTone.neutral,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (title != null)
                    Text(
                      title!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.body.copyWith(color: colors.text),
                    ),
                  Text(
                    t.t('cases.saved.unavailable'),
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            AppTapTarget(
              child: Semantics(
                button: true,
                label: t.t('cases.saved.remove'),
                excludeSemantics: true,
                child: AppPressable(
                  onTap: onRemove,
                  child: SizedBox.square(
                    dimension: AppSizes.touchTarget,
                    child: AppIcon(
                      AppIcons.bookmarkRemoveOutlined,
                      color: colors.textSecondary,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
