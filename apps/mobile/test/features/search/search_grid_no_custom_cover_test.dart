import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/search/presentation/widgets/search_tiles.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-28: a video's custom cover is for the profile grid only
/// (tab 1 posts, tab 3 briefs / reposts). The Search grid shows the video's
/// own frame (the stream's `thumbnail.jpg` next to its playlist) and the
/// muted preview — never the cover.

const _cover = 'https://cdn.test/covers/my-gallery-cover_1080.jpg';
const _token = 'bcdn_token=abc&token_path=%2Fvid-1%2F&expires=1999999999';
const _playlist = 'https://cdn.test/$_token/vid-1/playlist.m3u8';
const _frame = 'https://cdn.test/$_token/vid-1/thumbnail.jpg';

Post _videoPost() => Post(
      id: 'p-video',
      author: const PostAuthor(
        id: 'att-1',
        username: 'saul',
        firstName: 'Saul',
        lastName: 'Goodman',
        verified: true,
      ),
      body: 'Know your rights',
      media: const [],
      tags: const [],
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: false,
      isMine: false,
      createdAt: DateTime(2026, 10, 28),
      video: const PostVideo(
        status: 'ready',
        playbackUrl: _playlist,
        thumbnailUrl: _cover,
        durationSec: 20,
        width: 720,
        height: 1280,
      ),
    );

List<String> _imageUrls(WidgetTester tester) => [
      for (final w in tester.widgetList<CachedNetworkImage>(
        find.byType(CachedNetworkImage),
      ))
        w.imageUrl,
    ];

void main() {
  setUpAll(initializeDateFormatting);

  test("the frame is the stream folder's thumbnail, token kept byte for byte",
      () {
    expect(_videoPost().video!.frameThumbnailUrl, _frame);
    const query = PostVideo(
      status: 'ready',
      playbackUrl: 'https://cdn.test/v/playlist.m3u8?token=x%2Fy',
    );
    expect(
      query.frameThumbnailUrl,
      'https://cdn.test/v/thumbnail.jpg?token=x%2Fy',
    );
    // Not ready, or not a playlist: no frame (the tile falls back to its
    // text cover, never to the custom cover).
    expect(
      const PostVideo(status: 'processing', thumbnailUrl: _cover)
          .frameThumbnailUrl,
      isNull,
    );
    expect(
      const PostVideo(status: 'ready', playbackUrl: 'https://cdn.test/v.mp4')
          .frameThumbnailUrl,
      isNull,
    );
  });

  testWidgets('Search grid tile: the video frame, never the custom cover',
      (tester) async {
    final post = _videoPost();
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: SizedBox(
            width: 130,
            height: 173,
            child: SearchPostTile(post: post, feed: [post]),
          ),
        ),
        theme: AppTheme.light(),
        overrides: uxOverrides(),
      ),
    );
    await tester.pump();
    final urls = _imageUrls(tester);
    expect(urls, contains(_frame));
    expect(urls, isNot(contains(_cover)));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('profile grid tile (default) keeps the custom cover',
      (tester) async {
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: SizedBox(
            width: 130,
            height: 130,
            child: PostGridTile(
              post: _videoPost(),
              onTap: () {},
              semanticLabel: 'post',
            ),
          ),
        ),
        theme: AppTheme.light(),
        overrides: uxOverrides(),
      ),
    );
    await tester.pump();
    expect(_imageUrls(tester), [_cover]);
    await tester.pumpWidget(const SizedBox());
  });
}
