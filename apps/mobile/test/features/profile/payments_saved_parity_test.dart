// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/profile/presentation/screens/payments_hub_screen.dart';
import 'package:lawbid/features/settings/saved/saved_screen.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/long_locale.dart';
import '../subscription/subscription_fakes.dart';
import 'profile_fakes.dart';
import 'settings_rows_test.dart' show pumpSettings, tearDownSettings;

class _NoCasePayments extends CasePaymentsHistoryNotifier {
  @override
  Future<CursorPage<CasePayment>> fetch(String? cursor) async =>
      const CursorPage(items: []);
}

List<Override> _hubOverrides({bool casePayments = false, Translator? t}) => [
      subscriptionRepositoryProvider
          .overrideWithValue(FakeSubscriptionRepository(makeOverview())),
      casePaymentsFlagProvider.overrideWithValue(casePayments),
      casePaymentsHistoryProvider.overrideWith(_NoCasePayments.new),
      casePaymentsSummaryProvider.overrideWith(
        (ref) async =>
            const PaymentsSummary(totalCents: 0, count: 0, refundedCents: 0),
      ),
      if (t != null) translatorProvider.overrideWithValue(t),
    ];

Future<void> _pumpHub(
  WidgetTester tester,
  CurrentUser user, {
  PaymentsTab initial = PaymentsTab.receipts,
  bool casePayments = false,
  ThemeData? theme,
  Translator? t,
  TextDirection dir = TextDirection.ltr,
  double scale = 1,
}) async {
  useNarrowPhone(tester);
  final wrap = await profileWrapper(
    theme ?? AppTheme.light(),
    user: user,
    textScale: scale,
    overrides: _hubOverrides(casePayments: casePayments, t: t),
  );
  await tester.pumpWidget(
    wrap(
      Directionality(
        textDirection: dir,
        child: PaymentsHubScreen(initial: initial),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _done(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(const Duration(seconds: 1));
}

/// Owner 2026-10-22 (product audit #4 §1): «Сохранённое» and «Платежи» in
/// the same place for both roles; distinct icons for distinct rows.
void main() {
  setUpAll(initializeDateFormatting);

  group('Settings rows', () {
    for (final (role, user) in [
      ('client', clientMe()),
      ('attorney', attorneyMe()),
    ]) {
      testWidgets('$role: one Saved and one Payments row', (tester) async {
        await pumpSettings(tester, user);
        expect(find.byKey(const ValueKey('settings-saved')), findsOneWidget);
        expect(find.byKey(const ValueKey('settings-payments')), findsOneWidget);
        expect(
          find.byKey(const ValueKey('settings-case-payments')),
          findsNothing,
        );
        await tearDownSettings(tester);
      });
    }

    testWidgets('no icon means two different rows', (tester) async {
      for (final user in [clientMe(), attorneyMe()]) {
        await pumpSettings(tester, user);
        final icons = <IconData, String>{};
        for (final row in tester.widgetList<AppListRow>(find.byType(AppListRow))) {
          final icon = row.icon;
          if (icon == null) continue;
          final seen = icons[icon];
          expect(
            seen == null || seen == row.label,
            isTrue,
            reason: '"${row.label}" and "$seen" share an icon',
          );
          icons[icon] = row.label;
        }
        await tearDownSettings(tester);
      }
    });
  });

  group('Payments page', () {
    testWidgets('tabs: receipts and purchases; case payments when on',
        (tester) async {
      await _pumpHub(tester, clientMe());
      expect(find.text('Receipts'), findsOneWidget);
      expect(find.text('Purchases'), findsOneWidget);
      expect(find.text('Case payments'), findsNothing);
      await _done(tester);

      await _pumpHub(
        tester,
        attorneyMe(),
        casePayments: true,
        initial: PaymentsTab.cases,
      );
      expect(find.text('Case payments'), findsOneWidget);
      expect(find.byKey(const ValueKey('case-payments-csv')), findsOneWidget);
      await _done(tester);
    });

    testWidgets('purchases: the client badge for a client', (tester) async {
      await _pumpHub(tester, clientMe(), initial: PaymentsTab.purchases);
      expect(
        find.byKey(const ValueKey('payments-client-badge')),
        findsOneWidget,
      );
      await _done(tester);
    });

    test('an unknown tab opens the receipts', () {
      expect(PaymentsTab.parse('cases'), PaymentsTab.cases);
      expect(PaymentsTab.parse(null), PaymentsTab.receipts);
      expect(PaymentsTab.parse('x'), PaymentsTab.receipts);
    });
  });

  group('Saved', () {
    testWidgets('an attorney also sees the saved cases tab; a client does not',
        (tester) async {
      for (final (user, cases) in [(attorneyMe(), true), (clientMe(), false)]) {
        useNarrowPhone(tester);
        final wrap = await profileWrapper(
          AppTheme.light(),
          user: user,
          overrides: profileOverrides(),
        );
        await tester.pumpWidget(wrap(const SavedScreen()));
        await tester.pumpAndSettle();
        expect(find.text('Cases'), cases ? findsOneWidget : findsNothing);
        expect(find.text('Posts'), findsOneWidget);
        await _done(tester);
      }
    });
  });

  // Overflow: the new page at 360 dp, five long languages, four themes,
  // three text sizes.
  final locales = <String, (Translator, TextDirection)>{
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
  };
  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    for (final theme in AppThemeId.values) {
      for (final scale in [1.0, 1.1, 1.3]) {
        testWidgets(
            'Payments fits 360 dp ($name, ${theme.name}, x$scale)',
            (tester) async {
          for (final tab in PaymentsTab.values) {
            await _pumpHub(
              tester,
              tab == PaymentsTab.purchases ? clientMe() : attorneyMe(),
              initial: tab,
              casePayments: true,
              theme: AppTheme.of(theme),
              t: t,
              dir: dir,
              scale: scale,
            );
            expect(tester.takeException(), isNull, reason: tab.name);
            await _done(tester);
          }
        });
      }
    }
  }
}
