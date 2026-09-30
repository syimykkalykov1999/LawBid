import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';

import '../../../helpers/ux_harness.dart';

/// Feed tab golden (docs/07 §10 header with the small static ScalesLogo;
/// empty state with the content-card preview), both themes.
void main() {
  for (final entry in {
    'light': AppTheme.light(),
    'dark': AppTheme.dark(),
  }.entries) {
    testGoldens('feed screen - ${entry.key}', (tester) async {
      await tester.pumpWidgetBuilder(
        const FeedScreen(),
        wrapper: (child) => uxApp(
          child,
          theme: entry.value,
          overrides: [
            ...uxOverrides(),
            // The topic slider reads practice names; no network in tests.
            practiceTreeProvider.overrideWith((ref) async => const []),
          ],
          disableAnimations: true,
        ),
        surfaceSize: const Size(390, 844),
      );
      await screenMatchesGolden(tester, 'feed_screen_${entry.key}');
    });
  }

  testWidgets('client feed header: scales mark left, wordmark centred (owner 2026-09-30)',
      (tester) async {
    await tester.pumpWidget(
      uxApp(
        const FeedScreen(),
        theme: AppTheme.light(),
        overrides: [
            ...uxOverrides(),
            // The topic slider reads practice names; no network in tests.
            practiceTreeProvider.overrideWith((ref) async => const []),
          ],
      ),
    );
    // The header scales animate forever (owner 2026-09-30), so no settle.
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(ScalesLogo), findsOneWidget);
    expect(find.bySemanticsLabel('LawBid'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 30));
  });

}
