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
import 'package:lawbid/features/team/presentation/task_editor_screen.dart'
    show normalizeTaskPhone;
import 'package:lawbid/features/team/presentation/task_links.dart';
import 'package:lawbid/features/team/presentation/task_pickers.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens a task: everything about it and — for the attorney — take /
/// done / not done (note + new time) / cancel. Returns the updated task.
Future<TaskItem?> showTaskSheet(
  BuildContext context, {
  required TaskItem task,
  required TasksKey listKey,
}) =>
    showAppBottomSheet<TaskItem>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TaskSheet(task: task, listKey: listKey),
    );

/// The outcome of a finished task: a note and, for "not done", an
/// optional new date/time.
Future<({String? note, DateTime? rescheduleTo})?> askTaskOutcome(
  BuildContext context,
  Translator t, {
  required bool done,
  DateTime? currentDue,
}) =>
    showAppBottomSheet<({String? note, DateTime? rescheduleTo})>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _OutcomeSheet(t: t, done: done, currentDue: currentDue),
    );

/// Date then time picker; null when cancelled at the date.
Future<DateTime?> pickDateTime(
  BuildContext context, {
  DateTime? initial,
}) async {
  final now = DateTime.now();
  final base = initial ?? now.add(const Duration(hours: 1));
  final date = await showDatePicker(
    context: context,
    initialDate: base.isBefore(now) ? now : base,
    firstDate: DateTime(now.year - 1),
    lastDate: DateTime(now.year + 5),
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(base),
  );
  return DateTime(
    date.year,
    date.month,
    date.day,
    time?.hour ?? 9,
    time?.minute ?? 0,
  );
}

/// Owner 2026-10-01: writes one checklist step (a call, a meeting, an
/// address…) — title, its own time, place and contact.
Future<TaskStepDraft?> showStepEditor(
  BuildContext context, {
  required TaskKind taskKind,
}) =>
    showAppBottomSheet<TaskStepDraft>(
      context: context,
      isScrollControlled: true,
      builder: (_) => StepEditorSheet(taskKind: taskKind),
    );

class StepEditorSheet extends ConsumerStatefulWidget {
  const StepEditorSheet({required this.taskKind, super.key});

  final TaskKind taskKind;

  @override
  ConsumerState<StepEditorSheet> createState() => _StepEditorSheetState();
}

class _StepEditorSheetState extends ConsumerState<StepEditorSheet> {
  final _title = TextEditingController();
  final _place = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  late TaskKind _kind = widget.taskKind;
  DateTime? _at;
  String? _error;

  static final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  @override
  void dispose() {
    for (final c in [_title, _place, _name, _phone, _email]) {
      c.dispose();
    }
    super.dispose();
  }

