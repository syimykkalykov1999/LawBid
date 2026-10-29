import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:video_player/video_player.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-28: «Сохранённое → Посты» is the profile's 3-column grid
/// (covers only, no autoplay), not a feed of cards.
void main() {
  setUpAll(initializeDateFormatting);

  Post post(String id, {bool video = false}) {
    final base = fakePost(id);
    return Post(
      id: id,
      author: base.author,
      body: 'Body of $id',
      media: const [],
      tags: base.tags,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: true,
      isMine: false,
      createdAt: DateTime(2026, 10, 23, 12),
      video: video
          ? const PostVideo(
              status: 'ready',
              playbackUrl: 'https://cdn.test/v/playlist.m3u8',
              thumbnailUrl: 'https://cdn.test/v/thumb.jpg',
            )
          : null,
    );
  }

  testWidgets('saved posts render as grid tiles, no cards, no video player',
      (t) async {
    final repo = _SavedRepo([
      SavedPost(
        postId: 's1',
        savedAt: DateTime(2026, 10, 20),
        post: post('s1'),
      ),
      SavedPost(
        postId: 's2',
        savedAt: DateTime(2026, 10, 19),
        post: post('s2', video: true),
      ),
      SavedPost(postId: 's3', savedAt: DateTime(2026, 10, 18)),
    ]);
    t.view.physicalSize = const Size(400, 900);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        const Scaffold(body: SavedPostsList()),
        theme: AppTheme.light(),
        size: const Size(400, 900),
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.pump(const Duration(seconds: 1));
    expect(find.byKey(const ValueKey('saved-posts-grid')), findsOneWidget);
    // The unavailable one is left out.
    expect(find.byType(PostGridTile), findsNWidgets(2));
    expect(find.byType(PostCard), findsNothing);
    expect(find.byType(VideoPlayer), findsNothing);
    // Three columns across the full width.
    final a = t.getTopLeft(find.byKey(const ValueKey('saved-tile-s1')));
    final b = t.getTopLeft(find.byKey(const ValueKey('saved-tile-s2')));
    expect(a.dy, b.dy);
    expect(b.dx, greaterThan(a.dx));
    expect(
      t.getSize(find.byKey(const ValueKey('saved-tile-s1'))).width,
      closeTo(400 / 3, 3),
    );
  });
}

class _SavedRepo extends FakeSocialRepository {
  _SavedRepo(this.items);
  final List<SavedPost> items;

  @override
  Future<CursorPage<SavedPost>> savedPosts({String? cursor}) async =>
      CursorPage(items: items);
}
