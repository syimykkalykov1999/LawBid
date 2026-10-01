import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

IconData taskKindIcon(TaskKind k) => switch (k) {
      TaskKind.call => Icons.call_outlined,
      TaskKind.meeting => Icons.groups_outlined,
      TaskKind.court => Icons.gavel_rounded,
      TaskKind.deadline => Icons.timer_outlined,
      TaskKind.documents => Icons.description_outlined,
      TaskKind.print => Icons.print_outlined,
      TaskKind.visit => Icons.directions_car_outlined,
      TaskKind.other => Icons.push_pin_outlined,
      TaskKind.consultation => Icons.support_agent_outlined,
      TaskKind.hearingPrep => Icons.menu_book_outlined,
      TaskKind.deposition => Icons.record_voice_over_outlined,
      TaskKind.mediation => Icons.handshake_outlined,
      TaskKind.filing => Icons.upload_file_outlined,
      TaskKind.review => Icons.plagiarism_outlined,
      TaskKind.email => Icons.mail_outline_rounded,
      TaskKind.sign => Icons.draw_outlined,
      TaskKind.payment => Icons.payments_outlined,
      TaskKind.research => Icons.travel_explore_outlined,
      TaskKind.jailVisit => Icons.account_balance_outlined,
    };

String taskKindLabel(Translator t, TaskKind k) => t.t('tasks.kind.${k.wire}');

String taskStatusLabel(Translator t, TaskStatus s) =>
    t.t('tasks.status.${s.wire}');

/// Day sections of the task calendar: overdue, today, tomorrow, then each
/// date, then "no date".
typedef TaskSection = ({String key, String title, List<TaskItem> items});

List<TaskSection> groupTasksByDay(
  List<TaskItem> tasks,
  Translator t,
  L10nFormats formats, {
  required DateTime now,
  bool done = false,
}) {
  final today = DateTime(now.year, now.month, now.day);
  final sections = <String, TaskSection>{};
  void add(String key, String title, TaskItem item) {
    final s =
        sections.putIfAbsent(key, () => (key: key, title: title, items: []));
    s.items.add(item);
  }

  for (final task in tasks) {
    final when = done ? (task.doneAt ?? task.dueAt) : task.nextDueAt;
    if (when == null) {
      add('~none', t.t('tasks.noDate'), task);
      continue;
    }
    final local = when.toLocal();
    final day = DateTime(local.year, local.month, local.day);
    final diff = day.difference(today).inDays;
    if (!done && task.isOverdue(now) && diff < 0) {
      add('0overdue', t.t('tasks.overdue'), task);
    } else if (diff == 0) {
      add('1today', t.t('tasks.today'), task);
    } else if (diff == 1 && !done) {
      add('2tomorrow', t.t('tasks.tomorrow'), task);
    } else {
      final key = '3${day.toIso8601String()}';
      add(key, formats.dateLong(day), task);
    }
  }
  final keys = sections.keys.toList()..sort();
  if (done) keys.sort((a, b) => b.compareTo(a));
  return [for (final k in keys) sections[k]!];
}

/// One task in the planner. Owner 2026-10-01 (second pass): one brand
/// language — navy + gold on the card surface, no coloured strips. A navy
/// medallion with the gold kind icon, the kind and the time on top, a bold
/// title; a task with steps shows its gold progress line and the checklist
/// (tap a box to check that step off), otherwise the place / contact /
/// case lines. Who set it and the status mark sit at the bottom.
/// Tap opens the task; a double tap checks the next step off (or the whole
/// task when it has no steps).
class TaskRow extends StatelessWidget {
  const TaskRow({
    required this.task,
    required this.t,
    required this.formats,
    required this.now,
    required this.onTap,
    this.onCheck,
    this.onStepCheck,
    super.key,
  });

  final TaskItem task;
  final Translator t;
  final L10nFormats formats;
  final DateTime now;
  final VoidCallback onTap;

  /// Double tap → done / next step done. Null when the viewer can't
  /// complete tasks.
  final VoidCallback? onCheck;

