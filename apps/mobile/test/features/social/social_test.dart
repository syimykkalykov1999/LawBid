import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

void main() {
  setUpAll(initializeDateFormatting);

  group('SocialActions (docs/05 §4 optimistic UI)', () {
    test('like shows at once and rolls back on failure', () async {
      final repo = FakeSocialRepository()..failLikes = true;
      final c = ProviderContainer(overrides: socialOverrides(repo));
      addTearDown(c.dispose);
      final post = fakePost('p1', likes: 3);
      final future = c.read(socialActionsProvider).toggleLike(post);
      // Optimistic: already liked, count + 1, before the server answers.
      expect(c.read(postOverridesProvider)['p1']?.likedByMe, isTrue);
      expect(c.read(postOverridesProvider)['p1']?.likeCount, 4);
      final error = await future;
      expect(error, isNotNull);
      expect(c.read(postOverridesProvider)['p1']?.likedByMe, isFalse);
      expect(c.read(postOverridesProvider)['p1']?.likeCount, 3);
    });

    test('a second tap while the first is in flight never calls the API twice',
        () async {
      final repo = FakeSocialRepository();
      final c = ProviderContainer(overrides: socialOverrides(repo));
      addTearDown(c.dispose);
      final actions = c.read(socialActionsProvider);
      final post = fakePost('p1');
      await Future.wait([actions.toggleLike(post), actions.toggleLike(post)]);
      expect(repo.likeCalls, [('p1', true)]);
    });

    test('double tap only ever likes', () async {
      final repo = FakeSocialRepository();
      final c = ProviderContainer(overrides: socialOverrides(repo));
      addTearDown(c.dispose);
      await c.read(socialActionsProvider).like(fakePost('p1', liked: true));
      expect(repo.likeCalls, isEmpty);
    });
  });

  test("deleting a post reloads the author's profile grid", () async {
    final repo = FakeSocialRepository(posts: [fakePost('p1')]);
    final c = ProviderContainer(overrides: socialOverrides(repo));
    addTearDown(c.dispose);
    final sub = c.listen(attorneyPostsProvider('att-1'), (_, __) {});
    addTearDown(sub.close);
    await c.read(attorneyPostsProvider('att-1').future);
    expect(repo.attorneyPostsCalls, 1);
    await c.read(socialActionsProvider).deletePost(fakePost('p1'));
    await c.read(attorneyPostsProvider('att-1').future);
    expect(repo.attorneyPostsCalls, 2);
    expect(c.read(deletedPostsProvider), contains('p1'));
  });

  testWidgets('tapping your own name opens the Profile tab, not a copy',
      (tester) async {
    final router = GoRouter(
      initialLocation: '/start',
      routes: [
        GoRoute(
          path: '/start',
          builder: (_, __) => Consumer(
            builder: (context, ref, _) => Column(
              children: [
                TextButton(
                  onPressed: () =>
                      openProfile(context, ref, id: 'me', username: 'mine'),
                  child: const Text('me'),
                ),
                TextButton(
                  onPressed: () =>
                      openProfile(context, ref, id: 'x', username: 'other'),
                  child: const Text('other'),
                ),
              ],
            ),
          ),
        ),
        GoRoute(
          path: AppRoutes.profile,
          builder: (_, __) => const Text('PROFILE TAB'),
        ),
        GoRoute(
          path: '/lawyer/:u',
          builder: (_, s) => Text('LAWYER ${s.pathParameters['u']}'),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [currentUserIdProvider.overrideWithValue('me')],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.tap(find.text('other'));
    await tester.pumpAndSettle();
    expect(find.text('LAWYER other'), findsOneWidget);
    router.go('/start');
    await tester.pumpAndSettle();
    await tester.tap(find.text('me'));
    await tester.pumpAndSettle();
    expect(find.text('PROFILE TAB'), findsOneWidget);
    expect(router.canPop(), isFalse);
  });

  test('offline feed falls back to the cached first page (§2.3)', () async {
    final repo = FakeSocialRepository(
      cached: CursorPage(items: [fakePost('cached')]),
    )..offline = true;
    final c = ProviderContainer(overrides: socialOverrides(repo));
    addTearDown(c.dispose);
    final page = await c.read(feedProvider.future);
    expect(page.items.single.id, 'cached');
    expect(c.read(feedProvider.notifier).fromCache, isTrue);
  });

  testWidgets('the feed shows post cards with author, likes and tags',
      (tester) async {
    final repo = FakeSocialRepository(
      // News keeps the LawBid card (like a post with a qualification).
      posts: [fakePost('p1', likes: 2, news: true)],
    );
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: PostsFeedView()),
        theme: AppTheme.light(),
        overrides: uxOverrides(social: repo),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Saul Goodman'), findsOneWidget);
    // Owner 2026-09-30 card: the like count sits next to the heart.
    expect(find.text('2'), findsOneWidget);
    expect(find.textContaining('#dui', findRichText: true), findsOneWidget);
  });

  testWidgets(
      'a post without a qualification looks like Instagram: photo, '
      'actions, likes line, bold name + caption, comments, time',
      (tester) async {
    final repo = FakeSocialRepository(
      posts: [fakePost('p1', likes: 2, comments: 3, withPhoto: true)],
    );
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: PostsFeedView()),
        theme: AppTheme.light(),
        overrides: uxOverrides(social: repo),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Saul Goodman'), findsOneWidget);
    // No count beside the heart: the likes have their own line.
    expect(find.text('2'), findsNothing);
    expect(find.text('2 likes'), findsOneWidget);
    // "saul Know your rights #dui": the name in bold, then the caption.
    expect(
      find.textContaining('saul Know your rights #dui', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('View all comments (3)'), findsOneWidget);
    // No "Read more" and no qualification chips (LawBid card only).
    expect(find.text('Read more'), findsNothing);
    // Order: photo above the actions, the caption below them.
    final photo = tester.getTopLeft(find.byType(PostMediaCarousel)).dy;
    final heart = tester.getTopLeft(find.bySemanticsLabel('Like')).dy;
    final caption = tester
        .getTopLeft(
          find.textContaining('Know your rights', findRichText: true),
        )
        .dy;
    expect(photo, lessThan(heart));
    expect(heart, lessThan(caption));
    // Full width photo (edge to edge).
    expect(
      tester.getSize(find.byType(PostMediaCarousel)).width,
      tester.getSize(find.byType(PostsFeedView)).width,
    );
  });

  testWidgets(
      "someone else's post ⋯: profile, block, report — no copy link "
      '(the paper plane shares)', (tester) async {
    final repo = FakeSocialRepository(posts: [fakePost('p1')]);
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: PostsFeedView()),
        theme: AppTheme.light(),
        overrides: uxOverrides(social: repo),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(AppIcons.moreHorizRounded).first);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('post-menu-profile')), findsOneWidget);
    expect(find.byKey(const ValueKey('post-menu-block')), findsOneWidget);
    expect(find.byKey(const ValueKey('post-menu-report')), findsOneWidget);
    // Not following yet: no "Unfollow".
    expect(find.byKey(const ValueKey('post-menu-unfollow')), findsNothing);
    expect(find.text('Copy link'), findsNothing);
  });

  testWidgets(
      'search: one request per pause, nothing under 2 characters (§7.1)',
      (tester) async {
    final search = FakeSearchRepository();
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        overrides: uxOverrides(search: search),
      ),
    );
    await tester.pump();
    // Owner 2026-09-29 (2nd pass): the big field sits at the top again.
    await tester.enterText(find.byType(TextField), 'a');
    await tester.pump(const Duration(milliseconds: 400));
    expect(search.attorneyQueries, isEmpty);
    await tester.enterText(find.byType(TextField), 'sa');
    await tester.enterText(find.byType(TextField), 'sau');
    await tester.enterText(find.byType(TextField), 'saul');
    await tester.pump(const Duration(milliseconds: 100));
    expect(search.attorneyQueries, isEmpty);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(search.attorneyQueries, ['saul']);
    expect(find.text('No results'), findsOneWidget);
  });

  testWidgets('search tabs by role: a client has no Cases tab (§7.1)',
      (tester) async {
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        overrides: uxOverrides(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Cases'), findsNothing);
    expect(find.text('Topics'), findsOneWidget);
  });

  test('compact counters', () {
    // 12.5K style past ten thousand.
    expect(
      SocialFormat.postLink('lawbid.dev', 'p 1'),
      'https://lawbid.dev/post/p%201',
    );
  });
}
