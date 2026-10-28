import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/hidden_counter_mark.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-28 (Instagram): the author hides the like / view counter
/// of an own post — others never see the number, the author still does,
/// with a small «Скрыто для других» mark; the ⋯ menu always names the
/// action that the tap does now, and the switch flips at once.
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

  testWidgets('hidden counters: the menu offers to show them, says hidden', (
    t,
  ) async {
    await pumpMenu(
      t,
      _CountersRepo(),
      post(likesHidden: true, viewsHidden: true),
    );
    expect(find.text('Show like count'), findsOneWidget);
    expect(find.text('Show view count'), findsOneWidget);
    expect(find.text('Hidden from others'), findsNWidgets(2));
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

  testWidgets('a viewer never sees a hidden like count', (t) async {
    await pumpBar(t, post(mine: false, likesHidden: true));
    expect(find.text('7'), findsNothing);
    expect(find.byType(HiddenCounterMark), findsNothing);
  });

  testWidgets('the author sees the own hidden count with the mark', (t) async {
    await pumpBar(t, post(likesHidden: true));
    expect(find.text('7'), findsOneWidget);
    expect(find.byType(HiddenCounterMark), findsOneWidget);
    expect(find.byTooltip('Hidden from others'), findsOneWidget);
  });

  testWidgets('a visible count: number, no mark', (t) async {
    await pumpBar(t, post(mine: false));
    expect(find.text('7'), findsOneWidget);
    expect(find.byType(HiddenCounterMark), findsNothing);
  });
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
