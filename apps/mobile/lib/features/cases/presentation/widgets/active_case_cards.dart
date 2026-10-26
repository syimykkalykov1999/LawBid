import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/active_case_card.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_stale_banner.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

/// Owner 2026-10-15: the five stages of a case, each tied to a real case
/// status: 1 published (open, no bids) · 2 bids (open, at least one bid) ·
/// 3 in progress · 4 wrapping up (pending completion / disputed) ·
/// 5 completed (closed, archived).
int caseStageOf(CaseStatus status, int bids) => switch (status) {
      CaseStatus.open => bids > 0 ? 1 : 0,
      CaseStatus.inProgress => 2,
      CaseStatus.pendingCompletion || CaseStatus.disputed => 3,
      _ => 4,
    };

String caseStageLabel(Translator t, int stage) =>
    t.t('mine.stage.short', {'n': '${stage + 1}'});

/// A client's own case in «Active».
class ClientActiveCaseCard extends ConsumerWidget {
  const ClientActiveCaseCard({
    required this.item,
    this.newBids = 0,
    this.scale = true,
    super.key,
  });

  final CaseSummary item;
  final int newBids;

  /// «My cases» (owner 2026-10-15): the same card without the stage scale,
  /// the date of the last activity at the end of the status row.
  final bool scale;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final c = item;
    final stage = caseStageOf(c.status, c.bidsCount);
    final practice = CaseFormat.withMore(
      CaseFormat.practice(
        t,
        c.practice.categoryI18nKey ?? c.practice.i18nKey,
        c.practice.categoryNameEn ?? c.practice.nameEn,
      ),
      c.extraPracticeCount,
    );
    final choosing = c.status == CaseStatus.open && c.bidsCount > 0;
    final working = stage == 2 || stage == 3;
    final when = formats.dayMonth(c.lastActivityAt);
    final disputed = c.status == CaseStatus.disputed;
    final pending = c.status == CaseStatus.pendingCompletion;
    final noPrice = c.budget.isClarifyLater;
    final next = disputed
        ? t.t('mine.next.dispute')
        : pending
            ? t.t('mine.next.confirmDone')
            : noPrice && stage == 2
                ? t.t('mine.next.agreePrice')
                : choosing
                    ? t.t('mine.next.chooseLawyer', {
                        'bids': t.t('cases.card.bidsCount', {
                          'count': SocialFormat.count(formats, c.bidsCount),
                        }),
                      })
                    : working
                        ? t.t('mine.next.working')
                        : c.status == CaseStatus.open
                            ? t.t('mine.next.waitingBids')
                            : t.t('mine.next.done');
    // OQ-054: a paused case reads «На паузе»; the question and the pause
    // note sit right under the card they are about.
    final onPause = c.paused && c.status == CaseStatus.open;
    final card = ActiveCaseCard(
      key: ValueKey('active-case-${c.id}'),
      title: c.title,
      practiceName: practice,
      stateCode:
          CaseFormat.place(null, c.primaryStateCode, c.additionalStateCount),
      price: noPrice
          ? t.t('mine.price.negotiable')
          : CaseFormat.budget(t, formats, c.budget),
      categoryCode: c.practice.artCode,
      practiceCode: c.practice.code,
      badge: c.status == CaseStatus.open ? newBids : 0,
      statusLabel: caseStatusLabelOf(t, c.status, paused: c.paused),
      statusTone: onPause ? StatusTone.neutral : caseTone(c.status),
      stage: scale ? stage : null,
      stageLabel: scale ? caseStageLabel(t, stage) : when,
      next: next,
      nextDate: scale ? when : null,
      nextYours: choosing || pending || (noPrice && stage == 2),
      nextDanger: disputed,
      onTap: () => context.push(AppRoutes.myCase(c.id)),
    );
    if (c.status != CaseStatus.open ||
        !CaseStaleBanner.needed(
          paused: c.paused,
          pending: c.stillNeededPending,
        )) {
      return card;
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        card,
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.xs,
            AppSpacing.md,
            AppSpacing.sm,
          ),
          child: CaseStaleBanner(
            caseId: c.id,
            paused: c.paused,
            pending: c.stillNeededPending,
            canMakeNotUrgent: c.canMakeNotUrgent,
            hidesAt: c.hidesAt,
            archivesAt: c.archivesAt,
          ),
        ),
      ],
    );
  }
}

