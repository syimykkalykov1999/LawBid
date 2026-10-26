import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_actions_bar.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cover.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart'
    show initialsOf;
import 'package:lawbid/features/social/data/social_repository.dart'
    show caseThreadId;
import 'package:lawbid/features/social/presentation/widgets/comments_sheet.dart';
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

/// Attorney "Кейсы" card. Owner 2026-10-13: a clear card without a photo —
/// practice chips, the title, State · Budget · Deadline in one line, the
/// description in three lines with its paragraphs, how many files wait
/// behind the lock, and the row: Bid, counters, the time and Save.
class FeedCaseCard extends StatelessWidget {
  const FeedCaseCard({
    required this.item,
    required this.t,
    required this.formats,
    required this.onTap,
    this.feedHeight,
    this.activity,
    super.key,
  });

  /// OQ-054: how active the client is; null = [FeedCase.clientActivity]
  /// (the API sends it only when the client's activity status is shown).
  final ClientActivity? activity;

  final FeedCase item;

  final Translator t;
  final L10nFormats formats;
  final VoidCallback onTap;

  /// Kept for the list's call sites; the card is as tall as its content.
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
    final leaf = CaseFormat.practice(
      t,
      item.practice.i18nKey,
      item.practice.nameEn,
    );
    final chips = [
      if (leaf == category)
        CaseFormat.withMore(category, item.extraPracticeCount)
      else ...[category, CaseFormat.withMore(leaf, item.extraPracticeCount)],
    ];
    final semantics = [
      category,
      item.title,
      CaseFormat.place(
        item.city,
        item.primaryStateCode,
        item.additionalStateCodes.length,
      ),
      CaseFormat.budget(t, formats, item.budget),
      t.t(
        'cases.card.bidsCount',
        {'count': SocialFormat.count(formats, item.bidsCount)},
      ),
      if (item.hasOwnBid) t.t('cases.card.youBid'),
    ].join(', ');
    final text = (item.description ?? item.excerpt).trim();
    final dark = Theme.of(context).brightness == Brightness.dark;
    final accent = practiceAccent(
      item.practice.categoryCode,
      surface: practiceCardBase(colors),
    );
    return Semantics(
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          clipBehavior: Clip.hardEdge,
          decoration: BoxDecoration(
            color: colors.surface,
            // Owner 2026-10-14: a continuous list, a hairline between cards.
            border: Border(bottom: BorderSide(color: colors.border)),
          ),
          // Owner 2026-10-15: the practice's own colour — a soft glow in the
          // bottom right corner (by Save, away from the text) and the
          // header band with the practice chips.
          child: Stack(
            children: [
              PositionedDirectional(
                // Owner 2026-10-15: top right, away from the text.
                end: -80,
                top: -80,
                child: IgnorePointer(
                  child: Container(
                    width: 240,
                    height: 240,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          accent.withValues(alpha: dark ? 0.26 : 0.2),
                          accent.withValues(alpha: 0),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ColoredBox(
                    color: accent.withValues(alpha: dark ? 0.16 : 0.12),
                    child: CaseChipsRow(
                      labels: chips,
                      dense: true,
                      accent: accent,
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.lg,
                        AppSpacing.sm,
                        AppSpacing.lg,
                        AppSpacing.sm,
                      ),
                    ),
                  ),
                  // Owner 2026-10-15: a paid case is pinned on top and says so,
                  // with the last paid day.
                  if (item.promoted)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.lg,
                        AppSpacing.sm,
                        AppSpacing.lg,
                        0,
                      ),
                      child: Text(
                        item.promotedUntil == null
                            ? t.t('promote.sponsored')
                            : t.t('boost.ad.until', {
                                'date': formats.date(item.promotedUntil!),
                              }),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      AppSpacing.sm,
                      AppSpacing.lg,
                      0,
                    ),
                    child: Text(
                      item.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: typography.titleMedium.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        height: 1.2,
                      ),
                    ),
                  ),
                  if ((activity ?? item.clientActivity) != null)
                    ClientActivityLine(
                      activity: (activity ?? item.clientActivity)!,
                      t: t,
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.lg,
                        AppSpacing.xs,
                        AppSpacing.lg,
                        0,
                      ),
                    ),
                  CaseFigures(
                    t: t,
                    formats: formats,
                    states: [
                      item.primaryStateCode,
                      ...item.additionalStateCodes,
                    ],
                    budget: item.budget,
                    urgency: item.urgencyInfo,
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      AppSpacing.sm,
                      AppSpacing.lg,
                      0,
                    ),
                  ),
                  if (text.isNotEmpty)
                    CaseText(
                      text: text,
                      lines: 2,
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.lg,
                        AppSpacing.sm,
                        AppSpacing.lg,
                        0,
                      ),
                      moreLabel: t.t('post.more'),
                      onMore: onTap,
                    ),
                  CaseFileLine(
                    t: t,
                    dossier: item.dossier,
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      AppSpacing.sm,
                      AppSpacing.lg,
                      0,
                    ),
                  ),
                  _CaseCardRow(item: item, t: t, formats: formats),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One thin line under the title: a dot and «В сети» / «Был 2 дня назад»,
