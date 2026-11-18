import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/core/navigation/router_error_screen.dart';
import 'package:material_ui/material_ui.dart';

/// Row 148 (go_router 17 -> 18): go_router 18 looks for package:material_ui's
/// MaterialApp (the app's own since row 237, Flutter 3.50); inside the old
/// flutter/material one it would build every
/// `builder:` route as a NoTransitionPage, give its navigators a plain
/// HeroController and show the plain error page. The app builds its own
/// pages, so links, back and the look stay as on go_router 17.
void main() {
  GoRouter router({String initial = '/feed'}) => GoRouter(
        initialLocation: initial,
        errorPageBuilder: (context, state) => AppPageTransitions.material(
          state,
          RouterErrorScreen(state.error),
        ),
        routes: [
          StatefulShellRoute.indexedStack(
            pageBuilder: (context, state, shell) =>
                AppPageTransitions.fade(state, Scaffold(body: shell)),
            branches: [
              StatefulShellBranch(
                routes: [
                  GoRoute(
                    path: '/feed',
                    pageBuilder: (context, state) =>
                        AppPageTransitions.material(
                      state,
                      const Text('feed'),
                    ),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/lawyer/:handle',
            pageBuilder: (context, state) => AppPageTransitions.push(
              state,
              Scaffold(body: Text('lawyer ${state.pathParameters['handle']}')),
            ),
          ),
        ],
      );

  Future<GoRouter> pump(WidgetTester tester, {String initial = '/feed'}) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final r = router(initial: initial);
    addTearDown(r.dispose);
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(
          theme: AppTheme.light().copyWith(
            pageTransitionsTheme: kBackSwipeTransitions,
          ),
          routerConfig: r,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return r;
  }

  // Row 237 (Flutter 3.50): the app's MaterialApp is package:material_ui's
  // now, so go_router 18 recognises it and a plain `builder:` route gets
  // its MaterialPage again (it was a NoTransitionPage inside the old
  // flutter/material one). The app's routes still build their own pages.
  testWidgets(
      'a plain `builder:` route gets a MaterialPage on 18 inside the '
      'material_ui MaterialApp', (tester) async {
    final r = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const Text('plain')),
      ],
    );
    addTearDown(r.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: r));
    await tester.pumpAndSettle();
    final route = ModalRoute.of(tester.element(find.text('plain')))!;
    expect(route.settings, isA<MaterialPage<void>>());
    expect(route.settings, isNot(isA<NoTransitionPage<void>>()));
  });

  testWidgets('a tab root is a MaterialPage, as on go_router 17',
      (tester) async {
    final r = await pump(tester);
    expect(r.routerDelegate.currentConfiguration.matches, isNotEmpty);
    final route = ModalRoute.of(tester.element(find.text('feed')))!;
    expect(route, isA<PageRoute<void>>());
    expect(route.settings, isA<MaterialPage<void>>());
    expect(route.settings, isNot(isA<NoTransitionPage<void>>()));
  });

  testWidgets('a deep link opens its page with its parameters', (tester) async {
    await pump(tester, initial: '/lawyer/anna');
    expect(find.text('lawyer anna'), findsOneWidget);
  });

  testWidgets('a pushed page goes back by the system back and by a swipe',
      (tester) async {
    final r = await pump(tester);
    unawaited(r.push('/lawyer/anna'));
    await tester.pumpAndSettle();
    expect(find.text('lawyer anna'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('lawyer anna'), findsNothing);
    expect(find.text('feed'), findsOneWidget);

    unawaited(r.push('/lawyer/bob'));
    await tester.pumpAndSettle();
    // Swipe from the left edge to the right (AppBackSwipeTransitionsBuilder).
    final g = await tester.startGesture(const Offset(5, 400));
    for (var i = 0; i < 10; i++) {
      await g.moveBy(const Offset(30, 1));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await g.up();
    await tester.pumpAndSettle();
    expect(find.text('lawyer bob'), findsNothing);
    expect(find.text('feed'), findsOneWidget);
  });

  testWidgets('an unknown address shows the Material error page',
      (tester) async {
    await pump(tester, initial: '/no/such/page');
    expect(find.byType(RouterErrorScreen), findsOneWidget);
    expect(find.byType(AppBar), findsOneWidget);
  });

  testWidgets('the gallery hero flies along the Material arc', (tester) async {
    expect(
      materialHeroTween(Rect.zero, const Rect.fromLTWH(0, 0, 10, 10)),
      isA<MaterialRectArcTween>(),
    );
    const hero = Hero(
      tag: 't',
      createRectTween: materialHeroTween,
      child: SizedBox(),
    );
    expect(hero.createRectTween, materialHeroTween);
  });
}
