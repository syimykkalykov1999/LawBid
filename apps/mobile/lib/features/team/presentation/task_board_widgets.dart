import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/l10n/week_start.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_pickers.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';

/// Owner 2026-10-15 («Моё › Задачи», the approved mockup, card A «Кольцо
/// прогресса»): the board of tasks — a hero with today's progress, one ring
/// per case, and cards whose ring takes the case's practice colour and fills
/// with the sub-tasks.

/// The chips under the views: a slice of the board.
enum TaskScope { all, overdue, mine, forClient, joint, assistant }

/// Whose task it is (the pill on a card).
enum TaskWho { mine, forClient, joint, attorneyMove, assistant, yours }

TaskWho taskWhoOf(TaskItem task, {required bool viewerIsAttorney}) {
  final b = task.boardTask;
  if (b != null) {
    if (b.joint) return TaskWho.joint;
    if (b.shared) return TaskWho.attorneyMove;
    return viewerIsAttorney ? TaskWho.forClient : TaskWho.yours;
  }
  if (task.assigneeMembershipId != null) return TaskWho.assistant;
  return viewerIsAttorney ? TaskWho.mine : TaskWho.yours;
}

String taskWhoLabel(Translator t, TaskItem task, TaskWho who) => switch (who) {
      // A task an assistant set for the attorney says who set it.
      TaskWho.mine ||
      TaskWho.yours when task.createdByName != null =>
        t.t('tasks.by', {'name': task.createdByName!}),
      TaskWho.mine => t.t('tasks.who.mine'),
      TaskWho.forClient => t.t('tasks.who.forClient'),
      TaskWho.joint => t.t('tasks.who.joint'),
      TaskWho.attorneyMove => t.t('tasks.who.attorneyMove'),
      TaskWho.assistant => t.t('tasks.assignee.to', {
          'name': task.assignedToMe
              ? t.t('tasks.assignee.you')
              : (task.assigneeName ?? t.t('tasks.who.assistant')),
        }),
      TaskWho.yours => t.t('tasks.who.yours'),
    };

/// The accent of a task: its case's practice colour, else the brand gold.
Color taskAccent(AppColorTokens colors, TaskItem task) {
  final code = task.casePracticeCode;
  if (code == null || code.isEmpty) return colors.goldDark;
  return practiceAccent(
    code.split('.').first,
    surface: practiceCardBase(colors),
  );
}

/// Whether [task] belongs to the chip [scope].
bool taskInScope(TaskItem task, TaskScope scope, DateTime now) =>
    switch (scope) {
      TaskScope.all => true,
      TaskScope.overdue => task.isOverdue(now),
      TaskScope.forClient => task.boardTask?.forClient ?? false,
      TaskScope.joint => task.boardTask?.joint ?? false,
      TaskScope.assistant => task.assigneeMembershipId != null,
      TaskScope.mine => task.boardTask == null || task.boardTask!.forClient,
    };

/// 0..1: how far the task is (its sub-tasks; a finished one is whole).
double taskProgress(TaskItem task) {
  if (!task.status.active) return 1;
  if (task.steps.isEmpty) return 0;
  return task.checkedSteps / task.steps.length;
}

/// A ring (a thin arc over a track) with [child] in the middle.
class TaskRing extends StatelessWidget {
  const TaskRing({
    required this.progress,
    required this.color,
    required this.size,
    required this.stroke,
    this.child,
    super.key,
  });

  final double progress;
  final Color color;
  final double size;
  final double stroke;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RingPainter(
          progress: progress.clamp(0.0, 1.0),
          color: color,
          track: colors.border,
          stroke: stroke,
        ),
        child: child == null ? null : Center(child: child),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({
    required this.progress,
    required this.color,
    required this.track,
    required this.stroke,
  });

  final double progress;
  final Color color;
  final Color track;
  final double stroke;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final arc = rect.deflate(stroke / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(arc, 0, math.pi * 2, false, paint..color = track);
    if (progress > 0) {
      canvas.drawArc(
        arc,
        -math.pi / 2,
        math.pi * 2 * progress,
        false,
        paint..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.progress != progress ||
      old.color != color ||
      old.track != track ||
      old.stroke != stroke;
}

/// A small coloured pill: [label], with a dot or an [icon].
class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color, this.icon, this.max});

