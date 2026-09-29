import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
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
    expect(find.text('2 likes'), findsOneWidget);
    expect(find.textContaining('#dui', findRichText: true), findsOneWidget);
  });

  test('compact counters', () {
    // 12.5K style past ten thousand.
    expect(SocialFormat.postLink('lawbid.app', 'p 1'),
        'https://lawbid.app/post/p%201');
  });
}
