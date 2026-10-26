import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/posts_feed_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

class _PostsSearch extends FakeSearchRepository {
  final items = [for (var i = 0; i < 4; i++) fakePost('p$i')];

  @override
  Future<CursorPage<Post>> posts(
    String q, {
    String? cursor,
    SearchFilters filters = const SearchFilters(),
  }) async =>
      CursorPage(items: items);
}

void main() {
  VisibilityDetectorController.instance.updateInterval = Duration.zero;
  setUpAll(initializeDateFormatting);

  testWidgets('post results are the profile grid; a tap opens the feed there',
      (tester) async {
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        overrides: uxOverrides(search: _PostsSearch()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Posts'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'rights');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    final tiles = find.byType(PostGridTile);
    expect(tiles, findsNWidgets(4));
    // Three tiles per row, all 3:4 (Instagram Explore).
    final first = tester.getRect(tiles.at(0));
    final fourth = tester.getRect(tiles.at(3));
    expect(first.height, closeTo(first.width / 0.75, 0.5));
    expect(fourth.size, first.size);
    final screen = tester.getSize(find.byType(SearchScreen)).width;
    expect(first.width, lessThanOrEqualTo(screen / 3));
    expect(fourth.top, greaterThan(first.bottom));

    await tester.tap(tiles.at(1));
    await tester.pumpAndSettle();
    final feed = tester.widget<PostsFeedScreen>(find.byType(PostsFeedScreen));
    expect(feed.initialIndex, 1);
    expect(feed.posts.map((p) => p.id), ['p0', 'p1', 'p2', 'p3']);
  });
}
