import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/l10n/week_start.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/time/local_now.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/consultations/application/consultations_providers.dart';
import 'package:lawbid/features/consultations/consultations_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/planner_task_sheet.dart';
import 'package:lawbid/features/team/presentation/task_board_widgets.dart';
import 'package:lawbid/features/team/presentation/task_pickers.dart';
import 'package:lawbid/features/team/presentation/task_sheet.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';
import 'package:lawbid/features/team/presentation/team_widgets.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-05: «Сегодня» (by time of day), «Все» (by day),
/// «Архив» (finished — kept a year, then removed) and an assistant's
/// «Результаты».
enum TasksView { today, all, archive, results }

/// Owner 2026-10-05: the planner's filters — period, case, who does it,
/// order. Applied on the phone: the lists are small and it is instant.
enum TaskPeriod { any, today, week, overdue, noDate }

enum TaskSort { time, priority, created }

@immutable
class TaskFilter {
  const TaskFilter({
    this.period = TaskPeriod.any,
    this.caseId,
    this.assignee,
    this.sort = TaskSort.time,
    this.scope = TaskScope.all,
  });

  /// Owner 2026-10-15: the chips under the views (overdue, for the client…).
  final TaskScope scope;

  final TaskPeriod period;
  final String? caseId;

  /// `me` (not given to anyone), `mine` (given to me), or a membership id.
  final String? assignee;
  final TaskSort sort;

  bool get isEmpty =>
      period == TaskPeriod.any &&
      caseId == null &&
      assignee == null &&
      sort == TaskSort.time &&
      scope == TaskScope.all;

  /// Without the chips (the filter sheet's own part).
  bool get sheetIsEmpty =>
      period == TaskPeriod.any &&
      caseId == null &&
      assignee == null &&
      sort == TaskSort.time;

  TaskFilter copyWith({
    TaskPeriod? period,
    String? Function()? caseId,
    String? Function()? assignee,
    TaskSort? sort,
    TaskScope? scope,
  }) =>
      TaskFilter(
        period: period ?? this.period,
        caseId: caseId == null ? this.caseId : caseId(),
        assignee: assignee == null ? this.assignee : assignee(),
        sort: sort ?? this.sort,
        scope: scope ?? this.scope,
      );
}

/// The tasks that pass [f], in its order.
List<TaskItem> applyTaskFilter(
  List<TaskItem> tasks,
  TaskFilter f, {
  required DateTime now,
  String query = '',
}) {
  final today = DateTime(now.year, now.month, now.day);
  final weekEnd = today.add(const Duration(days: 7));
  final q = query.trim().toLowerCase();
  bool inPeriod(TaskItem t) {
    final due = t.nextDueAt?.toLocal();
    return switch (f.period) {
      TaskPeriod.any => true,
      TaskPeriod.noDate => due == null,
      TaskPeriod.overdue => t.isOverdue(now),
      TaskPeriod.today => due != null &&
          (t.isOverdue(now) || DateTime(due.year, due.month, due.day) == today),
      TaskPeriod.week => due != null && due.isBefore(weekEnd),
    };
  }

  bool matches(TaskItem t) =>
      q.isEmpty ||
      t.title.toLowerCase().contains(q) ||
      (t.notes?.toLowerCase().contains(q) ?? false) ||
      (t.caseTitle?.toLowerCase().contains(q) ?? false) ||
      t.places.any((p) => p.address.toLowerCase().contains(q)) ||
      t.people.any((p) => p.name.toLowerCase().contains(q)) ||
      t.steps.any((s) => s.title.toLowerCase().contains(q));

  final out = [
    for (final t in tasks)
      if (inPeriod(t) &&
          taskInScope(t, f.scope, now) &&
          (f.caseId == null || t.caseId == f.caseId) &&
          switch (f.assignee) {
            null => true,
            'me' => t.assigneeMembershipId == null,
            'mine' => t.assignedToMe,
            final id => t.assigneeMembershipId == id,
          } &&
          matches(t))
        t,
  ];
  switch (f.sort) {
    case TaskSort.time:
      break;
    case TaskSort.priority:
      out.sort((a, b) {
        final p = b.priority.index.compareTo(a.priority.index);
        if (p != 0) return p;
        final ad = a.nextDueAt;
        final bd = b.nextDueAt;
        if (ad == null || bd == null) {
          return ad == bd ? 0 : (ad == null ? 1 : -1);
        }
        return ad.compareTo(bd);
      });
    case TaskSort.created:
      out.sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }
  return out;
}

/// Owner 2026-10-15: the board's groups — overdue, today, tomorrow, this
/// week, later, no date. [onlyNow] keeps overdue and today («Сегодня»).
List<TaskSection> groupTasksForBoard(
  List<TaskItem> tasks,
  Translator t, {
  required DateTime now,
  bool onlyNow = false,
}) {
  final today = DateTime(now.year, now.month, now.day);
  final out = <String, List<TaskItem>>{
    '0overdue': [],
    '1today': [],
    '2tomorrow': [],
    '3week': [],
    '4later': [],
    '5none': [],
  };
  for (final task in tasks) {
    final due = task.nextDueAt?.toLocal();
    if (due == null) {
      out['5none']!.add(task);
      continue;
    }
    final day = DateTime(due.year, due.month, due.day);
    final diff = day.difference(today).inDays;
    if (task.isOverdue(now) && diff < 0) {
      out['0overdue']!.add(task);
    } else if (diff <= 0) {
      out['1today']!.add(task);
    } else if (diff == 1) {
      out['2tomorrow']!.add(task);
    } else if (diff < 8) {
      out['3week']!.add(task);
    } else {
      out['4later']!.add(task);
    }
  }
  const titles = {
    '0overdue': 'tasks.overdue',
    '1today': 'tasks.today',
    '2tomorrow': 'tasks.tomorrow',
    '3week': 'tasks.thisWeek',
    '4later': 'tasks.later',
    '5none': 'tasks.noDate',
  };
  return [
    for (final e in out.entries)
      if (e.value.isNotEmpty &&
          (!onlyNow || e.key == '0overdue' || e.key == '1today'))
        (key: e.key, title: t.t(titles[e.key]!), items: e.value),
  ];
}

