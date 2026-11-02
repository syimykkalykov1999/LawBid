import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// Audit 2026-11-01 ("I typed one word and got something else"): the answer
/// to an OLDER query that arrives after the newer one must never replace it.
class _SlowFirst extends FakeSearchRepository {
  final slow = Completer<CursorPage<Post>>();
  final asked = <String>[];

  @override
  Future<CursorPage<Post>> posts(
    String q, {
    String? cursor,
    SearchFilters filters = const SearchFilters(),
  }) {
    asked.add(q);
    if (q == 'ab') return slow.future;
    return Future.value(CursorPage(items: [fakePost('new-$q')]));
  }
}

void main() {
  VisibilityDetectorController.instance.updateInterval = Duration.zero;
  setUpAll(initializeDateFormatting);

  testWidgets('a late answer to the old text does not replace the new one',
      (tester) async {
    final repo = _SlowFirst();
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        overrides: uxOverrides(search: repo),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Posts'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'ab');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.enterText(find.byType(TextField), 'abc');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();

    List<String> shown() => tester
        .widgetList<PostGridTile>(find.byType(PostGridTile))
        .map((t) => t.post.id)
        .toList();
    expect(shown(), ['new-abc']);

    // The slow answer for "ab" arrives last.
    repo.slow.complete(CursorPage(items: [fakePost('old-ab')]));
    await tester.pumpAndSettle();
    expect(shown(), ['new-abc']);
    expect(repo.asked, containsAll(['ab', 'abc']));
  });
}
