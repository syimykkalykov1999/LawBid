import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/social/application/post_insights_providers.dart';
import 'package:lawbid/features/social/data/post_insights_repository.dart';
import 'package:lawbid/features/social/domain/post_insights_models.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/post_insights_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/post_impression_tracker.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-18 (Instagram Insights): the author's statistics screen —
/// the big numbers, the overview, the chart by day with its metric chips,
/// followers / non-followers, the promotion link when promoted; nothing
/// for someone else's post. Impressions are queued once a card is half on
/// screen for a second and sent in one batch.
void main() {
  setUpAll(initializeDateFormatting);

  Post post({bool mine = true, bool video = false}) => Post(
        id: 'p1',
        author: const PostAuthor(
          id: 'a1',
          username: 'sofia.hernandez',
          firstName: 'Sofia',
          lastName: 'Hernandez',
          verified: true,
        ),
        title: 'Tenant rights in 5 points',
        body: 'Text',
        media: const [],
        tags: const [],
        likeCount: 12,
        commentCount: 3,
        likedByMe: false,
        savedByMe: false,
        isMine: mine,
        createdAt: DateTime(2026, 10, 15, 9, 30),
        video: video ? const PostVideo(status: 'ready') : null,
      );

  final insights = PostInsights(
    postId: 'p1',
    publishedAt: DateTime(2026, 10, 15, 9, 30),
    totals: const InsightsCounts(
      impressions: 1234,
      reach: 800,
      likes: 12,
      comments: 3,
      saves: 4,
      reposts: 2,
      shares: 5,
      profileVisits: 7,
    ),
    reachFollowers: 200,
    reachNonFollowers: 600,
    days: [
      for (var i = 0; i < 4; i++)
        InsightsDay(
          date: DateTime(2026, 10, 15 + i),
          counts: InsightsCounts(impressions: 100 * i, reach: 10 * i),
        ),
    ],
  );

  CasePromotionState promo({String id = 'promo-1'}) => CasePromotionState(
        canPromote: false,
        quote: const PromotionQuote(
          days: 7,
          priceCentsPerDay: 100,
          grossCents: 700,
          totalCents: 700,
          creditDaysAvailable: 0,
          creditDaysUsed: 0,
          maxDays: 30,
          enabled: true,
        ),
        promotion: id.isEmpty
            ? null
            : CasePromotion(
                id: id,
                status: PromotionStatus.active,
                days: 7,
                totalCents: 700,
                impressions: 50,
                target: PromotionTarget.post,
                postId: 'p1',
              ),
      );

  Future<void> pump(
    WidgetTester t,
    Widget child, {
    List<Override> extra = const [],
  }) async {
    t.view.physicalSize = const Size(400, 1400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        child,
        theme: AppTheme.light(),
        size: const Size(400, 1400),
        overrides: uxOverrides(extra: extra),
      ),
    );
    await t.pump();
  }

  testWidgets('the author sees the numbers, the chart and the audience',
      (t) async {
    await pump(
      t,
      PostInsightsScreen(postId: 'p1', post: post()),
      extra: [
        postInsightsProvider('p1').overrideWith((_) async => insights),
        postPromotionProvider('p1').overrideWith((_) async => promo(id: '')),
      ],
    );
    await t.pumpAndSettle();

    expect(find.text('Post insights'), findsOneWidget);
    expect(find.text('Tenant rights in 5 points'), findsOneWidget);
    expect(find.textContaining('Posted'), findsOneWidget);
    expect(find.text('Accounts reached'), findsWidgets);
    expect(find.text('800'), findsOneWidget);
    expect(find.text('1,234'), findsOneWidget);
    expect(find.text('Profile visits'), findsWidgets);
    // Not a video: no Views row or chip.
    expect(find.byKey(const ValueKey('insights-metric-views')), findsNothing);
    expect(find.byKey(const ValueKey('insights-chart')), findsOneWidget);
    // The chart total follows the chosen metric: impressions 0+100+200+300.
    expect(find.text('600'), findsWidgets);
    await t.tap(find.byKey(const ValueKey('insights-metric-reach')));
    await t.pumpAndSettle();
    expect(find.text('60'), findsOneWidget);
    // Followers 200 of 800 reached.
    expect(find.text('200 · 25%'), findsOneWidget);
    expect(find.text('600 · 75%'), findsOneWidget);
    expect(find.text('Only you can see these insights.'), findsOneWidget);
    // Not promoted: no promotion section.
    expect(find.text('Promotion insights'), findsNothing);
  });

  testWidgets('a promoted post links to its promotion statistics', (t) async {
    await pump(
      t,
      PostInsightsScreen(postId: 'p1', post: post(video: true)),
      extra: [
        postInsightsProvider('p1').overrideWith((_) async => insights),
        postPromotionProvider('p1').overrideWith((_) async => promo()),
      ],
    );
    await t.pumpAndSettle();
    await t.scrollUntilVisible(find.text('Promotion insights'), 200);
    expect(find.text('Promotion'), findsOneWidget);
    expect(find.byKey(const ValueKey('insights-metric-views')), findsOneWidget);
  });

  testWidgets("someone else's post shows no numbers and asks for none",
      (t) async {
    var asked = false;
    await pump(
      t,
      PostInsightsScreen(postId: 'p1', post: post(mine: false)),
      extra: [
        postInsightsProvider('p1').overrideWith((_) async {
          asked = true;
          return insights;
        }),
      ],
    );
    await t.pumpAndSettle();
    expect(asked, isFalse);
    expect(
      find.text("Only the post's author can see its insights."),
      findsOneWidget,
    );
    expect(find.text('1,234'), findsNothing);
  });

  testWidgets('a 404 from the server shows the same message', (t) async {
    await pump(
      t,
      const PostInsightsScreen(postId: 'p1'),
      extra: [
        postInsightsProvider('p1').overrideWith(
          (_) => Future<PostInsights>.error(
            const ApiException(
              code: 'POST_NOT_FOUND',
              message: 'Post not found.',
              statusCode: 404,
            ),
          ),
        ),
      ],
    );
    await t.pumpAndSettle();
    expect(
      find.text("Only the post's author can see its insights."),
      findsOneWidget,
    );
  });

  testWidgets('a card half on screen for a second queues one impression',
      (t) async {
    final sent = <List<(String, PostEventKind)>>[];
    final queue = PostEventsQueue(
      send: (e) async => sent.add(e),
      flushAfter: const Duration(seconds: 2),
    );
    addTearDown(queue.dispose);
    await pump(
      t,
      Scaffold(
        body: ListView(
          children: [
            PostImpressionTracker(
              post: post(mine: false),
              child: const SizedBox(height: 300, child: Text('card')),
            ),
            PostImpressionTracker(
              post: post(),
              child: const SizedBox(height: 300, child: Text('own')),
            ),
          ],
        ),
      ),
      extra: [postEventsQueueProvider.overrideWithValue(queue)],
    );
    await t.pump(const Duration(milliseconds: 500));
    expect(queue.pending, isEmpty);
    await t.pump(const Duration(milliseconds: 600));
    expect(queue.pending, [('p1', PostEventKind.impression)]);
    await t.pump(const Duration(seconds: 3));
    expect(sent, [
      [('p1', PostEventKind.impression)],
    ]);
    // Seen again soon: not queued again.
    queue.impression('p1');
    expect(queue.pending, isEmpty);
  });

  testWidgets('the queue batches, dedupes and sends profile visits soon',
      (t) async {
    final sent = <List<(String, PostEventKind)>>[];
    final q = PostEventsQueue(send: (e) async => sent.add(e));
    addTearDown(q.dispose);
    q
      ..impression('a')
      ..impression('b')
      ..impression('a');
    expect(q.pending.length, 2);
    q.profileVisit('a');
    await t.pump(const Duration(seconds: 1));
    expect(sent, [
      [
        ('a', PostEventKind.impression),
        ('b', PostEventKind.impression),
        ('a', PostEventKind.profileVisit),
      ],
    ]);
    final off = PostEventsQueue(send: (e) async => sent.add(e), enabled: false)
      ..impression('c');
    expect(off.pending, isEmpty);
  });
}
