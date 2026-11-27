import 'package:dio/dio.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/data/promotions_repository.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/boost_wizard.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stars/data/stars_repository.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid/features/stars/presentation/low_stars_sheet.dart';
import 'package:lawbid/features/stars/presentation/stars_screen.dart';
import 'package:material_ui/material_ui.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20: the stars screen (balance, history), the
/// not-enough-stars sheet and the «pay with stars» block of Boost do not
/// overflow in the longest languages (worst of all, ne, ar, de, mr), at 360 dp, RTL, a
/// 1.1 font and every theme.
class _Stars extends StarsRepository {
  _Stars({this.balance = 120}) : super(Dio());

  final int balance;

  @override
  Future<StarsOverview> overview() async => StarsOverview(
        enabled: true,
        balance: balance,
        packs: const [
          StarPack(id: 'p1', stars: 5000, priceCents: 9999),
          StarPack(id: 'p2', stars: 150, priceCents: 279),
        ],
      );

  @override
  Future<({List<StarLedgerItem> items, String? next})> history({
    String? cursor,
  }) async =>
      (
        items: [
          for (final k in StarLedgerKind.values)
            StarLedgerItem(
              id: k.name,
              delta: k == StarLedgerKind.topup ? 5000 : -1250,
              balanceAfter: 123456,
              kind: k,
              createdAt: DateTime(2026, 10, 20, 9),
            ),
        ],
        next: null,
      );
}

class _Promo extends PromotionsRepository {
  _Promo() : super(Dio());

  @override
  Future<PromotionQuote> quote(
    int days, {
    int? dailyBudgetCents,
    PromotionTarget target = PromotionTarget.case_,
  }) async =>
      _quote;
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
  ctaTypes: ['more', 'message', 'profile', 'call'],
  starsTotal: 1750,
);

Future<void> main() async {
  await initializeDateFormatting();
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  final themes = {
    for (final id in AppThemeId.values) id.name: AppTheme.of(id),
  };

  for (final MapEntry(key: lang, value: (t, dir)) in locales.entries) {
    for (final MapEntry(key: themeName, value: theme) in themes.entries) {
      for (final balance in [120, 100000]) {
        final tag = '$lang, $themeName, balance $balance';

        Future<void> pump(WidgetTester tester, Widget child) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            uxApp(
              Directionality(textDirection: dir, child: child),
              theme: theme,
              size: narrowPhone,
              textScale: 1.1,
              disableAnimations: true,
              overrides: <Override>[
                ...uxOverrides(
                  translator: t,
                  extra: [
                    starsRepositoryProvider
                        .overrideWithValue(_Stars(balance: balance)),
                    starsEnabledProvider.overrideWithValue(true),
                    currentUserIdProvider.overrideWithValue('me'),
                    promotionsRepositoryProvider.overrideWithValue(_Promo()),
                    l10nFormatsProvider.overrideWithValue(
                      L10nFormats(AppLanguage.fromCode('en')),
                    ),
                  ],
                ),
              ],
            ),
          );
          await tester.pump(const Duration(milliseconds: 300));
          await tester.pump(const Duration(milliseconds: 300));
        }

        testWidgets('stars screen, $tag', (tester) async {
          await pump(tester, const StarsScreen());
          expect(find.byType(StarsScreen), findsOneWidget);
          expect(tester.takeException(), isNull);
        });

        testWidgets('not-enough-stars sheet, $tag', (tester) async {
          await pump(
            tester,
            Builder(
              builder: (context) => TextButton(
                onPressed: () => showLowStarsSheet(context, t, price: 99999),
                child: const Text('open'),
              ),
            ),
          );
          await tester.tap(find.text('open'));
          await tester.pump(const Duration(milliseconds: 400));
          await tester.pump(const Duration(milliseconds: 400));
          expect(find.byKey(const ValueKey('low-stars-sheet')), findsOneWidget);
          expect(tester.takeException(), isNull);
        });

        testWidgets('Boost: pay with stars, $tag', (tester) async {
          await pump(
            tester,
            const Scaffold(
              body: PromoteSheet(
                target: PromotionTarget.post,
                id: 'x',
                state: CasePromotionState(canPromote: true, quote: _quote),
              ),
            ),
          );
          for (var step = 0; step < kBoostSteps - 1; step++) {
            await tester.tap(find.byType(AppButton).last);
            await tester.pump(const Duration(milliseconds: 300));
          }
          // Choose the star balance.
          final stars = find.text(t.t('promote.pay.stars'));
          expect(stars, findsWidgets);
          await tester.ensureVisible(stars.first);
          await tester.tap(stars.first);
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
