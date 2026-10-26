import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/shared/application/handle_check.dart';
import 'package:lawbid/shared/presentation/handle_hints.dart';

import '../helpers/ux_harness.dart';

void main() {
  Future<List<String>> pump(WidgetTester tester, HandleVerdict verdict) async {
    final picked = <String>[];
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: HandleHints(
            text: 'lawbidfan',
            kind: 'channel',
            onPick: picked.add,
          ),
        ),
        size: const Size(360, 640),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            handleCheckProvider.overrideWith((ref, q) async => verdict),
          ],
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pumpAndSettle();
    return picked;
  }

  testWidgets('a free handle says so and offers nothing', (tester) async {
    await pump(tester, const HandleVerdict(available: true));
    expect(find.byKey(const ValueKey('handle-verdict')), findsOneWidget);
    expect(find.textContaining('lawbid_fan'), findsNothing);
  });

  testWidgets('a refused handle shows ideas; a tap picks one', (tester) async {
    final picked = await pump(
      tester,
      const HandleVerdict(
        available: false,
        reason: 'similar',
        suggestions: ['lawbid_fan', 'lawbidfan1'],
      ),
    );
    expect(find.text('Too similar to an existing name.'), findsOneWidget);
    await tester.tap(
      find.byKey(const ValueKey('username-suggestion-lawbid_fan')),
    );
    expect(picked, ['lawbid_fan']);
  });
}