  void _save() {
    final t = ref.read(translatorProvider);
    final phone = normalizeTaskPhone(_phone.text) ?? '!';
    final email = _email.text.trim();
    String? error;
    if (_title.text.trim().isEmpty) {
      error = t.t('post.create.required');
    } else if (phone == '!') {
      error = t.t('tasks.phoneInvalid');
    } else if (email.isNotEmpty && !_emailRe.hasMatch(email)) {
      error = t.t('tasks.emailInvalid');
    }
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    String? v(TextEditingController c) =>
        c.text.trim().isEmpty ? null : c.text.trim();
    Navigator.of(context).pop(
      TaskStepDraft(
        title: _title.text.trim(),
        kind: _kind == widget.taskKind ? null : _kind,
        dueAt: _at,
        location: v(_place),
        contactName: v(_name),
        contactPhone: phone.isEmpty ? null : phone,
        contactEmail: email.isEmpty ? null : email,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget field(
      String key,
      TextEditingController c,
      String hint, {
      TextInputType? type,
      IconData? icon,
    }) =>
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: AppTextField(
            key: ValueKey(key),
            controller: c,
            hintText: hint,
            semanticLabel: hint,
            keyboardType: type,
            leading: icon == null ? null : AppIcon(icon, size: 18),
          ),
        );
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              t.t('tasks.steps.new'),
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final k in TaskKind.values)
                    Padding(
                      padding:
                          const EdgeInsetsDirectional.only(end: AppSpacing.sm),
                      child: AppChip(
                        key: ValueKey('step-kind-${k.wire}'),
                        label: taskKindLabel(t, k),
                        selected: _kind == k,
                        onTap: () => setState(() => _kind = k),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            field(
              'step-title',
              _title,
              t.t('tasks.steps.titleHint'),
              icon: AppIcons.shortTextRounded,
            ),
            AppListRow(
              key: const ValueKey('step-when'),
              icon: AppIcons.scheduleRounded,
              label: _at == null
                  ? t.t('tasks.steps.pickTime')
                  : formats.dateTime(_at!),
              onTap: () async {
                final at = await pickDateTime(context, initial: _at);
                if (at != null && mounted) setState(() => _at = at);
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            field(
              'step-place',
              _place,
              t.t('tasks.steps.placeHint'),
              icon: AppIcons.placeOutlined,
            ),
            field(
              'step-name',
              _name,
              t.t('tasks.steps.whoHint'),
              icon: AppIcons.personOutlineRounded,
            ),
            field(
              'step-phone',
              _phone,
              t.t('tasks.field.contactPhone'),
              type: TextInputType.phone,
              icon: AppIcons.callOutlined,
            ),
            field(
              'step-email',
              _email,
              t.t('tasks.f.email'),
              type: TextInputType.emailAddress,
              icon: AppIcons.mailOutlineRounded,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Text(
                  _error!,
                  style:
                      typography.bodySmall.copyWith(color: colors.dangerText),
                ),
              ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('step-save'),
              label: t.t('tasks.steps.add'),
              icon: AppIcons.addRounded,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskSheet extends ConsumerStatefulWidget {
  const _TaskSheet({required this.task, required this.listKey});

  final TaskItem task;
  final TasksKey listKey;

  @override
  ConsumerState<_TaskSheet> createState() => _TaskSheetState();
}

class _TaskSheetState extends ConsumerState<_TaskSheet> {
  late TaskItem _task = widget.task;
  bool _busy = false;

  Future<void> _set(
    TaskStatus status, {
    String? note,
    DateTime? rescheduleTo,
  }) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final updated = await ref
          .read(tasksProvider(widget.listKey).notifier)
          .setStatus(_task, status, note: note, rescheduleTo: rescheduleTo);
      if (!mounted) return;
      Navigator.of(context).pop(updated);
      if (rescheduleTo != null) {
        showAppSnackBar(
          context,
          t.t('tasks.rescheduled', {
            'date': ref.read(l10nFormatsProvider).dateTime(rescheduleTo),
          }),
        );
      }
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  TasksController get _ctrl => ref.read(tasksProvider(widget.listKey).notifier);

  Future<void> _stepOp(Future<TaskItem> Function() op) async {
    final t = ref.read(translatorProvider);
    try {
      final updated = await op();
      if (!mounted) return;
      setState(() => _task = updated);
      if (!updated.status.active && _task.steps.isNotEmpty) {
        showAppSnackBar(context, t.t('tasks.steps.allDone'));
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _toggle(TaskStep step) => _stepOp(
        () => _ctrl.checkStep(
          _task,
          step,
          step.checked ? TaskStatus.open : TaskStatus.done,
        ),
      );

  Future<void> _addStep() async {
    final d = await showStepEditor(context, taskKind: _task.kind);
    if (d == null || !mounted) return;
    await _stepOp(() => _ctrl.addStep(_task, d));
  }

  /// A step's actions: check / not done with a note / move / call /
  /// write / map / remove.
  Future<void> _stepMenu(TaskStep step, {required bool canPlan}) async {
    final t = ref.read(translatorProvider);
    final active = _task.status.active;
    // Checkmarks also on a finished task (taking one back reopens it);
    // the attorney and the assistant the task is given to.
    final checkable = _task.canComplete && _task.status != TaskStatus.cancelled;
    final hasAny = checkable ||
        (canPlan && active) ||
        (step.contactPhone?.isNotEmpty ?? false) ||
        (step.contactEmail?.isNotEmpty ?? false) ||
        (step.location?.isNotEmpty ?? false);
    // Nothing to offer (e.g. an assistant without the tasks duty).
    if (!hasAny) return;
    final choice = await showAppBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (checkable) ...[
                AppListRow(
                  key: const ValueKey('step-act-done'),
                  icon: step.status == TaskStatus.done
                      ? AppIcons.undoRounded
                      : AppIcons.checkRounded,
                  label: step.status == TaskStatus.done
                      ? t.t('tasks.steps.reopen')
                      : t.t('tasks.done'),
                  onTap: () => Navigator.of(ctx).pop('done'),
                ),
                if (step.status != TaskStatus.notDone)
                  AppListRow(
                    key: const ValueKey('step-act-not'),
                    icon: AppIcons.closeRounded,
                    label: t.t('tasks.notDone'),
                    onTap: () => Navigator.of(ctx).pop('not'),
                  ),
              ],
              if (canPlan && active && !step.checked)
                AppListRow(
                  key: const ValueKey('step-act-move'),
                  icon: AppIcons.scheduleRounded,
                  label: t.t('tasks.steps.move'),
                  onTap: () => Navigator.of(ctx).pop('move'),
                ),
              if (step.contactPhone?.isNotEmpty ?? false)
                AppListRow(
                  icon: AppIcons.callOutlined,
                  label: '${t.t('tasks.call')} · ${step.contactPhone}',
                  onTap: () => Navigator.of(ctx).pop('call'),
                ),
              if (step.contactEmail?.isNotEmpty ?? false)
                AppListRow(
                  icon: AppIcons.mailOutlineRounded,
                  label: '${t.t('tasks.write')} · ${step.contactEmail}',
                  onTap: () => Navigator.of(ctx).pop('mail'),
                ),
              if (step.location?.isNotEmpty ?? false)
                AppListRow(
                  icon: AppIcons.mapOutlined,
                  label: t.t('tasks.map'),
                  onTap: () => Navigator.of(ctx).pop('map'),
                ),
              if (canPlan && active)
                AppListRow(
                  key: const ValueKey('step-act-remove'),
                  icon: AppIcons.deleteOutlineRounded,
                  label: t.t('tasks.steps.remove'),
                  onTap: () => Navigator.of(ctx).pop('remove'),
                ),
            ],
          ),
        ),
      ),
    );
    if (choice == null || !mounted) return;
    switch (choice) {
      case 'done':
        await _toggle(step);
      case 'not':
        final r = await askTaskOutcome(context, t, done: false);
        if (r == null || !mounted) return;
        final to = r.rescheduleTo;
        await _stepOp(
          () => to == null
              ? _ctrl.checkStep(_task, step, TaskStatus.notDone, note: r.note)
              // "Not done, move it": one request, the step stays open.
              : _ctrl.rescheduleStep(_task, step, to, note: r.note),
        );
      case 'move':
        final at = await pickDateTime(context, initial: step.dueAt);
        if (at != null && mounted) {
          await _stepOp(() => _ctrl.moveStep(_task, step, at));
        }
      case 'call':
        await TaskLinks.open(TaskLinks.call(step.contactPhone!));
      case 'mail':
        await TaskLinks.open(
          TaskLinks.mail(step.contactEmail!, subject: step.title),
        );
      case 'map':
        if (!mounted) return;
        await showPlaceActions(
          context,
          t,
          TaskPlace(address: step.location!),
        );
      case 'remove':
        await _stepOp(() => _ctrl.removeStep(_task, step));
    }
  }

  Future<void> _delete() async {
    final t = ref.read(translatorProvider);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(t.t('tasks.delete.title')),
        content: Text(t.t('tasks.delete.body')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            key: const ValueKey('task-delete-confirm'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(t.t('tasks.delete')),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(teamRepositoryProvider).deleteTask(_task.id);
      invalidateAllTasks(ref);
      if (!mounted) return;
      Navigator.of(context).pop();
      showAppSnackBar(context, t.t('tasks.deleted'));
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  /// Owner 2026-10-05: "keep forever" — the yearly archive cleanup
  /// leaves this task alone; and "back from the archive".
  Future<void> _archiveOp(TaskBulkAction action) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await ref.read(teamRepositoryProvider).bulkTasks([_task.id], action);
      invalidateAllTasks(ref);
      final updated = await ref.read(teamRepositoryProvider).task(_task.id);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _task = updated;
      });
      showAppSnackBar(
        context,
        t.t(
          switch (action) {
            TaskBulkAction.keep => 'tasks.keep.on',
            TaskBulkAction.unkeep => 'tasks.keep.off',
            _ => 'tasks.reopened',
          },
        ),
      );
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  Future<void> _finish(bool done) async {
    final t = ref.read(translatorProvider);
    final r = await askTaskOutcome(
      context,
      t,
      done: done,
      currentDue: _task.dueAt,
    );
    if (r == null || !mounted) return;
    await _set(
      done ? TaskStatus.done : TaskStatus.notDone,
      note: r.note,
      rescheduleTo: r.rescheduleTo,
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final canPlan = ref.watch(canDoProvider(AssistantDuty.tasks));
    final task = _task;
    final active = task.status.active;
    final canComplete = task.canComplete;
    final now = DateTime.now();
    final remind = task.dueAt == null ? null : task.remindBeforeMin;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          0,
          AppSpacing.screenSide,
          AppSpacing.xxl,
        ),
        children: [
          Row(
            children: [
              TaskKindMedallion(kind: task.kind, size: 48),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      taskKindLabel(t, task.kind).toUpperCase(),
                      style: typography.caption.copyWith(
                        color: colors.goldDark,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.1,
                      ),
                    ),
                    Text(
                      taskStatusLabel(t, task.status),
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            task.title,
            style: typography.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.lg),
          if (task.dueAt != null)
            _InfoRow(
              icon: AppIcons.eventOutlined,
              text: formats.dateTime(task.dueAt!),
              danger: task.isOverdue(DateTime.now()),
            ),
          if (task.dueAt != null && remind != null)
            _InfoRow(
              icon: AppIcons.notificationsActiveOutlined,
              text: taskRemindLabel(t, remind),
            ),
          if (task.repeat != TaskRepeat.none)
            _InfoRow(
              icon: AppIcons.eventRepeatRounded,
              text: task.repeatUntil == null
                  ? taskRepeatLabel(t, task.repeat)
                  : '${taskRepeatLabel(t, task.repeat)} · '
                      '${t.t('tasks.repeat.until', {
                          'date': formats.dateLong(task.repeatUntil!),
                        })}',
            ),
          if (task.priority != TaskPriority.normal)
            _InfoRow(
              icon: AppIcons.flagOutlined,
              text: taskPriorityLabel(t, task.priority),
              danger: task.priority == TaskPriority.urgent,
            ),
          if (task.assigneeName != null)
            _InfoRow(
              icon: AppIcons.personAddAlt1Rounded,
              text: t.t('tasks.assignee.to', {
                'name': task.assignedToMe
                    ? t.t('tasks.assignee.you')
                    : task.assigneeName!,
              }),
            ),
          // Owner 2026-10-05: every address opens in the maps; every
          // person — a call, an email, the chat.
          if (task.places.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            _SheetSection(
              title: t.t('tasks.places.title'),
              children: [
                for (final (i, p) in task.places.indexed)
                  _PlaceTile(
                    key: ValueKey('sheet-place-$i'),
                    place: p,
                    t: t,
                  ),
              ],
            ),
          ],
          if (task.people.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            _SheetSection(
              title: t.t('tasks.people.title'),
              children: [
                for (final (i, p) in task.people.indexed)
                  _PersonTile(
                    key: ValueKey('sheet-person-$i'),
                    person: p,
                    subject: task.title,
                    t: t,
                  ),
              ],
            ),
          ],
          if (task.caseTitle?.isNotEmpty ?? false)
            _InfoRow(icon: AppIcons.workOutlineRounded, text: task.caseTitle!),
          if (task.notes?.isNotEmpty ?? false) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              task.notes!,
              style: typography.body.copyWith(color: colors.text),
            ),
          ],
          // Owner 2026-10-01: the checklist — every step with its own
          // time; the attorney checks them off one by one.
          if (task.steps.isNotEmpty || (canPlan && active)) ...[
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: Text(
                    t.t('tasks.steps.title'),
                    style: typography.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (canPlan && active)
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 180),
                    child: TextButton.icon(
                      key: const ValueKey('task-step-add'),
                      onPressed: _addStep,
                      icon: AppIcon(
                        AppIcons.addRounded,
                        size: 18,
                        color: colors.goldDark,
                      ),
                      label: Text(
                        t.t('tasks.steps.add'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: colors.goldDark),
                      ),
                    ),
                  ),
              ],
            ),
            if (task.steps.isNotEmpty) ...[
              TaskProgress(
                done: task.checkedSteps,
                total: task.steps.length,
                label: t.t('tasks.steps.progress', {
                  'done': '${task.checkedSteps}',
                  'total': '${task.steps.length}',
                }),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.xs,
                ),
                child: Column(
                  children: [
                    for (final (i, step) in task.steps.indexed) ...[
                      if (i > 0) Divider(height: 1, color: colors.border),
                      TaskStepTile(
                        key: ValueKey('sheet-step-${step.id}'),
                        step: step,
                        t: t,
                        formats: formats,
                        now: now,
                        // Finished tasks too: unchecking reopens them.
                        onCheck:
                            !canComplete || task.status == TaskStatus.cancelled
                                ? null
                                : () => _toggle(step),
                        onTap: () => _stepMenu(step, canPlan: canPlan),
                      ),
                    ],
                  ],
                ),
              ),
            ] else
              Text(
                t.t('tasks.steps.emptyHint'),
                style:
                    typography.bodySmall.copyWith(color: colors.textSecondary),
              ),
          ],
          if (task.files.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('tasks.field.files'),
              style: typography.body.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            // Owner 2026-10-07: three to a row across the whole width (no
            // empty strip on the right).
            LayoutBuilder(
              builder: (context, box) {
                final side = (box.maxWidth - AppSpacing.sm * 2) / 3;
                return Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final (i, f) in task.files.indexed)
                      _FileTile(
                        file: f,
                        index: i + 1,
                        side: side,
                        photos: task.files,
                        closeLabel: t.t('common.close'),
                      ),
                  ],
                );
              },
            ),
          ],
          if (task.outcomeNote?.isNotEmpty ?? false) ...[
            const SizedBox(height: AppSpacing.lg),
            AppCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppIcon(
                    AppIcons.chatBubbleOutlineRounded,
                    size: AppSizes.iconSm,
                    color: colors.gold,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      task.outcomeNote!,
                      style: typography.body.copyWith(color: colors.text),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          Text(
            task.createdByName == null
                ? t.t('tasks.byMe')
                : t.t('tasks.by', {'name': task.createdByName!}),
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xl),
          // Owner 2026-10-05: the archive — when it goes, keep forever.
          if (task.archived) ...[
            _ArchiveCard(
              t: t,
              task: task,
              formats: formats,
              busy: _busy,
              canKeep: task.canEdit,
              onKeep: (keep) => _archiveOp(
                keep ? TaskBulkAction.keep : TaskBulkAction.unkeep,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          if (active && canComplete) ...[
            if (task.status == TaskStatus.open) ...[
              AppButton(
                key: const ValueKey('task-take'),
                label: t.t('tasks.take'),
                icon: AppIcons.playArrowRounded,
                variant: AppButtonVariant.secondary,
                isLoading: _busy,
                onPressed: () => _set(TaskStatus.taken),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            AppButton(
              key: const ValueKey('task-done'),
              label: t.t('tasks.done'),
              icon: AppIcons.checkRounded,
              isLoading: _busy,
              onPressed: () => _finish(true),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('task-not-done'),
              label: t.t('tasks.notDone'),
              icon: AppIcons.closeRounded,
              variant: AppButtonVariant.secondary,
              isLoading: _busy,
              onPressed: () => _finish(false),
            ),
          ],
          // Owner 2026-10-01: every card is editable and deletable — the
          // owner any; an assistant edits with the tasks duty and deletes
          // only the tasks they set.
          if (task.canEdit && canPlan && task.status != TaskStatus.cancelled)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Row(
                children: [
                  Expanded(
                    child: AppButton(
                      key: const ValueKey('task-edit'),
                      label: t.t('tasks.edit'),
                      icon: AppIcons.editOutlined,
                      variant: AppButtonVariant.secondary,
                      onPressed: _busy
                          ? null
                          : () async {
                              Navigator.of(context).pop();
                              await GoRouter.of(context).push(
                                TeamRoutes.editTask,
                                extra: task,
                              );
                            },
                    ),
                  ),
                  if (task.canDelete) ...[
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: AppButton(
                        key: const ValueKey('task-delete'),
                        label: t.t('tasks.delete'),
                        icon: AppIcons.deleteOutlineRounded,
                        variant: AppButtonVariant.secondary,
                        onPressed: _busy ? null : _delete,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          // Owner 2026-10-01: a task closed by mistake goes back to work.
          if (!active &&
              canComplete &&
              task.status != TaskStatus.cancelled) ...[
            AppButton(
              key: const ValueKey('task-reopen'),
              label: t.t('tasks.reopen'),
              icon: AppIcons.undoRounded,
              variant: AppButtonVariant.secondary,
              isLoading: _busy,
              onPressed: () => _set(TaskStatus.open),
            ),
          ],
          // Put away while still open (or cancelled): back to the planner.
          if (task.archived &&
              (active || task.status == TaskStatus.cancelled) &&
              (canComplete || task.canEdit)) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('task-unarchive'),
              label: t.t('tasks.bulk.return'),
              icon: AppIcons.unarchiveOutlined,
              variant: AppButtonVariant.secondary,
              isLoading: _busy,
              onPressed: () => _archiveOp(TaskBulkAction.unarchive),
            ),
          ],
          if (active && canComplete) ...[
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              key: const ValueKey('task-cancel'),
              onPressed: _busy ? null : () => _set(TaskStatus.cancelled),
              child: Text(
                t.t('tasks.cancel'),
                style: TextStyle(color: colors.dangerText),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SheetSection extends StatelessWidget {
  const _SheetSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          title,
          style: typography.body.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        AppCard(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.xs,
          ),
          child: Column(
            children: [
              for (final (i, c) in children.indexed) ...[
                if (i > 0) Divider(height: 1, color: colors.border),
                c,
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// An address: tap — Google / Apple Maps, the round button — directions.
class _PlaceTile extends StatelessWidget {
  const _PlaceTile({required this.place, required this.t, super.key});

  final TaskPlace place;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return InkWell(
      onTap: () => showPlaceActions(context, t, place),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
        child: Row(
          children: [
            AppIcon(AppIcons.placeOutlined, color: colors.goldDark),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (place.label != null)
                      Text(
                        place.label!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.caption.copyWith(
                          color: colors.goldDark,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    Text(
                      place.address,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: typography.body.copyWith(color: colors.text),
                    ),
                  ],
                ),
              ),
            ),
            AppIconButton(
              key: ValueKey('place-route-${place.address}'),
              icon: AppIcon(
                AppIcons.directionsCarOutlined,
                color: colors.goldDark,
              ),
              semanticLabel: t.t('tasks.place.route'),
              onPressed: () =>
                  TaskLinks.open(TaskLinks.directions(place.address)),
            ),
          ],
        ),
      ),
    );
  }
}

/// A person: their picture, name, role; call / write / chat buttons.
class _PersonTile extends ConsumerWidget {
  const _PersonTile({
    required this.person,
    required this.subject,
    required this.t,
    super.key,
  });

  final TaskPerson person;
  final String subject;
  final Translator t;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = person;
    final sub = [
      p.role,
      if (p.inApp && p.role == null)
        t.t('tasks.people.inApp.${p.userRole ?? 'attorney'}'),
      p.phone,
      p.email,
    ].whereType<String>().where((x) => x.isNotEmpty).join(' · ');
    final actions = taskPersonActions(context, ref, t, p, subject: subject);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          TaskPersonAvatar(name: p.name, avatarUrl: p.avatarUrl),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (sub.isNotEmpty)
                  Text(
                    sub,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
              ],
            ),
          ),
          for (final a in actions)
            AppIconButton(
              key: ValueKey('person-${a.key}-${p.name}'),
              icon: AppIcon(a.icon, color: colors.goldDark),
              semanticLabel: '${a.label} · ${p.name}',
              onPressed: a.run,
            ),
        ],
      ),
    );
  }
}

/// In the archive: when the task is removed, and "keep forever".
class _ArchiveCard extends StatelessWidget {
  const _ArchiveCard({
    required this.t,
    required this.task,
    required this.formats,
    required this.busy,
    required this.canKeep,
    required this.onKeep,
  });

  final Translator t;
  final TaskItem task;
  final L10nFormats formats;
  final bool busy;
  final bool canKeep;
  final ValueChanged<bool> onKeep;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final purge = task.purgeAt;
    final text = task.keepForever
        ? t.t('tasks.keep.kept')
        : purge == null
            ? t.t('tasks.keep.notRemoved')
            : t.t('tasks.keep.removedOn', {'date': formats.dateLong(purge)});
    return Container(
      key: const ValueKey('task-archive-card'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppIcon(
                task.keepForever
                    ? AppIcons.bookmarkRounded
                    : AppIcons.inventory2Outlined,
                color: colors.goldDark,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  text,
                  style: typography.bodySmall.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
          if (canKeep)
            Row(
              children: [
                Expanded(
                  child: Text(
                    t.t('tasks.keep.toggle'),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: typography.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Switch.adaptive(
                  key: const ValueKey('task-keep'),
                  value: task.keepForever,
                  activeTrackColor: colors.gold,
                  onChanged: busy ? null : onKeep,
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.text,
    this.danger = false,
  });

  final IconData icon;
  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        children: [
          AppIcon(
            icon,
            size: AppSizes.iconSm,
            color: danger ? colors.dangerText : colors.textSecondary,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: typography.body
                  .copyWith(color: danger ? colors.dangerText : colors.text),
            ),
          ),
        ],
      ),
    );
  }
}

class _FileTile extends StatelessWidget {
  const _FileTile({
    required this.file,
    required this.index,
    required this.side,
    required this.photos,
    required this.closeLabel,
  });

  final String closeLabel;

  final TaskFile file;
  final int index;
  final double side;

  /// All files of the task: a photo opens the full-screen gallery of the
  /// task's photos.
  final List<TaskFile> photos;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final url = file.url;
    final images = [
      for (final p in photos)
        if (p.isImage && p.url != null) p.url!,
    ];
    return AppPressable(
      onTap: url == null
          ? null
          : file.isImage
              ? () => showPhotoGallery(
                    context,
                    urls: images,
                    initial: images.indexOf(url).clamp(0, images.length - 1),
                    closeLabel: closeLabel,
                  )
              : () => launchUrl(
                    Uri.parse(url),
                    mode: LaunchMode.externalApplication,
                  ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.field),
        child: Container(
          width: side,
          height: side,
          color: colors.goldTint,
          child: file.isImage && url != null
              ? Image.network(url, fit: BoxFit.cover)
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AppIcon(AppIcons.descriptionOutlined, color: colors.gold),
                    const SizedBox(height: 4),
                    Text(
                      '#$index',
                      style: TextStyle(color: colors.textSecondary),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _OutcomeSheet extends ConsumerStatefulWidget {
  const _OutcomeSheet({
    required this.t,
    required this.done,
    this.currentDue,
  });

  final Translator t;
  final bool done;
  final DateTime? currentDue;

  @override
  ConsumerState<_OutcomeSheet> createState() => _OutcomeSheetState();
}

class _OutcomeSheetState extends ConsumerState<_OutcomeSheet> {
  final _note = TextEditingController();
  DateTime? _move;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final formats = ref.watch(l10nFormatsProvider);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            t.t(widget.done ? 'tasks.done' : 'tasks.notDone'),
            style: typography.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            key: const ValueKey('task-outcome'),
            controller: _note,
            label: t.t('tasks.outcome'),
            hintText: t.t('tasks.outcome.hint'),
            maxLines: 3,
            maxLength: 1000,
            textCapitalization: TextCapitalization.sentences,
            autofocus: true,
          ),
          if (!widget.done) ...[
            const SizedBox(height: AppSpacing.sm),
            AppListRow(
              key: const ValueKey('task-reschedule'),
              icon: AppIcons.eventRepeatRounded,
              label: t.t('tasks.reschedule'),
              subtitle: _move == null ? null : formats.dateTime(_move!),
              flush: true,
              onTap: () async {
                final picked =
                    await pickDateTime(context, initial: widget.currentDue);
                if (picked != null) setState(() => _move = picked);
              },
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            key: const ValueKey('task-outcome-save'),
            label: t.t('common.save'),
            onPressed: () => Navigator.of(context).pop(
              (
                note: _note.text.trim().isEmpty ? null : _note.text.trim(),
                rescheduleTo: _move,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
