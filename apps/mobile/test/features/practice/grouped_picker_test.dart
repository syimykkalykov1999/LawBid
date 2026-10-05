import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';

import '../../helpers/long_locale.dart';

/// Owner 2026-10-05: the topic pickers show categories as collapsible
/// groups (like the qualification editor) instead of one long list.
void main() {
  const options = [
    PickerOption(value: 'news', label: 'News'),
    PickerOption(value: 'criminal', label: 'Criminal Defense'),
    PickerOption(
      value: 'criminal.felonies',
      label: 'Felonies',
      group: 'Criminal Defense',
      nested: true,
    ),
    PickerOption(
      value: 'criminal.dui',
      label: 'DUI and DWI',
      group: 'Criminal Defense',
      nested: true,
    ),
    PickerOption(value: 'family', label: 'Family Law'),
    PickerOption(
      value: 'family.divorce',
      label: 'Divorce',
      group: 'Family Law',
      nested: true,
    ),
  ];

  test('nested options join the option above', () {
    final groups = groupOptions(options);
    expect(groups.map((g) => g.head.value), ['news', 'criminal', 'family']);
    expect(groups[0].children, isEmpty);
    expect(
      groups[1].children.map((o) => o.value),
      ['criminal.felonies', 'criminal.dui'],
    );
  });

  Future<void> open(
    WidgetTester tester, {
    Set<String> initial = const {},
    Translator translator = const StaticTranslatorEn(),
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [translatorProvider.overrideWithValue(translator)],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => OptionPickerSheet.show(
                    context,
                    title: 'Topics',
                    multi: true,
                    initial: initial,
                    options: options,
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('groups start closed, open on tap, and pick inside',
      (tester) async {
    await open(tester, initial: {'criminal.dui'});
    // Closed: the subtopics are hidden, the group shows what is picked.
    expect(find.text('Felonies'), findsNothing);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('picker-group-criminal')),
        matching: find.text('1'),
      ),
      findsOneWidget,
    );

    await tester.tap(find.text('Criminal Defense'));
    await tester.pumpAndSettle();
    expect(find.text('Felonies'), findsOneWidget);
    expect(find.text('Divorce'), findsNothing);

    await tester.tap(find.text('Felonies'));
    await tester.tap(find.byKey(const ValueKey('picker-all-criminal')));
    await tester.pumpAndSettle();
    // The category itself + two subtopics.
    expect(find.textContaining('· 3'), findsOneWidget);
  });

  testWidgets('typing searches every subtopic, flat', (tester) async {
    await open(tester);
    await tester.enterText(find.byType(EditableText), 'divor');
    await tester.pumpAndSettle();
    expect(find.text('Divorce'), findsOneWidget);
    expect(find.byKey(const ValueKey('picker-group-family')), findsNothing);
  });

  testWidgets('longest translations fit on a narrow phone', (tester) async {
    useNarrowPhone(tester);
    await open(tester, initial: {'criminal'}, translator: LongestTranslator());
    await tester.tap(find.text('Criminal Defense'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
