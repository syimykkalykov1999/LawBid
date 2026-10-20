import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/deadlines/application/deadlines_providers.dart';
import 'package:lawbid/features/deadlines/deadlines_routes.dart';

/// Owner 2026-10-20: «Мои» — a small «Сроки» chip above the lists of both
/// profiles; hidden while the `deadline_calculator` flag is off.
class DeadlineMineEntry extends ConsumerWidget {
  const DeadlineMineEntry({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(deadlinesEnabledProvider)) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: AppSpacing.screenSide,
        end: AppSpacing.screenSide,
        bottom: AppSpacing.sm,
      ),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: Semantics(
          button: true,
          label: t.t('deadline.title'),
          excludeSemantics: true,
          child: AppChip(
            key: const ValueKey('mine-deadlines'),
            label: t.t('deadline.title'),
            leading: AppIcon(
              AppIcons.timerOutlined,
              size: 18,
              color: colors.goldDark,
            ),
            onTap: () => context.push(DeadlinesRoutes.open()),
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-20: on a case — «Сроки» opens the calculator with the
/// case's state and practice category already chosen.
class CaseDeadlinesRow extends ConsumerWidget {
  const CaseDeadlinesRow({
    required this.caseId,
    this.stateCode,
    this.practiceCategory,
    this.padding = const EdgeInsets.only(top: AppSpacing.md),
    super.key,
  });

  final String caseId;
  final String? stateCode;
  final String? practiceCategory;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(deadlinesEnabledProvider)) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    return Padding(
      padding: padding,
      child: AppCard(
        padding: EdgeInsets.zero,
        child: AppListRow(
          key: const ValueKey('case-deadlines'),
          icon: AppIcons.timerOutlined,
          label: t.t('deadline.title'),
          subtitle: t.t('deadline.case.hint'),
          onTap: () => context.push(
            DeadlinesRoutes.open(
              state: stateCode,
              practice: practiceCategory,
              caseId: caseId,
            ),
          ),
        ),
      ),
    );
  }
}
