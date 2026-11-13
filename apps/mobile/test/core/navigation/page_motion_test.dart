import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';

/// Owner row 88 (2026-11-13): pushes and pops run Flutter's iPhone timing
/// (500 ms), and a screen that is not a Material page itself (the tab
/// shell) slides a third to the left under a pushed page.
void main() {
  testWidgets('push takes the Cupertino 500 ms, the shell slides under it',
      (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final nav = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: nav,
        theme: AppTheme.light().copyWith(
          pageTransitionsTheme: kBackSwipeTransitions,
        ),
        // Like the shell: a page route that is not a MaterialPageRoute.
        onGenerateRoute: (_) => PageRouteBuilder<void>(
          pageBuilder: (_, __, ___) => const Scaffold(body: Text('shell')),
        ),
      ),
    );
    expect(
      const AppBackSwipeTransitionsBuilder().transitionDuration,
      CupertinoRouteTransitionMixin.kTransitionDuration,
    );
    final shellX = tester.getTopLeft(find.text('shell')).dx;
    nav.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('pushed')),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    // Half way: the shell has moved left, the page is still arriving.
    expect(tester.getTopLeft(find.text('shell')).dx, lessThan(shellX - 20));
    expect(tester.getTopLeft(find.text('pushed')).dx, greaterThan(0));
    await tester.pump(const Duration(milliseconds: 260));
    expect(tester.getTopLeft(find.text('pushed')).dx, 0);
  });

  testWidgets('Windows and Linux use the same page motion', (tester) async {
    for (final p in [TargetPlatform.windows, TargetPlatform.linux]) {
      expect(
        kBackSwipeTransitions.builders[p],
        isA<AppBackSwipeTransitionsBuilder>(),
      );
    }
  });
}
