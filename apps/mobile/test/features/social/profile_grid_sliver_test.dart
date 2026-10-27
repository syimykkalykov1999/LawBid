import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_tab_pages.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// 2026-10-26 (smoothness P4): the profile's post grid as a sliver page is
/// laid out exactly like the old shrink-wrapped grid in a box page (same
/// tile rects, same scroll length, same minimum height), but builds only
/// the tiles near the screen instead of every tile of the list.
void main() {
  setUpAll(initializeDateFormatting);

  const screen = Size(400, 800);
  const minPage = 400.0;

  Future<void> pump(
    WidgetTester t,
    FakeSocialRepository repo, {
    required bool sliver,
  }) async {
    t.view.physicalSize = screen;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    const grid = ProfilePostsGrid(
      attorneyId: 'att-1',
      emptyTitle: 'Empty',
      emptyMessage: '',
    );
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: CustomScrollView(
            key: const ValueKey('scroll'),
            slivers: [
              const SliverToBoxAdapter(child: SizedBox(height: 600)),
              if (sliver)
                const ProfileSliverPage(
                  sliver: ProfilePostsGrid(
                    attorneyId: 'att-1',
                    emptyTitle: 'Empty',
                    emptyMessage: '',
                    asSliver: true,
                    minExtent: minPage,
                  ),
                )
              else
                SliverToBoxAdapter(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: minPage),
                    child: grid,
                  ),
                ),
              const SliverToBoxAdapter(child: SizedBox(height: 48)),
            ],
          ),
        ),
        theme: AppTheme.light(),
        size: screen,
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.pumpAndSettle();
  }

  double maxScroll(WidgetTester t) => t
      .state<ScrollableState>(
        // The page's own scroll view (the box page's grid has an inner
        // Scrollable of its own, further down the tree).
        find
            .descendant(
              of: find.byKey(const ValueKey('scroll')),
              matching: find.byType(Scrollable),
            )
            .first,
      )
      .position
      .maxScrollExtent;

  Future<void> settle(WidgetTester t) async {
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  }

  final many = [
    for (var i = 0; i < 150; i++) fakePost('p$i', withPhoto: true),
  ];

  testWidgets('a long grid: same layout, a fraction of the tiles built',
      (t) async {
    final repo = FakeSocialRepository(posts: many);

    await pump(t, repo, sliver: false);
    final boxBuilt =
        t.widgetList(find.byType(PostGridTile, skipOffstage: false)).length;
    final boxRects = [
      for (var i = 0; i < 9; i++)
        t.getRect(find.byType(PostGridTile, skipOffstage: false).at(i)),
    ];
    final boxScroll = maxScroll(t);
    await settle(t);

    await pump(t, repo, sliver: true);
    final sliverBuilt =
        t.widgetList(find.byType(PostGridTile, skipOffstage: false)).length;
    final sliverRects = [
      for (var i = 0; i < 9; i++)
        t.getRect(find.byType(PostGridTile, skipOffstage: false).at(i)),
    ];
    expect(sliverRects, boxRects);
    expect(maxScroll(t), boxScroll);
    expect(boxBuilt, 150);
    expect(sliverBuilt, lessThan(60));
    await settle(t);
  });

  testWidgets('a short / empty page keeps the same minimum height', (t) async {
    for (final posts in [
      [fakePost('one', withPhoto: true)],
      <Never>[],
    ]) {
      final repo = FakeSocialRepository(posts: posts);
      await pump(t, repo, sliver: false);
      final boxScroll = maxScroll(t);
      final boxEmpty = find.text('Empty').evaluate().isEmpty
          ? null
          : t.getRect(find.text('Empty'));
      await settle(t);

      await pump(t, repo, sliver: true);
      expect(maxScroll(t), boxScroll);
      if (boxEmpty != null) expect(t.getRect(find.text('Empty')), boxEmpty);
      await settle(t);
    }
  });
}