/// An attorney's accepted case in «Active» (the header is only the
/// practice colour: the client's photos are not shown here).
class AttorneyActiveCaseCard extends ConsumerWidget {
  const AttorneyActiveCaseCard({required this.item, super.key});

  final WorkItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final w = item;
    final stage = caseStageOf(w.status, 0).clamp(2, 4);
    final practice = w.practiceI18nKey == null
        ? ''
        : CaseFormat.practice(t, w.practiceI18nKey!, w.practiceNameEn ?? '');
    final when = w.acceptedAt ?? w.closedAt;
    final disputed = w.status == CaseStatus.disputed;
    final pending = w.status == CaseStatus.pendingCompletion;
    final next = disputed
        ? t.t('mine.next.dispute')
        : pending
            ? t.t('mine.next.awaitClient')
            : stage < 4
                ? t.t('mine.next.workingAttorney')
                : t.t('mine.next.done');
    return ActiveCaseCard(
      key: ValueKey('active-work-${w.caseId}'),
      title: w.title,
      practiceName: practice,
      stateCode: w.primaryStateCode == null
          ? null
          : CaseFormat.place(null, w.primaryStateCode!, w.additionalStateCount),
      price: w.amountCents > 0
          ? formats.currencyFromCents(w.amountCents)
          : t.t('mine.price.negotiable'),
      categoryCode: w.practiceCode?.split('.').first,
      practiceCode: w.practiceCode,
      statusLabel: caseStatusLabel(t, w.status),
      statusTone: caseTone(w.status),
      stage: stage,
      stageLabel: caseStageLabel(t, stage),
      next: next,
      nextDate: when == null ? null : formats.dayMonth(when),
      nextDanger: disputed,
      onTap: () => context.push(AppRoutes.workCase(w.caseId)),
    );
  }
}

/// Owner 2026-10-15 («Мои биды»): an attorney's bid as a card — the header in
/// the practice colour with the bid price, the bid status, the date and one
/// «what next» line (gold when the move is the attorney's).
class AttorneyBidCard extends ConsumerWidget {
  const AttorneyBidCard({required this.item, super.key});

  final MyBid item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final b = item;
    final (label, tone) = bidStatusOf(t, b.bid, PartyRole.attorney);
    final yours =
        b.bid.status == BidStatus.active && b.bid.turn == PartyRole.attorney;
    final next = switch (b.bid.status) {
      BidStatus.active when yours => t.t('mine.bidNext.yourTurn'),
      BidStatus.active => t.t('mine.bidNext.waitingClient'),
      BidStatus.accepted => t.t('mine.bidNext.done'),
      BidStatus.rejectedByClient => t.t('mine.bidNext.rejected'),
      BidStatus.rejectedAuto => t.t('mine.bidNext.expired'),
      BidStatus.withdrawn => t.t('mine.bidNext.withdrawn'),
      _ => t.t('mine.bidNext.failed'),
    };
    final when = formats.dayMonth(b.bid.decidedAt ?? b.bid.createdAt);
    return ActiveCaseCard(
      key: ValueKey('bid-card-${b.bid.id}'),
      title: b.caseTitle,
      practiceName: CaseFormat.practice(
        t,
        b.casePracticeI18nKey,
        b.casePracticeNameEn,
      ),
      stateCode: b.primaryStateCode,
      price: b.bid.amountCents > 0
          ? formats.currencyFromCents(b.bid.amountCents)
          : t.t('mine.price.negotiable'),
      categoryCode: b.casePracticeCode?.split('.').first,
      practiceCode: b.casePracticeCode,
      statusLabel: label,
      statusTone: tone,
      stageLabel: when,
      next: next,
      nextYours: yours,
      nextDanger: b.bid.status == BidStatus.rejectedByClient,
      onTap: () => context.push(AppRoutes.bid(b.bid.id)),
    );
  }
}
