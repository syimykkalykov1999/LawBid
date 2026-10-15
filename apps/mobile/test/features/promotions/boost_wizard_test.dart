import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/data/promotions_repository.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/boost_wizard.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-15: the Boost setup is five steps — goal, audience,
/// budget and days, the button, review. A client's case has no choice of
/// button («Откликнуться»); a post picks one, with a link / phone checked.
class _FakeRepo extends PromotionsRepository {
  _FakeRepo() : super(Dio());

  Map<String, Object?>? bought;

  @override
  Future<PromotionQuote> quote(
    int days, {
    int? dailyBudgetCents,
    PromotionTarget target = PromotionTarget.case_,
  }) async =>
      _quote;

  @override
  Future<PromotionPurchase> buy(
    String id, {
    required int days,
    PromotionTarget target = PromotionTarget.case_,
    int? dailyBudgetCents,
    PromotionAudience? audience,
    bool useCredits = true,
    String? promoCode,
    String? goal,
    String? ctaType,
    String? ctaValue,
    bool extend = false,
  }) async {
    bought = {
      'goal': goal,
      'ctaType': ctaType,
      'ctaValue': ctaValue,
      'days': days,
      'target': target,
      'extend': extend,
    };
    return const PromotionPurchase(
      status: PromotionStatus.active,
      totalCents: 0,
      creditDaysUsed: 0,
    );
  }
}

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
  ctaTypes: ['more', 'message', 'profile', 'download', 'call'],
);

Future<void> main() async {
  await initializeDateFormatting();

  Future<_FakeRepo> open(WidgetTester t, PromotionTarget target) async {
    useNarrowPhone(t);
    final repo = _FakeRepo();
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: PromoteSheet(
            target: target,
            id: 'x1',
            state: const CasePromotionState(canPromote: true, quote: _quote),
          ),
        ),
        theme: AppTheme.dark(),
        size: narrowPhone,
        overrides: uxOverrides(
          extra: [
            promotionsRepositoryProvider.overrideWithValue(repo),
            l10nFormatsProvider
                .overrideWithValue(L10nFormats(AppLanguage.fromCode('en'))),
          ],
        ),
      ),
    );
    await t.pump();
    return repo;
  }

  Future<void> next(WidgetTester t) async {
    await t.tap(find.text('Next'));
    await t.pump(const Duration(milliseconds: 300));
  }

  testWidgets('a client case: two goals, fixed «Respond», five steps',
      (t) async {
    final repo = await open(t, PromotionTarget.case_);
    expect(find.text('Step 1 of 5'), findsOneWidget);
    expect(find.text('More attorneys see the case'), findsOneWidget);
    expect(find.text('More bids'), findsOneWidget);
    expect(find.text('More followers'), findsNothing);
    await t.tap(find.text('More bids'));
    await t.pump();
    await next(t); // audience
    expect(find.textContaining('Attorneys in your case'), findsOneWidget);
    await next(t); // budget
    await next(t); // button
    expect(find.text('Respond'), findsOneWidget);
    expect(find.text('Visit website'), findsNothing);
    await next(t); // review
    expect(find.text('Step 5 of 5'), findsOneWidget);
    await t.tap(find.text('Start for free'));
    await t.pumpAndSettle();
    expect(repo.bought, containsPair('goal', 'messages'));
    expect(repo.bought, containsPair('ctaType', null));
  });

  testWidgets('a post: four goals, the link is checked, then it is sent',
      (t) async {
    final repo = await open(t, PromotionTarget.post);
    expect(find.text('More followers'), findsOneWidget);
    await t.tap(find.text('More clicks'));
    await t.pump();
    await next(t);
    await next(t);
    await next(t);
    expect(find.text('Visit website'), findsOneWidget);
    expect(find.text('Call'), findsOneWidget);
    await t.tap(find.text('Visit website'));
    await t.pump();
    await t.enterText(find.byType(TextField), 'http://bit.ly/x');
    await next(t);
    // Not an https site: stays on the button step with the reason.
    expect(find.text('Step 4 of 5'), findsOneWidget);
    expect(find.textContaining('https link'), findsOneWidget);
    await t.enterText(find.byType(TextField), 'https://smith-law.com/hi');
    await next(t);
    expect(find.text('Step 5 of 5'), findsOneWidget);
    await t.tap(find.text('Start for free'));
    await t.pumpAndSettle();
    expect(repo.bought, containsPair('goal', 'clicks'));
    expect(repo.bought, containsPair('ctaType', 'more'));
    expect(repo.bought, containsPair('ctaValue', 'https://smith-law.com/hi'));
  });

  test('link and phone rules', () {
    expect(isValidBoostLink('https://smith-law.com'), isTrue);
    expect(isValidBoostLink('http://smith-law.com'), isFalse);
    expect(isValidBoostLink('smith-law'), isFalse);
    expect(isValidBoostPhone('+1 (202) 555-0123'), isTrue);
    expect(isValidBoostPhone('2025550123'), isFalse);
  });
}
