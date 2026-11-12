import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/media/data_saver.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../../helpers/ux_harness.dart';

/// Owner item 38: while a row is built, the pictures of the next three rows
/// are warmed (feed, chats, case lists); the data saver stops it, as it
/// stops the video warm-up («light on phones»).
void main() {
  Future<List<String>> pump(WidgetTester tester, {required bool saver}) async {
    final warmed = <String>[];
    final container = ProviderContainer(overrides: uxOverrides());
    addTearDown(container.dispose);
    container.read(dataSaverProvider.notifier).set(on: saver);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: PagedListBody<String>(
              value: const AsyncData(
                PaginatedList(items: ['a', 'b', 'c', 'd', 'e']),
              ),
              t: const StaticTranslatorEn(),
              itemKey: (s) => s,
              itemBuilder: (_, s, __) => SizedBox(height: 2000, child: Text(s)),
              empty: const SizedBox.shrink(),
              onRefresh: () async {},
              onLoadMore: () {},
              onRetryMore: () {},
              prefetch: (_, s) => warmed.add(s),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    return warmed;
  }

  testWidgets('the next three rows are warmed while a row is built',
      (tester) async {
    final warmed = await pump(tester, saver: false);
    expect(warmed.take(3), ['b', 'c', 'd']);
  });

  testWidgets('the data saver warms nothing ahead', (tester) async {
    final warmed = await pump(tester, saver: true);
    expect(warmed, isEmpty);
  });
}
