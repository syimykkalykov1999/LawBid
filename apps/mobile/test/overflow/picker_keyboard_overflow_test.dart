import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-15: the topic picker opened with the keyboard showed the
/// yellow "BOTTOM OVERFLOWED" stripes. On a 360 dp phone with the keyboard
/// up, the search, the list and the pinned «Готово» must all fit.
void main() {
  for (final scale in [1.0, 1.3]) {
    testWidgets('topic picker with the keyboard open, text x$scale',
        (tester) async {
      useNarrowPhone(tester);
      await tester.pumpWidget(
        uxApp(
          Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => OptionPickerSheet.show(
                    context,
                    title: 'Qualification',
                    searchHint: 'Start typing',
                    unknownLabel: 'Not sure',
                    confirm: true,
                    initial: const {},
                    options: [
                      for (var c = 0; c < 6; c++) ...[
                        PickerOption(value: 'c$c', label: 'Category $c'),
                        for (var l = 0; l < 4; l++)
                          PickerOption(
                            value: 'c$c.l$l',
                            label: 'Subcategory $c.$l',
                            group: 'Category $c',
                            nested: true,
                          ),
                      ],
                    ],
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
          theme: AppTheme.dark(),
          textScale: scale,
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);

      // The keyboard opens (300 dp) with some text in the search.
      tester.view.viewInsets = const FakeViewPadding(bottom: 300 * 3.0);
      await tester.enterText(find.byType(TextField).first, 'visa');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      addTearDown(tester.view.resetViewInsets);
    });
  }
}
