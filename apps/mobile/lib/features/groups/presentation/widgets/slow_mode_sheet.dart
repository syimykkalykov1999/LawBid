import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/domain/slow_mode.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';

/// Owner 2026-11-02 (Telegram «Медленный режим»): Off · 10 s · 30 s · 1 min ·
/// 5 min · 15 min · 60 min, the current one checked. Returns the seconds
/// (0 = off) or null when dismissed or unchanged.
Future<int?> pickSlowMode(
  BuildContext context,
  Translator t, {
  required int? current,
}) async {
  final now = current ?? 0;
  final picked = await showGroupChoiceSheet<int>(
    context,
    title: t.t('group.slow.title'),
    current: now,
    choices: [
      GroupChoice(
        value: 0,
        label: t.t('contact.off'),
        icon: AppIcons.closeRounded,
      ),
      for (final s in kSlowModeChoicesS)
        GroupChoice(
          value: s,
          label: slowModeLabel(t, s),
          icon: AppIcons.timerOutlined,
        ),
    ],
  );
  return picked == null || picked == now ? null : picked;
}
