import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
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
    final repo = FakeSocialRepository(posts: [fakePost('p1', likes: 2)]);
    await tester.pumpWidget(uxApp(
      const Scaffold(body: PostsFeedView()),
      theme: AppTheme.light(),
      overrides: uxOverrides(social: repo),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Saul Goodman'), findsOneWidget);
    // Owner 2026-09-30 card: the like count sits next to the heart.
    expect(find.text('2'), findsOneWidget);
    expect(find.textContaining('#dui', findRichText: true), findsOneWidget);
  });

  testWidgets('search: one request per pause, nothing under 2 characters (§7.1)',
      (tester) async {
    final search = FakeSearchRepository();
    await tester.pumpWidget(uxApp(
      const SearchScreen(),
      theme: AppTheme.light(),
      overrides: uxOverrides(search: search),
    ));
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
    await tester.pumpWidget(uxApp(
      const SearchScreen(),
      theme: AppTheme.light(),
      overrides: uxOverrides(),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Cases'), findsNothing);
    expect(find.text('Topics'), findsOneWidget);
  });

  test('compact counters', () {
    // 12.5K style past ten thousand.
    expect(SocialFormat.postLink('lawbid.app', 'p 1'),
        'https://lawbid.app/post/p%201');
  });
}
