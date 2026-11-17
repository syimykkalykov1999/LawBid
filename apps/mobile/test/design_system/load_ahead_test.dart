import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/design_system/design_system.dart';

const _labels = AppPaginationLabels(
  loadingMore: 'Loading more',
  error: 'Error',
  retry: 'Retry',
  end: 'End',
);

const _viewport = 700.0;

/// Owner row 38: every list built on [AppPaginatedListView] (and so every
/// `PagedListBody` list: chats, archive, cases, history, notifications,
/// search, channels, consultations, payments, feed) asks for the next page
/// about one screen before the end (the admin's `client.load_ahead_percent`),
/// once per page however fast it is scrolled.
void main() {
  tearDown(ClientTuning.reset);

  Future<ScrollController> pump(
    WidgetTester tester, {
    required VoidCallback onLoadMore,
    bool cards = false,
    int count = 60,
  }) async {
    final controller = ScrollController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: MediaQuery(
          data: const MediaQueryData(size: Size(390, _viewport)),
          child: Scaffold(
            body: AppPaginatedListView<int>(
              controller: controller,
              cards: cards,
              items: List.generate(count, (i) => i),
              itemKey: (i) => i,
              itemBuilder: (context, item, index) =>
                  SizedBox(height: 80, child: Text('row $item')),
              status: AppPaginationStatus.idle,
              labels: _labels,
              onLoadMore: onLoadMore,
              onRetry: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    return controller;
  }

  Future<void> jumpToAhead(
    WidgetTester tester,
    ScrollController c,
    double ahead,
  ) async {
    final p = c.position;
    c.jumpTo(p.maxScrollExtent - ahead);
    await tester.pump();
  }

  testWidgets('the next page is asked for one screen before the end, once',
      (tester) async {
    var calls = 0;
    final c = await pump(tester, onLoadMore: () => calls++);
    final screen = c.position.viewportDimension;
    await jumpToAhead(tester, c, screen + 80);
    expect(calls, 0, reason: 'more than a screen still below');
    await jumpToAhead(tester, c, screen - 10);
    expect(calls, 1, reason: 'within one screen of the end');
    // A fast scroll keeps sending updates before the page arrives.
    for (final ahead in [screen - 100, screen - 300, 200.0, 0.0]) {
      await jumpToAhead(tester, c, ahead);
    }
    expect(calls, 1, reason: 'the same page is never asked for twice');
  });

  testWidgets('the distance comes from the admin (client.load_ahead_percent)',
      (tester) async {
    ClientTuning.apply(const {'client.load_ahead_percent': '300'});
    var calls = 0;
    final c = await pump(tester, onLoadMore: () => calls++);
    final screen = c.position.viewportDimension;
    await jumpToAhead(tester, c, screen * 3 + 80);
    expect(calls, 0);
    await jumpToAhead(tester, c, screen * 3 - 10);
    expect(calls, 1, reason: 'three screens before the end');
  });

  testWidgets('full-width cards use client.feed_load_ahead_percent (2 screens)',
      (tester) async {
    var calls = 0;
    final c = await pump(tester, onLoadMore: () => calls++, cards: true);
    final screen = c.position.viewportDimension;
    await jumpToAhead(tester, c, screen * 2 + 80);
    expect(calls, 0);
    await jumpToAhead(tester, c, screen * 2 - 10);
    expect(calls, 1);
  });

  test('LoadAhead reads rows and media from the admin, with bounds', () {
    expect(LoadAhead.rows, 8);
    expect(LoadAhead.media, 3);
    ClientTuning.apply(const {
      'client.load_ahead_rows': '20',
      'client.media_prefetch_ahead': '0',
    });
    expect(LoadAhead.rows, 20);
    expect(LoadAhead.media, 0, reason: '0 turns the picture warm-up off');
    ClientTuning.apply(const {'client.load_ahead_rows': '100000'});
    expect(LoadAhead.rows, 100, reason: 'clamped to the server bound');
  });

  test('LoadAheadGate lets one request through per list length', () {
    final gate = LoadAheadGate();
    var n = 0;
    gate
      ..ask(20, () => n++)
      ..ask(20, () => n++);
    expect(n, 1);
    gate.ask(40, () => n++);
    expect(n, 2, reason: 'the next page arrived: the next request may go');
    gate
      ..reset()
      ..ask(40, () => n++);
    expect(n, 3, reason: 'a state change (retry) opens the gate again');
  });
}
