import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart'
    show initialsOf;
import 'package:lawbid/features/team/domain/team_models.dart';

/// Initials of a free-form name ("Anna Kowalski" → "AK").
String personInitials(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return initialsOf(
    parts.isEmpty ? null : parts.first,
    parts.length > 1 ? parts.last : null,
  );
}

/// A person's small round picture (their photo or initials).
class TaskPersonAvatar extends StatelessWidget {
  const TaskPersonAvatar({
    required this.name,
    this.avatarUrl,
    this.size = 36,
    super.key,
  });

  final String name;
  final String? avatarUrl;
  final double size;

  @override
  Widget build(BuildContext context) => AppAvatar(
        size: size,
        imageProvider: avatarUrl == null
            ? null
            : appNetworkImage(avatarUrl!, decodeWidthFor(size)),
        initials: personInitials(name),
        semanticLabel: name,
      );
}

// --- Small choices ----------------------------------------------------------

/// Reminder choices, minutes before the time (null = none).
const taskRemindChoices = <int?>[null, 0, 10, 30, 60, 120, 1440, 2880, 10080];

String taskRemindLabel(Translator t, int? min) => switch (min) {
      null => t.t('tasks.remind.none'),
      0 => t.t('tasks.remind.atTime'),
      < 60 => t.t('tasks.remind.min', {'n': '$min'}),
      < 1440 => t.t('tasks.remind.hours', {'n': '${min ~/ 60}'}),
      < 10080 => t.t('tasks.remind.days', {'n': '${min ~/ 1440}'}),
      _ => t.t('tasks.remind.week'),
    };

String taskRepeatLabel(Translator t, TaskRepeat r) =>
    t.t('tasks.repeat.${r.wire}');

String taskPriorityLabel(Translator t, TaskPriority p) =>
    t.t('tasks.priority.${p.wire}');

/// A plain list of choices in a sheet; returns the picked index.
Future<int?> showChoiceSheet(
  BuildContext context, {
  required String title,
  required List<String> labels,
  int? selected,
  String keyPrefix = 'choice',
}) =>
    showAppBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final colors = Theme.of(ctx).extension<AppColorTokens>()!;
        final typography = Theme.of(ctx).extension<AppTypographyTokens>()!;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(ctx).height * 0.7,
            ),
            // Owner 2026-10-24: same place as before, only a little more
            // room under the last row so it is not squeezed at the bottom.
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.only(bottom: AppSpacing.xl),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    0,
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                  ),
                  child: Text(
                    title,
                    style: typography.titleMedium.copyWith(color: colors.text),
                  ),
                ),
                for (final (i, l) in labels.indexed)
                  AppListRow(
                    key: ValueKey('$keyPrefix-$i'),
                    label: l,
                    selected: i == selected,
                    showChevron: false,
                    onTap: () => Navigator.of(ctx).pop(i),
                  ),
              ],
            ),
          ),
        );
      },
    );
