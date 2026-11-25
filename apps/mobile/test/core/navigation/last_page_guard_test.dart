import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/core/navigation/last_page_guard.dart';
import 'package:material_ui/material_ui.dart';

/// KNOWN_ERRORS 228 (owner 18.11): one `Navigator.pop()` too many while a
/// navigator holds its last page emptied go_router's configuration; the
/// app then built `SizedBox.shrink()` — the theme's plain background,
/// nothing to tap — until it was killed. On the unpatched go_router
/// 18.1.4 every test below fails (the configuration goes empty and the
/// debug assert «You have popped the last page off of the stack» fires);
/// with third_party/go_router the pop is refused.
void main() {
  late BuildContext feedContext;
  var taps = 0;

  GoRouter router() => GoRouter(
        initialLocation: '/feed',
        routes: [
          // As in app_router.dart: the tab shell is the root navigator's
          // first page, each tab its own navigator.
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
                      Builder(
                        builder: (context) {
                          feedContext = context;
                          return Center(
                            child: TextButton(
                              onPressed: () => taps++,
                              child: const Text('feed'),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ],
              ),
              StatefulShellBranch(
                routes: [
                  GoRoute(
                    path: '/mine',
                    pageBuilder: (context, state) =>
                        AppPageTransitions.material(state, const Text('mine')),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/post',
            pageBuilder: (context, state) => AppPageTransitions.push(
              state,
              const Scaffold(body: Text('post')),
            ),
          ),
        ],
      );

  Future<GoRouter> pump(WidgetTester tester) async {
    taps = 0;
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final r = router();
    addTearDown(r.dispose);
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(
          theme: AppTheme.light(),
          routerConfig: r,
          builder: (context, child) => BackSwipeTheme(child: child!),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return r;
  }

  /// The pattern of the app's sheets (quick replies, sticker packs, notes,
  /// payments…): the sheet's button waits for the server, then
  /// `if (mounted) Navigator.of(context).pop()`. Here the person swipes the
  /// sheet away while it waits: the sheet is still mounted while it slides
  /// out, so the late pop hits the page under it — the tab shell, the root
  /// navigator's last page.
  Future<void> lateSheetPop(WidgetTester tester) async {
    late BuildContext sheetContext;
    unawaited(
      showAppBottomSheet<void>(
        context: feedContext,
        builder: (context) {
          sheetContext = context;
          return const SizedBox(height: 200, child: Text('sheet'));
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('sheet'), findsOneWidget);
    // Swiped / tapped away: the sheet starts to slide out.
    Navigator.of(sheetContext).pop();
    await tester.pump(const Duration(milliseconds: 16));
    expect(sheetContext.mounted, isTrue);
    // The server answers now: `if (mounted) Navigator.of(context).pop()`.
    // (Unpatched go_router 18.1.4 emptied its configuration here; only a
    // debug assert said so, the phones' release build went on to an empty
    // app.)
    Navigator.of(sheetContext).pop();
  }

  final refused = <String?>[];
  setUp(() {
    refused.clear();
    GoRouterDelegate.onLastPagePopRefused =
        (route, _) => refused.add(route.settings.name);
  });
  tearDown(() => GoRouterDelegate.onLastPagePopRefused = null);

  testWidgets('a late sheet pop leaves the person on their tab, and taps work',
      (tester) async {
    final r = await pump(tester);
    await lateSheetPop(tester);
    await tester.pumpAndSettle();
    expect(refused, hasLength(1));
    expect(r.routerDelegate.currentConfiguration.isEmpty, isFalse);
    expect(r.routerDelegate.currentConfiguration.uri.path, '/feed');
    expect(find.text('sheet'), findsNothing);
    await tester.tap(find.text('feed'));
    expect(taps, 1);
    // Navigation keeps working after it.
    unawaited(r.push<void>('/post'));
    await tester.pumpAndSettle();
    expect(find.text('post'), findsOneWidget);
    r.pop();
    await tester.pumpAndSettle();
    expect(find.text('feed'), findsOneWidget);
    r.go('/mine');
    await tester.pumpAndSettle();
    expect(find.text('mine'), findsOneWidget);
  });

  testWidgets("a pop on a tab's own first screen is refused", (tester) async {
    final r = await pump(tester);
    Navigator.of(feedContext).pop();
    await tester.pumpAndSettle();
    expect(refused, hasLength(1));
    expect(r.routerDelegate.currentConfiguration.uri.path, '/feed');
    await tester.tap(find.text('feed'));
    expect(taps, 1);
  });

  testWidgets('a double pop of a page stops at the shell', (tester) async {
    final r = await pump(tester);
    final closed = r.push<void>('/post');
    await tester.pumpAndSettle();
    final postContext = tester.element(find.text('post'));
    // Two pops at once (a double tap on «close»): the page, then the shell.
    Navigator.of(postContext)
      ..pop()
      ..pop();
    await tester.pumpAndSettle();
    await closed;
    expect(refused, hasLength(1));
    expect(r.routerDelegate.currentConfiguration.uri.path, '/feed');
    await tester.tap(find.text('feed'));
    expect(taps, 1);
  });

  testWidgets('ordinary pops and go are never refused', (tester) async {
    final r = await pump(tester);
    unawaited(r.push<void>('/post'));
    await tester.pumpAndSettle();
    r.pop();
    await tester.pumpAndSettle();
    r.go('/mine');
    await tester.pumpAndSettle();
    r.go('/feed');
    await tester.pumpAndSettle();
    // A sheet closed the normal way.
    unawaited(
      showAppBottomSheet<void>(
        context: feedContext,
        builder: (_) => const SizedBox(height: 200, child: Text('sheet')),
      ),
    );
    await tester.pumpAndSettle();
    Navigator.of(tester.element(find.text('sheet'))).pop();
    await tester.pumpAndSettle();
    expect(refused, isEmpty);
    expect(find.text('feed'), findsOneWidget);
    expect(find.text('sheet'), findsNothing);
  });

  test('the app reports a refused pop (wired in the app router)', () {
    final source =
        File('lib/core/navigation/app_router.dart').readAsStringSync();
    expect(source, contains('LastPageGuard.install();'));
    LastPageGuard.install();
    expect(GoRouterDelegate.onLastPagePopRefused, isNotNull);
  });
}
