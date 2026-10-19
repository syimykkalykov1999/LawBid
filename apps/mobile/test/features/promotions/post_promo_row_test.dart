import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/data/promotions_repository.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/boost_wizard.dart';
import 'package:lawbid/features/social/presentation/widgets/post_promo_row.dart';

import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// Owner 2026-10-18: under the author's own post — «Статистика» on the
/// left (only when a promotion exists) and «Продвигать публикацию» on the
/// right; only the author sees the row.
const _quote = PromotionQuote(
  days: 3,
  priceCentsPerDay: 500,
  grossCents: 1500,
  totalCents: 0,
  creditDaysAvailable: 0,
  creditDaysUsed: 0,
  maxDays: 14,
  enabled: true,
  dailyBudgetCents: 500,
  maxDailyBudgetCents: 5000,
  budgetPresetsCents: [500, 1000],
  durationPresets: [3, 7],
  estReachMin: 900,
  estReachMax: 1500,
  ctaTypes: ['more'],
);

class _FakeRepo extends PromotionsRepository {
  _FakeRepo() : super(Dio());

  @override
  Future<PromotionQuote> quote(
    int days, {
    int? dailyBudgetCents,
    PromotionTarget target = PromotionTarget.case_,
  }) async =>
      _quote;
}

CasePromotion _promo(PromotionStatus s) => CasePromotion(
      id: 'pr1',
      target: PromotionTarget.post,
      postId: 'p1',
      status: s,
      days: 3,
      totalCents: 1500,
      impressions: 10,
    );

Future<void> main() async {
  await initializeDateFormatting();

  Future<void> open(
    WidgetTester t, {
    required bool isMine,
    CasePromotion? promotion,
    bool canPromote = true,
  }) async {
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => Scaffold(
            body: PostPromoRow(
              post: fakePost('p1', withPhoto: true, mine: isMine),
            ),
          ),
        ),
        GoRoute(
          path: AppRoutes.promotionStatsPattern,
          builder: (_, s) => Scaffold(
            body: Text('stats-screen-${s.pathParameters['id']}'),
          ),
        ),
      ],
    );
    await t.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          promotionsRepositoryProvider.overrideWithValue(_FakeRepo()),
          postPromotionProvider('p1').overrideWith(
            (ref) async => CasePromotionState(
              promotion: promotion,
              canPromote: canPromote,
              quote: _quote,
            ),
          ),
        ],
        child: MaterialApp.router(
          theme: AppTheme.dark(),
          routerConfig: router,
        ),
      ),
    );
    await t.pump();
    await t.pump();
  }

  testWidgets('not the author: nothing', (t) async {
    await open(t, isMine: false, promotion: _promo(PromotionStatus.active));
    expect(find.text('Stats'), findsNothing);
    expect(find.text('Boost this post'), findsNothing);
  });

  testWidgets("never promoted: «Stats» (the post's numbers) and «Boost»",
      (t) async {
    await open(t, isMine: true);
    expect(find.text('Stats'), findsOneWidget);
    await t.tap(find.text('Boost this post'));
    await t.pumpAndSettle();
    expect(find.byType(PromoteSheet), findsOneWidget);
  });

  testWidgets('running: state shown, both buttons open its stats', (t) async {
    await open(
      t,
      isMine: true,
      promotion: _promo(PromotionStatus.active),
      canPromote: false,
    );
    expect(find.text('Running'), findsOneWidget);
    await t.tap(find.text('Stats'));
    await t.pumpAndSettle();
    expect(find.text('stats-screen-pr1'), findsOneWidget);
  });

  testWidgets('finished: stats on the left, Boost again on the right',
      (t) async {
    await open(t, isMine: true, promotion: _promo(PromotionStatus.finished));
    expect(find.text('Stats'), findsOneWidget);
    expect(find.text('Boost this post'), findsOneWidget);
    await t.tap(find.text('Boost this post'));
    await t.pumpAndSettle();
    expect(find.byType(PromoteSheet), findsOneWidget);
  });

  testWidgets('running: the right button opens the stats too', (t) async {
    await open(
      t,
      isMine: true,
      promotion: _promo(PromotionStatus.active),
      canPromote: false,
    );
    await t.tap(find.text('Running'));
    await t.pumpAndSettle();
    expect(find.text('stats-screen-pr1'), findsOneWidget);
  });
}
