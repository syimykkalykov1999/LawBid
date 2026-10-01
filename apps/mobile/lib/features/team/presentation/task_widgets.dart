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

/// One task in the planner (owner 2026-10-01 redesign): a coloured strip
/// on the left (gold waiting · navy in progress · red overdue / not done ·
/// green done), the kind and the time on top, a bold title, place /
/// contact / case lines, who set it, and the status mark bottom-right.
/// Tap opens the task; a double tap marks it done.
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

  /// Double tap → done. Null when the viewer can't complete tasks.
  final VoidCallback? onCheck;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final overdue = task.isOverdue(now);
    final finished = !task.status.active;
    final accent = switch (task.status) {
      TaskStatus.done => colors.success,
      TaskStatus.notDone => colors.danger,
      TaskStatus.cancelled => colors.textSecondary,
      TaskStatus.taken => colors.navy,
      TaskStatus.open => overdue ? colors.danger : colors.gold,
    };
    Widget line(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(
            children: [
              Icon(icon, size: 15, color: colors.textSecondary),
              const SizedBox(width: 6),
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
    return Semantics(
      container: true,
      button: true,
      label: '${taskKindLabel(t, task.kind)}. ${task.title}. '
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
          child: Container(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.card),
              border: Border.all(
                color: overdue && !finished
                    ? colors.danger.withValues(alpha: 0.35)
                    : colors.border,
              ),
              boxShadow: [
                BoxShadow(
                  color: colors.shadow,
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(width: 5, color: accent),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.md,
                        AppSpacing.md,
                        AppSpacing.md,
                        AppSpacing.sm,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 30,
                                height: 30,
                                decoration: BoxDecoration(
                                  color: colors.goldTint,
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                  taskKindIcon(task.kind),
                                  size: 17,
                                  color: colors.goldDark,
                                ),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: Text(
                                  taskKindLabel(t, task.kind).toUpperCase(),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: typography.caption.copyWith(
                                    color: colors.goldDark,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.8,
                                  ),
                                ),
                              ),
                              if (task.dueAt != null)
                                Text(
                                  formats.time(task.dueAt!),
                                  style: typography.titleMedium.copyWith(
                                    color: overdue && !finished
                                        ? colors.dangerText
                                        : colors.text,
                                    fontFamily: typography.body.fontFamily,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            task.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: typography.body.copyWith(
                              color:
                                  finished ? colors.textSecondary : colors.text,
                              fontWeight: FontWeight.w700,
                              height: 1.3,
                              decoration: task.status == TaskStatus.done
                                  ? TextDecoration.lineThrough
                                  : null,
                            ),
                          ),
                          if (task.location?.isNotEmpty ?? false)
                            line(Icons.place_outlined, task.location!),
                          if ((task.contactName?.isNotEmpty ?? false) ||
                              (task.contactPhone?.isNotEmpty ?? false))
                            line(
                              Icons.person_outline_rounded,
                              [task.contactName, task.contactPhone]
                                  .whereType<String>()
                                  .where((x) => x.isNotEmpty)
                                  .join(' · '),
                            ),
                          if (task.caseTitle?.isNotEmpty ?? false)
                            line(Icons.work_outline_rounded, task.caseTitle!),
                          if (task.outcomeNote?.isNotEmpty ?? false) ...[
                            const SizedBox(height: 6),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(AppSpacing.sm),
                              decoration: BoxDecoration(
                                color: accent.withValues(alpha: 0.08),
                                borderRadius:
                                    BorderRadius.circular(AppRadii.field),
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
                              Flexible(
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
                                const SizedBox(width: AppSpacing.sm),
                                Icon(Icons.attach_file_rounded,
                                    size: 14, color: colors.textSecondary),
                                Text(
                                  '${task.files.length}',
                                  style: typography.caption
                                      .copyWith(color: colors.textSecondary),
                                ),
                              ],
                              const Spacer(),
                              if (overdue && !finished)
                                Padding(
                                  padding: const EdgeInsets.only(right: 6),
                                  child: _Tag(
                                    label: t.t('tasks.overdue'),
                                    color: colors.danger,
                                  ),
                                ),
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
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The status mark bottom-right: an empty ring (waiting), a navy ring
/// with a dot (in progress), a green check (done), a red cross (not
/// done), a grey dash (cancelled) — with the word next to it.
class TaskMark extends StatelessWidget {
  const TaskMark({required this.status, required this.label, super.key});

  final TaskStatus status;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    final (Color color, IconData? icon, bool filled) = switch (status) {
      TaskStatus.done => (colors.success, Icons.check_rounded, true),
      TaskStatus.notDone => (colors.danger, Icons.close_rounded, true),
      TaskStatus.cancelled => (
          colors.textSecondary,
          Icons.remove_rounded,
          true
        ),
      TaskStatus.taken => (colors.navy, null, false),
      TaskStatus.open => (colors.textSecondary, null, false),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: typography.caption.copyWith(
            color: status == TaskStatus.open ? colors.textSecondary : color,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(width: 6),
        AnimatedContainer(
          duration: dur,
          curve: Curves.easeOutBack,
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: filled ? color : Colors.transparent,
            border: Border.all(
              color: filled ? color : color.withValues(alpha: 0.6),
              width: 2,
            ),
          ),
          child: AnimatedSwitcher(
            duration: dur,
            transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
            child: icon != null
                ? Icon(icon,
                    key: ValueKey(status), size: 16, color: colors.onAccent)
                : status == TaskStatus.taken
                    ? Container(
                        key: const ValueKey('taken'),
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: colors.navy,
                          shape: BoxShape.circle,
                        ),
                      )
                    : const SizedBox.shrink(key: ValueKey('open')),
          ),
        ),
      ],
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
