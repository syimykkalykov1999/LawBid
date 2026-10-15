import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

void main() {
  testWidgets('after Done no barrier or sheet is left, the keyboard is let go',
      (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => OptionPickerSheet.show(
                context,
                title: 'Qualification',
                confirm: true,
                unknownLabel: 'Not sure',
                initial: const {},
                options: const [
                  PickerOption(value: 'a', label: 'Alpha'),
                  PickerOption(value: 'b', label: 'Beta'),
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
    expect(find.byType(ModalBarrier), findsWidgets);
    await tester.tap(find.text('Alpha'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    final barriers = tester
        .widgetList<ModalBarrier>(find.byType(ModalBarrier))
        .where((b) => b.color != null && b.color != Colors.transparent);
    expect(barriers, isEmpty);
    expect(find.byType(OptionPickerSheet), findsNothing);
  });

  testWidgets('a tap outside keeps the topic already picked, no overlay left',
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
                confirm: true,
                initial: const {},
                options: const [
                  PickerOption(value: 'a', label: 'Alpha'),
                  PickerOption(value: 'b', label: 'Beta'),
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
    await tester.tap(find.text('Alpha'));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(180, 20)); // the scrim above the sheet
    await tester.pumpAndSettle();
    expect(result, {'a'});
    expect(find.byType(OptionPickerSheet), findsNothing);
    final barriers = tester
        .widgetList<ModalBarrier>(find.byType(ModalBarrier))
        .where((b) => b.color != null && b.color != Colors.transparent);
    expect(barriers, isEmpty);
  });
}
