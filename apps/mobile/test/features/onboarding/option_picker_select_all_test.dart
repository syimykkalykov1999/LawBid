import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-15: «Select all» in a category ticked only itself — the
/// rows below stayed empty and the counter said 1.
void main() {
  testWidgets('Select all ticks every row of the category and counts them',
      (tester) async {
    useNarrowPhone(tester);
    Set<String>? result;
    await tester.pumpWidget(
      uxApp(
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async => result = await OptionPickerSheet.show(
                context,
                title: 'Qualification',
                multi: true,
                initial: const {},
                options: const [
                  PickerOption(value: 'crim', label: 'Criminal Defense'),
                  PickerOption(
                    value: 'crim.felony',
                    label: 'Felony',
                    nested: true,
                  ),
                  PickerOption(
                    value: 'crim.misd',
                    label: 'Misdemeanor',
                    nested: true,
                  ),
                  PickerOption(
                    value: 'crim.drug',
                    label: 'Drug Offenses',
                    nested: true,
                  ),
                ],
              ),
              child: const Text('open'),
            ),
          ),
        ),
        theme: AppTheme.dark(),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Criminal Defense'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Select all'));
    await tester.pumpAndSettle();

    final ticked = find.byWidgetPredicate(
      (w) => w is PickerCheckRow && w.checked,
    );
    // The «Select all» row and its three rows.
    expect(ticked, findsNWidgets(4));

    // Unticking one row keeps the other two.
    await tester.tap(find.text('Felony'));
    await tester.pumpAndSettle();
    expect(ticked, findsNWidgets(2));

    await tester.tap(find.textContaining('Done'));
    await tester.pumpAndSettle();
    expect(result, {'crim.misd', 'crim.drug'});
  });
}
