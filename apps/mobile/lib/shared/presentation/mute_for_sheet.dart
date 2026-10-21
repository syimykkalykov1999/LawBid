import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Owner 2026-10-21 (inbox 27, Telegram): how long the notifications of a
/// chat, a group or a channel stay off — the same four choices everywhere.
enum MuteFor { hour, hours8, days2, forever }

/// «Forever» is a moment far ahead: the servers keep a `mutedUntil` and turn
/// the sound back on by themselves once it has passed.
const Duration kMuteForever = Duration(days: 3650);

/// The moment the notifications come back for [choice].
DateTime muteUntilFor(MuteFor choice, {DateTime? now}) {
  final at = now ?? DateTime.now();
  return at.add(
    switch (choice) {
      MuteFor.hour => const Duration(hours: 1),
      MuteFor.hours8 => const Duration(hours: 8),
      MuteFor.days2 => const Duration(days: 2),
      MuteFor.forever => kMuteForever,
    },
  );
}

/// The label key of [choice] (shared by every mute sheet).
String muteForLabelKey(MuteFor choice) => switch (choice) {
      MuteFor.hour => 'group.info.mute.hour',
      MuteFor.hours8 => 'group.info.mute.hours8',
      MuteFor.days2 => 'group.info.mute.days2',
      MuteFor.forever => 'group.info.mute.forever',
    };

/// «Mute for…»: 1 hour · 8 hours · 2 days · forever. Returns the moment the
/// sound comes back, or null when the sheet was dismissed.
Future<DateTime?> pickMuteUntil(BuildContext context, Translator t) async {
  final pick = await showAppBottomSheet<MuteFor>(
    context: context,
    builder: (sheet) {
      final colors = Theme.of(sheet).extension<AppColorTokens>()!;
      final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
      return SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: AppSpacing.sm),
              const Center(child: AppSheetHandle()),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.xs,
                ),
                child: Text(
                  t.t('group.info.mute.title'),
                  key: const ValueKey('mute-for-title'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
              for (final c in MuteFor.values)
                AppListRow(
                  key: ValueKey('mute-for-${c.name}'),
                  icon: c == MuteFor.forever
                      ? AppIcons.notificationsOffOutlined
                      : AppIcons.scheduleRounded,
                  label: t.t(muteForLabelKey(c)),
                  showChevron: false,
                  onTap: () => Navigator.of(sheet).pop(c),
                ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        ),
      );
    },
  );
  return pick == null ? null : muteUntilFor(pick);
}
