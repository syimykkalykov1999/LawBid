import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-18: the profile's «Посты» grid has photo posts only; the
/// «Рилсы» tab has the video posts / reels as 9:16 tiles with their view
/// count, newest first.
void main() {
  setUpAll(initializeDateFormatting);

  Post post(
    String id, {
    bool photo = false,
    bool video = false,
    int views = 0,
    int day = 1,
  }) {
    final base = fakePost(id, withPhoto: photo);
    return Post(
      id: id,
      author: base.author,
      body: 'Body of $id',
      media: base.media,
      tags: base.tags,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: false,
      isMine: false,
      viewCount: views,
      createdAt: DateTime(2026, 10, day, 12),
      video: video
          ? const PostVideo(
              status: 'ready',
              playbackUrl: 'https://example.test/v.m3u8',
              thumbnailUrl: 'https://example.test/v.jpg',
              width: 1080,
              height: 1920,
            )
          : null,
    );
  }

  final all = [
    post('reel-new', video: true, views: 7, day: 9),
    post('photo', photo: true, day: 8),
    post('brief', day: 7),
    post('reel-old', video: true, day: 6),
  ];

  Future<void> pump(
    WidgetTester t,
    FakeSocialRepository repo, {
    bool reels = false,
  }) async {
    t.view.physicalSize = const Size(400, 3000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: SingleChildScrollView(
            child: ProfilePostsGrid(
              attorneyId: 'att-1',
              reelsOnly: reels,
              emptyTitle: 'Empty',
              emptyMessage: '',
            ),
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(400, 3000),
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.pumpAndSettle();
  }

  Future<void> settle(WidgetTester t) async {
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  }

  testWidgets('Posts grid: photo posts only — no reels, no briefs', (t) async {
    final repo = FakeSocialRepository(posts: all);
    await pump(t, repo);
    final shown = [
      for (final tile in t.widgetList<PostGridTile>(find.byType(PostGridTile)))
        tile.post.id,
    ];
    expect(shown, ['photo']);
    expect(find.byType(ReelGridTile), findsNothing);
    expect(repo.attorneyPostsMedia, [ProfileMedia.visual]);
    await settle(t);
  });

  testWidgets('Reels tab: reels only, newest first, 9:16, with views',
      (t) async {
    final repo = FakeSocialRepository(posts: all);
    await pump(t, repo, reels: true);
    final shown = [
      for (final tile in t.widgetList<ReelGridTile>(find.byType(ReelGridTile)))
        tile.post.id,
    ];
    expect(shown, ['reel-new', 'reel-old']);
    expect(find.byType(PostGridTile), findsNothing);
    expect(repo.attorneyPostsMedia, [ProfileMedia.video]);
    // Vertical tiles.
    final size = t.getSize(find.byKey(const ValueKey('reel-tile-reel-new')));
    expect(size.height / size.width, closeTo(16 / 9, 0.01));
    // The view count on the tile; none for a reel nobody watched yet.
    final views = find.byKey(const ValueKey('reel-views-reel-new'));
    expect(views, findsOneWidget);
    expect(
      find.descendant(of: views, matching: find.text('7')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('reel-views-reel-old')), findsNothing);
    // Owner 2026-10-27: the grid is the only place the cover is drawn.
    for (final id in ['reel-new', 'reel-old']) {
      expect(
        find.descendant(
          of: find.byKey(ValueKey('reel-tile-$id')),
          matching: find.byType(CachedNetworkImage),
        ),
        findsOneWidget,
      );
    }
    await settle(t);
  });

  testWidgets('Reels tab without reels: its empty state', (t) async {
    final repo = FakeSocialRepository(posts: [post('photo', photo: true)]);
    await pump(t, repo, reels: true);
    expect(find.byType(ReelGridTile), findsNothing);
    expect(find.text('Empty'), findsOneWidget);
    await settle(t);
  });
}
