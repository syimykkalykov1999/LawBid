import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

const _labels = AppPaginationLabels(
  loadingMore: 'Loading more',
  error: "Couldn't load more",
  retry: 'Retry',
  end: "That's everything",
);

/// Harness: an [AppPaginatedListView] of [count] fixed-height rows.
class _Host extends StatelessWidget {
  const _Host({
    required this.count,
    required this.status,
    required this.onLoadMore,
    this.onRetry,
    this.disableAnimations = false,
  });

  final int count;
  final AppPaginationStatus status;
  final VoidCallback onLoadMore;
  final VoidCallback? onRetry;
  final bool disableAnimations;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: AppTheme.light(),
      home: MediaQuery(
        data: MediaQueryData(
          size: const Size(390, 700),
          disableAnimations: disableAnimations,
        ),
        child: Scaffold(
          body: AppPaginatedListView<int>(
            items: List.generate(count, (i) => i),
            itemKey: (i) => i,
            itemBuilder: (context, item, index) =>
                SizedBox(height: 80, child: Text('row $item')),
            status: status,
            labels: _labels,
            onLoadMore: onLoadMore,
            onRetry: onRetry ?? () {},
          ),
        ),
      ),
    );
  }
}

void main() {
  group('AppPaginationFooter states', () {
    Future<void> pumpFooter(
      WidgetTester tester,
      AppPaginationStatus status, {
      VoidCallback? onRetry,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: AppPaginationFooter(
              status: status,
              labels: _labels,
              onRetry: onRetry ?? () {},
            ),
          ),
        ),
      );
      await tester.pump(AppMotion.footerSwitch);
    }

    testWidgets('loading: gold spinner + announced "loading more"',
        (tester) async {
      await pumpFooter(tester, AppPaginationStatus.loading);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Loading more'), findsOneWidget);
      final node = tester.getSemantics(find.bySemanticsLabel('Loading more'));
      expect(node.getSemanticsData().flagsCollection.isLiveRegion, isTrue);
    });

    testWidgets('error: message + Retry at the list end calls onRetry',
        (tester) async {
      var retries = 0;
      await pumpFooter(
        tester,
        AppPaginationStatus.error,
        onRetry: () => retries++,
      );
      expect(find.text("Couldn't load more"), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await tester.tap(find.widgetWithText(AppButton, 'Retry'));
      expect(retries, 1);
    });

    testWidgets('end: quiet end-of-list mark, no spinner, no button',
        (tester) async {
      await pumpFooter(tester, AppPaginationStatus.end);
      expect(find.text("That's everything"), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.byType(AppButton), findsNothing);
    });

    testWidgets('idle: renders nothing visible', (tester) async {
      await pumpFooter(tester, AppPaginationStatus.idle);
      expect(find.byType(Text), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });
  });

  group('AppPaginatedListView', () {
    testWidgets('a short first page asks for the next one right away',
        (tester) async {
      var calls = 0;
      await tester.pumpWidget(
        _Host(
          count: 3,
          status: AppPaginationStatus.idle,
          onLoadMore: () => calls++,
        ),
      );
      await tester.pump();
      expect(calls, 1);
    });

    testWidgets('a long page loads more only when scrolled near the end',
        (tester) async {
      var calls = 0;
      await tester.pumpWidget(
        _Host(
          count: 40,
          status: AppPaginationStatus.idle,
          onLoadMore: () => calls++,
        ),
      );
      await tester.pump();
      expect(calls, 0, reason: 'plenty of content below the fold');

      await tester.drag(find.byType(ListView), const Offset(0, -1000));
      await tester.pump();
      expect(calls, 0, reason: 'still far from the end');

      await tester.fling(find.byType(ListView), const Offset(0, -4000), 3000);
      await tester.pumpAndSettle();
      expect(calls, greaterThan(0));
      expect(find.text('row 39'), findsOneWidget);
    });

    for (final status in [
      AppPaginationStatus.loading,
      AppPaginationStatus.error,
      AppPaginationStatus.end,
    ]) {
      testWidgets('never asks for more while $status', (tester) async {
        var calls = 0;
        await tester.pumpWidget(
          _Host(count: 3, status: status, onLoadMore: () => calls++),
        );
        await tester.pump();
        await tester.fling(find.byType(ListView), const Offset(0, -500), 2000);
        // Not pumpAndSettle: the loading spinner never settles.
        await tester.pump(const Duration(seconds: 1));
        await tester.pump(const Duration(seconds: 1));
        expect(calls, 0);
      });
    }

    testWidgets('the footer follows the last row and shows the status',
        (tester) async {
      await tester.pumpWidget(
        _Host(
          count: 2,
          status: AppPaginationStatus.loading,
          onLoadMore: () {},
          disableAnimations: true,
        ),
      );
      await tester.pump();
      final lastRow = tester.getRect(find.text('row 1'));
      final footer = tester.getRect(find.byType(AppPaginationFooter));
      expect(footer.top, greaterThanOrEqualTo(lastRow.bottom));
      expect(find.text('Loading more'), findsOneWidget);
    });

    testWidgets('error at the list end keeps the loaded rows and retries',
        (tester) async {
      var retries = 0;
      await tester.pumpWidget(
        _Host(
          count: 2,
          status: AppPaginationStatus.error,
          onLoadMore: () {},
          onRetry: () => retries++,
          disableAnimations: true,
        ),
      );
      await tester.pump();
      expect(find.text('row 0'), findsOneWidget);
      expect(find.text('row 1'), findsOneWidget);
      await tester.tap(find.widgetWithText(AppButton, 'Retry'));
      expect(retries, 1);
    });
  });

  group('PaginatedList (cursor state)', () {
    PaginatedList<int> first(List<int> items, [String? cursor]) =>
        PaginatedList.firstPage(CursorPage(items: items, nextCursor: cursor));

    test('no nextCursor → no more pages (API without pagination)', () {
      final list = first([1, 2, 3]);
      expect(list.hasMore, isFalse);
      expect(list.canLoadMore, isFalse);
    });

    test('empty-string cursor is treated as the end', () {
      expect(first([1], '').hasMore, isFalse);
    });

    test('loading → appended keeps order, drops overlapping ids', () {
      final loading = first([1, 2, 3], 'c1').loadingMore();
      expect(loading.canLoadMore, isFalse);
      final next = loading.appended(
        const CursorPage(items: [3, 4, 5], nextCursor: 'c2'),
        idOf: (i) => i,
      );
      expect(next.items, [1, 2, 3, 4, 5]);
      expect(next.nextCursor, 'c2');
      expect(next.isLoadingMore, isFalse);
      expect(next.canLoadMore, isTrue);
    });

    test('a failed page blocks auto-loading until retried', () {
      final failed = first([1], 'c1').loadingMore().failedMore('boom');
      expect(failed.loadMoreError, 'boom');
      expect(failed.isLoadingMore, isFalse);
      expect(failed.canLoadMore, isFalse);
      expect(failed.items, [1]);
      expect(failed.nextCursor, 'c1', reason: 'retry resumes at the cursor');
    });

    test('without() removes matching rows and keeps the cursor', () {
      final list = first([1, 2, 3], 'c1').without((i) => i == 2);
      expect(list.items, [1, 3]);
      expect(list.nextCursor, 'c1');
    });
  });
}
