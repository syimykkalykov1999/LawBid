import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

/// Owner 2026-10-20: the service line of a group chat («Ann added Bob»)
/// reads in every theme: its text is the chat's own «their» ink on the
/// «their» plate.
void main() {
  for (final id in AppThemeId.values) {
    test('group system line is readable in ${id.name}', () {
      final theme = AppTheme.of(id);
      final colors = theme.extension<AppColorTokens>()!;
      final chat = ChatColors.forTokens(colors, theme.brightness);
      final plate = Color.alphaBlend(
        chat.theirs.withValues(alpha: 0.92),
        chat.wallpaper,
      );
      expect(
        contrastRatio(chat.onTheirs, plate),
        greaterThanOrEqualTo(4.5),
        reason: 'system line text in ${id.name}',
      );
    });
  }
}
