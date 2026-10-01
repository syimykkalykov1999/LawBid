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
    final when = done ? (task.doneAt ?? task.dueAt) : task.dueAt;
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

/// The round checkbox of a task row: empty (open), half (taken), check
/// (done), cross (not done).
class TaskCheck extends StatelessWidget {
  const TaskCheck({
    required this.status,
    required this.onTap,
    required this.semanticLabel,
    super.key,
  });

  final TaskStatus status;
  final VoidCallback? onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    final done = status == TaskStatus.done;
    final failed = status == TaskStatus.notDone;
    final cancelled = status == TaskStatus.cancelled;
    final fill = done
        ? colors.success
        : failed
            ? colors.danger
            : Colors.transparent;
    return Semantics(
      button: onTap != null,
      checked: done,
      label: semanticLabel,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap == null
            ? null
            : () {
                HapticFeedback.lightImpact();
                onTap!();
              },
        child: SizedBox.square(
          dimension: AppSizes.touchTarget,
          child: Center(
            child: AnimatedContainer(
              duration: dur,
              curve: Curves.easeOutBack,
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: fill,
                border: Border.all(
                  color: done
                      ? colors.success
                      : failed
                          ? colors.danger
                          : status == TaskStatus.taken
                              ? colors.gold
                              : colors.textSecondary.withValues(alpha: 0.6),
                  width: 2,
                ),
              ),
              child: AnimatedSwitcher(
                duration: dur,
                transitionBuilder: (c, a) =>
                    ScaleTransition(scale: a, child: c),
                child: done
                    ? Icon(Icons.check_rounded,
                        key: const ValueKey('done'),
                        size: 17,
                        color: colors.onAccent)
                    : failed
                        ? Icon(Icons.close_rounded,
                            key: const ValueKey('failed'),
                            size: 17,
                            color: colors.onAccent)
                        : cancelled
                            ? Icon(Icons.remove_rounded,
                                key: const ValueKey('cancelled'),
                                size: 17,
                                color: colors.textSecondary)
                            : status == TaskStatus.taken
                                ? Container(
                                    key: const ValueKey('taken'),
                                    width: 10,
                                    height: 10,
                                    decoration: BoxDecoration(
                                      color: colors.gold,
                                      shape: BoxShape.circle,
                                    ),
                                  )
                                : const SizedBox.shrink(key: ValueKey('open')),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One task in the calendar list: checkbox, kind medallion, title, time /
/// place / contact line, who set it.
class TaskRow extends StatelessWidget {
  const TaskRow({
    required this.task,
    required this.t,
    required this.formats,
    required this.now,
    required this.onTap,
    this.onCheck,
    super.key,
  });

  final TaskItem task;
  final Translator t;
  final L10nFormats formats;
  final DateTime now;
  final VoidCallback onTap;

  /// Null when the viewer can't complete tasks (assistants).
  final VoidCallback? onCheck;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final overdue = task.isOverdue(now);
    final finished = !task.status.active;
    final meta = <String>[
      if (task.dueAt != null) formats.time(task.dueAt!),
      if (task.location?.isNotEmpty ?? false) task.location!,
      if (task.contactName?.isNotEmpty ?? false) task.contactName!,
      if (task.caseTitle?.isNotEmpty ?? false) task.caseTitle!,
    ];
    return Semantics(
      container: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xs,
            AppSpacing.sm,
            AppSpacing.md,
            AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(
              color: overdue
                  ? colors.danger.withValues(alpha: 0.45)
                  : colors.border,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TaskCheck(
                key: ValueKey('task-check-${task.id}'),
                status: task.status,
                onTap: onCheck,
                semanticLabel: taskStatusLabel(t, task.status),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(taskKindIcon(task.kind),
                              size: 16, color: colors.gold),
                          const SizedBox(width: 6),
                          Text(
                            taskKindLabel(t, task.kind).toUpperCase(),
                            style: typography.caption.copyWith(
                              color: colors.gold,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                            ),
                          ),
                          const Spacer(),
                          if (task.status == TaskStatus.taken)
                            _Tag(
                              label: t.t('tasks.taken'),
                              color: colors.gold,
                            )
                          else if (overdue)
                            _Tag(
                              label: t.t('tasks.overdue'),
                              color: colors.danger,
                            )
                          else if (finished)
                            _Tag(
                              label: taskStatusLabel(t, task.status),
                              color: task.status == TaskStatus.done
                                  ? colors.success
                                  : colors.textSecondary,
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        task.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: typography.body.copyWith(
                          color: finished ? colors.textSecondary : colors.text,
                          fontWeight: FontWeight.w600,
                          decoration: task.status == TaskStatus.done
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                      if (meta.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          meta.join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: typography.bodySmall
                              .copyWith(color: colors.textSecondary),
                        ),
                      ],
                      if (task.outcomeNote?.isNotEmpty ?? false) ...[
                        const SizedBox(height: 4),
                        Text(
                          '“${task.outcomeNote!}”',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: typography.bodySmall.copyWith(
                            color: colors.text,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                      const SizedBox(height: 4),
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
                                  : t.t('tasks.by',
                                      {'name': task.createdByName!}),
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
                          ],
                        ],
                      ),
                    ],
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

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        label,
        style: typography.caption.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
