import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/compact_case_row.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/promote_case_card.dart';

/// A client's own case as a compact row ("My cases", Search). With
/// [swipe], a swipe left offers the actions the case screen menu has:
/// close (open cases only) and delete (open or archived).
class MyCaseRow extends ConsumerWidget {
  const MyCaseRow({
    required this.item,
    this.newBids = 0,
    this.swipe = false,
    super.key,
  });

  final CaseSummary item;
  final int newBids;
  final bool swipe;

  Future<void> _confirmed(
    BuildContext context,
    WidgetRef ref, {
    required String title,
    required String message,
    required String confirm,
    required Future<void> Function() action,
    required String doneKey,
    bool destructive = false,
  }) async {
    final t = ref.read(translatorProvider);
    // The row leaves the list once the action is done: the snack bar
    // goes through the navigator's context.
    final host = Navigator.of(context).context;
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t(title),
      message: t.t(message),
      confirmLabel: t.t(confirm),
      destructive: destructive,
    );
    if (!ok) return;
    try {
      await action();
      if (host.mounted) showAppSnackBar(host, t.t(doneKey));
    } on Object catch (e) {
      if (host.mounted) showAppSnackBar(host, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final c = item;
    final practice = CaseFormat.practice(
      t,
      c.practice.categoryI18nKey ?? c.practice.i18nKey,
      c.practice.categoryNameEn ?? c.practice.nameEn,
    );
    final open = c.status == CaseStatus.open;
    final row = CompactCaseRow(
      key: ValueKey('my-case-${c.id}'),
      title: c.title,
      description: '$practice · ${c.primaryStateCode}',
      status: CaseStatusPill(status: c.status, t: t),
      coverUrl: c.coverUrl,
      coverKey: c.coverKey,
      coverSeed: c.id,
      categoryCode: c.practice.artCode,
      practiceCode: c.practice.code,
      bidsCount: c.bidsCount,
      newBids: newBids,
      semanticLabel: '${c.title}, ${caseStatusLabel(t, c.status)}',
      // Owner 2026-10-07: Boost lives on the cards only.
      trailing: open
          ? BoostButton(postId: c.id, target: PromotionTarget.case_)
          : null,
      onTap: () => context.push(AppRoutes.myCase(c.id)),
    );
    final canDelete = open || c.status == CaseStatus.archived;
    if (!swipe || !canDelete) return row;
    final actions = ref.read(caseActionsProvider);
    return SwipeActions(
      key: ValueKey('my-case-swipe-${c.id}'),
      actions: [
        if (open)
          SwipeAction(
            key: ValueKey('my-case-close-${c.id}'),
            label: t.t('cases.owner.closeShort'),
            icon: AppIcons.doNotDisturbOnOutlined,
            color: colors.navy,
            onColor: Colors.white,
            onTap: () => _confirmed(
              context,
              ref,
              title: 'cases.owner.closeTitle',
              message: 'cases.owner.closeMessage',
              confirm: 'cases.owner.close',
              action: () => actions.closeCase(c.id),
              doneKey: 'cases.owner.closed',
            ),
          ),
        if (canDelete)
          SwipeAction(
            key: ValueKey('my-case-delete-${c.id}'),
            label: t.t('cases.owner.delete'),
            icon: AppIcons.deleteOutlineRounded,
            color: colors.dangerFill,
            onColor: colors.onDanger,
            onTap: () => _confirmed(
              context,
              ref,
              title: 'cases.owner.deleteTitle',
              message: 'cases.owner.deleteMessage',
              confirm: 'cases.owner.delete',
              destructive: true,
              action: () => actions.deleteCase(c.id),
              doneKey: 'cases.owner.deleted',
            ),
          ),
      ],
      child: row,
    );
  }
}