  final String label;
  final Color color;
  final IconData? icon;
  final double? max;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final base = practiceCardBase(colors);
    final bg = Color.alphaBlend(color.withValues(alpha: 0.16), base);
    final fg = readableOn(color, bg);
    return ConstrainedBox(
      constraints: BoxConstraints(maxWidth: max ?? double.infinity),
      child: Container(
        height: 22,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null)
              AppIcon(icon, size: 12, color: fg)
            else
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
              ),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption
                    .copyWith(color: fg, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The date line of a card: «Today, 14:00», «Overdue · Oct 12», «No date».
String taskWhenLabel(
  Translator t,
  L10nFormats f,
  TaskItem task,
  DateTime now,
) {
  if (!task.status.active) return t.t('tasks.status.done');
  final due = task.nextDueAt?.toLocal();
  if (due == null) return t.t('tasks.noDate');
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(due.year, due.month, due.day);
  final hasTime = due.hour != 0 || due.minute != 0;
  final time = hasTime ? ', ${f.time(due)}' : '';
  if (task.isOverdue(now) && day.isBefore(today)) {
    return '${t.t('tasks.overdue')} · ${f.dayMonth(due)}';
  }
  final diff = day.difference(today).inDays;
  if (diff == 0) return '${t.t('tasks.today')}$time';
  if (diff == 1) return '${t.t('tasks.tomorrow')}$time';
  return '${f.dayMonth(due)}$time';
}

/// One task of the board (variant A, a progress ring).
class TaskRingCard extends StatelessWidget {
  const TaskRingCard({
    required this.task,
    required this.t,
    required this.formats,
    required this.now,
    required this.viewerIsAttorney,
    required this.expanded,
    required this.onToggleSteps,
    required this.onTap,
    this.onMarkTap,
    this.onStepCheck,
    this.onLongPress,
    this.onDoubleTap,
    this.selected,
    super.key,
  });

  /// A double tap on the card: done (or the next sub-task).
  final VoidCallback? onDoubleTap;

  final TaskItem task;
  final Translator t;
  final L10nFormats formats;
  final DateTime now;
  final bool viewerIsAttorney;
  final bool expanded;
  final VoidCallback onToggleSteps;
  final VoidCallback onTap;

  /// The round button at the right: done ⇄ open. Null = the viewer cannot.
  final VoidCallback? onMarkTap;
  final void Function(TaskStep step)? onStepCheck;
  final VoidCallback? onLongPress;

  /// Null = not choosing; true / false = picked or not.
  final bool? selected;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final done = task.status == TaskStatus.done;
    final cancelled = task.status == TaskStatus.cancelled;
    final overdue = task.isOverdue(now);
    final accent = taskAccent(colors, task);
    final ringColor = done || cancelled
        ? colors.success
        : overdue
            ? colors.danger
            : accent;
    final iconColor = readableOn(ringColor, colors.surface, min: 3);
    final who = taskWhoOf(task, viewerIsAttorney: viewerIsAttorney);
    final whoColor = switch (who) {
      TaskWho.forClient || TaskWho.yours => colors.goldDark,
      TaskWho.joint => colors.info,
      TaskWho.assistant => colors.success,
      TaskWho.attorneyMove => colors.textSecondary,
      TaskWho.mine => colors.text,
    };
    final urgent = task.priority == TaskPriority.high ||
        task.priority == TaskPriority.urgent;
    final picked = selected ?? false;
    final due = task.nextDueAt?.toLocal();
    final whenColor = overdue
        ? colors.dangerText
        : (due != null && !done && DateUtils.isSameDay(due, now))
            ? colors.text
            : colors.textSecondary;
    final steps = task.steps;
    final canMark = onMarkTap != null;
    final readOnly = !canMark && task.boardTask != null;
    final muted = done || cancelled;
    final mark = Semantics(
      button: canMark,
      label: taskStatusLabel(t, task.status),
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onMarkTap,
        child: SizedBox(
          width: AppSizes.touchTarget,
          height: AppSizes.touchTarget,
          child: Center(
            child: Container(
              key: ValueKey('task-check-${task.id}'),
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done ? colors.success : null,
                border: done || readOnly
                    ? null
                    : Border.all(color: colors.textSecondary, width: 1.8),
              ),
              child: done
                  ? AppIcon(
                      AppIcons.checkRounded,
                      size: 16,
                      color: onPracticeAccent(colors.success),
                    )
                  : (readOnly
                      ? AppIcon(
                          AppIcons.visibilityOutlined,
                          size: 18,
                          color: colors.textSecondary,
                        )
                      : null),
            ),
          ),
        ),
      ),
    );
    return Semantics(
      container: true,
      button: true,
      selected: selected,
      label: '${task.title}. ${taskWhenLabel(t, formats, task, now)}',
      child: GestureDetector(
        onLongPress: onLongPress,
        onDoubleTap: onDoubleTap == null
            ? null
            : () {
                HapticFeedback.mediumImpact();
                onDoubleTap!();
              },
        child: AppPressable(
          onTap: onTap,
          child: AnimatedOpacity(
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            opacity: muted ? 0.72 : 1,
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 8, 2, 8),
              decoration: BoxDecoration(
                color: picked ? colors.goldTint : colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(
                  color: picked
                      ? colors.gold
                      : overdue
                          ? colors.danger.withValues(alpha: 0.55)
                          : colors.border,
                  width: picked ? 1.6 : 1,
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TaskRing(
                    progress: taskProgress(task),
                    color: ringColor,
                    size: 40,
                    stroke: 3,
                    child: picked
                        ? AppIcon(AppIcons.checkRounded, color: colors.gold)
                        : AppIcon(
                            taskKindIcon(task.kind),
                            size: 18,
                            color: iconColor,
                          ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          task.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall.copyWith(
                            color: muted ? colors.textSecondary : colors.text,
                            fontWeight: FontWeight.w600,
                            decoration:
                                done ? TextDecoration.lineThrough : null,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 8,
                          runSpacing: 5,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                AppIcon(
                                  AppIcons.scheduleRounded,
                                  size: 13,
                                  color: whenColor,
                                ),
                                const SizedBox(width: 4),
                                Flexible(
                                  child: Text(
                                    taskWhenLabel(t, formats, task, now),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: type.caption.copyWith(
                                      color: whenColor,
                                      fontWeight:
                                          overdue || whenColor == colors.text
                                              ? FontWeight.w600
                                              : FontWeight.w400,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            if (task.repeat != TaskRepeat.none)
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  AppIcon(
                                    AppIcons.eventRepeatRounded,
                                    size: 13,
                                    color: colors.textSecondary,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    taskRepeatLabel(t, task.repeat),
                                    maxLines: 1,
                                    style: type.caption.copyWith(
                                      color: colors.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            if ((task.caseTitle ?? '').isNotEmpty)
                              _Pill(
                                label: task.caseTitle!,
                                color: accent,
                                max: 170,
                              ),
                            _Pill(
                              label: taskWhoLabel(t, task, who),
                              color: whoColor,
                              max: 150,
                            ),
                            if (urgent && !muted)
                              _Pill(
                                label: t.t(
                                  'tasks.priority.${task.priority.wire}',
                                ),
                                color: colors.danger,
                                icon: AppIcons.flagOutlined,
                                max: 120,
                              ),
                          ],
                        ),
                        if (steps.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Semantics(
                            button: true,
                            expanded: expanded,
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: onToggleSteps,
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(
                                  minHeight: 28,
                                ),
                                child: Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        t.t('tasks.steps.count', {
                                          'done': '${task.checkedSteps}',
                                          'total': '${steps.length}',
                                        }),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: type.caption.copyWith(
                                          color: colors.text,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      t.t(
                                        expanded
                                            ? 'tasks.steps.collapse'
                                            : 'tasks.steps.expand',
                                      ),
                                      maxLines: 1,
                                      style: type.caption.copyWith(
                                        color: colors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                        if (steps.isNotEmpty && expanded)
                          Container(
                            margin: const EdgeInsets.only(top: 2),
                            padding: const EdgeInsets.only(top: 4),
                            decoration: BoxDecoration(
                              border: Border(
                                top: BorderSide(color: colors.border),
                              ),
                            ),
                            child: Column(
                              children: [
                                for (final step in steps)
                                  _StepLine(
                                    key: ValueKey('card-step-${step.id}'),
                                    step: step,
                                    onTap: onStepCheck == null
                                        ? null
                                        : () => onStepCheck!(step),
                                  ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  mark,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StepLine extends StatelessWidget {
  const _StepLine({required this.step, required this.onTap, super.key});

  final TaskStep step;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final y = step.checked;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 32),
        child: Row(
          children: [
            Container(
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                color: y ? colors.success : null,
                borderRadius: BorderRadius.circular(5),
                border: y
                    ? null
                    : Border.all(color: colors.textSecondary, width: 1.5),
              ),
              child: y
                  ? AppIcon(
                      AppIcons.checkRounded,
                      size: 11,
                      color: onPracticeAccent(colors.success),
                    )
                  : null,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text(
                  step.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.bodySmall.copyWith(
                    color: y ? colors.textSecondary : colors.text,
                    decoration: y ? TextDecoration.lineThrough : null,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Today at a glance: a ring (done of today's), what is overdue, the next
/// time, and the week as seven small bars.
class TasksHero extends StatelessWidget {
  const TasksHero({
    required this.t,
    required this.formats,
    required this.active,
    required this.doneToday,
    required this.now,
    this.firstWeekday = DateTime.monday,
    super.key,
  });

  /// Owner 2026-10-15: the week strip starts on the locale's first day.
  final int firstWeekday;
  final Translator t;
  final L10nFormats formats;

  /// The open tasks.
  final List<TaskItem> active;

  /// How many tasks were finished today.
  final int doneToday;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final today = DateTime(now.year, now.month, now.day);
    DateTime? dueOf(TaskItem x) => x.nextDueAt?.toLocal();
    bool onDay(TaskItem x, DateTime d) {
      final due = dueOf(x);
      return due != null && DateUtils.isSameDay(due, d);
    }

    final todays = [
      for (final x in active)
        if (onDay(x, today)) x,
    ];
    final overdue = [
      for (final x in active)
        if (x.isOverdue(now)) x,
    ];
    final left = todays.length;
    final total = left + doneToday;
    final nextTimed = [
      for (final x in todays)
        if (dueOf(x) != null && !dueOf(x)!.isBefore(now)) dueOf(x)!,
    ]..sort();
    final weekStart = weekStartOf(today, firstWeekday);
    final counts = [
      for (var i = 0; i < 7; i++)
        active.where((x) => onDay(x, weekStart.add(Duration(days: i)))).length,
    ];
    final maxCount = counts.fold<int>(1, math.max);
    final accent = colors.info;
    final sub = [
      if (overdue.isNotEmpty)
        t.t('tasks.hero.overdue', {'n': '${overdue.length}'}),
      if (nextTimed.isNotEmpty)
        t.t('tasks.hero.next', {'time': formats.time(nextTimed.first)})
      else if (left == 0)
        t.t('tasks.hero.free'),
    ].join('. ');
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card + 2),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          TaskRing(
            progress: total == 0 ? 0 : doneToday / total,
            color: accent,
            size: 52,
            stroke: 5,
            child: Text(
              '$doneToday/$total',
              maxLines: 1,
              style: type.bodySmall.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.t('tasks.hero.today', {'n': '$left'}),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.bodySmall.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (sub.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      sub,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    for (var i = 0; i < 7; i++) ...[
                      if (i > 0) const SizedBox(width: 5),
                      Expanded(
                        child: _WeekBar(
                          label: formats.weekdayNarrow(
                            weekStart.add(Duration(days: i)),
                          ),
                          fraction: counts[i] / maxCount,
                          today: DateUtils.isSameDay(
                            weekStart.add(Duration(days: i)),
                            today,
                          ),
                          accent: accent,
                          count: counts[i],
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _WeekBar extends StatelessWidget {
  const _WeekBar({
    required this.label,
    required this.fraction,
    required this.today,
    required this.accent,
    required this.count,
  });

  final String label;
  final double fraction;
  final bool today;
  final Color accent;
  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final base = practiceCardBase(colors);
    return Semantics(
      label: '$label: $count',
      excludeSemantics: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            height: 16,
            decoration: BoxDecoration(
              color: colors.chip,
              borderRadius: BorderRadius.circular(6),
              border: today ? Border.all(color: colors.text) : null,
            ),
            clipBehavior: Clip.antiAlias,
            alignment: Alignment.bottomCenter,
            child: FractionallySizedBox(
              heightFactor: count == 0 ? 0 : (0.25 + 0.75 * fraction),
              widthFactor: 1,
              child: ColoredBox(color: accent.withValues(alpha: 0.5)),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            style: type.caption.copyWith(
              color: readableOn(
                today ? colors.text : colors.textSecondary,
                base,
              ),
              fontWeight: today ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }
}

/// A case with how far its tasks are: tapping it narrows the board.
class TaskCaseRing extends StatelessWidget {
  const TaskCaseRing({
    required this.title,
    required this.progress,
    required this.accent,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final String title;
  final double progress;
  final Color accent;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      label: '$title ${(progress * 100).round()}%',
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          width: 116,
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? colors.text : colors.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              TaskRing(
                progress: progress,
                color: accent,
                size: 28,
                stroke: 3,
                child: Text(
                  '${(progress * 100).round()}',
                  maxLines: 1,
                  style: type.caption.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                    height: 1.2,
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

/// Owner 2026-10-15: a compact chip (30 dp, 13 sp) for the views and the
/// slices of the board; the chosen one is filled with the text colour.
class MiniChip extends StatelessWidget {
  const MiniChip({
    required this.label,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final bg = selected ? colors.text : colors.chip;
    final fg = selected
        ? onPracticeAccent(colors.text)
        : readableOn(colors.textSecondary, practiceCardBase(colors));
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          height: 30,
          constraints: const BoxConstraints(minWidth: 44),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(15),
          ),
          child: Center(
            widthFactor: 1,
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.bodySmall.copyWith(
                color: fg,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
