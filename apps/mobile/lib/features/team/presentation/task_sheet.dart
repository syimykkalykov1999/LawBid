import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
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
    final task = _task;
    final active = task.status.active;
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
              AppIconMedallion(icon: taskKindIcon(task.kind)),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      taskKindLabel(t, task.kind).toUpperCase(),
                      style: typography.caption.copyWith(
                        color: colors.gold,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
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
              icon: Icons.event_outlined,
              text: formats.dateTime(task.dueAt!),
              danger: task.isOverdue(DateTime.now()),
            ),
          if (task.location?.isNotEmpty ?? false)
            _InfoRow(
              icon: Icons.place_outlined,
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
              icon: Icons.person_outline_rounded,
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
          if (task.caseTitle?.isNotEmpty ?? false)
            _InfoRow(icon: Icons.work_outline_rounded, text: task.caseTitle!),
          if (task.notes?.isNotEmpty ?? false) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              task.notes!,
              style: typography.body.copyWith(color: colors.text),
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
                  Icon(Icons.chat_bubble_outline_rounded,
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
                icon: Icons.play_arrow_rounded,
                variant: AppButtonVariant.secondary,
                isLoading: _busy,
                onPressed: () => _set(TaskStatus.taken),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            AppButton(
              key: const ValueKey('task-done'),
              label: t.t('tasks.done'),
              icon: Icons.check_rounded,
              isLoading: _busy,
              onPressed: () => _finish(true),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('task-not-done'),
              label: t.t('tasks.notDone'),
              icon: Icons.close_rounded,
              variant: AppButtonVariant.secondary,
              isLoading: _busy,
              onPressed: () => _finish(false),
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
          Icon(icon,
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
                    Icon(Icons.description_outlined, color: colors.gold),
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
              icon: Icons.event_repeat_rounded,
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
