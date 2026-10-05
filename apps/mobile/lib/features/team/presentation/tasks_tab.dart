import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_pickers.dart';
import 'package:lawbid/features/team/presentation/task_sheet.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';
import 'package:lawbid/features/team/presentation/team_widgets.dart';
import 'package:lawbid/features/team/team_routes.dart';

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
  });

  final TaskPeriod period;
  final String? caseId;

  /// `me` (not given to anyone), `mine` (given to me), or a membership id.
  final String? assignee;
  final TaskSort sort;

  bool get isEmpty =>
      period == TaskPeriod.any &&
      caseId == null &&
      assignee == null &&
      sort == TaskSort.time;

  TaskFilter copyWith({
    TaskPeriod? period,
    String? Function()? caseId,
    String? Function()? assignee,
    TaskSort? sort,
  }) =>
      TaskFilter(
        period: period ?? this.period,
        caseId: caseId == null ? this.caseId : caseId(),
        assignee: assignee == null ? this.assignee : assignee(),
        sort: sort ?? this.sort,
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

/// Owner 2026-10-05: «Сегодня» by time of day — overdue, morning,
/// afternoon, evening.
List<TaskSection> groupTasksForToday(
  List<TaskItem> tasks,
  Translator t, {
  required DateTime now,
}) {
  final today = DateTime(now.year, now.month, now.day);
  final out = <String, List<TaskItem>>{
    'overdue': [],
    'morning': [],
    'afternoon': [],
    'evening': [],
  };
  for (final task in tasks) {
    final due = task.nextDueAt?.toLocal();
    if (due == null) continue;
    final day = DateTime(due.year, due.month, due.day);
    if (task.isOverdue(now) && day.isBefore(today)) {
      out['overdue']!.add(task);
    } else if (day == today) {
      out[due.hour < 12
              ? 'morning'
              : due.hour < 17
                  ? 'afternoon'
                  : 'evening']!
          .add(task);
    }
  }
  return [
    for (final e in out.entries)
      if (e.value.isNotEmpty)
        (
          key: e.key == 'overdue' ? '0overdue' : e.key,
          title: t.t(
            e.key == 'overdue' ? 'tasks.overdue' : 'tasks.today.${e.key}',
          ),
          items: e.value,
        ),
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

  /// Owner 2026-10-05: tasks picked for one action; empty = not choosing.
  final Set<String> _picked = {};
  bool _busy = false;

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

  Future<void> _add() async {
    final created = await context.push<bool>(TeamRoutes.newTask);
    if (created ?? false) invalidateAllTasks(ref);
  }

  /// Double tap / swipe right: the next step is checked off (or the whole
  /// task when it has no steps).
  Future<void> _quickDone(TaskItem task) async {
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

  /// Owner 2026-10-05: swipe left — later: in an hour, this evening,
  /// tomorrow morning, a day later, next week, or a chosen time. A task
  /// with steps moves its next step.
  Future<void> _snooze(TaskItem task) async {
    final t = ref.read(translatorProvider);
    final now = DateTime.now();
    final base = task.nextDueAt?.toLocal();
    final evening = DateTime(now.year, now.month, now.day, 18);
    final tomorrow = DateTime(now.year, now.month, now.day + 1, 9);
    final choices = <(String, DateTime?)>[
      (t.t('tasks.snooze.hour'), now.add(const Duration(hours: 1))),
      if (now.isBefore(evening.subtract(const Duration(minutes: 30))))
        (t.t('tasks.snooze.evening'), evening),
      (t.t('tasks.snooze.tomorrow'), tomorrow),
      if (base != null)
        (t.t('tasks.snooze.dayLater'), base.add(const Duration(days: 1))),
      (
        t.t('tasks.snooze.week'),
        DateTime(
          now.year,
          now.month,
          now.day + 7,
          base?.hour ?? 9,
          base?.minute ?? 0,
        ),
      ),
      (t.t('tasks.snooze.pick'), null),
    ];
    final i = await showChoiceSheet(
      context,
      title: t.t('tasks.snooze.title'),
      labels: [for (final c in choices) c.$1],
      keyPrefix: 'snooze',
    );
    if (i == null || !mounted) return;
    final to = choices[i].$2 ?? await pickDateTime(context, initial: base);
    if (to == null || !mounted) return;
    try {
      final step = task.nextStep;
      if (step != null) {
        await ref.read(tasksProvider(_key).notifier).moveStep(task, step, to);
      } else {
        await ref.read(teamRepositoryProvider).moveTask(task.id, to);
        ref.invalidate(tasksProvider(_key));
      }
      if (!mounted) return;
      showAppSnackBar(
        context,
        t.t('tasks.rescheduled', {
          'date': ref.read(l10nFormatsProvider).dateTime(to),
        }),
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
        builder: (ctx) => AlertDialog(
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

  Future<void> _openFilter(List<TaskItem> all) async {
    final t = ref.read(translatorProvider);
    final cases = <String, String>{
      for (final x in all)
        if (x.caseId != null) x.caseId!: x.caseTitle ?? '',
    };
    final team = <String, String>{
      for (final x in all)
        if (x.assigneeMembershipId != null)
          x.assigneeMembershipId!: x.assigneeName ?? '',
    };
    final next = await showAppBottomSheet<TaskFilter>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FilterSheet(
        t: t,
        initial: _filter,
        cases: cases,
        team: team,
        assistant: ref.read(isAssistantProvider),
        archive: _view == TasksView.archive,
      ),
    );
    if (next != null && mounted) setState(() => _filter = next);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final assistant = ref.watch(isAssistantProvider);
    final canAdd = ref.watch(canDoProvider(AssistantDuty.tasks));
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final all = ref.watch(tasksProvider(_key)).value ?? const <TaskItem>[];
    final views = [
      (TasksView.today, 'today', t.t('tasks.view.today')),
      (TasksView.all, 'active', t.t('tasks.view.active')),
      (TasksView.archive, 'done', t.t('tasks.view.done')),
      if (assistant) (TasksView.results, 'results', t.t('tasks.results')),
    ];
    final header = _choosing
        ? _ChoosingBar(
            t: t,
            count: _picked.length,
            onClose: () => setState(_picked.clear),
            onAll: () {
              final shown = applyTaskFilter(
                all,
                _filter,
                now: DateTime.now(),
                query: _search.text,
              );
              setState(() => _picked.addAll(shown.map((x) => x.id)));
            },
          )
        // Owner 2026-10-05: the views and "Add a task" on one row, the
        // filter under them. In long languages the words shrink or end
        // with "…"; nothing slides or wraps.
        : Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  if (widget.showViews)
                    Flexible(
                      flex: 3,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (final (i, (v, key, label)) in views.indexed) ...[
                            if (i > 0) const SizedBox(width: AppSpacing.sm),
                            Flexible(
                              child: AppChip(
                                key: ValueKey('tasks-view-$key'),
                                label: label,
                                fitLabel: true,
                                selected: _view == v,
                                onTap: () => setState(() {
                                  _view = v;
                                  _picked.clear();
                                }),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  if (canAdd &&
                      _view != TasksView.archive &&
                      _view != TasksView.results) ...[
                    const SizedBox(width: AppSpacing.sm),
                    Flexible(
                      flex: 2,
                      child: AddTaskButton(
                        key: const ValueKey('tasks-add'),
                        label: t.t('tasks.add'),
                        onTap: _add,
                      ),
                    ),
                  ],
                ],
              ),
              if (_view != TasksView.results) ...[
                const SizedBox(height: AppSpacing.xs),
                _FilterButton(
                  t: t,
                  filter: _filter,
                  onOpen: () => _openFilter(all),
                  onClear: () => setState(() => _filter = const TaskFilter()),
                ),
              ],
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
        if (_view == TasksView.archive) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.sm,
              AppSpacing.screenSide,
              0,
            ),
            child: AppTextField(
              key: const ValueKey('tasks-archive-search'),
              controller: _search,
              label: t.t('tasks.archive.search'),
              leading: const AppIcon(AppIcons.searchRounded),
              onChanged: (_) => setState(() {}),
            ),
          ),
          _ArchiveNote(t: t, tasks: all),
        ],
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: RefreshIndicator(
            color: colors.gold,
            backgroundColor: colors.surface,
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
                    query: _view == TasksView.archive ? _search.text : '',
                    canAdd: canAdd,
                    onAdd: _add,
                    picked: _choosing ? _picked : null,
                    onPick: _togglePick,
                    onCheck: _quickDone,
                    onStepCheck: _toggleStep,
                    onMarkTap: _markTap,
                    onSnooze: _snooze,
                    onReopen: (task) => _setDone(task, done: false),
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
    required this.onSnooze,
    required this.onReopen,
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
  final void Function(TaskItem) onSnooze;
  final void Function(TaskItem) onReopen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(tasksProvider(listKey));
    final now = DateTime.now();
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
        final sections = view == TasksView.today
            ? groupTasksForToday(shown, t, now: now)
            : filter.sort != TaskSort.time
                ? <TaskSection>[(key: 'sorted', title: '', items: shown)]
                : groupTasksByDay(
                    shown,
                    t,
                    formats,
                    now: now,
                    done: listKey.done,
                  );
        if (sections.isEmpty || shown.isEmpty) {
          return view == TasksView.today && filter.isEmpty
              ? empty(t.t('tasks.today.empty'), t.t('tasks.today.emptyBody'))
              : empty(
                  t.t('tasks.filter.empty'),
                  t.t('tasks.filter.emptyBody'),
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
            if (!choosing && !archive)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Text(
                  t.t('tasks.gesturesHint'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style:
                      typography.caption.copyWith(color: colors.textSecondary),
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
                      if (view == TasksView.today && s.key != '0overdue') ...[
                        AppIcon(
                          switch (s.key) {
                            'morning' => AppIcons.wbSunnyOutlined,
                            'afternoon' => AppIcons.lightModeOutlined,
                            _ => AppIcons.nightlightRound,
                          },
                          size: 18,
                          color: colors.goldDark,
                        ),
                        const SizedBox(width: AppSpacing.xs),
                      ],
                      Flexible(
                        child: Text(
                          s.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: typography.body.copyWith(
                            color: s.key == '0overdue'
                                ? colors.dangerText
                                : colors.text,
                            fontWeight: FontWeight.w700,
                          ),
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
                          : task.steps.isEmpty
                              ? t.t('tasks.done')
                              : t.t('tasks.swipe.nextStep'),
                      onLeft: !archive && task.canEdit
                          ? () => onSnooze(task)
                          : null,
                      child: TaskRow(
                        key: ValueKey('task-${task.id}'),
                        task: task,
                        t: t,
                        formats: formats,
                        now: now,
                        selected: picked?.contains(task.id),
                        onLongPress: choosing ? null : () => onPick(task),
                        onTap: choosing
                            ? () => onPick(task)
                            : () => showTaskSheet(
                                  context,
                                  task: task,
                                  listKey: listKey,
                                ),
                        onCheck:
                            choosing || !task.canComplete || !task.status.active
                                ? null
                                : () => onCheck(task),
                        onStepCheck: choosing || !task.canComplete
                            ? null
                            : (step) => onStepCheck(task, step),
                        onMarkTap: choosing ||
                                !task.canComplete ||
                                task.status == TaskStatus.cancelled
                            ? null
                            : () => onMarkTap(task),
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
      t.t('tasks.snooze.short'),
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
          color: colors.goldTint,
          borderRadius: BorderRadius.circular(AppRadii.field),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppIcon(
              AppIcons.infoOutlineRounded,
              size: 18,
              color: colors.goldDark,
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

/// "Filter" — or the filters in use, with ✕ to reset them.
class _FilterButton extends StatelessWidget {
  const _FilterButton({
    required this.t,
    required this.filter,
    required this.onOpen,
    required this.onClear,
  });

  final Translator t;
  final TaskFilter filter;
  final VoidCallback onOpen;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final parts = [
      if (filter.period != TaskPeriod.any)
        t.t('tasks.filter.period.${filter.period.name}'),
      if (filter.caseId != null) t.t('tasks.filter.byCase'),
      if (filter.assignee != null) t.t('tasks.filter.byAssignee'),
      if (filter.sort != TaskSort.time)
        t.t('tasks.filter.sort.${filter.sort.name}'),
    ];
    final active = parts.isNotEmpty;
    final label = active ? parts.join(' · ') : t.t('tasks.filter.title');
    return Row(
      children: [
        Flexible(
          child: Semantics(
            button: true,
            label: '${t.t('tasks.filter.title')}: $label',
            excludeSemantics: true,
            child: InkWell(
              key: const ValueKey('tasks-filter'),
              onTap: onOpen,
              borderRadius: BorderRadius.circular(AppRadii.pill),
              child: ConstrainedBox(
                constraints:
                    const BoxConstraints(minHeight: AppSizes.touchTarget),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AppIcon(
                      AppIcons.tuneRounded,
                      size: 20,
                      color: active ? colors.goldDark : colors.text,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.bodySmall.copyWith(
                          color: active ? colors.goldDark : colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (active)
          AppIconButton(
            key: const ValueKey('tasks-filter-clear'),
            icon: const AppIcon(AppIcons.closeRounded, size: 18),
            semanticLabel: t.t('tasks.filter.reset'),
            onPressed: onClear,
          ),
      ],
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({
    required this.t,
    required this.initial,
    required this.cases,
    required this.team,
    required this.assistant,
    required this.archive,
  });

  final Translator t;
  final TaskFilter initial;
  final Map<String, String> cases;
  final Map<String, String> team;
  final bool assistant;
  final bool archive;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late TaskFilter _f = widget.initial;

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget head(String key) => Padding(
          padding: const EdgeInsets.only(
            top: AppSpacing.md,
            bottom: AppSpacing.sm,
          ),
          child: Text(
            t.t(key),
            style: typography.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w700,
            ),
          ),
        );
    Widget chips<T>(
      List<(T, String)> items,
      T selected,
      void Function(T) onPick,
      String keyPrefix,
    ) =>
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            for (final (v, label) in items)
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.sizeOf(context).width - 48,
                ),
                child: AppChip(
                  key: ValueKey('$keyPrefix-$v'),
                  label: label,
                  fitLabel: true,
                  selected: v == selected,
                  onTap: () => setState(() => onPick(v)),
                ),
              ),
          ],
        );
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            0,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          children: [
            Text(
              t.t('tasks.filter.title'),
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            if (!widget.archive) ...[
              head('tasks.filter.period'),
              chips(
                [
                  for (final p in TaskPeriod.values)
                    (p, t.t('tasks.filter.period.${p.name}')),
                ],
                _f.period,
                (v) => _f = _f.copyWith(period: v),
                'filter-period',
              ),
            ],
            if (widget.cases.isNotEmpty) ...[
              head('tasks.filter.case'),
              chips<String?>(
                [
                  (null, t.t('tasks.filter.all')),
                  for (final e in widget.cases.entries)
                    (e.key, e.value.isEmpty ? '—' : e.value),
                ],
                _f.caseId,
                (v) => _f = _f.copyWith(caseId: () => v),
                'filter-case',
              ),
            ],
            head('tasks.filter.assignee'),
            chips<String?>(
              [
                (null, t.t('tasks.filter.all')),
                if (widget.assistant)
                  ('mine', t.t('tasks.filter.assignedToMe'))
                else
                  ('me', t.t('tasks.filter.notAssigned')),
                if (!widget.assistant)
                  for (final e in widget.team.entries) (e.key, e.value),
              ],
              _f.assignee,
              (v) => _f = _f.copyWith(assignee: () => v),
              'filter-assignee',
            ),
            head('tasks.filter.sort'),
            chips(
              [
                for (final s in TaskSort.values)
                  (s, t.t('tasks.filter.sort.${s.name}')),
              ],
              _f.sort,
              (v) => _f = _f.copyWith(sort: v),
              'filter-sort',
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: AppButton(
                    key: const ValueKey('filter-reset'),
                    label: t.t('tasks.filter.reset'),
                    variant: AppButtonVariant.secondary,
                    onPressed: () =>
                        Navigator.of(context).pop(const TaskFilter()),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppButton(
                    key: const ValueKey('filter-apply'),
                    label: t.t('tasks.filter.apply'),
                    onPressed: () => Navigator.of(context).pop(_f),
                  ),
                ),
              ],
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
    final now = DateTime.now();
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
              onTap: () => showTaskSheet(context, task: task, listKey: listKey),
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
