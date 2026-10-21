import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/domain/disappearing.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';

/// Owner 2026-10-21: «Disappearing messages» picker — Off · 24 hours ·
/// 7 days · 90 days, the current one checked. Returns the seconds (0 = off)
/// or null when dismissed or unchanged.
Future<int?> pickDisappearing(
  BuildContext context,
  Translator t, {
  required int? current,
}) async {
  final now = current ?? 0;
  final picked = await showGroupChoiceSheet<int>(
    context,
    title: t.t('dm.title'),
    current: now,
    choices: [
      GroupChoice(
        value: 0,
        label: t.t('contact.off'),
        icon: AppIcons.closeRounded,
      ),
      for (final s in kDisappearChoicesS)
        GroupChoice(
          value: s,
          label: disappearLabel(t, s),
          icon: AppIcons.timerOutlined,
        ),
    ],
  );
  return picked == null || picked == now ? null : picked;
}
