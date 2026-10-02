import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';

/// docs/04 §5.2 / §6 "история торга": every offer by round as a dialogue —
/// the viewer's own offers on the right, the other side's on the left —
/// joined by a gold rail, closed by a system line when the negotiation
/// ended ("Стороны не договорились", accepted, withdrawn…).
class NegotiationTimeline extends StatelessWidget {
  const NegotiationTimeline({
    required this.bid,
    required this.viewer,
    required this.t,
    required this.formats,
    super.key,
  });

  final CaseBid bid;
  final PartyRole viewer;
  final Translator t;
  final L10nFormats formats;

  String? _closingLine() => switch (bid.status) {
        BidStatus.accepted => t.t('cases.timeline.accepted'),
        BidStatus.failedNegotiation => t.t('cases.timeline.failed'),
        BidStatus.rejectedByClient => t.t('cases.timeline.rejectedByClient'),
        BidStatus.rejectedAuto => t.t('cases.timeline.rejectedAuto'),
        BidStatus.withdrawn => t.t('cases.timeline.withdrawn'),
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    final offers = bid.offers;
    final closing = _closingLine();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < offers.length; i++)
          AppEntrance(
            index: i < 8 ? i + 1 : 0,
            child: _OfferBubble(
              offer: offers[i],
              mine: offers[i].fromRole == viewer,
              t: t,
              formats: formats,
              isLast: i == offers.length - 1 && closing == null,
            ),
          ),
        if (closing != null)
          AppEntrance(
            index: offers.length < 8 ? offers.length + 1 : 0,
            child: _SystemLine(
              text: closing,
              positive: bid.status == BidStatus.accepted,
            ),
          ),
      ],
    );
  }
}

class _OfferBubble extends StatelessWidget {
  const _OfferBubble({
    required this.offer,
    required this.mine,
    required this.t,
    required this.formats,
    required this.isLast,
  });

  final BidOffer offer;
  final bool mine;
  final Translator t;
  final L10nFormats formats;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final author = offer.fromRole == PartyRole.client
        ? t.t('cases.timeline.client')
        : t.t('cases.timeline.attorney');
    final round = offer.roundNo == 0
        ? t.t('cases.timeline.initial')
        : t.t('cases.timeline.round', {'n': '${offer.roundNo}'});
    final status = switch (offer.status) {
      OfferStatus.pending => t.t('cases.timeline.pending'),
      OfferStatus.accepted => t.t('cases.timeline.offerAccepted'),
      OfferStatus.countered => t.t('cases.timeline.countered'),
      OfferStatus.declined => t.t('cases.timeline.declined'),
      _ => t.t('cases.timeline.superseded'),
    };
    final amount =
        CaseFormat.terms(t, formats, offer.feeType, offer.amountCents);
    final pending = offer.status == OfferStatus.pending;

    final bubble = Container(
      padding: const EdgeInsets.all(AppSpacing.md + 2),
      decoration: BoxDecoration(
        color: mine ? colors.goldTint : colors.surface,
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(AppRadii.card),
          topRight: const Radius.circular(AppRadii.card),
          bottomLeft: Radius.circular(mine ? AppRadii.card : AppSpacing.xs),
          bottomRight: Radius.circular(mine ? AppSpacing.xs : AppRadii.card),
        ),
        border: Border.all(
          color: pending ? colors.gold : colors.border,
          width: pending ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$author · $round',
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            amount,
            style: typography.roleTitle.copyWith(
              color: offer.status == OfferStatus.countered ||
                      offer.status == OfferStatus.superseded
                  ? colors.textSecondary
                  : colors.text,
              decoration: offer.status == OfferStatus.countered
                  ? TextDecoration.lineThrough
                  : null,
              decorationColor: colors.textSecondary,
            ),
          ),
          if (offer.message != null && offer.message!.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              offer.message!,
              style: typography.bodySmall.copyWith(color: colors.text),
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Text(
            '$status · ${formats.dateTime(offer.createdAt)}',
            style: typography.caption.copyWith(
              color: pending ? colors.goldDark : colors.textSecondary,
            ),
          ),
        ],
      ),
    );

    return Semantics(
      label: '$author, $round, $amount, $status',
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: AppSpacing.xl,
              child: Column(
                children: [
                  Container(
                    width: AppSpacing.md,
                    height: AppSpacing.md,
                    margin: const EdgeInsets.only(top: AppSpacing.lg),
                    decoration: BoxDecoration(
                      color: pending ? colors.gold : colors.surface,
                      shape: BoxShape.circle,
                      border: Border.all(color: colors.gold, width: 2),
                    ),
                  ),
                  Expanded(
                    child: Container(
                      width: 2,
                      color: isLast
                          ? Colors.transparent
                          : colors.gold.withValues(alpha: 0.35),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Align(
                  alignment:
                      mine ? Alignment.centerRight : Alignment.centerLeft,
                  child: FractionallySizedBox(widthFactor: 0.92, child: bubble),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SystemLine extends StatelessWidget {
  const _SystemLine({required this.text, required this.positive});

  final String text;
  final bool positive;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final color = positive ? colors.success : colors.textSecondary;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Row(
        children: [
          SizedBox(
            width: AppSpacing.xl,
            child: AppIcon(
              positive
                  ? AppIcons.verifiedRounded
                  : AppIcons.removeCircleOutlineRounded,
              size: AppSizes.iconSm,
              color: color,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: typography.bodySmall
                  .copyWith(color: color, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
