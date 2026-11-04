import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/theme/theme_picker_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/recommended_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../features/social/social_fakes.dart';
import '../../../helpers/overflow_harness.dart' show overflowLocales;
import '../../../helpers/ux_harness.dart';

/// Desktop web plan 2026-10-28, PR 5: on a desktop window (>= 1024) every
/// bottom sheet is a centred window — at most 480 wide and 80 % high, the
/// same content, Esc or a click on the dim background closes it, Tab stays
/// inside. A phone keeps the sheet that rises from the bottom.
void main() {
  setUpAll(initializeDateFormatting);
  tearDown(() => adaptiveShellOverride = null);

  // Three representative sheets: one through the shared helper as it always
  // was, and two that used to call showModalBottomSheet themselves.
  final sheets = <String, Future<void> Function(BuildContext)>{
    'theme picker': ThemePickerSheet.show,
    'post text (was its own modal sheet)': (c) => showPostTextSheet(
          c,
          fakePost('p1')
              .copyWith(body: List.filled(80, 'A long line.').join('\n')),
        ),
    'recommended (was its own modal sheet)': showRecommendedSheet,
  };

  // The visible window (the dialog's own Material, not the full-screen
  // route around it).
  final window = find
      .descendant(
        of: find.byType(DesktopSheetDialog),
        matching: find.byType(Material),
      )
      .first;

  Future<void> open(WidgetTester t, Size size, String name) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    adaptiveShellOverride = true;
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await t.pumpWidget(
      uxApp(
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => sheets[name]!(context),
              child: const Text('open'),
            ),
          ),
        ),
        theme: AppTheme.light(),
        size: size,
        overrides: [
          ...uxOverrides(translator: overflowLocales().values.first.$1),
          sharedPreferencesProvider.overrideWithValue(prefs),
        ],
      ),
    );
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
  }

  for (final name in sheets.keys) {
    group(name, () {
      testWidgets('desktop 1440: a window, not a sheet', (t) async {
        await open(t, const Size(1440, 900), name);
        expect(find.byType(DesktopSheetDialog), findsOneWidget);
        expect(find.byType(BottomSheet), findsNothing);
        final box = t.getRect(window);
        expect(box.width, lessThanOrEqualTo(480));
        expect(box.height, lessThanOrEqualTo(900 * 0.8 + 0.5));
        // Centred, not stuck to the bottom.
        expect(box.center.dx, closeTo(720, 1));
        expect(box.bottom, lessThan(900));
        expect(t.takeException(), isNull);
      });

      testWidgets('Esc closes it', (t) async {
        await open(t, const Size(1440, 900), name);
        await t.sendKeyEvent(LogicalKeyboardKey.escape);
        await t.pumpAndSettle();
        expect(find.byType(DesktopSheetDialog), findsNothing);
      });

      testWidgets('a click on the dim background closes it', (t) async {
        await open(t, const Size(1440, 900), name);
        await t.tapAt(const Offset(10, 10));
        await t.pumpAndSettle();
        expect(find.byType(DesktopSheetDialog), findsNothing);
      });

      testWidgets('phone 390: still the sheet from the bottom', (t) async {
        await open(t, const Size(390, 844), name);
        expect(find.byType(BottomSheet), findsOneWidget);
        expect(find.byType(DesktopSheetDialog), findsNothing);
        expect(t.takeException(), isNull);
      });
    });
  }

  testWidgets('Tab stays inside the window', (t) async {
    await open(t, const Size(1440, 900), 'theme picker');
    for (var i = 0; i < 12; i++) {
      await t.sendKeyEvent(LogicalKeyboardKey.tab);
      await t.pump();
      final focus = FocusManager.instance.primaryFocus?.context;
      if (focus == null) continue;
      // The page behind (its Scaffold, its button) never gets the focus.
      expect(
        focus.findAncestorWidgetOfExactType<Scaffold>(),
        isNull,
        reason: 'focus left the window on Tab $i',
      );
    }
  });

  testWidgets('a short window scrolls its content, nothing overflows',
      (t) async {
    await open(t, const Size(1100, 400), 'post text (was its own modal sheet)');
    expect(
      t.getRect(window).height,
      lessThanOrEqualTo(400 * 0.8 + 0.5),
    );
    expect(t.takeException(), isNull);
  });
}
