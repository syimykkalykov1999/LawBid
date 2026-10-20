import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/deadlines/application/deadlines_providers.dart';
import 'package:lawbid/features/deadlines/presentation/deadline_entry.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-20: the deadline calculator is switched off by default
/// (legal risk); with the flag off no entry point is drawn.
void main() {
  Future<void> pump(WidgetTester tester, {required bool enabled}) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const Column(
          children: [
            DeadlineMineEntry(),
            CaseDeadlinesRow(caseId: 'c1'),
          ],
        ),
        theme: AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
          extra: [deadlinesEnabledProvider.overrideWithValue(enabled)],
        ),
      ),
    );
    await tester.pump();
  }

  test('the bundled default is off', () {
    expect(defaultFeatureFlags['deadline_calculator'], isFalse);
  });

  testWidgets('flag off: no chip in «Моё», no row on a case', (tester) async {
    await pump(tester, enabled: false);
    expect(find.byKey(const ValueKey('mine-deadlines')), findsNothing);
    expect(find.byKey(const ValueKey('case-deadlines')), findsNothing);
  });

  testWidgets('flag on: both entries are drawn', (tester) async {
    await pump(tester, enabled: true);
    expect(find.byKey(const ValueKey('mine-deadlines')), findsOneWidget);
    expect(find.byKey(const ValueKey('case-deadlines')), findsOneWidget);
  });
}