  /// A step's box tapped on the card. Null = read-only boxes.
  final void Function(TaskStep step)? onStepCheck;

  static const _visibleSteps = 4;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final overdue = task.isOverdue(now);
    final finished = !task.status.active;
    final due = task.nextDueAt;
    final steps = task.steps;
    Widget line(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Row(
            children: [
              Icon(icon, size: 15, color: colors.goldDark),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                ),
              ),
            ],
          ),
        );
    final contact = [task.contactName, task.contactPhone]
        .whereType<String>()
        .where((x) => x.isNotEmpty)
        .join(' · ');
    return Semantics(
      container: true,
      button: true,
      label: '${taskKindLabel(t, task.kind)}. ${task.title}. '
          '${steps.isEmpty ? '' : '${task.checkedSteps}/${steps.length}. '}'
          '${taskStatusLabel(t, task.status)}',
      child: GestureDetector(
        onDoubleTap: onCheck == null
            ? null
            : () {
                HapticFeedback.mediumImpact();
                onCheck!();
              },
        child: AppPressable(
          onTap: onTap,
          child: AnimatedOpacity(
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            opacity: finished ? 0.78 : 1,
            child: Container(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.md,
                AppSpacing.lg,
                AppSpacing.md,
              ),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
                boxShadow: [
                  BoxShadow(
                    color: colors.shadow,
                    blurRadius: 14,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      TaskKindMedallion(kind: task.kind),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              taskKindLabel(t, task.kind).toUpperCase(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: typography.caption.copyWith(
                                color: colors.goldDark,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.1,
                              ),
                            ),
                            if (overdue)
                              Text(
                                t.t('tasks.overdue'),
                                style: typography.caption.copyWith(
                                  color: colors.dangerText,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (due != null)
                        Text(
                          formats.time(due),
                          style: typography.titleLarge.copyWith(
                            color: overdue ? colors.dangerText : colors.text,
                            fontSize: 22,
                            height: 1.1,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    task.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: typography.body.copyWith(
                      color: finished ? colors.textSecondary : colors.text,
                      fontWeight: FontWeight.w700,
                      height: 1.3,
                      decoration: task.status == TaskStatus.done
                          ? TextDecoration.lineThrough
                          : null,
                    ),
                  ),
                  if (steps.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.sm),
                    TaskProgress(
                      done: task.checkedSteps,
                      total: steps.length,
                      label: t.t('tasks.steps.progress', {
                        'done': '${task.checkedSteps}',
                        'total': '${steps.length}',
                      }),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    for (final step in steps.take(_visibleSteps))
                      TaskStepTile(
                        key: ValueKey('card-step-${step.id}'),
                        step: step,
                        t: t,
                        formats: formats,
                        now: now,
                        dense: true,
                        onCheck: onStepCheck == null || finished
                            ? null
                            : () => onStepCheck!(step),
                      ),
                    if (steps.length > _visibleSteps)
                      Padding(
                        padding: const EdgeInsets.only(left: 34, top: 2),
                        child: Text(
                          t.t('tasks.steps.more',
                              {'n': '${steps.length - _visibleSteps}'}),
                          style: typography.caption.copyWith(
                            color: colors.goldDark,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ] else ...[
                    if (task.location?.isNotEmpty ?? false)
                      line(Icons.place_outlined, task.location!),
                    if (contact.isNotEmpty)
                      line(Icons.person_outline_rounded, contact),
                    if (task.contactEmail?.isNotEmpty ?? false)
                      line(Icons.mail_outline_rounded, task.contactEmail!),
                  ],
                  if (task.caseTitle?.isNotEmpty ?? false)
                    line(Icons.work_outline_rounded, task.caseTitle!),
                  if (task.outcomeNote?.isNotEmpty ?? false) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(
                          AppSpacing.md, AppSpacing.sm, AppSpacing.sm, AppSpacing.sm),
                      decoration: BoxDecoration(
                        color: colors.goldTint,
                        borderRadius: BorderRadius.circular(AppRadii.field),
                        border: Border(
                          left: BorderSide(color: colors.gold, width: 2),
                        ),
                      ),
                      child: Text(
                        task.outcomeNote!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: typography.bodySmall.copyWith(
                          color: colors.text,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  Divider(height: 1, color: colors.border),
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      Icon(
                        task.createdByName == null
                            ? Icons.person_outline_rounded
                            : Icons.support_agent_rounded,
                        size: 14,
                        color: colors.textSecondary,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          task.createdByName == null
                              ? t.t('tasks.byMe')
                              : t.t('tasks.by', {'name': task.createdByName!}),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: typography.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                      ),
                      if (task.files.isNotEmpty) ...[
                        Icon(Icons.attach_file_rounded,
                            size: 14, color: colors.textSecondary),
                        Text(
                          '${task.files.length}',
                          style: typography.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                      ],
                      TaskMark(
                        key: ValueKey('task-check-${task.id}'),
                        status: task.status,
                        label: taskStatusLabel(t, task.status),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The kind's gold icon on a navy medallion (gold-ringed in dark theme).
class TaskKindMedallion extends StatelessWidget {
  const TaskKindMedallion({required this.kind, this.size = 40, super.key});

  final TaskKind kind;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: colors.navy,
        borderRadius: BorderRadius.circular(size * 0.3),
        border: Border.all(color: colors.gold.withValues(alpha: 0.55)),
      ),
      child: Icon(taskKindIcon(kind), size: size * 0.5, color: colors.gold),
    );
  }
}

/// A thin gold progress line with "3 of 6 done".
class TaskProgress extends StatelessWidget {
  const TaskProgress({
    required this.done,
    required this.total,
    required this.label,
    super.key,
  });

  final int done;
  final int total;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = total == 0 ? 0.0 : done / total;
    return Row(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.pill),
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: value),
              duration: context.reduceMotion
                  ? Duration.zero
                  : AppMotion.stateChange,
              curve: Curves.easeOutCubic,
              builder: (_, v, __) => LinearProgressIndicator(
                value: v,
                minHeight: 4,
                color: colors.gold,
                backgroundColor: colors.goldTint,
              ),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(
          label,
          style: typography.caption.copyWith(
            color: colors.goldDark,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

/// One step of a task's checklist: a square box (gold check when done,
/// a navy cross when not done), the title, its time and place / contact.
class TaskStepTile extends StatelessWidget {
  const TaskStepTile({
    required this.step,
    required this.t,
    required this.formats,
    required this.now,
    this.onCheck,
    this.onTap,
    this.dense = false,
    super.key,
  });

  final TaskStep step;
  final Translator t;
  final L10nFormats formats;
  final DateTime now;
  final VoidCallback? onCheck;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final overdue = step.isOverdue(now);
    final sub = [
      if (step.kind != null) taskKindLabel(t, step.kind!),
      if (step.location?.isNotEmpty ?? false) step.location!,
      if (step.contactName?.isNotEmpty ?? false) step.contactName!,
      if (step.contactPhone?.isNotEmpty ?? false) step.contactPhone!,
      if (step.contactEmail?.isNotEmpty ?? false) step.contactEmail!,
    ].join(' · ');
    final content = Padding(
      padding: EdgeInsets.symmetric(vertical: dense ? 4 : AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TaskStepCheck(
            key: ValueKey('step-check-${step.id}'),
            status: step.status,
            label: step.title,
            onTap: onCheck,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 2),
                Text(
                  step.title,
                  maxLines: dense ? 1 : 3,
                  overflow: TextOverflow.ellipsis,
                  style: typography.bodySmall.copyWith(
                    color: step.checked ? colors.textSecondary : colors.text,
                    fontWeight: FontWeight.w600,
                    decoration: step.status == TaskStatus.done
                        ? TextDecoration.lineThrough
                        : null,
                  ),
                ),
                if (sub.isNotEmpty && !dense)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      sub,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                  ),
                if ((step.note?.isNotEmpty ?? false) && !dense)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      step.note!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: typography.caption.copyWith(
                        color: colors.goldDark,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (step.dueAt != null) ...[
            const SizedBox(width: AppSpacing.sm),
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                formats.time(step.dueAt!),
                style: typography.bodySmall.copyWith(
                  color: overdue
                      ? colors.dangerText
                      : step.checked
                          ? colors.textSecondary
                          : colors.text,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ],
        ],
      ),
    );
    if (onTap == null) return content;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadii.field),
      child: content,
    );
  }
}

/// A step's box: 24px rounded square; the tap target is 44px.
class TaskStepCheck extends StatelessWidget {
  const TaskStepCheck({
    required this.status,
    required this.label,
    this.onTap,
    super.key,
  });

  final TaskStatus status;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    final done = status == TaskStatus.done;
    final notDone = status == TaskStatus.notDone;
    final box = AnimatedContainer(
      duration: dur,
      curve: Curves.easeOutBack,
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: done
            ? colors.gold
            : notDone
                ? colors.text
                : Colors.transparent,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: done
              ? colors.gold
              : notDone
                  ? colors.text
                  : colors.goldDark.withValues(alpha: 0.7),
          width: 1.6,
        ),
      ),
      child: AnimatedSwitcher(
        duration: dur,
        transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
        child: done
            ? const Icon(Icons.check_rounded,
                key: ValueKey('d'), size: 16, color: AppColorsLight.navy)
            : notDone
                ? Icon(Icons.close_rounded,
                    key: const ValueKey('n'), size: 15, color: colors.surface)
                : const SizedBox.shrink(key: ValueKey('o')),
      ),
    );
    return Semantics(
      checked: done,
      button: onTap != null,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap == null
            ? null
            : () {
                HapticFeedback.selectionClick();
                onTap!();
              },
        child: Padding(
          // The visual box is small; the tap area stays generous.
          padding: const EdgeInsets.fromLTRB(0, 0, 4, 0),
          child: SizedBox(
            width: 26,
            height: 26,
            child: Align(alignment: Alignment.topLeft, child: box),
          ),
        ),
      ),
    );
  }
}

/// The status mark bottom-right, in brand colours: an empty gold ring
/// (waiting), a navy ring with a gold dot (in progress), a gold disc with
/// a navy check (done), an ink disc with a cross (not done), a grey dash
/// (cancelled) — with the word next to it.
class TaskMark extends StatelessWidget {
  const TaskMark({required this.status, required this.label, super.key});

  final TaskStatus status;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    final (Color ring, Color fill, Widget inner) = switch (status) {
      TaskStatus.done => (
          colors.gold,
          colors.gold,
          const Icon(Icons.check_rounded,
              key: ValueKey('done'), size: 16, color: AppColorsLight.navy),
        ),
      TaskStatus.notDone => (
          colors.text,
          colors.text,
          Icon(Icons.close_rounded,
              key: const ValueKey('not'), size: 15, color: colors.surface),
        ),
      TaskStatus.cancelled => (
          colors.textSecondary,
          Colors.transparent,
          Icon(Icons.remove_rounded,
              key: const ValueKey('x'), size: 15, color: colors.textSecondary),
        ),
      TaskStatus.taken => (
          colors.text,
          Colors.transparent,
          Container(
            key: const ValueKey('taken'),
            width: 9,
            height: 9,
            decoration:
                BoxDecoration(color: colors.gold, shape: BoxShape.circle),
          ),
        ),
      TaskStatus.open => (
          colors.goldDark.withValues(alpha: 0.7),
          Colors.transparent,
          const SizedBox.shrink(key: ValueKey('open')),
        ),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: typography.caption.copyWith(
            color: status == TaskStatus.done
                ? colors.goldDark
                : colors.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(width: 6),
        AnimatedContainer(
          duration: dur,
          curve: Curves.easeOutBack,
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: fill,
            border: Border.all(color: ring, width: 1.8),
          ),
          child: Center(
            child: AnimatedSwitcher(
              duration: dur,
              transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
              child: inner,
            ),
          ),
        ),
      ],
    );
  }
}
