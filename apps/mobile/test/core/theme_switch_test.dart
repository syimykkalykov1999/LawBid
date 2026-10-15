import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-15: switching between any two themes settles — no endless
/// animation, no exception — also while a list scrolls.
void main() {
  testWidgets('every theme to every other settles', (tester) async {
    final id = ValueNotifier<AppThemeId>(AppThemeId.values.first);
    await tester.pumpWidget(
      ValueListenableBuilder<AppThemeId>(
        valueListenable: id,
        builder: (_, v, __) => MaterialApp(
          theme: AppTheme.of(v),
          home: Scaffold(
            body: ListView(
              children: [
                for (var i = 0; i < 40; i++)
                  ListTile(title: Text('Row $i'), subtitle: const Text('x')),
              ],
            ),
          ),
        ),
      ),
    );
    for (final from in AppThemeId.values) {
      for (final to in AppThemeId.values) {
        if (from == to) continue;
        id.value = from;
        await tester.pump();
        id.value = to;
        // pumpAndSettle throws if frames never stop.
        await tester.pumpAndSettle(const Duration(milliseconds: 50));
        await tester.drag(find.byType(ListView), const Offset(0, -200));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: '$from → $to');
        expect(
          Theme.of(tester.element(find.byType(ListView))).brightness,
          AppTheme.of(to).brightness,
        );
      }
    }
  });
}
