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
import 'package:lawbid/features/promotions/presentation/promotion_stats_screen.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-15: the Boost screens do not overflow or overlap with the
/// longest text of every language, at 360 dp, in RTL, with a big font, in
/// every theme.
class _Repo extends PromotionsRepository {
  _Repo() : super(Dio());

  @override
  Future<PromotionQuote> quote(
    int days, {
    int? dailyBudgetCents,
    PromotionTarget target = PromotionTarget.case_,
  }) async =>
      _quote;

  @override
  Future<PromotionStats> stats(String id) async => PromotionStats(
        promotion: CasePromotion(
          id: 'p1',
          status: PromotionStatus.active,
          days: 7,
          totalCents: 3500,
          impressions: 123456,
          reach: 98765,
          clicks: 4321,
          title: 'A long title of the boosted post that wraps on two lines',
          endsAt: DateTime(2026, 10, 20),
        ),
        days: [
          for (var i = 0; i < 7; i++)
            PromotionDay(
              day: DateTime(2026, 10, 14 + i),
              impressions: 100 * (i + 1),
              reach: 80,
              clicks: 5,
            ),
        ],
        spentCents: 1500,
      );
}

const _quote = PromotionQuote(
  days: 7,
  priceCentsPerDay: 500,
  grossCents: 3500,
  totalCents: 3500,
  creditDaysAvailable: 0,
  creditDaysUsed: 0,
  maxDays: 14,
  enabled: true,
  dailyBudgetCents: 500,
  maxDailyBudgetCents: 5000,
  budgetPresetsCents: [500, 1000, 2000],
  durationPresets: [3, 7, 14],
  estReachMin: 12000,
  estReachMax: 18000,
  ctaTypes: ['more', 'message', 'profile', 'download', 'call'],
);

Future<void> main() async {
  await initializeDateFormatting();
  final themes = {
    for (final id in AppThemeId.values) id.name: AppTheme.of(id),
  };

  for (final MapEntry(key: themeName, value: theme) in themes.entries) {
    for (final dir in [TextDirection.ltr, TextDirection.rtl]) {
      for (final scale in [1.0, 1.3]) {
        final tag = '$themeName, ${dir.name}, x$scale';

        Future<void> pump(WidgetTester t, Widget child) async {
          useNarrowPhone(t);
          await t.pumpWidget(
            uxApp(
              Directionality(textDirection: dir, child: child),
              theme: theme,
              size: narrowPhone,
              textScale: scale,
              overrides: uxOverrides(
                translator: LongestTranslator(),
                extra: [
                  promotionsRepositoryProvider.overrideWithValue(_Repo()),
                  l10nFormatsProvider.overrideWithValue(
                    L10nFormats(AppLanguage.fromCode('en')),
                  ),
                ],
              ),
            ),
          );
          await t.pump(const Duration(milliseconds: 300));
        }

        for (final target in [PromotionTarget.post, PromotionTarget.case_]) {
          testWidgets('wizard ${target.name}: all steps, $tag', (t) async {
            await pump(
              t,
              Scaffold(
                body: PromoteSheet(
                  target: target,
                  id: 'x',
                  state: const CasePromotionState(
                    canPromote: true,
                    quote: _quote,
                  ),
                ),
              ),
            );
            for (var step = 0; step < kBoostSteps; step++) {
              expect(t.takeException(), isNull, reason: 'step ${step + 1}');
              if (step < kBoostSteps - 1) {
                final next = find.byType(AppButton).last;
                await t.tap(next);
                await t.pump(const Duration(milliseconds: 300));
              }
            }
            expect(t.takeException(), isNull);
          });
        }

        testWidgets('stats screen, $tag', (t) async {
          await pump(t, const PromotionStatsScreen(id: 'p1'));
          await t.pump(const Duration(milliseconds: 300));
          expect(t.takeException(), isNull);
        });
      }
    }
  }
}
