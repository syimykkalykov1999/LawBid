import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/deeplinks/deep_link_controller.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

// Click audit 2026-11-08 (web): a reloaded `/profile` opened the feed —
// the guard's splash → feed redirect landed after the link's go().
void main() {
  GoRouter router() => GoRouter(
        initialLocation: AppRoutes.splash,
        routes: [
          for (final p in [AppRoutes.splash, AppRoutes.feed, AppRoutes.profile])
            GoRoute(path: p, builder: (_, __) => Text(p)),
        ],
      );

  String where(GoRouter r) => r.routerDelegate.currentConfiguration.uri.path;

  testWidgets(
      'a link that arrives on the splash opens after the guard moves on',
      (tester) async {
    final r = router();
    await tester.pumpWidget(MaterialApp.router(routerConfig: r));
    goAfterSplash(r, AppRoutes.profile);
    await tester.pumpAndSettle();
    expect(where(r), AppRoutes.splash);
    // The guard: splash → feed.
    r.go(AppRoutes.feed);
    await tester.pumpAndSettle();
    expect(where(r), AppRoutes.profile);
  });

  testWidgets('off the splash the link opens at once', (tester) async {
    final r = router();
    await tester.pumpWidget(MaterialApp.router(routerConfig: r));
    r.go(AppRoutes.feed);
    await tester.pumpAndSettle();
    goAfterSplash(r, AppRoutes.profile);
    await tester.pumpAndSettle();
    expect(where(r), AppRoutes.profile);
  });
}
