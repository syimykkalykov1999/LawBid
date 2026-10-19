import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/application/merged_paging.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-18: the attorney profile's «Брифы и репосты» tab — their
/// briefs and their reposts in one newest-first list; both sources page on
/// their own and «ещё» never skips or repeats a card.
void main() {
  setUpAll(initializeDateFormatting);

  DateTime day(int d) => DateTime(2026, 10, d, 12);

  Post post(
    String id,
    DateTime createdAt, {
    bool withPhoto = false,
    DateTime? repostedAt,
    int? pinSlot,
  }) {
    final base = fakePost(id, withPhoto: withPhoto);
    return Post(
      id: id,
      author: base.author,
      body: 'Body of $id',
      media: base.media,
      tags: base.tags,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: false,
      isMine: false,
      createdAt: createdAt,
      pinSlot: pinSlot,
      repostedBy: repostedAt == null
          ? null
          : PostReposter(
              id: 'att-1',
              username: 'saul',
              repostedAt: repostedAt,
            ),
    );
  }

  group('mergeNewestFirst', () {
    MergeSource<String> src(
      List<(String, int)> items, {
      bool hasMore = false,
      int? boundary,
    }) =>
        MergeSource(
          items: [for (final (id, d) in items) (id, day(d))],
          hasMore: hasMore,
          boundary: boundary != null
              ? day(boundary)
              : (items.isEmpty ? null : day(items.last.$2)),
        );

    List<String> ids(MergedPage<String> m) =>
        [for (final e in m.entries) e.item];

    test('everything loaded: one list, newest first', () {
      final m = mergeNewestFirst(
        [
          src([('b9', 9), ('b5', 5), ('b1', 1)]),
          src([('r8', 8), ('r6', 6), ('r2', 2)]),
        ],
        idOf: (s) => s,
      );
      expect(ids(m), ['b9', 'r8', 'r6', 'b5', 'r2', 'b1']);
      expect(m.hasMore, isFalse);
    });

    test('items older than a source with more pages wait for it', () {
      final m = mergeNewestFirst(
        [
          src([('b9', 9), ('b5', 5), ('b1', 1)]),
          src([('r8', 8), ('r6', 6)], hasMore: true),
        ],
        idOf: (s) => s,
      );
      // b5 / b1 may be preceded by unloaded reposts older than 6.
      expect(ids(m), ['b9', 'r8', 'r6']);
      expect(m.nextSource, 1);
    });

    test('next source = the one with the newest boundary', () {
      final m = mergeNewestFirst(
        [
          src([('b9', 9), ('b3', 3)], hasMore: true),
          src([('r8', 8), ('r6', 6)], hasMore: true),
        ],
        idOf: (s) => s,
      );
      expect(ids(m), ['b9', 'r8', 'r6']);
      expect(m.nextSource, 1);
    });

    test('a source with more pages and nothing loaded holds everything', () {
      final m = mergeNewestFirst(
        [
          src([('b9', 9)]),
          src(const [], hasMore: true),
        ],
        idOf: (s) => s,
      );
      expect(ids(m), isEmpty);
      expect(m.nextSource, 1);
    });

    test('the boundary counts filtered-out items too', () {
      // The briefs source loaded posts down to day 4 (media ones are not
      // shown), so a repost from day 5 may already be shown.
      final m = mergeNewestFirst(
        [
          src([('b9', 9)], hasMore: true, boundary: 4),
          src([('r5', 5), ('r2', 2)]),
        ],
        idOf: (s) => s,
      );
      expect(ids(m), ['b9', 'r5']);
      expect(m.nextSource, 0);
    });

    test('an id is shown once', () {
      final m = mergeNewestFirst(
        [
          src([('x', 9)]),
          src([('x', 8), ('r', 7)]),
        ],
        idOf: (s) => s,
      );
      expect(ids(m), ['x', 'r']);
    });

    test('paging both sources step by step never skips or repeats', () {
      final briefs = [for (var d = 30; d > 0; d -= 3) ('b$d', d)];
      final reposts = [for (var d = 29; d > 0; d -= 2) ('r$d', d)];
      final expected = [...briefs, ...reposts]
        ..sort((a, b) => b.$2.compareTo(a.$2));
      var loadedB = 2;
      var loadedR = 2;
      var shownBefore = <String>[];
      while (true) {
        final m = mergeNewestFirst(
          [
            src(
              briefs.take(loadedB).toList(),
              hasMore: loadedB < briefs.length,
            ),
            src(
              reposts.take(loadedR).toList(),
              hasMore: loadedR < reposts.length,
            ),
          ],
          idOf: (s) => s,
        );
        final shown = ids(m);
        // What is shown is always the start of the full list: nothing
        // skipped, nothing repeated, and earlier cards never move.
        expect(shown, [for (final e in expected.take(shown.length)) e.$1]);
        expect(shown.take(shownBefore.length), shownBefore);
        shownBefore = shown;
        if (!m.hasMore) break;
        if (m.nextSource == 0) {
          loadedB += 2;
        } else {
          loadedR += 2;
        }
      }
      expect(shownBefore, [for (final e in expected) e.$1]);
    });
  });

  test('monotoneTimes: exact times as given, estimates never newer', () {
    final times = monotoneTimes<(DateTime?, DateTime)>(
      [(day(9), day(1)), (null, day(8)), (null, day(3)), (day(2), day(1))],
      exact: (x) => x.$1,
      estimate: (x) => x.$2,
    );
    expect(times, [day(9), day(8), day(3), day(2)]);
    final clamped = monotoneTimes<(DateTime?, DateTime)>(
      [(day(5), day(1)), (null, day(8))],
      exact: (x) => x.$1,
      estimate: (x) => x.$2,
    );
    expect(clamped, [day(5), day(5)]);
  });

  group('ProfileBriefsAndReposts', () {
    Future<void> pump(WidgetTester t, FakeSocialRepository repo) async {
      t.view.physicalSize = const Size(400, 20000);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(
        uxApp(
          const Scaffold(
            body: SingleChildScrollView(
              child:
                  ProfileBriefsAndReposts(attorneyId: 'att-1', isSelf: false),
            ),
          ),
          theme: AppTheme.light(),
          size: const Size(400, 20000),
          overrides: uxOverrides(social: repo),
        ),
      );
      await t.pumpAndSettle();
    }

    Future<void> settle(WidgetTester t) async {
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 30));
    }

    List<String> cardIds(WidgetTester t) => [
          for (final c in t.widgetList<PostCard>(find.byType(PostCard)))
            c.post.id,
        ];

    testWidgets('briefs and reposts in one list, newest first', (t) async {
      final repo = FakeSocialRepository(
        posts: [
          post('brief-new', day(10)),
          post('photo', day(8), withPhoto: true),
          post('brief-old', day(3)),
        ],
      )..reposts = [
          // Reposted on day 9 / day 5, whatever the posts' own dates.
          post('repost-a', day(1), repostedAt: day(9)),
          post('repost-b', day(2), repostedAt: day(5)),
        ];
      await pump(t, repo);
      expect(cardIds(t), ['brief-new', 'repost-a', 'repost-b', 'brief-old']);
      // A repost keeps its "… reposted" header.
      expect(find.text('saul reposted'), findsNWidgets(2));
      await settle(t);
    });

    testWidgets('a pinned brief stays on top', (t) async {
      final repo = FakeSocialRepository(
        posts: [
          post('pinned', day(1), pinSlot: 1),
          post('brief', day(6)),
        ],
      )..reposts = [post('repost', day(2), repostedAt: day(7))];
      await pump(t, repo);
      expect(cardIds(t), ['pinned', 'repost', 'brief']);
      await settle(t);
    });

    testWidgets('load more merges both sources without gaps or repeats',
        (t) async {
      final briefs = [
        for (var d = 28; d > 0; d -= 3) post('b$d', day(d)),
      ];
      // Reposted at 06:00 (briefs at 12:00): no two cards share a time.
      final reposts = [
        for (var d = 27; d > 0; d -= 4)
          post('r$d', day(1), repostedAt: DateTime(2026, 10, d, 6)),
      ];
      DateTime at(Post p) => p.repostedBy?.repostedAt ?? p.createdAt;
      final all = [...briefs, ...reposts]
        ..sort((a, b) => at(b).compareTo(at(a)));
      final expected = [for (final p in all) p.id];
      final repo = FakeSocialRepository(posts: briefs)
        ..reposts = reposts
        ..pageSize = 2;
      await pump(t, repo);
      final more = find.byKey(const ValueKey('briefs-reposts-more'));
      var before = <String>[];
      var taps = 0;
      while (more.evaluate().isNotEmpty) {
        final ids = cardIds(t);
        expect(ids, expected.take(ids.length).toList());
        expect(ids.take(before.length), before);
        before = ids;
        await t.tap(more);
        await t.pumpAndSettle();
        expect(++taps, lessThan(30));
      }
      expect(cardIds(t), expected);
      // Each reposts page was asked for once.
      expect(repo.userRepostsCursors, [null, '2', '4', '6']);
      await settle(t);
    });

    testWidgets('nothing yet: says there are no briefs or reposts', (t) async {
      final repo = FakeSocialRepository(
        posts: [post('photo', day(3), withPhoto: true)],
      );
      await pump(t, repo);
      expect(find.byType(PostCard), findsNothing);
      expect(find.text('No briefs or reposts yet'), findsOneWidget);
      await settle(t);
    });
  });
}
