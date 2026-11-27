import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:material_ui/material_ui.dart';

/// Owner bug 2026-11-26 (Samsung S26 Ultra, Android 16, release): «Новая
/// публикация» with the keyboard up on the place field, then ✕ / back,
/// and every following screen (Settings) ended at ~55 % of the height.
/// The phone log: the system cancelled the keyboard's hide animation
/// (`ImeTracker … onCancelled at PHASE_CLIENT_ON_CONTROLS_CHANGED`) and no
/// field asked for the keyboard again, so the reported height was stale
/// while a focus node that is not a text field held the focus. Same shape
/// as the app: a [StatefulShellRoute] for the tabs, the composer and
/// Settings on the root navigator.
void main() {
  late GoRouter router;

  Widget app() {
    final rootKey = GlobalKey<NavigatorState>();
    router = GoRouter(
      navigatorKey: rootKey,
      initialLocation: '/feed',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => Scaffold(body: shell),
          branches: [
            for (final tab in ['feed', 'chats'])
              StatefulShellBranch(
                routes: [
                  GoRoute(
                    path: '/$tab',
                    builder: (_, __) => ListView(
                      key: Key(tab),
                      children: const [SizedBox(height: 2000)],
                    ),
                  ),
                ],
              ),
          ],
        ),
        GoRoute(
          path: '/create',
          parentNavigatorKey: rootKey,
          builder: (_, __) => const Scaffold(
            body: Column(
              children: [
                TextField(key: Key('caption')),
                TextField(key: Key('place'), autofocus: true),
              ],
            ),
          ),
        ),
        GoRoute(
          path: '/settings',
          parentNavigatorKey: rootKey,
          builder: (_, __) => Scaffold(
            body: ListView(
              key: const Key('settings'),
              children: const [SizedBox(height: 2000)],
            ),
          ),
        ),
      ],
    );
    return MaterialApp.router(
      theme: AppTheme.light(),
      routerConfig: router,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          viewPadding: const EdgeInsets.only(bottom: 48),
          // flutter/flutter#191156: the phone keeps reporting the keyboard
          // after it went down.
          viewInsets: const EdgeInsets.only(bottom: 360),
        ),
        child: SystemNavBand(child: child!),
      ),
    );
  }

  Future<void> start(WidgetTester tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    tester.view
      ..physicalSize = const Size(400, 800)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    unawaited(router.push<void>('/create'));
    await tester.pumpAndSettle();
    expect(
      FocusManager.instance.primaryFocus?.context
          ?.findAncestorStateOfType<EditableTextState>(),
      isNotNull,
      reason: 'the place field has the keyboard',
    );
    // With a focused field the keyboard height still lifts the page.
    expect(
      tester.getBottomLeft(find.byKey(const Key('place'))).dy,
      lessThanOrEqualTo(800 - 360),
    );
  }

  double height(WidgetTester tester, String key) =>
      tester.getSize(find.byKey(Key(key))).height;

  testWidgets('✕ on the composer, then Settings: full height', (tester) async {
    await start(tester);
    router.pop();
    await tester.pumpAndSettle();
    expect(height(tester, 'feed'), 800 - 48);
    unawaited(router.push<void>('/settings'));
    await tester.pumpAndSettle();
    expect(height(tester, 'settings'), 800 - 48);
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets(
      'a focus that is not a text field (the tab navigator’s own node) '
      'does not let the stale keyboard height through', (tester) async {
    await start(tester);
    router.pop();
    await tester.pumpAndSettle();
    final tab = Navigator.of(tester.element(find.byKey(const Key('feed'))));
    tab.focusNode.requestFocus();
    await tester.pump();
    await tester.pump();
    expect(FocusManager.instance.primaryFocus, same(tab.focusNode));
    expect(height(tester, 'feed'), 800 - 48);
    unawaited(router.push<void>('/settings'));
    await tester.pumpAndSettle();
    tab.focusNode.requestFocus();
    await tester.pump();
    await tester.pump();
    expect(height(tester, 'settings'), 800 - 48);
    debugDefaultTargetPlatformOverride = null;
  });

  testWidgets('composer left for another tab: full height', (tester) async {
    await start(tester);
    router.go('/chats');
    await tester.pumpAndSettle();
    expect(height(tester, 'chats'), 800 - 48);
    unawaited(router.push<void>('/settings'));
    await tester.pumpAndSettle();
    expect(height(tester, 'settings'), 800 - 48);
    debugDefaultTargetPlatformOverride = null;
  });
}
