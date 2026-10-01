import 'package:flutter/material.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_editor_screen.dart'
    show normalizeTaskPhone;
import 'package:lawbid/features/team/presentation/task_widgets.dart';
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
    Widget field(String key, TextEditingController c, String hint,
            {TextInputType? type, IconData? icon}) =>
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
                      padding: const EdgeInsets.only(right: AppSpacing.sm),
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
            field('step-title', _title, t.t('tasks.steps.titleHint'),
                icon: AppIcons.shortTextRounded),
            AppListRow(
              key: const ValueKey('step-when'),
              icon: AppIcons.scheduleRounded,
              label: _at == null
                  ? t.t('tasks.steps.pickTime')
                  : formats.dateTime(_at!),
              showChevron: true,
              onTap: () async {
                final at = await pickDateTime(context, initial: _at);
                if (at != null && mounted) setState(() => _at = at);
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            field('step-place', _place, t.t('tasks.steps.placeHint'),
                icon: AppIcons.placeOutlined),
            field('step-name', _name, t.t('tasks.steps.whoHint'),
                icon: AppIcons.personOutlineRounded),
            field('step-phone', _phone, '+1 312 555 0123',
                type: TextInputType.phone, icon: AppIcons.callOutlined),
            field('step-email', _email, 'name@example.com',
                type: TextInputType.emailAddress,
                icon: AppIcons.mailOutlineRounded),
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

  Future<void> _toggle(TaskStep step) => _stepOp(() => _ctrl.checkStep(
        _task,
        step,
        step.checked ? TaskStatus.open : TaskStatus.done,
      ));

  Future<void> _addStep() async {
    final d = await showStepEditor(context, taskKind: _task.kind);
    if (d == null || !mounted) return;
    await _stepOp(() => _ctrl.addStep(_task, d));
  }

  /// A step's actions: check / not done with a note / move / call /
  /// write / map / remove.
  Future<void> _stepMenu(TaskStep step, {required bool canPlan}) async {
    final t = ref.read(translatorProvider);
    final assistant = ref.read(isAssistantProvider);
    final active = _task.status.active;
    // Checkmarks also on a finished task (taking one back reopens it).
    final checkable = _task.status != TaskStatus.cancelled;
    final hasAny = (!assistant && checkable) ||
        (canPlan && active) ||
        (step.contactPhone?.isNotEmpty ?? false) ||
        (step.contactEmail?.isNotEmpty ?? false) ||
        (step.location?.isNotEmpty ?? false);
    // Nothing to offer (e.g. an assistant without the tasks duty).
    if (!hasAny) return;
    final choice = await showAppBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!assistant && checkable) ...[
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
    );
    if (choice == null || !mounted) return;
    switch (choice) {
      case 'done':
        await _toggle(step);
      case 'not':
        final r = await askTaskOutcome(context, t, done: false);
        if (r == null || !mounted) return;
        final to = r.rescheduleTo;
        await _stepOp(() => to == null
            ? _ctrl.checkStep(_task, step, TaskStatus.notDone, note: r.note)
            // "Not done, move it": one request, the step stays open.
            : _ctrl.rescheduleStep(_task, step, to, note: r.note));
      case 'move':
        final at = await pickDateTime(context, initial: step.dueAt);
        if (at != null && mounted) {
          await _stepOp(() => _ctrl.moveStep(_task, step, at));
        }
      case 'call':
        await launchUrl(Uri(scheme: 'tel', path: step.contactPhone));
      case 'mail':
        await launchUrl(Uri(
          scheme: 'mailto',
          path: step.contactEmail,
          queryParameters: {'subject': step.title},
        ));
      case 'map':
        await launchUrl(
          Uri.https('maps.google.com', '/', {'q': step.location!}),
          mode: LaunchMode.externalApplication,
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
      ref
        ..invalidate(tasksProvider((done: false, mine: false)))
        ..invalidate(tasksProvider((done: true, mine: false)));
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
    final assistant = ref.watch(isAssistantProvider);
    final canPlan = ref.watch(canDoProvider(AssistantDuty.tasks));
    final task = _task;
    final active = task.status.active;
    final now = DateTime.now();
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
          if (task.location?.isNotEmpty ?? false)
            _InfoRow(
              icon: AppIcons.placeOutlined,
              text: task.location!,
              action: t.t('tasks.map'),
              onAction: () => launchUrl(
                Uri.https('maps.google.com', '/', {'q': task.location!}),
                mode: LaunchMode.externalApplication,
              ),
            ),
          if ((task.contactName?.isNotEmpty ?? false) ||
              (task.contactPhone?.isNotEmpty ?? false))
            _InfoRow(
              icon: AppIcons.personOutlineRounded,
              text: [task.contactName, task.contactPhone]
                  .whereType<String>()
                  .where((s) => s.isNotEmpty)
                  .join(' · '),
              action: (task.contactPhone?.isNotEmpty ?? false)
                  ? t.t('tasks.call')
                  : null,
              onAction: (task.contactPhone?.isNotEmpty ?? false)
                  ? () => launchUrl(Uri(scheme: 'tel', path: task.contactPhone))
                  : null,
            ),
          if (task.contactEmail?.isNotEmpty ?? false)
            _InfoRow(
              icon: AppIcons.mailOutlineRounded,
              text: task.contactEmail!,
              action: t.t('tasks.write'),
              onAction: () => launchUrl(
                Uri(
                  scheme: 'mailto',
                  path: task.contactEmail,
                  queryParameters: {'subject': task.title},
                ),
              ),
            ),
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
                  TextButton.icon(
                    key: const ValueKey('task-step-add'),
                    onPressed: _addStep,
                    icon: AppIcon(AppIcons.addRounded,
                        size: 18, color: colors.goldDark),
                    label: Text(
                      t.t('tasks.steps.add'),
                      style: TextStyle(color: colors.goldDark),
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
                            assistant || task.status == TaskStatus.cancelled
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
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final (i, f) in task.files.indexed)
                  _FileTile(file: f, index: i + 1),
              ],
            ),
          ],
          if (task.outcomeNote?.isNotEmpty ?? false) ...[
            const SizedBox(height: AppSpacing.lg),
            AppCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppIcon(AppIcons.chatBubbleOutlineRounded,
                      size: AppSizes.iconSm, color: colors.gold),
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
          if (active && !assistant) ...[
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
          if (canPlan && task.status != TaskStatus.cancelled)
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
          if (!active && !assistant && task.status != TaskStatus.cancelled) ...[
            AppButton(
              key: const ValueKey('task-reopen'),
              label: t.t('tasks.reopen'),
              icon: AppIcons.undoRounded,
              variant: AppButtonVariant.secondary,
              isLoading: _busy,
              onPressed: () => _set(TaskStatus.open),
            ),
          ],
          if (active) ...[
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

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.text,
    this.action,
    this.onAction,
    this.danger = false,
  });

  final IconData icon;
  final String text;
  final String? action;
  final VoidCallback? onAction;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        children: [
          AppIcon(icon,
              size: AppSizes.iconSm,
              color: danger ? colors.dangerText : colors.textSecondary),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: typography.body
                  .copyWith(color: danger ? colors.dangerText : colors.text),
            ),
          ),
          if (action != null)
            TextButton(onPressed: onAction, child: Text(action!)),
        ],
      ),
    );
  }
}

class _FileTile extends StatelessWidget {
  const _FileTile({required this.file, required this.index});

  final TaskFile file;
  final int index;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final url = file.url;
    return AppPressable(
      onTap: url == null
          ? null
          : () =>
              launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.field),
        child: Container(
          width: 84,
          height: 84,
          color: colors.goldTint,
          child: file.isImage && url != null
              ? Image.network(url, fit: BoxFit.cover)
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AppIcon(AppIcons.descriptionOutlined, color: colors.gold),
                    const SizedBox(height: 4),
                    Text('#$index',
                        style: TextStyle(color: colors.textSecondary)),
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
            onPressed: () => Navigator.of(context).pop((
              note: _note.text.trim().isEmpty ? null : _note.text.trim(),
              rescheduleTo: _move,
            )),
          ),
        ],
      ),
    );
  }
}
