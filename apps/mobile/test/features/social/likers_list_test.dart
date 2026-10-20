import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-20: a tap on the like counter opens the list of people who
/// liked the post.
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('tap on the like counter opens the likers list', (t) async {
    t.view.physicalSize = const Size(400, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final post = fakePost('p1', likes: 5, withPhoto: true);
    await t.pumpWidget(
      uxApp(
        Scaffold(body: SingleChildScrollView(child: PostCard(post: post))),
        theme: AppTheme.light(),
        size: const Size(400, 1200),
        overrides: uxOverrides(social: FakeSocialRepository()),
      ),
    );
    await t.pump(const Duration(seconds: 1));
    expect(find.byType(LikersScreen), findsNothing);
    await t.tap(find.text('5 likes'));
    await t.pump(const Duration(milliseconds: 400));
    await t.pumpAndSettle();
    expect(find.byType(LikersScreen), findsOneWidget);
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  });

  testWidgets('a one-emoji post draws the emoji big in the feed card',
      (t) async {
    t.view.physicalSize = const Size(400, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final post = fakePost('p2', withPhoto: true).copyWith(body: '😎');
    await t.pumpWidget(
      uxApp(
        Scaffold(body: SingleChildScrollView(child: PostCard(post: post))),
        theme: AppTheme.light(),
        size: const Size(400, 1200),
        overrides: uxOverrides(social: FakeSocialRepository()),
      ),
    );
    await t.pump(const Duration(seconds: 1));
    final emoji = t.widget<Text>(find.text('😎'));
    expect(emoji.style?.fontSize, 44);
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  });
}
