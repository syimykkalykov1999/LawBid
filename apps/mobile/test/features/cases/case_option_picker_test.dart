import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_option_picker.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-11-05: the list is open with nothing picked; a pick folds it
/// and the field names it; a tap on the field opens it again.
void main() {
  testWidgets('open, pick folds, tap opens again', (tester) async {
    String? value;
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: StatefulBuilder(
            builder: (context, set) => CaseOptionPicker<String>(
              label: 'Fee',
              value: value,
              options: const [
                CaseOption('a', 'Fixed', 'One sum'),
                CaseOption('b', 'Hourly', 'Each hour'),
              ],
              onChanged: (v) => set(() => value = v),
            ),
          ),
        ),
        theme: AppTheme.light(),
        disableAnimations: true,
      ),
    );
    expect(find.text('One sum'), findsOneWidget);
    expect(find.text('Each hour'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('option-picker-b')));
    await tester.pumpAndSettle();
    expect(value, 'b');
    expect(find.text('Hourly'), findsOneWidget);
    expect(find.text('Fixed'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('option-picker-field')));
    await tester.pumpAndSettle();
    expect(find.text('Fixed'), findsOneWidget);
    expect(find.text('One sum'), findsOneWidget);
  });

  testWidgets('startOpen stands open over a default, a pick folds',
      (tester) async {
    String? value = 'b';
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: StatefulBuilder(
            builder: (context, set) => CaseOptionPicker<String>(
              label: 'Fee',
              value: value,
              startOpen: true,
              options: const [
                CaseOption('a', 'Fixed', 'One sum'),
                CaseOption('b', 'Later', 'Agree later'),
              ],
              onChanged: (v) => set(() => value = v),
            ),
          ),
        ),
        theme: AppTheme.light(),
        disableAnimations: true,
      ),
    );
    expect(find.text('One sum'), findsOneWidget);
    expect(find.text('Agree later'), findsOneWidget);
    // The choice stands on top, once, with its hint.
    expect(find.text('Later'), findsOneWidget);
    expect(find.byKey(const ValueKey('option-picker-b')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('option-picker-a')));
    await tester.pumpAndSettle();
    expect(value, 'a');
    expect(find.text('One sum'), findsNothing);
    expect(find.text('Later'), findsNothing);

    // The default stays in the list and can be picked back.
    await tester.tap(find.byKey(const ValueKey('option-picker-field')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('option-picker-b')));
    await tester.pumpAndSettle();
    expect(value, 'b');
    expect(find.text('Later'), findsOneWidget);
    expect(find.text('Fixed'), findsNothing);
  });
}
