import 'dart:async';

import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-28 (Samsung): a tiny pull started the refresh, with the
/// spinner mid-screen. Only a deliberate pull past the threshold refreshes,
/// and the spinner sits at the top edge.
void main() {
  late int refreshes;

  Future<void> onRefresh() async {
    refreshes++;
  }

  setUp(() => refreshes = 0);

  Widget host(Widget body) => MaterialApp(
        home: Scaffold(
          appBar: AppBar(title: const Text('bar')),
          body: body,
        ),
      );

  Widget list() => AppRefreshIndicator(
        onRefresh: onRefresh,
        child: ListView.builder(
          physics: const AlwaysScrollableScrollPhysics(),
          itemCount: 50,
          itemBuilder: (_, i) => SizedBox(height: 60, child: Text('row $i')),
        ),
      );

  Future<void> pull(WidgetTester tester, Finder f, double dy) async {
    final g = await tester.startGesture(tester.getCenter(f));
    // Past the touch slop first, then the measured pull in steps.
    await g.moveBy(const Offset(0, 20));
    for (var i = 0; i < 10; i++) {
      await g.moveBy(Offset(0, dy / 10));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await g.up();
  }

  testWidgets('a 30 px pull does not refresh', (tester) async {
    await tester.pumpWidget(host(list()));
    await pull(tester, find.byType(ListView), 30);
    await tester.pumpAndSettle();
    expect(refreshes, 0);
  });

  testWidgets('a 120 px pull refreshes once, spinner at the top edge',
      (tester) async {
    await tester.pumpWidget(host(list()));
    final top = tester.getTopLeft(find.byType(AppRefreshIndicator)).dy;
    final g = await tester.startGesture(
      tester.getCenter(find.byType(ListView)),
    );
    await g.moveBy(const Offset(0, 20));
    for (var i = 0; i < 12; i++) {
      await g.moveBy(const Offset(0, 10));
      await tester.pump(const Duration(milliseconds: 16));
    }
    // While dragging the circle is within the top part of the area.
    final circle = find.byType(CircularProgressIndicator);
    expect(circle, findsOneWidget);
    expect(tester.getTopLeft(circle).dy - top, lessThan(100));
    await g.up();
    await tester.pumpAndSettle();
    expect(refreshes, 1);
  });

  testWidgets('a pull that starts mid-list never refreshes', (tester) async {
    await tester.pumpWidget(host(list()));
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    // Scroll back to the very top and keep pulling in the same gesture.
    final g =
        await tester.startGesture(tester.getCenter(find.byType(ListView)));
    await g.moveBy(const Offset(0, 20));
    await g.moveBy(const Offset(0, 400));
    await g.moveBy(const Offset(0, 200));
    await g.up();
    await tester.pumpAndSettle();
    expect(refreshes, 0);
  });

  testWidgets('a horizontal swipe never refreshes', (tester) async {
    await tester.pumpWidget(host(list()));
    await tester.drag(find.byType(ListView), const Offset(300, 0));
    await tester.pumpAndSettle();
    expect(refreshes, 0);
  });

  testWidgets('iOS: native bounce pulls past the threshold to refresh',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(platform: TargetPlatform.iOS),
        home: Scaffold(
          body: AppRefreshIndicator(
            onRefresh: onRefresh,
            child: ListView.builder(
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              itemCount: 50,
              itemBuilder: (_, i) => SizedBox(height: 60, child: Text('$i')),
            ),
          ),
        ),
      ),
    );
    await pull(tester, find.byType(ListView), 30);
    await tester.pumpAndSettle();
    expect(refreshes, 0);
    await pull(tester, find.byType(ListView), 600);
    await tester.pumpAndSettle();
    expect(refreshes, 1);
  });

  testWidgets(
      'profile layout (NestedScrollView + page list): the outer scroll '
      'carries the pull, a small one does nothing', (tester) async {
    Widget profile() => AppRefreshIndicator(
          onRefresh: onRefresh,
          notificationPredicate: nestedScrollNotificationPredicate,
          child: NestedScrollView(
            headerSliverBuilder: (_, __) => [
              const SliverToBoxAdapter(child: SizedBox(height: 200)),
            ],
            body: PageView(
              children: [
                ListView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  itemCount: 40,
                  itemBuilder: (_, i) =>
                      SizedBox(height: 60, child: Text('p$i')),
                ),
                const SizedBox(),
              ],
            ),
          ),
        );
    await tester.pumpWidget(host(profile()));
    await pull(tester, find.byType(NestedScrollView), 30);
    await tester.pumpAndSettle();
    expect(refreshes, 0);
    await pull(tester, find.byType(NestedScrollView), 150);
    await tester.pumpAndSettle();
    expect(refreshes, 1);
    // With the header scrolled away, a pull back toward the top is just a
    // scroll: no refresh.
    await tester.drag(find.byType(NestedScrollView), const Offset(0, -150));
    await tester.pumpAndSettle();
    await pull(tester, find.byType(NestedScrollView), 100);
    await tester.pumpAndSettle();
    expect(refreshes, 1);
    // A sideways swipe between the pages does not refresh.
    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(refreshes, 1);
  });

  testWidgets('show() refreshes programmatically', (tester) async {
    await tester.pumpWidget(host(list()));
    final state = tester.state<AppRefreshIndicatorState>(
      find.byType(AppRefreshIndicator),
    );
    await state.show();
    await tester.pumpAndSettle();
    expect(refreshes, 1);
  });

  // Owner 13.11 (row 93, Instagram iOS): the list stays down by the
  // Cupertino refresh gap while it refreshes, then rises back.
  Widget iosList(Future<void> Function() refresh, TargetPlatform platform) =>
      MaterialApp(
        theme: ThemeData(platform: platform),
        home: Scaffold(
          body: AppRefreshIndicator(
            onRefresh: refresh,
            child: ListView.builder(
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              itemCount: 50,
              itemBuilder: (_, i) => SizedBox(height: 60, child: Text('r$i')),
            ),
          ),
        ),
      );

  testWidgets('iOS: the list holds the 60 px gap while refreshing',
      (tester) async {
    final done = Completer<void>();
    await tester.pumpWidget(
      iosList(
        () {
          refreshes++;
          return done.future;
        },
        TargetPlatform.iOS,
      ),
    );
    final top = tester.getTopLeft(find.text('r0')).dy;
    await pull(tester, find.byType(ListView), 600);
    // The bounce settles (the refresh is still running, so no settle()).
    for (var i = 0; i < 120; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(refreshes, 1);
    expect(
      tester.getTopLeft(find.text('r0')).dy,
      closeTo(top + AppRefreshIndicator.iosRefreshExtent, 1),
    );
    expect(find.byType(CupertinoActivityIndicator), findsOneWidget);
    done.complete();
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('r0')).dy, closeTo(top, 0.5));
  });

  testWidgets('Android: no gap, the Material spinner as before',
      (tester) async {
    final done = Completer<void>();
    await tester.pumpWidget(
      iosList(
        () {
          refreshes++;
          return done.future;
        },
        TargetPlatform.android,
      ),
    );
    final top = tester.getTopLeft(find.text('r0')).dy;
    await pull(tester, find.byType(ListView), 600);
    // The bounce settles (the refresh is still running, so no settle()).
    for (var i = 0; i < 120; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(refreshes, 1);
    expect(tester.getTopLeft(find.text('r0')).dy, closeTo(top, 0.5));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    done.complete();
    await tester.pumpAndSettle();
  });
}
