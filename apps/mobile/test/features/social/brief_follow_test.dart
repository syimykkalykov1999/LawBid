import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-15: Follow is on someone else's brief (text post), at a
/// phone width and at a laptop width alike — and not on my own.
void main() {
  setUpAll(initializeDateFormatting);

  Post brief({required bool mine}) => Post(
        id: 'b1',
        author: const PostAuthor(
          id: 'a1',
          username: 'sofia.hernandez',
          firstName: 'Sofia',
          lastName: 'Hernandez',
          verified: true,
        ),
        title: 'A brief',
        body: 'Three things to know before the interview.',
        media: const [],
        tags: const [],
        likeCount: 3,
        commentCount: 2,
        likedByMe: false,
        savedByMe: false,
        isMine: mine,
        createdAt: DateTime.now().subtract(const Duration(days: 1)),
      );

  for (final width in [360.0, 1280.0]) {
    testWidgets('a brief shows Follow at $width dp', (t) async {
      t.view.physicalSize = Size(width, 900);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: SingleChildScrollView(
              child: PostCard(post: brief(mine: false)),
            ),
          ),
          theme: AppTheme.light(),
          size: Size(width, 900),
          overrides: uxOverrides(),
        ),
      );
      await t.pump();
      expect(find.byType(FollowButton), findsOneWidget);
      expect(find.text('Follow'), findsOneWidget);
    });
  }

  testWidgets('no Follow on my own brief', (t) async {
    t.view.physicalSize = const Size(360, 900);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: SingleChildScrollView(
            child: PostCard(post: brief(mine: true)),
          ),
        ),
        theme: AppTheme.light(),
        overrides: uxOverrides(),
      ),
    );
    await t.pump();
    expect(find.byType(FollowButton), findsNothing);
    // Boost's timers end with the tree.
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  });
}
