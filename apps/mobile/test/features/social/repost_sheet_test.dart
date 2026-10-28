import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/client_social_profile.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-18: ↻ opens a sheet («Репост» / «Отменить репост»), the
/// counter moves at once and rolls back on an error; the «Репосты» tab is
/// one widget for every role and an undo removes the card from it.
void main() {
  setUpAll(initializeDateFormatting);

  Post other({bool reposted = false, int count = 2}) =>
      fakePost('p1').copyWith(repostedByMe: reposted, repostCount: count);

  Future<void> pumpCard(
    WidgetTester t,
    FakeSocialRepository repo,
    Post post,
  ) async {
    t.view.physicalSize = const Size(400, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(body: SingleChildScrollView(child: PostCard(post: post))),
        theme: AppTheme.light(),
        size: const Size(400, 1200),
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.pump(const Duration(seconds: 1));
  }

  Future<void> settle(WidgetTester t) async {
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 30));
  }

  testWidgets('not reposted: sheet offers Repost, counter goes up', (t) async {
    final repo = FakeSocialRepository();
    await pumpCard(t, repo, other());
    await t.tap(find.bySemanticsLabel('Repost').first);
    await t.pump(const Duration(milliseconds: 300));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('repost-sheet-do')), findsOneWidget);
    expect(find.byKey(const ValueKey('repost-sheet-undo')), findsNothing);
    await t.tap(find.byKey(const ValueKey('repost-sheet-do')));
    await t.pumpAndSettle();
    expect(repo.repostCalls, [('p1', true)]);
    expect(find.text('3'), findsOneWidget);
    await settle(t);
  });

  testWidgets('reposted: sheet offers Undo, counter goes down', (t) async {
    final repo = FakeSocialRepository();
    await pumpCard(t, repo, other(reposted: true, count: 3));
    await t.tap(find.bySemanticsLabel('Undo repost').first);
    await t.pump(const Duration(milliseconds: 300));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('repost-sheet-undo')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('repost-sheet-undo')));
    await t.pumpAndSettle();
    expect(repo.repostCalls, [('p1', false)]);
    expect(find.text('2'), findsOneWidget);
    await settle(t);
  });

  testWidgets('a failed repost rolls the counter back', (t) async {
    final repo = FakeSocialRepository()..failReposts = true;
    await pumpCard(t, repo, other());
    await t.tap(find.bySemanticsLabel('Repost').first);
    await t.pump(const Duration(milliseconds: 300));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('repost-sheet-do')));
    await t.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);
    expect(find.text('3'), findsNothing);
    await settle(t);
  });

  testWidgets('Briefs & reposts tab lists reposts as grid tiles',
      (t) async {
    final repo = FakeSocialRepository()
      ..reposts = [
        other(reposted: true, count: 3).copyWith(),
      ];
    t.view.physicalSize = const Size(400, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        const Scaffold(
          body: SingleChildScrollView(
            child: ProfileBriefsAndReposts(attorneyId: 'me', isSelf: true),
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(400, 1200),
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.pumpAndSettle();
    expect(find.byType(PostGridTile), findsOneWidget);
    await settle(t);
  });

  // Owner 2026-10-18: a client's reposts sit with their briefs, as on an
  // attorney's profile.
  testWidgets('a client profile has the same Briefs & reposts tab', (t) async {
    final repo = FakeSocialRepository()..reposts = [other()];
    t.view.physicalSize = const Size(400, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: ClientSocialProfile(
            profile: PublicClientProfile(
              id: 'c1',
              username: 'cleo',
              state: const StateRef(code: 'NY', name: 'New York'),
              memberSince: DateTime(2026),
              isSelf: false,
            ),
            onRefresh: () async {},
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(400, 1200),
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.pumpAndSettle();
    // No reviews for this viewer: three tabs.
    for (final label in ['Posts', 'Reels', 'Briefs & reposts']) {
      expect(find.bySemanticsLabel(label), findsOneWidget, reason: label);
    }
    expect(find.bySemanticsLabel('Reviews'), findsNothing);
    await t.tap(find.bySemanticsLabel('Briefs & reposts'));
    await t.pumpAndSettle();
    expect(find.byType(PostGridTile), findsOneWidget);
    await settle(t);
  });

  testWidgets(
      'a client profile has four tabs: '
      'Posts, Reels, Briefs & reposts, Reviews', (t) async {
    t.view.physicalSize = const Size(400, 1200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: ClientSocialProfile(
            profile: PublicClientProfile(
              id: 'c1',
              username: 'cleo',
              state: const StateRef(code: 'NY', name: 'New York'),
              memberSince: DateTime(2026),
              isSelf: true,
              canSeeReviews: true,
            ),
            onRefresh: () async {},
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(400, 1200),
        overrides: uxOverrides(social: FakeSocialRepository()),
      ),
    );
    await t.pumpAndSettle();
    for (final label in ['Posts', 'Reels', 'Briefs & reposts', 'Reviews']) {
      expect(find.bySemanticsLabel(label), findsOneWidget, reason: label);
    }
    expect(find.bySemanticsLabel('Reposts'), findsNothing);
    await settle(t);
  });
}
