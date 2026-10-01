import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_sheet.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';
import 'package:lawbid/features/team/presentation/team_widgets.dart';
import 'package:lawbid/features/team/team_routes.dart';

enum _TasksView { active, done, results }

/// OQ-048 (owner 2026-09-30) — Mine → «Задачи»: the attorney's calendar
/// of tasks by day with round checkboxes, "+ Add task" for the attorney
/// (their own) and assistants (for the attorney); a task opens with take /
/// done / not done + note / move to another time. An assistant also has
/// «Результаты»: the attorney's answers to their tasks and requests.
class TasksTab extends ConsumerStatefulWidget {
  const TasksTab({super.key});

  @override
  ConsumerState<TasksTab> createState() => _TasksTabState();
}

class _TasksTabState extends ConsumerState<TasksTab> {
  _TasksView _view = _TasksView.active;

  TasksKey get _key => switch (_view) {
        _TasksView.active => (done: false, mine: false),
        _TasksView.done => (done: true, mine: false),
        _TasksView.results => (done: true, mine: true),
      };

  Future<void> _add() async {
    final created = await context.push<bool>(TeamRoutes.newTask);
    if (created ?? false) {
      ref.invalidate(tasksProvider(_key));
    }
  }

  /// Double tap: the next step is checked off (or the whole task when it
  /// has no steps); a note can be added from the task.
  Future<void> _quickDone(TaskItem task) async {
    final next = task.nextStep;
    if (task.steps.isNotEmpty) {
      if (next != null) await _toggleStep(task, next);
      return;
    }
    final t = ref.read(translatorProvider);
    try {
      await ref
          .read(tasksProvider(_key).notifier)
          .setStatus(task, TaskStatus.done);
      if (!mounted) return;
      showAppSnackBar(context, '${t.t('tasks.status.done')} · ${task.title}');
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  /// Owner 2026-10-01: a step's box on the card — checked ↔ open.
  Future<void> _toggleStep(TaskItem task, TaskStep step) async {
    final t = ref.read(translatorProvider);
    try {
      final updated = await ref.read(tasksProvider(_key).notifier).checkStep(
            task,
            step,
            step.checked ? TaskStatus.open : TaskStatus.done,
          );
      if (!mounted) return;
      if (!updated.status.active) {
        showAppSnackBar(
            context, '${t.t('tasks.steps.allDone')} · ${task.title}');
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final assistant = ref.watch(isAssistantProvider);
    final canAdd = ref.watch(canDoProvider(AssistantDuty.tasks));
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.xs,
            AppSpacing.screenSide,
            0,
          ),
          child: Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final (v, label) in [
                        (_TasksView.active, t.t('tasks.view.active')),
                        (_TasksView.done, t.t('tasks.view.done')),
                        if (assistant)
                          (_TasksView.results, t.t('tasks.results')),
                      ]) ...[
                        AppChip(
                          key: ValueKey('tasks-view-${v.name}'),
                          label: label,
                          selected: _view == v,
                          onTap: () => setState(() => _view = v),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                      ],
                    ],
                  ),
                ),
              ),
              if (canAdd)
                AddTaskButton(
                  key: const ValueKey('tasks-add'),
                  label: t.t('tasks.add'),
                  onTap: _add,
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: RefreshIndicator(
            color: colors.gold,
            backgroundColor: colors.surface,
            onRefresh: () async {
              await ref.read(tasksProvider(_key).notifier).refresh();
              if (_view == _TasksView.results) {
                ref.invalidate(teamRequestsProvider);
              }
            },
            child: _view == _TasksView.results
                ? _ResultsList(t: t, formats: formats, listKey: _key)
                : _TaskList(
                    t: t,
                    formats: formats,
                    listKey: _key,
                    canAdd: canAdd,
                    onAdd: _add,
                    onCheck: assistant ? null : _quickDone,
                    onStepCheck: assistant ? null : _toggleStep,
                  ),
          ),
        ),
      ],
    );
  }
}

