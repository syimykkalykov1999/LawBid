import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:material_ui/material_ui.dart';

// Detective R2 item 2 (14.11): back on a screen that stands alone (web
// refresh, deep link, payment return) must lead to the parent screen.
Widget _page(String name) => Builder(
      builder: (context) => Scaffold(
        body: Column(
          children: [
            Text(name),
            TextButton(
              key: ValueKey('back-$name'),
              onPressed: () => context.safeBack(),
              child: const Text('back'),
            ),
          ],
        ),
      ),
    );

GoRouter _router(String initial) => GoRouter(
      initialLocation: initial,
      routes: [
        GoRoute(path: AppRoutes.feed, builder: (_, __) => _page('feed')),
        GoRoute(
          path: AppRoutes.profileSettings,
          builder: (_, __) => _page('settings'),
        ),
        GoRoute(
          path: AppRoutes.blockedUsers,
          builder: (_, __) => _page('blocked'),
        ),
        GoRoute(
          path: '/mine/case/:id',
          builder: (_, s) => _page('case ${s.pathParameters['id']}'),
        ),
        GoRoute(
          path: '/mine/case/:id/edit',
          builder: (_, __) => _page('edit'),
        ),
        GoRoute(path: '/lone/page', builder: (_, __) => _page('lone')),
      ],
    );

void main() {
  testWidgets('alone after a refresh: back goes to the parent path',
      (tester) async {
    final router = _router(AppRoutes.blockedUsers);
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    expect(find.text('blocked'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('back-blocked')));
    await tester.pumpAndSettle();
    expect(find.text('settings'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a path parameter parent: edit → the case, not the list',
      (tester) async {
    final router = _router('/mine/case/42/edit');
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.tap(find.byKey(const ValueKey('back-edit')));
    await tester.pumpAndSettle();
    expect(find.text('case 42'), findsOneWidget);
  });

  testWidgets('no known parent: Feed', (tester) async {
    final router = _router('/lone/page');
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.tap(find.byKey(const ValueKey('back-lone')));
    await tester.pumpAndSettle();
    expect(find.text('feed'), findsOneWidget);
  });

  testWidgets('a page below: back pops it, the parent path is not used',
      (tester) async {
    final router = _router(AppRoutes.feed);
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    unawaited(router.push<void>(AppRoutes.blockedUsers));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('back-blocked')));
    await tester.pumpAndSettle();
    expect(find.text('feed'), findsOneWidget);
    expect(find.text('settings'), findsNothing);
  });

  testWidgets('a PopScope of the screen is still asked first', (tester) async {
    var asked = 0;
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => _page('root')),
        GoRoute(
          path: '/draft',
          builder: (_, __) => PopScope(
            canPop: false,
            onPopInvokedWithResult: (didPop, _) => asked++,
            child: _page('draft'),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    unawaited(router.push<void>('/draft'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('back-draft')));
    await tester.pumpAndSettle();
    expect(asked, 1);
    expect(find.text('draft'), findsOneWidget);
  });

  testWidgets('an explicit fallback wins over the parent path',
      (tester) async {
    final router = GoRouter(
      initialLocation: AppRoutes.blockedUsers,
      routes: [
        GoRoute(path: AppRoutes.feed, builder: (_, __) => _page('feed')),
        GoRoute(
          path: AppRoutes.blockedUsers,
          builder: (context, _) => Scaffold(
            body: TextButton(
              key: const ValueKey('back'),
              onPressed: () => context.safeBack(fallback: AppRoutes.feed),
              child: const Text('back'),
            ),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.tap(find.byKey(const ValueKey('back')));
    await tester.pumpAndSettle();
    expect(find.text('feed'), findsOneWidget);
  });

  // Row 161: a screen alone with unsaved work asks first, then leaves.
  testWidgets('alone with a PopScope: the guard is asked, then safeLeave',
      (tester) async {
    var asked = 0;
    final router = GoRouter(
      initialLocation: '/profile/settings/draft',
      routes: [
        GoRoute(path: AppRoutes.feed, builder: (_, __) => _page('feed')),
        GoRoute(
          path: AppRoutes.profileSettings,
          builder: (_, __) => _page('settings'),
        ),
        GoRoute(
          path: '/profile/settings/draft',
          builder: (context, _) => PopScope(
            canPop: false,
            onPopInvokedWithResult: (didPop, _) => asked++,
            child: Scaffold(
              body: Column(
                children: [
                  const Text('draft'),
                  TextButton(
                    key: const ValueKey('back'),
                    onPressed: () => context.safeBack(),
                    child: const Text('back'),
                  ),
                  TextButton(
                    key: const ValueKey('discard'),
                    onPressed: () => context.safeLeave(),
                    child: const Text('discard'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.tap(find.byKey(const ValueKey('back')));
    await tester.pumpAndSettle();
    expect(asked, 1);
    expect(find.text('draft'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('discard')));
    await tester.pumpAndSettle();
    expect(find.text('settings'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('safeLeave with a page below pops it with the result',
      (tester) async {
    final router = _router(AppRoutes.feed);
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    Object? got;
    unawaited(
      router.push<bool>(AppRoutes.blockedUsers).then((v) => got = v),
    );
    await tester.pumpAndSettle();
    tester.element(find.text('blocked')).safeLeave<bool>(result: true);
    await tester.pumpAndSettle();
    expect(find.text('feed'), findsOneWidget);
    expect(got, isTrue);
  });

  group('safeBackLeading (Material AppBar)', () {
    Widget bar(String name) => Builder(
          builder: (context) => Scaffold(
            appBar: AppBar(
              leading: safeBackLeading(context),
              title: Text(name),
            ),
          ),
        );

    GoRouter router(String initial) => GoRouter(
          initialLocation: initial,
          routes: [
            GoRoute(path: AppRoutes.feed, builder: (_, __) => bar('feed')),
            GoRoute(
              path: AppRoutes.profileSettings,
              builder: (_, __) => bar('settings'),
            ),
            GoRoute(
              path: AppRoutes.myFirm,
              builder: (_, __) => bar('firm'),
            ),
          ],
        );

    testWidgets('alone on its link: an arrow that leads to the parent',
        (tester) async {
      final r = router(AppRoutes.myFirm);
      addTearDown(r.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: r));
      expect(find.byType(BackButton), findsOneWidget);
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.text('settings'), findsOneWidget);
    });

    testWidgets('a page below: the AppBar keeps its own arrow', (tester) async {
      final r = router(AppRoutes.profileSettings);
      addTearDown(r.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: r));
      unawaited(r.push<void>(AppRoutes.myFirm));
      await tester.pumpAndSettle();
      final leading = tester.widget<AppBar>(find.byType(AppBar).last).leading;
      expect(leading, isNull);
      expect(find.byType(BackButton), findsOneWidget);
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.text('settings'), findsOneWidget);
    });

    testWidgets('hosted in a one-page pane (not a router page): no arrow',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Navigator(
            onGenerateRoute: (_) => PageRouteBuilder<void>(
              pageBuilder: (_, __, ___) => bar('pane'),
            ),
          ),
        ),
      );
      expect(find.text('pane'), findsOneWidget);
      expect(find.byType(BackButton), findsNothing);
    });
  });
}
