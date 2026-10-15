import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-15: in Glass the theme's own `surface` is see-through, and
/// anything popping up on top of the screen (sheets, dialogs, menus,
/// dropdowns, pickers, the pull-to-refresh circle) became unreadable. Every
/// popup layer of every theme is solid, and no sheet, dialog or refresh
/// circle paints itself with the see-through `colors.surface`.
void main() {
  for (final id in AppThemeId.values) {
    test('every popup layer is solid in ${id.name}', () {
      final t = AppTheme.of(id);
      expect(t.colorScheme.surface.a, 1.0, reason: 'colorScheme.surface');
      expect(t.dialogTheme.backgroundColor!.a, 1.0, reason: 'dialog');
      expect(t.bottomSheetTheme.backgroundColor!.a, 1.0, reason: 'sheet');
      expect(t.popupMenuTheme.color!.a, 1.0, reason: 'popup menu');
      expect(t.datePickerTheme.backgroundColor!.a, 1.0, reason: 'date');
      expect(t.timePickerTheme.backgroundColor!.a, 1.0, reason: 'time');
      expect(
        t.menuTheme.style!.backgroundColor!.resolve({})!.a,
        1.0,
        reason: 'menu',
      );
      expect(
        t.dropdownMenuTheme.menuStyle!.backgroundColor!.resolve({})!.a,
        1.0,
        reason: 'dropdown',
      );
      expect(
        t.progressIndicatorTheme.refreshBackgroundColor!.a,
        1.0,
        reason: 'pull to refresh',
      );
    });
  }

  test('no sheet, dialog or refresh circle uses the see-through surface', () {
    final bad = <String>[];
    final re = RegExp(r'backgroundColor:\s*colors\.surface\b');
    for (final f
        in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart') || f.path.endsWith('.g.dart')) continue;
      final lines = f.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (!re.hasMatch(lines[i])) continue;
        final before = lines.sublist(i < 6 ? 0 : i - 6, i).join('\n');
        if (RegExp(
          r'AppAlertDialog|AlertDialog|RefreshIndicator|showModalBottomSheet|showAppBottomSheet|BottomSheet\(',
        ).hasMatch(before)) {
          bad.add('${f.path}:${i + 1}');
        }
      }
    }
    expect(bad, isEmpty);
  });
}
