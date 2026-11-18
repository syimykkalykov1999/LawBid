import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-28 / 16.11 (Instagram «Hide like and share counts»): the
/// author hides the counters of an own post — the like, repost and share
/// numbers (and views) disappear for everyone, the author too, with no
/// crossed-eye mark anywhere; the ⋯ menu always names the action that the
/// tap does now, and the switch flips at once.
void main() {
  setUpAll(initializeDateFormatting);

  Post post({
    bool mine = true,
    bool likesHidden = false,
    bool viewsHidden = false,
  }) =>
      Post(
        id: 'p1',
        author: const PostAuthor(
          id: 'a1',
          username: 'sofia.hernandez',
          firstName: 'Sofia',
          lastName: 'Hernandez',
          verified: true,
        ),
        title: 'Reel',
        body: 'Text',
        media: const [],
        tags: const [],
        likeCount: 7,
        commentCount: 0,
        viewCount: 9,
        shareCount: 4,
        repostCount: 3,
        likedByMe: false,
        savedByMe: false,
        isMine: mine,
        createdAt: DateTime(2026, 10, 20),
        video: const PostVideo(status: 'ready'),
        likesHidden: likesHidden,
        viewsHidden: viewsHidden,
      );

  Future<ProviderContainer> pumpMenu(
    WidgetTester t,
    _CountersRepo repo,
    Post p,
  ) async {
    t.view.physicalSize = const Size(400, 1000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    late ProviderContainer container;
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: Consumer(
            builder: (context, ref, _) {
              container = ProviderScope.containerOf(context);
              final current = ref.watch(postOverridesProvider)[p.id] ?? p;
              return TextButton(
                onPressed: () => showPostMenu(context, ref, current),
                child: const Text('open'),
              );
            },
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(400, 1000),
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    return container;
  }

  testWidgets('visible counters: the menu offers to hide them', (t) async {
    await pumpMenu(t, _CountersRepo(), post());
    expect(find.text('Hide like count'), findsOneWidget);
    expect(find.text('Hide view count'), findsOneWidget);
    expect(find.text('Hidden from others'), findsNothing);
  });

  testWidgets('hidden counters: the menu offers to show them, no extra line', (
    t,
  ) async {
    await pumpMenu(
      t,
      _CountersRepo(),
      post(likesHidden: true, viewsHidden: true),
    );
    expect(find.text('Show like count'), findsOneWidget);
    expect(find.text('Show view count'), findsOneWidget);
    expect(find.text('Hidden from others'), findsNothing);
  });

  testWidgets('hide flips at once, the server confirms, the label follows', (
    t,
  ) async {
    final repo = _CountersRepo()..gate = Completer<void>();
    final c = await pumpMenu(t, repo, post());
    await t.tap(find.byKey(const ValueKey('post-menu-hide-likes')));
    await t.pump();
    // Optimistic: hidden before the server answered.
    expect(c.read(postOverridesProvider)['p1']?.likesHidden, isTrue);
    expect(repo.calls, [('p1', true, null)]);
    repo.gate!.complete();
    await t.pumpAndSettle();
    expect(c.read(postOverridesProvider)['p1']?.likesHidden, isTrue);
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    expect(find.text('Show like count'), findsOneWidget);
    // Show again.
    await t.tap(find.byKey(const ValueKey('post-menu-hide-likes')));
    await t.pumpAndSettle();
    expect(repo.calls.last, ('p1', false, null));
    expect(c.read(postOverridesProvider)['p1']?.likesHidden, isFalse);
  });

  testWidgets('a server error puts the old state back and says so', (t) async {
    final repo = _CountersRepo()..fail = true;
    final c = await pumpMenu(t, repo, post());
    await t.tap(find.byKey(const ValueKey('post-menu-hide-views')));
    await t.pumpAndSettle();
    expect(c.read(postOverridesProvider)['p1']?.viewsHidden, isFalse);
    expect(find.byType(SnackBar), findsOneWidget);
  });

  Future<void> pumpBar(WidgetTester t, Post p) async {
    t.view.physicalSize = const Size(400, 740);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: PostActionsBar(post: p, run: (f) async => f()),
        ),
        theme: AppTheme.light(),
        size: const Size(400, 740),
        overrides: uxOverrides(),
      ),
    );
    await t.pump();
  }

  void expectNoMark() {
    expect(find.byIcon(AppIcons.visibilityOffOutlined), findsNothing);
    expect(find.byTooltip('Hidden from others'), findsNothing);
  }

  for (final mine in [false, true]) {
    final who = mine ? 'the author' : 'a viewer';
    testWidgets('$who sees no hidden like / repost / share count, no mark', (
      t,
    ) async {
      await pumpBar(t, post(mine: mine, likesHidden: true));
      expect(find.text('7'), findsNothing);
      expect(find.text('3'), findsNothing);
      expect(find.text('4'), findsNothing);
      expectNoMark();
    });

    testWidgets('$who sees the counts after «Показать», no mark', (t) async {
      await pumpBar(t, post(mine: mine));
      expect(find.text('7'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      expect(find.text('4'), findsOneWidget);
      expectNoMark();
    });

    testWidgets('$who: a hidden view count leaves the reels grid tile', (
      t,
    ) async {
      Future<void> pumpTile(Post p) => t.pumpWidget(
            uxApp(
              Scaffold(
                body: SizedBox(
                  width: 120,
                  height: 213,
                  child: ReelGridTile(
                    post: p,
                    onTap: () {},
                    semanticLabel: 'reel',
                  ),
                ),
              ),
              theme: AppTheme.light(),
              size: const Size(400, 740),
              overrides: uxOverrides(),
            ),
          );
      await pumpTile(post(mine: mine, viewsHidden: true));
      await t.pump();
      expect(find.text('9'), findsNothing);
      expectNoMark();
      await pumpTile(post(mine: mine));
      await t.pump();
      expect(find.text('9'), findsOneWidget);
    });
  }
}

class _CountersRepo extends FakeSocialRepository {
  final calls = <(String, bool?, bool?)>[];
  Completer<void>? gate;
  bool fail = false;
  bool _likes = false;
  bool _views = false;

  @override
  Future<Post> setPostCounters(
    String id, {
    bool? hideLikes,
    bool? hideViews,
  }) async {
    calls.add((id, hideLikes, hideViews));
    final g = gate;
    if (g != null) {
      await g.future;
      gate = null;
    }
    if (fail) throw StateError('offline');
    _likes = hideLikes ?? _likes;
    _views = hideViews ?? _views;
    return Post(
      id: id,
      author: const PostAuthor(
        id: 'a1',
        username: 'sofia.hernandez',
        firstName: 'Sofia',
        lastName: 'Hernandez',
        verified: true,
      ),
      title: 'Reel',
      body: 'Text',
      media: const [],
      tags: const [],
      likeCount: 7,
      commentCount: 0,
      viewCount: 9,
      likedByMe: false,
      savedByMe: false,
      isMine: true,
      createdAt: DateTime(2026, 10, 20),
      video: const PostVideo(status: 'ready'),
      likesHidden: _likes,
      viewsHidden: _views,
    );
  }
}
