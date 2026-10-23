import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/accessibility/reduce_motion.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';

/// Owner 2026-10-22 (checklist §17): one provider carries the phone's
/// «reduce motion» to the theme (route transitions), to every animated
/// widget (MediaQuery.disableAnimations) and to the router's pages.
void main() {
  tearDown(() => ReduceMotion.enabled.value = false);

  testWidgets('the scope sets MediaQuery.disableAnimations for the tree',
      (tester) async {
    late ProviderContainer container;
    bool? seen;
    await tester.pumpWidget(
      ProviderScope(
        child: Consumer(
          builder: (context, ref, _) {
            container = ProviderScope.containerOf(context);
            return MaterialApp(
              builder: (context, child) => ReduceMotionScope(child: child!),
              home: Builder(
                builder: (context) {
                  seen = MediaQuery.disableAnimationsOf(context);
                  return const SizedBox();
                },
              ),
            );
          },
        ),
      ),
    );
    expect(seen, isFalse);
    container.read(reduceMotionProvider.notifier).set(true);
    await tester.pump();
    expect(seen, isTrue);
    expect(ReduceMotion.enabled.value, isTrue);
    expect(ReduceMotion.of(const Duration(seconds: 1)), Duration.zero);
  });

  test('the theme swaps routes without a transition under reduce motion', () {
    final still = AppTheme.light(reduceMotion: true);
    final moving = AppTheme.light();
    for (final platform in [TargetPlatform.iOS, TargetPlatform.android]) {
      final builder = still.pageTransitionsTheme.builders[platform]!;
      expect(builder.transitionDuration, Duration.zero);
      expect(
        moving.pageTransitionsTheme.builders[platform]!.transitionDuration,
        isNot(Duration.zero),
      );
    }
    expect(
      AppTheme.of(AppThemeId.values.first, reduceMotion: true),
      isNot(same(AppTheme.of(AppThemeId.values.first))),
    );
  });

  testWidgets('go_router pages are instant under reduce motion',
      (tester) async {
    ReduceMotion.enabled.value = true;
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(path: '/', builder: (_, __) => const Text('home')),
        GoRoute(
          path: '/next',
          pageBuilder: (context, state) =>
              AppPageTransitions.push(state, const Text('next')),
        ),
        GoRoute(
          path: '/modal',
          pageBuilder: (context, state) =>
              AppPageTransitions.modal(state, const Text('modal')),
        ),
        GoRoute(
          path: '/fade',
          pageBuilder: (context, state) =>
              AppPageTransitions.fade(state, const Text('fade')),
        ),
      ],
    );
    await tester.pumpWidget(
      MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    );
    for (final (path, text) in [
      ('/next', 'next'),
      ('/modal', 'modal'),
      ('/fade', 'fade'),
    ]) {
      router.go(path);
      // One frame: with a transition the new page would not be fully on
      // screen yet; without one it is.
      await tester.pump();
      await tester.pump();
      expect(find.text(text), findsOneWidget, reason: path);
      final page = router.routerDelegate.currentConfiguration.last.route;
      expect(page, isA<GoRoute>());
    }
    final pages = router.routerDelegate.currentConfiguration.matches;
    expect(pages, isNotEmpty);
  });
}
