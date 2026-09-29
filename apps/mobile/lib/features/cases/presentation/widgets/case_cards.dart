import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';

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
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        border: Border(bottom: BorderSide(color: colors.gold, width: 1)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          children: [
            Icon(Icons.balance_rounded,
                size: AppSpacing.lg, color: colors.goldLight),
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
              Container(
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
                  style: typography.badge.copyWith(color: colors.navy),
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
        Icon(icon, size: AppSpacing.lg, color: colors.textSecondary),
        const SizedBox(width: AppSpacing.xs),
        Text(value,
            style: typography.bodySmall.copyWith(color: colors.textSecondary)),
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
      style: base.copyWith(color: colors.text, fontFeatures: const [
        FontFeature.tabularFigures(),
      ]),
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
    super.key,
  });

  final FeedCase item;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback onTap;

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
    return _CaseCardShell(
      onTap: onTap,
      semanticLabel: [
        category,
        if (item.isNew) t.t('cases.card.new'),
        item.title,
        place,
        budget,
        t.t('cases.card.bidsCount', {'count': '${item.bidsCount}'}),
        if (item.hasOwnBid) t.t('cases.card.youBid'),
      ].join(', '),
      header: CategoryBand(
        label: category,
        isNew: item.isNew,
        newLabel: t.t('cases.card.new'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: typography.roleTitle.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              Icon(Icons.place_outlined,
                  size: AppSpacing.lg, color: colors.textSecondary),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Text(
                  place,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.t('cases.card.budget'),
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                    MoneyText(budget),
                  ],
                ),
              ),
              _IconStat(
                  icon: Icons.visibility_outlined,
                  value: formats.number(item.viewCount)),
              const SizedBox(width: AppSpacing.md),
              _IconStat(
                  icon: Icons.gavel_rounded,
                  value: formats.number(item.bidsCount)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              CaseStatusPill(status: item.status, t: t),
              if (item.hasOwnBid)
                StatusPill(
                    label: t.t('cases.card.youBid'), tone: StatusTone.gold),
            ],
          ),
        ],
      ),
    );
  }
}

/// Client "Мои кейсы" card (docs/04 §11.1): category, title, state,
/// status, bids (+ new), date.
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
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final practice =
        CaseFormat.practice(t, item.practice.i18nKey, item.practice.nameEn);
    final place = CaseFormat.place(
      item.city,
      item.primaryStateCode,
      item.additionalStateCount,
    );
    final bids = t.t('cases.card.bidsCount', {'count': '${item.bidsCount}'});
    final fresh = unseenBids > 0
        ? t.t('cases.card.newBids', {'count': '$unseenBids'})
        : null;
    return _CaseCardShell(
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  practice,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.caption.copyWith(
                    color: colors.goldDark,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              CaseStatusPill(status: item.status, t: t),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            item.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: typography.roleTitle.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '$place · ${formats.date(item.createdAt)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              _IconStat(icon: Icons.gavel_rounded, value: bids),
              if (fresh != null) ...[
                const SizedBox(width: AppSpacing.sm),
                StatusPill(label: fresh, tone: StatusTone.gold),
              ],
              const Spacer(),
              Icon(Icons.chevron_right_rounded, color: colors.textSecondary),
            ],
          ),
        ],
      ),
    );
  }
}

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
            'count': '${attorney.ratingCount}',
          });
    final row = Row(
      children: [
        AppAvatar(
          size: AppSizes.cardAvatar,
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
                    Icon(Icons.verified_rounded,
                        size: AppSpacing.lg, color: colors.info),
                  ],
                ],
              ),
              Row(
                children: [
                  if (attorney.ratingCount > 0) ...[
                    Icon(Icons.star_rounded,
                        size: AppSpacing.md + 2, color: colors.gold),
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
          const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: MoneyText(terms)),
              BidStatusPill(bid: bid, viewer: PartyRole.client, t: t),
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

/// "Мои биды" card (docs/04 §11.2): "Re: case title", terms, status chip,
/// round counter, last message.
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
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final bid = item.bid;
    final terms = CaseFormat.terms(t, formats, bid.feeType, bid.amountCents);
    final re = t.t('cases.myBids.re', {'title': item.caseTitle});
    final lastMessage = item.lastOffer.message;
    return _CaseCardShell(
      onTap: onTap,
      semanticLabel:
          [re, terms, if (lastMessage != null) lastMessage].join(', '),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            re,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: typography.body
                .copyWith(color: colors.text, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '${CaseFormat.practice(t, item.casePracticeI18nKey, item.casePracticeNameEn)} · ${item.primaryStateCode}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: MoneyText(terms)),
              BidStatusPill(bid: bid, viewer: PartyRole.attorney, t: t),
            ],
          ),
          if (!bid.isFreeConsultation) ...[
            const SizedBox(height: AppSpacing.sm),
            RoundCounter(used: bid.roundCount, t: t),
          ],
          if (lastMessage != null && lastMessage.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              lastMessage,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

/// "В работе" card (docs/04 §11.2): title, client, status, terms.
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
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final terms = CaseFormat.terms(t, formats, item.feeType, item.amountCents);
    final client = item.clientName ?? t.t('cases.work.clientLocked');
    return _CaseCardShell(
      onTap: onTap,
      semanticLabel: [
        item.title,
        client,
        caseStatusLabel(t, item.status),
        terms
      ].join(', '),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  item.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: typography.roleTitle.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              CaseStatusPill(status: item.status, t: t),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Icon(
                item.clientName == null
                    ? Icons.lock_outline_rounded
                    : Icons.person_outline_rounded,
                size: AppSpacing.lg,
                color: colors.textSecondary,
              ),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Text(
                  client,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                ),
              ),
              MoneyText(terms),
            ],
          ),
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
                icon: Icons.block_rounded, tone: AppMedallionTone.neutral),
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
                    child: Icon(Icons.bookmark_remove_outlined,
                        color: colors.textSecondary),
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
