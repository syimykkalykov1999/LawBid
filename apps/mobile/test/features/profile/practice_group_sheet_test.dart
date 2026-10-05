import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/profile/presentation/widgets/attorney_profile_view.dart';

import '../../helpers/long_locale.dart';

/// Owner 2026-10-05: a practice area with many subcategories overflowed
/// the sheet ("BOTTOM OVERFLOWED BY 555 PIXELS"). With 150 long chips the
/// sheet must scroll to the last one, and a search field narrows the list.
void main() {
  final group = PracticeChipGroup(
    label: 'Причинение вреда здоровью и тяжкие телесные повреждения',
    items: [
      for (var i = 0; i < 150; i++)
        'ДТП с пешеходом или велосипедистом, случай номер $i',
    ],
  );

  Future<void> openSheet(WidgetTester tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [translatorProvider.overrideWithValue(LongestTranslator())],
        child: MaterialApp(
          theme: AppTheme.dark(),
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => showAppBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => PracticeGroupSheet(group: group),
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

  testWidgets('150 subcategories scroll inside the sheet, no overflow',
      (tester) async {
    await openSheet(tester);
    expect(tester.takeException(), isNull);
    final last = find.text(group.items.last);
    await tester.scrollUntilVisible(
      last,
      400,
      scrollable: find.byType(Scrollable).last,
    );
    expect(last, findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the search field narrows a long group', (tester) async {
    await openSheet(tester);
    await tester.enterText(
      find.byKey(const ValueKey('practice-group-search')),
      'номер 149',
    );
    await tester.pumpAndSettle();
    expect(find.byType(AppChip), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
