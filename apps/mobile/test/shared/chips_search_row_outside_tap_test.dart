import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/shared/presentation/chips_search_row.dart';

import '../helpers/ux_harness.dart';

void _noop(String _) {}

void main() {
  Future<void> pump(WidgetTester tester) => tester.pumpWidget(
        uxApp(
          const Scaffold(
            body: Column(
              children: [
                ChipsSearchRow(
                  chips: SizedBox.shrink(),
                  hintKey: 'chat.search.hint',
                  query: '',
                  onQuery: _noop,
                ),
                Expanded(child: SizedBox.expand(key: Key('empty-space'))),
              ],
            ),
          ),
          theme: AppTheme.light(),
          disableAnimations: true,
        ),
      );

  testWidgets('a tap on empty space closes the empty search field',
      (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const ValueKey('list-search-open')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('list-search')), findsOneWidget);

    await tester.tap(find.byKey(const Key('empty-space')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('list-search')), findsNothing);
    expect(find.byKey(const ValueKey('list-search-open')), findsOneWidget);
  });

  testWidgets('with text typed, a tap outside keeps the search open',
      (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const ValueKey('list-search-open')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText), 'abc');
    await tester.tap(find.byKey(const Key('empty-space')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('list-search')), findsOneWidget);
  });
}
