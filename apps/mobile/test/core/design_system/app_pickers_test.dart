import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/pickers/app_pickers.dart';

/// Owner 2026-10-15: the date and time pickers have an opaque background in
/// every theme (Glass's own surface is see-through and the form showed
/// through the calendar), stay compact, and fit a 360 dp phone in LTR and
/// RTL without overflow.
void main() {
  Future<void> open(
    WidgetTester tester,
    AppThemeId theme, {
    required bool rtl,
    required bool time,
  }) async {
    tester.view
      ..physicalSize = const Size(360 * 3, 780 * 3)
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.of(theme),
        builder: (context, child) => Directionality(
          textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
          child: child!,
        ),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => time
                    ? showAppTimePicker(
                        context: context,
                        initialTime: const TimeOfDay(hour: 9, minute: 30),
                      )
                    : showAppDatePicker(
                        context: context,
                        initialDate: DateTime(2026, 10, 20),
                        firstDate: DateTime(2026, 10),
                        lastDate: DateTime(2028),
                      ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  for (final theme in AppThemeId.values) {
    for (final rtl in [false, true]) {
      final where = '${theme.name}${rtl ? ', RTL' : ''}';

      testWidgets('date picker is opaque and compact ($where)', (t) async {
        await open(t, theme, rtl: rtl, time: false);
        final dialog = t.widget<Dialog>(find.byType(Dialog));
        expect(dialog.backgroundColor, isNotNull);
        expect(dialog.backgroundColor!.a, 1.0);
        final size = t.getSize(
          find
              .descendant(
                of: find.byType(Dialog),
                matching: find.byType(Material),
              )
              .first,
        );
        expect(size.width, lessThanOrEqualTo(330));
        expect(size.height, lessThanOrEqualTo(520));
        expect(t.takeException(), isNull);
      });

      testWidgets('time picker is opaque and fits ($where)', (t) async {
        await open(t, theme, rtl: rtl, time: true);
        final dialog = t.widget<Dialog>(find.byType(Dialog));
        expect(dialog.backgroundColor, isNotNull);
        expect(dialog.backgroundColor!.a, 1.0);
        expect(
          t
              .getSize(
                find
                    .descendant(
                      of: find.byType(Dialog),
                      matching: find.byType(Material),
                    )
                    .first,
              )
              .width,
          lessThanOrEqualTo(360),
        );
        expect(t.takeException(), isNull);
      });
    }
  }
}