/// OQ-048 (owner 2026-09-30) — Mine → «Задачи»: the attorney's planner.
/// Owner 2026-10-05: «Сегодня», «Все», «Архив»; filters; swipe right —
/// done (or the next step), swipe left — later; a long press picks
/// several tasks for one action (done, assign, priority, archive, keep,
/// delete).
class TasksTab extends ConsumerStatefulWidget {
  const TasksTab({
    this.initialView = TasksView.all,
    this.showViews = true,
    super.key,
  });

  final TasksView initialView;

  /// False on the archive screen — one view, no switcher.
  final bool showViews;

  @override
  ConsumerState<TasksTab> createState() => _TasksTabState();
}

class _TasksTabState extends ConsumerState<TasksTab> {
  late TasksView _view = widget.initialView;
  TaskFilter _filter = const TaskFilter();
  final _search = TextEditingController();

  /// Owner 2026-10-19: the search field opens from the magnifier by «+».
  bool _searchOpen = false;

  void _toggleSearch() => setState(() {
        _searchOpen = !_searchOpen;
        // Closed: the search no longer narrows the list.
        if (!_searchOpen) _search.clear();
      });

  /// Owner 2026-10-05: tasks picked for one action; empty = not choosing.
  final Set<String> _picked = {};
  bool _busy = false;

  /// Owner 2026-10-15: the cards whose sub-tasks are open.
  final Set<String> _expanded = {};

  bool get _attorneySide =>
      ref.read(currentUserRoleProvider) != UserRole.client;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  TasksKey get _key => switch (_view) {
        TasksView.today || TasksView.all => (done: false, mine: false),
        TasksView.archive => (done: true, mine: false),
        TasksView.results => (done: true, mine: true),
      };

  bool get _choosing => _picked.isNotEmpty;

  /// Owner 2026-10-13: the same compose sheet as a task of a case (title,
  /// checklist, clip, calendar, bell). Owner 2026-10-19: it is the only
  /// way — the full editor with the kinds is gone.
  Future<void> _add() => showPlannerTaskSheet(context, ref);

  /// Double tap / swipe right: the next step is checked off (or the whole
  /// task when it has no steps).
  Future<void> _quickDone(TaskItem task) async {
    if (task.boardTask != null) {
      return _caseTaskDone(task, done: true);
    }
    final next = task.nextStep;
    if (task.steps.isNotEmpty) {
      if (next != null) await _toggleStep(task, next);
      return;
    }
    await _setDone(task, done: true);
  }

