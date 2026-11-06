import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/application/topic_view_mode.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-11-04 (R-406): a topic page has a list/grid toggle at the top
/// right — «list» = the feed's post cards, «grid» = the Search tab's tiles;
/// the choice is kept on the device per account, default list; the same
/// for our practice topics and for people's hashtag topics.
void main() {
  setUpAll(initializeDateFormatting);

  const size = Size(390, 844);
  final posts = [
    fakePost('p1'),
    fakePost('p2', withPhoto: true),
    fakePost('p3'),
  ];

  Future<SharedPreferences> prefs([Map<String, Object> values = const {}]) {
    SharedPreferences.setMockInitialValues(values);
    return SharedPreferences.getInstance();
  }

  Future<void> pump(
    WidgetTester tester,
    Widget screen,
    SharedPreferences store,
    FakeSocialRepository repo,
  ) async {
    tester.view
      ..physicalSize = size
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        screen,
        theme: AppTheme.light(),
        overrides: [
          ...uxOverrides(social: repo),
          sharedPreferencesProvider.overrideWithValue(store),
          currentUserIdProvider.overrideWithValue('u1'),
        ],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
  }

  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 30));
  }

  testWidgets('a hashtag topic opens as a list of the feed cards by default',
      (tester) async {
    final repo = FakeSocialRepository(posts: posts);
    await pump(tester, const TagScreen(tag: 'alimony'), await prefs(), repo);
    expect(find.byKey(const ValueKey('topic-view-toggle')), findsOneWidget);
    expect(find.byType(PostCard), findsWidgets);
    expect(find.byType(PostGridTile), findsNothing);
    expect(find.byKey(const ValueKey('topic-posts-grid')), findsNothing);
    expect(repo.tagPostsCalls, isNotEmpty);
    await close(tester);
  });

  testWidgets('the toggle switches to the Search grid tiles and back',
      (tester) async {
    final repo = FakeSocialRepository(posts: posts);
    await pump(tester, const TagScreen(tag: 'alimony'), await prefs(), repo);
    await tester.tap(find.byKey(const ValueKey('topic-view-toggle')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byKey(const ValueKey('topic-posts-grid')), findsOneWidget);
    expect(find.byType(PostGridTile), findsNWidgets(3));
    expect(find.byType(PostCard), findsNothing);
    // The toggle now offers the list.
    expect(find.bySemanticsLabel('List'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('topic-view-toggle')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(PostGridTile), findsNothing);
    expect(find.byType(PostCard), findsWidgets);
    expect(find.bySemanticsLabel('Grid'), findsOneWidget);
    await close(tester);
  });

  testWidgets('the choice is remembered on the device, per account',
      (tester) async {
    final store = await prefs();
    final repo = FakeSocialRepository(posts: posts);
    await pump(tester, const TagScreen(tag: 'alimony'), store, repo);
    await tester.tap(find.byKey(const ValueKey('topic-view-toggle')));
    await tester.pump();
    expect(store.getString('topic.view.v1.u1'), 'grid');
    await close(tester);

    // A fresh app start with the same preferences: the grid at once.
    await pump(tester, const TagScreen(tag: 'alimony'), store, repo);
    expect(find.byKey(const ValueKey('topic-posts-grid')), findsOneWidget);
    expect(find.byType(PostCard), findsNothing);
    await close(tester);

    // Another account on the same device keeps the default.
    final container = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(store),
        currentUserIdProvider.overrideWithValue('u2'),
      ],
    );
    addTearDown(container.dispose);
    expect(container.read(topicViewModeProvider), TopicViewMode.list);
  });

  testWidgets('our practice topic has the same toggle and grid',
      (tester) async {
    final repo = FakeSocialRepository(posts: posts);
    await pump(
      tester,
      TagScreen(tag: topicTagFor('immigration')),
      await prefs({'topic.view.v1.u1': 'grid'}),
      repo,
    );
    expect(find.byKey(const ValueKey('topic-view-toggle')), findsOneWidget);
    expect(find.byKey(const ValueKey('topic-posts-grid')), findsOneWidget);
    expect(find.byType(PostGridTile), findsNWidgets(3));
    expect(find.byType(PostCard), findsNothing);
    expect(repo.latestPostsPractices, contains('immigration'));
    await close(tester);
  });
}
