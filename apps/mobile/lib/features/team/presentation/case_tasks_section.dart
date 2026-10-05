import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_sheet.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';
import 'package:lawbid/features/team/team_routes.dart';

/// Owner 2026-10-05: on a case — its open tasks (calls, hearings,
/// documents…) and "+ Task" that comes already linked to the case.
class CaseTasksSection extends ConsumerWidget {
  const CaseTasksSection({
    required this.caseId,
    required this.caseTitle,
    super.key,
  });

  final String caseId;
  final String caseTitle;

  static const _shown = 5;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final canAdd = ref.watch(canDoProvider(AssistantDuty.tasks));
    const key = (done: false, mine: false);
    final tasks = [
      for (final x in ref.watch(tasksProvider(key)).value ?? const <TaskItem>[])
        if (x.caseId == caseId) x,
    ];
    if (tasks.isEmpty && !canAdd) return const SizedBox.shrink();
    return DetailSection(
      key: const ValueKey('case-tasks'),
      title: t.t('tasks.case.title'),
      trailing: canAdd
          ? ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 170),
              child: TextButton.icon(
                key: const ValueKey('case-task-add'),
                onPressed: () async {
                  final created = await context.push<bool>(
                    TeamRoutes.newTaskFor(caseId: caseId, caseTitle: caseTitle),
                  );
                  if (created ?? false) invalidateAllTasks(ref);
                },
                icon: AppIcon(AppIcons.addRounded, color: colors.goldDark),
                label: Text(
                  t.t('tasks.case.add'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: colors.goldDark),
                ),
              ),
            )
          : null,
      child: tasks.isEmpty
          ? Text(
              t.t('tasks.case.empty'),
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            )
          : AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (final task in tasks.take(_shown))
                    AppListRow(
                      key: ValueKey('case-task-${task.id}'),
                      icon: taskKindIcon(task.kind),
                      label: task.title,
                      subtitle: task.nextDueAt == null
                          ? t.t('tasks.noDate')
                          : formats.dateTime(task.nextDueAt!),
                      onTap: () =>
                          showTaskSheet(context, task: task, listKey: key),
                    ),
                  if (tasks.length > _shown)
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.sm),
                      child: Text(
                        t.t('tasks.case.more', {
                          'n': '${tasks.length - _shown}',
                        }),
                        style: typography.caption.copyWith(
                          color: colors.goldDark,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
