import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/active_case_card.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
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

String caseStageLabel(Translator t, int stage) => t.t(
      'mine.stage.of',
      {'n': '${stage + 1}', 'stage': t.t('mine.stage.${stage + 1}')},
    );

/// A client's own case in «Active».
class ClientActiveCaseCard extends ConsumerWidget {
  const ClientActiveCaseCard({required this.item, this.newBids = 0, super.key});

  final CaseSummary item;
  final int newBids;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final c = item;
    final stage = caseStageOf(c.status, c.bidsCount);
    final practice = CaseFormat.practice(
      t,
      c.practice.categoryI18nKey ?? c.practice.i18nKey,
      c.practice.categoryNameEn ?? c.practice.nameEn,
    );
    final choosing = c.status == CaseStatus.open && c.bidsCount > 0;
    final working = stage == 2 || stage == 3;
    return ActiveCaseCard(
      key: ValueKey('active-case-${c.id}'),
      title: c.title,
      subtitle: '$practice · ${c.primaryStateCode}',
      categoryCode: c.practice.artCode,
      practiceCode: c.practice.code,
      coverUrl: c.coverUrl,
      badge: newBids,
      stage: stage,
      stageLabel: caseStageLabel(t, stage),
      timeText: formats.dayMonth(c.lastActivityAt),
      next: choosing
          ? t.t('mine.next.chooseLawyer', {
              'bids': t.plural('cases.card.bidsCount', c.bidsCount, {
                'count': SocialFormat.count(formats, c.bidsCount),
              }),
            })
          : working
              ? t.t('mine.next.working')
              : c.status == CaseStatus.open
                  ? t.t('mine.next.waitingBids')
                  : t.t('mine.next.done'),
      nextQuiet: !choosing && !working,
      onTap: () => context.push(AppRoutes.myCase(c.id)),
    );
  }
}

/// An attorney's accepted case in «Active».
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
        : CaseFormat.practice(
            t,
            w.practiceI18nKey!,
            w.practiceNameEn ?? '',
          );
    final when = w.acceptedAt ?? w.closedAt;
    return ActiveCaseCard(
      key: ValueKey('active-work-${w.caseId}'),
      title: w.title,
      subtitle: [
        if (practice.isNotEmpty) practice,
        if (w.primaryStateCode != null) w.primaryStateCode!,
      ].join(' · '),
      categoryCode: w.practiceCode?.split('.').first,
      practiceCode: w.practiceCode,
      coverUrl: w.coverUrl,
      stage: stage,
      stageLabel: caseStageLabel(t, stage),
      timeText: when == null ? '' : formats.dayMonth(when),
      next:
          stage < 4 ? t.t('mine.next.workingAttorney') : t.t('mine.next.done'),
      nextQuiet: stage >= 4,
      onTap: () => context.push(AppRoutes.workCase(w.caseId)),
    );
  }
}