/// then «· Отвечает за день». Always one line — when space runs out the
/// end is cut with "…", so it never pushes into other parts of the card.
class ClientActivityLine extends StatelessWidget {
  const ClientActivityLine({
    required this.activity,
    required this.t,
    this.padding = EdgeInsets.zero,
    super.key,
  });

  final ClientActivity activity;
  final Translator t;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = activity;
    final status = a.online
        ? t.t('cases.activity.online')
        : a.lastSeenDays == null || a.lastSeenDays == 0
            ? t.t('cases.activity.today')
            : t.plural(
                'cases.activity.lastSeen',
                a.lastSeenDays!,
                {'n': '${a.lastSeenDays}'},
              );
    final dot = a.online ? colors.success : colors.textSecondary;
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: status,
                    style: TextStyle(
                      color:
                          a.online ? colors.successText : colors.textSecondary,
                      fontWeight: a.online ? FontWeight.w600 : null,
                    ),
                  ),
                  if (a.respondsWithinDay)
                    TextSpan(text: ' · ${t.t('cases.activity.responds')}'),
                ],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: typography.caption.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

/// Bid first (a little larger), then bids / comments / shares, and on the
/// right the time with Save.
class _CaseCardRow extends StatelessWidget {
  const _CaseCardRow({
    required this.item,
    required this.t,
    required this.formats,
  });

  final FeedCase item;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget stat(IconData icon, int n, {VoidCallback? onTap}) {
      final row = Padding(
        padding: const EdgeInsetsDirectional.only(end: AppSpacing.md),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIcon(icon, size: 22, color: colors.text),
            const SizedBox(width: 4),
            Text(
              SocialFormat.count(formats, n),
              style: typography.bodySmall.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ],
        ),
      );
      if (onTap == null) return row;
      return GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: row,
      );
    }

    // Owner 2026-10-15: Bid sits in the icon row, left of the time; once a
    // bid is placed the same button turns grey with "Bid ✓".
    final bid = Container(
      constraints: const BoxConstraints(minHeight: 28),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: 2,
      ),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: item.hasOwnBid ? colors.chip : colors.gold,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: item.hasOwnBid ? Border.all(color: colors.border) : null,
      ),
      child: Text(
        item.hasOwnBid ? t.t('cases.card.bidDone') : t.t('cases.card.bid'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: typography.bodySmall.copyWith(
          color: item.hasOwnBid ? colors.textSecondary : colors.navy,
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.xs,
        AppSpacing.xs,
      ),
      child: Row(
        children: [
          stat(AppIcons.gavelRounded, item.bidsCount),
          // Owner 2026-10-15: comments open as a sheet (like posts), not
          // the case screen.
          stat(
            AppIcons.modeCommentOutlined,
            item.commentCount,
            onTap: () => showCommentsSheet(
              context,
              postId: caseThreadId(item.id),
              commentsEnabled: true,
            ),
          ),
          stat(AppIcons.sendOutlined, item.shareCount),
          // Owner 2026-10-15: Bid and the time sit at the right edge,
          // left of Save (Expanded + Align, not Spacer + Flexible).
          Expanded(
            child: Align(
              alignment: AlignmentDirectional.centerEnd,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    bid,
                    const SizedBox(width: AppSpacing.sm),
                    Text(
                      SocialFormat.ago(t, formats, item.createdAt),
                      maxLines: 1,
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
            ),
          ),
          CaseSaveButton(item: item),
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
  });

  final VoidCallback onTap;
  final String semanticLabel;
  final String? artCode;
  final String? practiceCode;
  final String practiceLabel;
  final Widget status;
  final String title;
  final List<_MineMeta> meta;
  final Widget footer;

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
                      color: colors.iconTint,
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
              fontSize: 15,
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
        AppIcon(icon, size: 15, color: colors.iconTint),
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

String? _artOf(String? practiceCode) =>
    practiceCode == null || practiceCode.isEmpty
        ? null
        : practiceCode.split('.').first;

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
    final name = attorney.fullName.isEmpty
        ? atHandle(attorney.username)
        : attorney.fullName;
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
              : appNetworkImage(attorney.avatarUrl!, 160),
          initials:
              initialsOf(attorney.firstName, attorney.lastName, fallback: '·'),
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
          color: colors.iconTintFill,
          borderRadius: BorderRadius.circular(AppRadii.field),
          border: Border.all(color: colors.iconTint),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppIcon(
              AppIcons.infoOutlineRounded,
              size: AppSizes.iconSm,
              color: colors.iconTint,
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
    final terms = CaseFormat.terms(
      t,
      formats,
      bid.feeType,
      bid.amountCents,
      percentBps: bid.percentBps,
    );
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
          // Owner 2026-10-19: say what comes next — the bid's screen, where
          // it is accepted, answered with a counter-offer or declined.
          const SizedBox(height: AppSpacing.md),
          AppButton(
            key: ValueKey('bid-card-view-${bid.id}'),
            label: t.t('bids.card.view'),
            icon: AppIcons.chevronRightRounded,
            variant: AppButtonVariant.secondary,
            onPressed: onTap,
          ),
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
    final terms = CaseFormat.terms(
      t,
      formats,
      item.feeType,
      item.amountCents,
      percentBps: item.percentBps,
    );
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
            color: colors.iconTint,
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(child: MoneyText(terms)),
          AppIcon(AppIcons.chevronRightRounded, color: colors.textSecondary),
        ],
      ),
    );
  }
}
