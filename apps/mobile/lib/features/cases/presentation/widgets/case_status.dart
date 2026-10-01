import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';

/// Semantic tone of a status (colors strictly from docs/01 §8.1 tokens).
enum StatusTone { gold, info, success, warning, danger, neutral }

({Color fg, Color bg}) _colorsOf(AppColorTokens c, StatusTone tone) =>
    switch (tone) {
      StatusTone.gold => (fg: c.goldDark, bg: c.goldTint),
      StatusTone.info => (fg: c.info, bg: c.infoTint),
      StatusTone.success => (fg: c.success, bg: c.successTint),
      StatusTone.warning => (fg: c.warning, bg: c.goldTint),
      StatusTone.danger => (fg: c.dangerText, bg: c.dangerTint),
      StatusTone.neutral => (fg: c.textSecondary, bg: c.border),
    };

/// Compact status pill: a dot + label. The label always carries the
/// meaning (color is never the only signal).
class StatusPill extends StatelessWidget {
  const StatusPill({required this.label, required this.tone, super.key});

  final String label;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = _colorsOf(colors, tone);
    return AnimatedContainer(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      curve: AppMotion.enterCurve,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm + AppSpacing.xs / 2,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: AppSizes.statusDot - 2,
            height: AppSizes.statusDot - 2,
            decoration: BoxDecoration(color: c.fg, shape: BoxShape.circle),
          ),
          const SizedBox(width: AppSpacing.xs + 2),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: typography.badge.copyWith(color: c.fg),
            ),
          ),
        ],
      ),
    );
  }
}

StatusTone caseTone(CaseStatus s) => switch (s) {
      CaseStatus.open => StatusTone.info,
      CaseStatus.inProgress => StatusTone.success,
      CaseStatus.pendingCompletion => StatusTone.warning,
      CaseStatus.disputed => StatusTone.danger,
      _ => StatusTone.neutral,
    };

String caseStatusLabel(Translator t, CaseStatus s) => switch (s) {
      CaseStatus.open => t.t('cases.status.open'),
      CaseStatus.inProgress => t.t('cases.status.inProgress'),
      CaseStatus.pendingCompletion => t.t('cases.status.pendingCompletion'),
      CaseStatus.disputed => t.t('cases.status.disputed'),
      CaseStatus.archived => t.t('cases.status.archived'),
      _ => t.t('cases.status.closed'),
    };

class CaseStatusPill extends StatelessWidget {
  const CaseStatusPill({required this.status, required this.t, super.key});

  final CaseStatus status;
  final Translator t;

  @override
  Widget build(BuildContext context) =>
      StatusPill(label: caseStatusLabel(t, status), tone: caseTone(status));
}

/// docs/04 §11.2 bid status chips: "Ваш ход" / "Ожидает …" while active,
/// then the final state.
class BidStatusPill extends StatelessWidget {
  const BidStatusPill({
    required this.bid,
    required this.viewer,
    required this.t,
    super.key,
  });

  final CaseBid bid;
  final PartyRole viewer;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = bidStatusOf(t, bid, viewer);
    return StatusPill(label: label, tone: tone);
  }
}

/// Five pips = the five possible counter-offers (docs/04 §6.1). Used pips
/// fill gold one after another; the label says "Round 2 of 5".
class RoundCounter extends StatelessWidget {
  const RoundCounter({required this.used, required this.t, super.key});

  final int used;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final label = t.t('cases.bid.rounds', {
      'used': '$used',
      'max': '$kMaxNegotiationRounds',
    });
    return Semantics(
      label: label,
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < kMaxNegotiationRounds; i++) ...[
            if (i > 0) const SizedBox(width: AppSpacing.xs),
            TweenAnimationBuilder<double>(
              tween: Tween(end: i < used ? 1 : 0),
              duration: context.reduceMotion
                  ? Duration.zero
                  : AppMotion.stateChange + AppMotion.entranceStagger * i,
              curve: AppMotion.enterCurve,
              builder: (context, v, _) => Container(
                width: AppSpacing.md,
                height: AppSpacing.xs,
                decoration: BoxDecoration(
                  color: Color.lerp(colors.border, colors.gold, v),
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
              ),
            ),
          ],
          const SizedBox(width: AppSpacing.sm),
          Text(
            label,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// A bid's status label and tone for [viewer] (pill, Mine grid).
(String, StatusTone) bidStatusOf(Translator t, CaseBid bid, PartyRole viewer) =>
    switch (bid.status) {
      BidStatus.active when bid.turn == viewer => (
          t.t('cases.bid.yourTurn'),
          StatusTone.gold,
        ),
      BidStatus.active => (
          viewer == PartyRole.client
              ? t.t('cases.bid.waitingAttorney')
              : t.t('cases.bid.waitingClient'),
          StatusTone.info,
        ),
      BidStatus.accepted => (t.t('cases.bid.accepted'), StatusTone.success),
      BidStatus.rejectedByClient => (
          t.t('cases.bid.rejectedByClient'),
          StatusTone.danger,
        ),
      BidStatus.rejectedAuto => (
          t.t('cases.bid.rejectedAuto'),
          StatusTone.neutral,
        ),
      BidStatus.withdrawn => (t.t('cases.bid.withdrawn'), StatusTone.neutral),
      BidStatus.failedNegotiation => (
          t.t('cases.bid.failed'),
          StatusTone.warning,
        ),
      _ => (t.t('cases.bid.unknown'), StatusTone.neutral),
    };
