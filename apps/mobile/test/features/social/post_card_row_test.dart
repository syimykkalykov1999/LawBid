import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-21 (inbox 1–3, Instagram): a photo post has the same row
/// as a text post — like, comment, repost, send with their numbers; the
/// dots of several photos lie on the picture, so the row comes right under
/// it; the author's username opens the caption.
const _photo = PostMedia(
  fileId: 'f',
  url: 'https://example.test/1.jpg',
  previewUrl: 'https://example.test/1_320.jpg',
  mediumUrl: 'https://example.test/1_1080.jpg',
  width: 1080,
  height: 1080,
);

void main() {
  setUpAll(initializeDateFormatting);
  testWidgets('photo post: repost with its number; dots on the photo',
      (t) async {
    t.view.physicalSize = const Size(400, 1400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final post = Post(
      id: 'p',
      author: fakePost('x').author,
      body: '',
      media: const [_photo, _photo],
      tags: const [],
      likeCount: 17,
      commentCount: 6,
      repostCount: 3,
      shareCount: 8,
      likedByMe: false,
      savedByMe: false,
      isMine: false,
      createdAt: DateTime(2026, 10, 20, 10),
    );
    await t.pumpWidget(
      uxApp(
        Scaffold(body: SingleChildScrollView(child: PostCard(post: post))),
        theme: AppTheme.dark(),
        size: const Size(400, 1400),
        overrides: uxOverrides(social: FakeSocialRepository()),
      ),
    );
    await t.pump(const Duration(seconds: 1));
    expect(find.byIcon(AppIcons.autoModeRounded), findsOneWidget);
    for (final n in ['17', '6', '3', '8']) {
      expect(find.text(n), findsOneWidget, reason: n);
    }
    final dots = t.getRect(find.byKey(const ValueKey('feed-carousel-dots')));
    final like = t.getRect(find.byIcon(AppIcons.favoriteBorderRounded));
    // The dots are on the picture, above the row; nothing between.
    expect(dots.bottom, lessThan(like.top));
    expect(like.top - dots.bottom, lessThan(24));
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  });
}
