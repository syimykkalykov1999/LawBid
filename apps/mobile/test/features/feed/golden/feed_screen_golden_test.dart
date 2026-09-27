import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';

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
          overrides: uxOverrides(),
          disableAnimations: true,
        ),
        surfaceSize: const Size(390, 844),
      );
      await screenMatchesGolden(tester, 'feed_screen_${entry.key}');
    });
  }

  testWidgets('the feed-header logo never animates', (tester) async {
    await tester.pumpWidget(
      uxApp(
        const FeedScreen(),
        theme: AppTheme.light(),
        overrides: uxOverrides(),
      ),
    );
    await tester.pumpAndSettle();
    final logo = tester.widget<ScalesLogo>(find.byType(ScalesLogo));
    expect(logo.animated, isFalse);
    expect(logo.size, AppSizes.feedHeaderLogo);
    expect(tester.hasRunningAnimations, isFalse);
    expect(find.bySemanticsLabel('LawBid'), findsOneWidget);
  });
}