class _TaskList extends ConsumerWidget {
  const _TaskList({
    required this.t,
    required this.formats,
    required this.listKey,
    required this.canAdd,
    required this.onAdd,
    required this.onCheck,
    this.onStepCheck,
  });

  final Translator t;
  final L10nFormats formats;
  final TasksKey listKey;
  final bool canAdd;
  final VoidCallback onAdd;
  final void Function(TaskItem)? onCheck;
  final void Function(TaskItem, TaskStep)? onStepCheck;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(tasksProvider(listKey));
    final now = DateTime.now();
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return switch (value) {
      AsyncData(:final value) when value.isEmpty => PullableState(
          child: AppEmptyState(
            icon: Icons.event_available_outlined,
            title: t.t('tasks.empty'),
            message: t.t('tasks.empty.body'),
            action: canAdd && !listKey.done
                ? AppButton(
                    label: t.t('tasks.add'),
                    icon: Icons.add_rounded,
                    height: AppSizes.touchTarget,
                    onPressed: onAdd,
                  )
                : null,
          ),
        ),
      AsyncData(:final value) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            0,
            AppSpacing.screenSide,
            AppSpacing.xxl,
          ),
          children: [
            if (onCheck != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Text(
                  t.t('tasks.doubleTapHint'),
                  style:
                      typography.caption.copyWith(color: colors.textSecondary),
                ),
              ),
            for (final (si, s) in groupTasksByDay(value, t, formats,
                    now: now, done: listKey.done)
                .indexed) ...[
              Padding(
                padding: EdgeInsets.only(
                  top: si == 0 ? AppSpacing.xs : AppSpacing.lg,
                  bottom: AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    Text(
                      s.title,
                      style: typography.body.copyWith(
                        color: s.key == '0overdue'
                            ? colors.dangerText
                            : colors.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Text(
                      '${s.items.length}',
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
              for (final (i, task) in s.items.indexed)
                AppEntrance(
                  index: i,
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: TaskRow(
                      key: ValueKey('task-${task.id}'),
                      task: task,
                      t: t,
                      formats: formats,
                      now: now,
                      onTap: () =>
                          showTaskSheet(context, task: task, listKey: listKey),
                      onCheck: onCheck == null || !task.status.active
                          ? null
                          : () => onCheck!(task),
                      onStepCheck: onStepCheck == null
                          ? null
                          : (step) => onStepCheck!(task, step),
                    ),
                  ),
                ),
            ],
          ],
        ),
      AsyncError(:final error) => PullableState(
          child: AppErrorState(
            message: errorText(t, error),
            onRetry: () => ref.invalidate(tasksProvider(listKey)),
          ),
        ),
      _ => const Center(child: CircularProgressIndicator()),
    };
  }
}

/// An assistant's «Результаты»: answers to the tasks they set and to their
/// approval requests.
class _ResultsList extends ConsumerWidget {
  const _ResultsList({
    required this.t,
    required this.formats,
    required this.listKey,
  });

  final Translator t;
  final L10nFormats formats;
  final TasksKey listKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(tasksProvider(listKey)).value ?? const [];
    final requests = (ref.watch(teamRequestsProvider).value?.items ??
            const <AssistantRequest>[])
        .where((r) => r.status != RequestStatus.pending)
        .toList();
    final now = DateTime.now();
    if (tasks.isEmpty && requests.isEmpty) {
      return PullableState(
        child: AppEmptyState(
          icon: Icons.mark_email_read_outlined,
          title: t.t('tasks.results'),
          message: t.t('tasks.results.empty'),
        ),
      );
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        for (final r in requests)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: RequestResultCard(request: r, t: t, formats: formats),
          ),
        for (final task in tasks)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: TaskRow(
              task: task,
              t: t,
              formats: formats,
              now: now,
              onTap: () => showTaskSheet(context, task: task, listKey: listKey),
            ),
          ),
      ],
    );
  }
}