  /// Owner 2026-10-01: done ⇄ back to work — the status mark and "Undo"
  /// take back a checkmark set by mistake.
  Future<void> _setDone(TaskItem task, {required bool done}) async {
    if (task.boardTask != null) return _caseTaskDone(task, done: done);
    final t = ref.read(translatorProvider);
    try {
      await ref
          .read(tasksProvider(_key).notifier)
          .setStatus(task, done ? TaskStatus.done : TaskStatus.open);
      if (!mounted) return;
      showAppSnackBar(
        context,
        '${t.t(done ? 'tasks.status.done' : 'tasks.reopened')} · ${task.title}',
        actionLabel: t.t('tasks.undo'),
        onAction: () => unawaited(_undo(task.id, wasDone: done)),
      );
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  /// Owner 2026-10-15: a task of a case's workspace — through the case's own
  /// API (a task with a checklist opens the case, its lines are ticked there).
  Future<void> _caseTaskDone(TaskItem task, {required bool done}) async {
    final t = ref.read(translatorProvider);
    final b = task.boardTask!;
    if (done && task.steps.isNotEmpty && b.forClient && !b.viewerIsAttorney) {
      final unchecked = task.steps.any((s) => !s.checked);
      if (unchecked) {
        _openCase(task);
        return;
      }
    }
    try {
      await ref
          .read(caseWorkspaceActionsProvider)
          .setTaskDone(task.caseId!, b.taskId, done: done);
      invalidateAllTasks(ref);
      if (!mounted) return;
      showAppSnackBar(
        context,
        '${t.t(done ? 'tasks.status.done' : 'tasks.reopened')} · ${task.title}',
        actionLabel: t.t('tasks.undo'),
        onAction: () => unawaited(_caseTaskUndo(task, wasDone: done)),
      );
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _caseTaskUndo(TaskItem task, {required bool wasDone}) async {
    final t = ref.read(translatorProvider);
    try {
      await ref
          .read(caseWorkspaceActionsProvider)
          .setTaskDone(task.caseId!, task.boardTask!.taskId, done: !wasDone);
      invalidateAllTasks(ref);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  /// A case task opens in the case's workspace (its Tasks tab).
  void _openCase(TaskItem task) {
    final id = task.caseId;
    if (id == null) return;
    context.push(
      _attorneySide ? AppRoutes.workCase(id) : AppRoutes.myCase(id),
    );
  }

  /// Undo: straight to the server, then the lists reload (the task has
  /// already moved to the other one).
  Future<void> _undo(String id, {required bool wasDone}) async {
    final t = ref.read(translatorProvider);
    try {
      await ref.read(teamRepositoryProvider).setTaskStatus(
            id,
            wasDone ? TaskStatus.open : TaskStatus.done,
          );
      invalidateAllTasks(ref);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  /// The status mark: a task without steps is checked / unchecked; a
  /// task with steps opens (its steps are the checkmarks).
  void _markTap(TaskItem task) {
    if (task.boardTask != null) {
      unawaited(_setDone(task, done: task.status.active));
      return;
    }
    if (task.steps.isNotEmpty) {
      showTaskSheet(context, task: task, listKey: _key);
      return;
    }
    if (task.status == TaskStatus.cancelled) return;
    unawaited(_setDone(task, done: task.status.active));
  }

  /// Owner 2026-10-01: a step's box on the card — checked ↔ open.
  Future<void> _toggleStep(TaskItem task, TaskStep step) async {
    final t = ref.read(translatorProvider);
    final b = task.boardTask;
    if (b != null) {
      // A for-client checklist line: the client ticks it, the attorney may
      // take it back; the other kinds have no lines to tick here.
      if (!b.forClient) {
        _openCase(task);
        return;
      }
      try {
        await ref.read(caseWorkspaceActionsProvider).setItemDone(
              task.caseId!,
              b.taskId,
              step.id,
              done: !step.checked,
            );
        invalidateAllTasks(ref);
      } on Object catch (e) {
        if (mounted) showAppSnackBar(context, errorText(t, e));
      }
      return;
    }
    try {
      final updated = await ref.read(tasksProvider(_key).notifier).checkStep(
            task,
            step,
            step.checked ? TaskStatus.open : TaskStatus.done,
          );
      if (!mounted) return;
      if (!updated.status.active) {
        showAppSnackBar(
          context,
          '${t.t('tasks.steps.allDone')} · ${task.title}',
        );
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  /// Owner 2026-10-15: swipe left — tomorrow, at the same time (9:00 when
  /// the task has none). A task with steps moves its next step. «Undo»
  /// puts it back.
  Future<void> _tomorrow(TaskItem task) async {
    final t = ref.read(translatorProvider);
    final now = ref.read(localNowProvider);
    final base = task.nextDueAt?.toLocal();
    final to = DateTime(
      now.year,
      now.month,
      now.day + 1,
      base != null && (base.hour != 0 || base.minute != 0) ? base.hour : 9,
      base != null && (base.hour != 0 || base.minute != 0) ? base.minute : 0,
    );
    final step = task.nextStep;
    Future<void> move(DateTime at) async {
      if (step != null) {
        await ref.read(tasksProvider(_key).notifier).moveStep(task, step, at);
      } else {
        await ref.read(teamRepositoryProvider).moveTask(task.id, at);
        ref.invalidate(tasksProvider(_key));
      }
    }

    try {
      await move(to);
      if (!mounted) return;
      showAppSnackBar(
        context,
        t.t('tasks.movedTomorrow'),
        actionLabel: t.t('tasks.undo'),
        onAction: () {
          if (base != null) unawaited(move(base));
        },
      );
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  void _togglePick(TaskItem task) {
    HapticFeedback.selectionClick();
    setState(() {
      if (!_picked.remove(task.id)) _picked.add(task.id);
    });
  }

  /// Owner 2026-10-05: one action on every picked task. Deleting asks
  /// first; tasks the viewer may not touch are skipped (and counted).
  Future<void> _bulk(
    TaskBulkAction action, {
    TaskStatus? status,
    TaskPriority? priority,
    String? assigneeMembershipId,
  }) async {
    final t = ref.read(translatorProvider);
    final ids = _picked.toList();
    if (action == TaskBulkAction.delete) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AppAlertDialog(
          title: Text(t.t('tasks.bulk.deleteTitle', {'n': '${ids.length}'})),
          content: Text(t.t('tasks.bulk.deleteBody')),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(t.t('common.cancel')),
            ),
            TextButton(
              key: const ValueKey('tasks-bulk-delete-confirm'),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(t.t('tasks.delete')),
            ),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    setState(() => _busy = true);
    try {
      final r = await bulkTasks(
        ref,
        ids,
        action,
        status: status,
        priority: priority,
        assigneeMembershipId: assigneeMembershipId,
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _picked.clear();
      });
      showAppSnackBar(
        context,
        r.skipped == 0
            ? t.t('tasks.bulk.result', {'n': '${r.affected}'})
            : t.t('tasks.bulk.partly', {
                'n': '${r.affected}',
                'skipped': '${r.skipped}',
              }),
      );
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  Future<void> _bulkAssign() async {
    final t = ref.read(translatorProvider);
    final team = [
      for (final s in await ref.read(taskPeopleProvider('').future))
        if (s.source == TaskPersonSource.assistant && s.membershipId != null) s,
    ];
    if (!mounted) return;
    final i = await showChoiceSheet(
      context,
      title: t.t('tasks.assignee.title'),
      labels: [
        t.t(
          ref.read(isAssistantProvider)
              ? 'tasks.assignee.attorney'
              : 'tasks.assignee.me',
        ),
        for (final a in team) a.name,
      ],
      keyPrefix: 'bulk-assignee',
    );
    if (i == null || !mounted) return;
    await (i == 0
        ? _bulk(TaskBulkAction.unassign)
        : _bulk(
            TaskBulkAction.assign,
            assigneeMembershipId: team[i - 1].membershipId,
          ));
  }

  Future<void> _bulkPriority() async {
    final t = ref.read(translatorProvider);
    final i = await showChoiceSheet(
      context,
      title: t.t('tasks.priority.title'),
      labels: [for (final p in TaskPriority.values) taskPriorityLabel(t, p)],
      keyPrefix: 'bulk-priority',
    );
    if (i != null && mounted) {
      await _bulk(TaskBulkAction.priority, priority: TaskPriority.values[i]);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final assistant = ref.watch(isAssistantProvider);
    final canAdd = ref.watch(canDoProvider(AssistantDuty.tasks));
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final all =
        ref.watch(mergedTasksProvider(_key)).value ?? const <TaskItem>[];
    final header = _choosing
        ? _ChoosingBar(
            t: t,
            count: _picked.length,
            onClose: () => setState(_picked.clear),
            onAll: () {
              final shown = applyTaskFilter(
                all,
                _filter,
                now: ref.read(localNowProvider),
                query: _search.text,
              );
              setState(() => _picked.addAll(shown.map((x) => x.id)));
            },
          )
        // Owner 2026-10-05: the views and "Add a task" on one row, the
        // filter under them. In long languages the words shrink or end
        // with "…"; nothing slides or wraps.
        : Row(
            children: [
              // Owner 2026-10-15: one row — all, overdue, the slices of the
              // viewer's side, then the archive; «+» stays at the end.
              Expanded(
                child: _TopChips(
                  t: t,
                  filter: _filter,
                  view: _view,
                  showViews: widget.showViews,
                  attorneySide: _attorneySide,
                  assistant: assistant,
                  // Owner 2026-10-20: booking and the deadline calculator
                  // live one tap from the planner.
                  consultations:
                      !assistant && ref.watch(consultationsFlagProvider),
                  deadlines: !assistant &&
                      ref
                          .watch(featureFlagsControllerProvider)
                          .isEnabled('deadline_calculator'),
                  onScope: (scope) => setState(() {
                    _view = TasksView.all;
                    _picked.clear();
                    _filter = _filter.copyWith(scope: scope);
                  }),
                  onView: (v) => setState(() {
                    _view = v;
                    _picked.clear();
                  }),
                ),
              ),
              if (_view != TasksView.results) ...[
                const SizedBox(width: AppSpacing.xs),
                _SearchButton(
                  label: t.t(
                    _view == TasksView.archive
                        ? 'tasks.archive.search'
                        : 'tasks.search',
                  ),
                  open: _searchOpen,
                  onTap: _toggleSearch,
                ),
              ],
              if (canAdd &&
                  _view != TasksView.archive &&
                  _view != TasksView.results)
                AddTaskButton(
                  key: const ValueKey('tasks-add'),
                  label: t.t('tasks.add'),
                  onTap: _add,
                  compact: true,
                ),
            ],
          );
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.xs,
            AppSpacing.screenSide,
            0,
          ),
          child: header,
        ),
        // Audit 2026-10-18: the search box of this screen looks only in the
        // tasks of the view shown (today / all / archive): title, notes, case,
        // place, person, step. Its label says so. Owner 2026-10-19: it opens
        // from the magnifier (its cross closes it and clears the search).
        if (_view != TasksView.results) ...[
          if (_searchOpen)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.sm,
                AppSpacing.screenSide,
                0,
              ),
              child: AppTextField(
                key: ValueKey(
                  _view == TasksView.archive
                      ? 'tasks-archive-search'
                      : 'tasks-search',
                ),
                controller: _search,
                label: t.t(
                  _view == TasksView.archive
                      ? 'tasks.archive.search'
                      : 'tasks.search',
                ),
                leading: const AppIcon(AppIcons.searchRounded),
                autofocus: true,
                trailing: IconButton(
                  key: const ValueKey('tasks-search-close'),
                  tooltip: t.t('common.close'),
                  onPressed: _toggleSearch,
                  icon: AppIcon(
                    AppIcons.closeRounded,
                    color: colors.textSecondary,
                  ),
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
          if (_view == TasksView.archive) _ArchiveNote(t: t, tasks: all),
        ],
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: RefreshIndicator(
            color: colors.gold,
            backgroundColor: colors.sheet,
            onRefresh: () async {
              await ref.read(tasksProvider(_key).notifier).refresh();
              if (_view == TasksView.results) {
                ref.invalidate(teamRequestsProvider);
              }
            },
            child: _view == TasksView.results
                ? _ResultsList(t: t, formats: formats, listKey: _key)
                : _TaskList(
                    t: t,
                    formats: formats,
                    listKey: _key,
                    view: _view,
                    filter: _filter,
                    query: _search.text,
                    canAdd: canAdd,
                    onAdd: _add,
                    picked: _choosing ? _picked : null,
                    onPick: _togglePick,
                    onCheck: _quickDone,
                    onStepCheck: _toggleStep,
                    onMarkTap: _markTap,
                    onTomorrow: _tomorrow,
                    onReopen: (task) => _setDone(task, done: false),
                    onOpenCase: _openCase,
                    expanded: _expanded,
                    onToggleSteps: (id) => setState(() {
                      if (!_expanded.remove(id)) _expanded.add(id);
                    }),
                    onFilter: (f) => setState(() => _filter = f),
                    attorneySide: _attorneySide,
                    assistant: assistant,
                  ),
          ),
        ),
        if (_choosing)
          _BulkBar(
            t: t,
            busy: _busy,
            archive: _view == TasksView.archive,
            canPlan: canAdd,
            canAssign: canAdd,
            onAction: (a) async {
              switch (a) {
                case 'done':
                  await _bulk(TaskBulkAction.status, status: TaskStatus.done);
                case 'assign':
                  await _bulkAssign();
                case 'priority':
                  await _bulkPriority();
                case 'archive':
                  await _bulk(TaskBulkAction.archive);
                case 'unarchive':
                  await _bulk(TaskBulkAction.unarchive);
                case 'keep':
                  await _bulk(TaskBulkAction.keep);
                case 'unkeep':
                  await _bulk(TaskBulkAction.unkeep);
                case 'delete':
                  await _bulk(TaskBulkAction.delete);
              }
            },
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
    required this.view,
    required this.filter,
    required this.query,
    required this.canAdd,
    required this.onAdd,
    required this.picked,
    required this.onPick,
    required this.onCheck,
    required this.onStepCheck,
    required this.onMarkTap,
    required this.onTomorrow,
    required this.onReopen,
    required this.onOpenCase,
    required this.expanded,
    required this.onToggleSteps,
    required this.onFilter,
    required this.attorneySide,
    required this.assistant,
  });

  final Translator t;
  final L10nFormats formats;
  final TasksKey listKey;
  final TasksView view;
  final TaskFilter filter;
  final String query;
  final bool canAdd;
  final VoidCallback onAdd;

  /// Null = not choosing.
  final Set<String>? picked;
  final void Function(TaskItem) onPick;
  final void Function(TaskItem) onCheck;
  final void Function(TaskItem, TaskStep) onStepCheck;
  final void Function(TaskItem) onMarkTap;
  final void Function(TaskItem) onTomorrow;
  final void Function(TaskItem) onReopen;
  final void Function(TaskItem) onOpenCase;

  /// Owner 2026-10-15: the cards whose sub-tasks are open, and a way to
  /// open / close one.
  final Set<String> expanded;
  final void Function(String id) onToggleSteps;

  /// The chips / the case rings change the filter.
  final void Function(TaskFilter) onFilter;

  /// The viewer is the attorney's side (the attorney or an assistant).
  final bool attorneySide;
  final bool assistant;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(mergedTasksProvider(listKey));
    final now = ref.watch(localNowProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final archive = view == TasksView.archive;
    final choosing = picked != null;
    Widget empty(String title, String body) => PullableState(
          child: AppEmptyState(
            icon: archive
                ? AppIcons.inventory2Outlined
                : AppIcons.eventAvailableOutlined,
            title: title,
            message: body,
            action: canAdd && !archive
                ? AppButton(
                    label: t.t('tasks.add'),
                    icon: AppIcons.addRounded,
                    height: AppSizes.touchTarget,
                    onPressed: onAdd,
                  )
                : null,
          ),
        );
    switch (value) {
      case AsyncError(:final error):
        return PullableState(
          child: AppErrorState(
            message: errorText(t, error),
            onRetry: () => ref.invalidate(tasksProvider(listKey)),
          ),
        );
      case AsyncData(:final value):
        if (value.isEmpty) {
          return archive
              ? empty(
                  t.t('tasks.archive.empty'),
                  t.t('tasks.archive.emptyBody'),
                )
              : empty(t.t('tasks.empty'), t.t('tasks.empty.body'));
        }
        final shown = applyTaskFilter(value, filter, now: now, query: query);
        final sections = archive
            ? groupTasksByDay(shown, t, formats, now: now, done: true)
            : filter.sort != TaskSort.time
                ? <TaskSection>[(key: 'sorted', title: '', items: shown)]
                : groupTasksForBoard(
                    shown,
                    t,
                    now: now,
                    onlyNow: view == TasksView.today,
                  );
        final board = !archive && !choosing && !assistant
            ? _BoardHeader(
                t: t,
                formats: formats,
                active: value,
                filter: filter,
                attorneySide: attorneySide,
                onFilter: onFilter,
                now: now,
              )
            : null;
        final emptyBody = sections.isEmpty || shown.isEmpty;
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            0,
            AppSpacing.screenSide,
            AppSpacing.xxl,
          ),
          children: [
            if (board != null) board,
            if (emptyBody)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xl),
                child: PullableState(
                  child: AppEmptyState(
                    icon: AppIcons.eventAvailableOutlined,
                    title: view == TasksView.today && filter.isEmpty
                        ? t.t('tasks.today.empty')
                        : t.t('tasks.filter.empty'),
                    message: view == TasksView.today && filter.isEmpty
                        ? t.t('tasks.today.emptyBody')
                        : t.t('tasks.filter.emptyBody'),
                  ),
                ),
              ),
            for (final (si, s) in sections.indexed) ...[
              if (s.title.isNotEmpty)
                Padding(
                  padding: EdgeInsets.only(
                    top: si == 0 ? AppSpacing.xs : AppSpacing.lg,
                    bottom: AppSpacing.sm,
                  ),
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          s.title.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: typography.caption.copyWith(
                            color: s.key == '0overdue'
                                ? colors.dangerText
                                : colors.textSecondary,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.6,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7),
                        decoration: BoxDecoration(
                          color: colors.chip,
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: Text(
                          context.digits(s.items.length),
                          style: typography.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                      ),
                    ],
                  ),
                ),
              for (final (i, task) in s.items.indexed)
                AppEntrance(
                  index: i,
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: _SwipeRow(
                      key: ValueKey('swipe-${task.id}'),
                      t: t,
                      task: task,
                      enabled: !choosing,
                      onRight: archive
                          ? (task.canComplete &&
                                  task.status != TaskStatus.cancelled
                              ? () => onReopen(task)
                              : null)
                          : (task.canComplete ? () => onCheck(task) : null),
                      rightLabel: archive
                          ? t.t('tasks.reopen')
                          : task.steps.isEmpty || task.boardTask != null
                              ? t.t('tasks.done')
                              : t.t('tasks.swipe.nextStep'),
                      onLeft: !archive && task.canEdit
                          ? () => onTomorrow(task)
                          : null,
                      child: TaskRingCard(
                        key: ValueKey('task-${task.id}'),
                        task: task,
                        t: t,
                        formats: formats,
                        now: now,
                        viewerIsAttorney: attorneySide,
                        expanded: expanded.contains(task.id),
                        onToggleSteps: () => onToggleSteps(task.id),
                        selected: picked?.contains(task.id),
                        onDoubleTap:
                            choosing || !task.canComplete || !task.status.active
                                ? null
                                : () => onCheck(task),
                        onLongPress: choosing || task.boardTask != null
                            ? null
                            : () => onPick(task),
                        onTap: choosing
                            ? (task.boardTask != null
                                ? () {}
                                : () => onPick(task))
                            : task.boardTask != null
                                ? () => onOpenCase(task)
                                : task.consultationId != null
                                    ? () => context.push(
                                          ConsultationsRoutes.detail(
                                            task.consultationId!,
                                          ),
                                        )
                                    : () => showTaskSheet(
                                          context,
                                          task: task,
                                          listKey: listKey,
                                        ),
                        onMarkTap: choosing ||
                                !task.canComplete ||
                                task.status == TaskStatus.cancelled
                            ? null
                            : () => onMarkTap(task),
                        onStepCheck: choosing || !task.canComplete
                            ? null
                            : (step) => onStepCheck(task, step),
                      ),
                    ),
                  ),
                ),
            ],
          ],
        );
      default:
        return const Center(child: CircularProgressIndicator());
    }
  }
}

/// Owner 2026-10-15: the hero and the rings of the cases, above the list.
class _BoardHeader extends ConsumerWidget {
  const _BoardHeader({
    required this.t,
    required this.formats,
    required this.active,
    required this.filter,
    required this.attorneySide,
    required this.onFilter,
    required this.now,
  });

  final Translator t;
  final L10nFormats formats;
  final List<TaskItem> active;
  final TaskFilter filter;
  final bool attorneySide;
  final void Function(TaskFilter) onFilter;
  final DateTime now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final done =
        ref.watch(mergedTasksProvider((done: true, mine: false))).value ??
            const <TaskItem>[];
    final doneToday = done
        .where(
          (x) =>
              x.doneAt != null && DateUtils.isSameDay(x.doneAt!.toLocal(), now),
        )
        .length;
    // Every case with a task: how far its tasks are, open and finished.
    final cases =
        <String, ({String title, String? code, List<TaskItem> all})>{};
    for (final x in [...active, ...done]) {
      final id = x.caseId;
      if (id == null) continue;
      final cur = cases[id];
      cases[id] = (
        title: x.caseTitle ?? '',
        code: x.casePracticeCode ?? cur?.code,
        all: [...?cur?.all, x],
      );
    }
    final openCases = [
      for (final e in cases.entries)
        if (e.value.all.any((x) => x.status.active)) e,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TasksHero(
          t: t,
          formats: formats,
          active: active,
          doneToday: doneToday,
          now: now,
          firstWeekday: ref.watch(firstWeekdayProvider),
        ),
        if (openCases.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          SizedBox(
            height: 52,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: openCases.length,
              separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
              itemBuilder: (_, i) {
                final e = openCases[i];
                final progress = e.value.all.fold<double>(
                      0,
                      (a, x) => a + taskProgress(x),
                    ) /
                    e.value.all.length;
                final code = e.value.code?.split('.').first;
                return TaskCaseRing(
                  title: e.value.title.isEmpty ? '—' : e.value.title,
                  progress: progress,
                  accent: code == null
                      ? colors.goldDark
                      : practiceAccent(code, surface: practiceCardBase(colors)),
                  selected: filter.caseId == e.key,
                  onTap: () => onFilter(
                    filter.copyWith(
                      caseId: () => filter.caseId == e.key ? null : e.key,
                    ),
                  ),
                );
              },
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.sm),
      ],
    );
  }
}

/// Owner 2026-10-15: the top row — all, overdue and the slices of the
/// viewer's side, then the archive (finished tasks); scrolls when a
/// language is long, compact chips, never stretched.
class _TopChips extends StatelessWidget {
  const _TopChips({
    required this.t,
    required this.filter,
    required this.view,
    required this.showViews,
    required this.attorneySide,
    required this.assistant,
    required this.onScope,
    required this.onView,
    this.consultations = false,
    this.deadlines = false,
  });

  final bool consultations;
  final bool deadlines;

  final Translator t;
  final TaskFilter filter;
  final TasksView view;
  final bool showViews;
  final bool attorneySide;
  final bool assistant;
  final void Function(TaskScope) onScope;
  final void Function(TasksView) onView;

  @override
  Widget build(BuildContext context) {
    final onBoard = view != TasksView.archive && view != TasksView.results;
    (String, String, bool, VoidCallback) scope(
      String key,
      String label,
      TaskScope sc,
    ) =>
        (key, label, onBoard && filter.scope == sc, () => onScope(sc));
    final items = <(String, String, bool, VoidCallback)>[
      if (showViews) ...[
        scope('all', t.t('tasks.scope.all'), TaskScope.all),
        scope('overdue', t.t('tasks.overdue'), TaskScope.overdue),
        if (!assistant && attorneySide) ...[
          scope('forClient', t.t('tasks.scope.forClient'), TaskScope.forClient),
          scope('joint', t.t('tasks.scope.joint'), TaskScope.joint),
          scope('assistant', t.t('tasks.scope.assistant'), TaskScope.assistant),
        ] else if (!assistant) ...[
          scope('mine', t.t('tasks.scope.mine'), TaskScope.mine),
          scope('joint', t.t('tasks.scope.joint'), TaskScope.joint),
        ],
        (
          'done',
          t.t('tasks.view.done'),
          view == TasksView.archive,
          () => onView(TasksView.archive),
        ),
        if (assistant)
          (
            'results',
            t.t('tasks.results'),
            view == TasksView.results,
            () => onView(TasksView.results),
          ),
      ],
      if (consultations)
        (
          'consultations',
          t.t('consult.chip'),
          false,
          () => context.push(ConsultationsRoutes.list),
        ),
      if (deadlines)
        (
          'deadlines',
          t.t('consult.chip.deadlines'),
          false,
          () => context.push('/deadlines'),
        ),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final (i, (key, label, selected, onTap)) in items.indexed) ...[
            if (i > 0) const SizedBox(width: AppSpacing.xs),
            MiniChip(
              key: ValueKey('tasks-view-$key'),
              label: label,
              selected: selected,
              onTap: onTap,
            ),
          ],
        ],
      ),
    );
  }
}

/// Owner 2026-10-05: swipe right — done (or the next step), swipe left —
/// later. The card springs back; the list reloads with the result.
class _SwipeRow extends StatelessWidget {
  const _SwipeRow({
    required this.t,
    required this.task,
    required this.enabled,
    required this.onRight,
    required this.rightLabel,
    required this.onLeft,
    required this.child,
    super.key,
  });

  final Translator t;
  final TaskItem task;
  final bool enabled;
  final VoidCallback? onRight;
  final String rightLabel;
  final VoidCallback? onLeft;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    if (!enabled || (onRight == null && onLeft == null)) return child;
    Widget bg(
      IconData icon,
      String label,
      Color color, {
      required bool start,
    }) =>
        Container(
          alignment: start
              ? AlignmentDirectional.centerStart
              : AlignmentDirectional.centerEnd,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(AppRadii.card),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 170),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppIcon(icon, color: AppColorsLight.navy),
                const SizedBox(width: AppSpacing.xs),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.bodySmall.copyWith(
                      color: AppColorsLight.navy,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
    final right = onRight != null;
    final left = onLeft != null;
    final leftBg = bg(
      AppIcons.scheduleRounded,
      t.t('tasks.swipe.tomorrow'),
      colors.goldTint,
      start: false,
    );
    return Dismissible(
      key: ValueKey('dismiss-${task.id}'),
      direction: right && left
          ? DismissDirection.horizontal
          : right
              ? DismissDirection.startToEnd
              : DismissDirection.endToStart,
      background: right
          ? bg(AppIcons.checkRounded, rightLabel, colors.gold, start: true)
          : leftBg,
      secondaryBackground: right && left ? leftBg : null,
      confirmDismiss: (d) async {
        unawaited(HapticFeedback.mediumImpact());
        if (d == DismissDirection.startToEnd) {
          onRight?.call();
        } else {
          onLeft?.call();
        }
        // The card stays; the list updates from the server.
        return false;
      },
      child: child,
    );
  }
}

/// While choosing: ✕, how many, "Select all".
class _ChoosingBar extends StatelessWidget {
  const _ChoosingBar({
    required this.t,
    required this.count,
    required this.onClose,
    required this.onAll,
  });

  final Translator t;
  final int count;
  final VoidCallback onClose;
  final VoidCallback onAll;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return SizedBox(
      height: AppSizes.touchTarget,
      child: Row(
        children: [
          AppIconButton(
            key: const ValueKey('tasks-choose-close'),
            icon: const AppIcon(AppIcons.closeRounded),
            semanticLabel: t.t('common.cancel'),
            onPressed: onClose,
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(
            child: Text(
              t.t('tasks.bulk.count', {'n': '$count'}),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: typography.body.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 160),
            child: TextButton(
              key: const ValueKey('tasks-choose-all'),
              onPressed: onAll,
              child: Text(
                t.t('tasks.bulk.all'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The actions for the picked tasks, at the bottom; equal cells, the
/// words shrink into an ellipsis so nothing moves in long languages.
class _BulkBar extends StatelessWidget {
  const _BulkBar({
    required this.t,
    required this.busy,
    required this.archive,
    required this.canPlan,
    required this.canAssign,
    required this.onAction,
  });

  final Translator t;
  final bool busy;
  final bool archive;
  final bool canPlan;
  final bool canAssign;
  final Future<void> Function(String) onAction;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final actions = <(String, IconData, String)>[
      if (!archive) ('done', AppIcons.checkRounded, t.t('tasks.bulk.done')),
      if (archive)
        ('unarchive', AppIcons.unarchiveOutlined, t.t('tasks.bulk.return')),
      if (canAssign && !archive)
        ('assign', AppIcons.personAddAlt1Rounded, t.t('tasks.bulk.assign')),
      if (canPlan && !archive)
        ('priority', AppIcons.flagOutlined, t.t('tasks.bulk.priority')),
      if (!archive)
        ('archive', AppIcons.inventory2Outlined, t.t('tasks.bulk.archive')),
      if (canPlan && archive)
        ('keep', AppIcons.bookmarkRounded, t.t('tasks.bulk.keep')),
      if (canPlan && archive)
        ('unkeep', AppIcons.bookmarkRemoveOutlined, t.t('tasks.bulk.unkeep')),
      ('delete', AppIcons.deleteOutlineRounded, t.t('tasks.delete')),
    ];
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xs),
          child: busy
              ? const SizedBox(
                  height: 56,
                  child: Center(child: CircularProgressIndicator()),
                )
              : Row(
                  children: [
                    for (final (key, icon, label) in actions)
                      Expanded(
                        child: Semantics(
                          button: true,
                          label: label,
                          excludeSemantics: true,
                          child: InkWell(
                            key: ValueKey('tasks-bulk-$key'),
                            borderRadius: BorderRadius.circular(AppRadii.field),
                            onTap: () => onAction(key),
                            // Grows with large text instead of
                            // cutting the word off.
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(minHeight: 56),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  AppIcon(
                                    icon,
                                    color: key == 'delete'
                                        ? colors.dangerText
                                        : colors.text,
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    label,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    textAlign: TextAlign.center,
                                    style: typography.caption.copyWith(
                                      color: key == 'delete'
                                          ? colors.dangerText
                                          : colors.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-05: everyone is told that finished tasks are removed
/// after a year, and how to keep one.
class _ArchiveNote extends StatelessWidget {
  const _ArchiveNote({required this.t, required this.tasks});

  final Translator t;
  final List<TaskItem> tasks;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    // The retention set in admin, read off any task that will be removed.
    int? days;
    for (final x in tasks) {
      final at = x.archivedAt;
      final purge = x.purgeAt;
      if (at != null && purge != null) {
        days = purge.difference(at).inDays;
        break;
      }
    }
    // Nothing here will be removed (the cleanup is off).
    if (days == null && tasks.any((x) => x.archivedAt != null)) {
      return const SizedBox.shrink();
    }
    final text = days == null || (days >= 360 && days <= 370)
        ? t.t('tasks.archive.noteYear')
        : t.t('tasks.archive.noteDays', {'n': '$days'});
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        0,
      ),
      child: Container(
        key: const ValueKey('tasks-archive-note'),
        padding: const EdgeInsets.all(AppSpacing.sm),
        decoration: BoxDecoration(
          color: colors.iconTintFill,
          borderRadius: BorderRadius.circular(AppRadii.field),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppIcon(
              AppIcons.infoOutlineRounded,
              size: 18,
              color: colors.iconTint,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                text,
                style: typography.caption.copyWith(color: colors.text),
              ),
            ),
          ],
        ),
      ),
    );
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
    final now = ref.watch(localNowProvider);
    if (tasks.isEmpty && requests.isEmpty) {
      return PullableState(
        child: AppEmptyState(
          icon: AppIcons.markEmailReadOutlined,
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
              onTap: () => task.consultationId != null
                  ? context.push(
                      ConsultationsRoutes.detail(task.consultationId!),
                    )
                  : showTaskSheet(context, task: task, listKey: listKey),
            ),
          ),
      ],
    );
  }
}

/// Owner 2026-10-05: the archive on its own screen (the "removed soon"
/// notice opens it).
class TasksArchiveScreen extends ConsumerWidget {
  const TasksArchiveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('tasks.archive.title')),
      ),
      body: const TasksTab(
        initialView: TasksView.archive,
        showViews: false,
      ),
    );
  }
}

/// Owner 2026-10-19: the magnifier by «+» — a 32 px circle in the theme's
/// chip colour, a 44 px touch area; it opens and closes the search.
class _SearchButton extends StatelessWidget {
  const _SearchButton({
    required this.label,
    required this.open,
    required this.onTap,
  });

  final String label;
  final bool open;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      selected: open,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        key: const ValueKey('tasks-search-open'),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: colors.chip,
              shape: BoxShape.circle,
              border: Border.all(color: open ? colors.text : colors.border),
            ),
            child: AppIcon(
              AppIcons.searchRounded,
              size: 18,
              color: colors.text,
            ),
          ),
        ),
      ),
    );
  }
}
