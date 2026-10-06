import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/client_plan/domain/client_plan_models.dart';
import 'package:lawbid/features/client_plan/presentation/client_plan_screen.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';

import '../../helpers/long_locale.dart';

/// Owner 2026-10-06: a client can change the saved card (Stripe portal)
/// from the plan screen while the subscription has not ended.
void main() {
  setUpAll(initializeDateFormatting);

  ClientSubscriptionInfo sub(SubscriptionStatus status) =>
      ClientSubscriptionInfo(
        id: 's1',
        status: status,
        isActive: status != SubscriptionStatus.canceled,
        priceCents: 1000,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: DateTime.utc(2026, 11, 6),
      );

  Future<void> pump(
    WidgetTester tester,
    ClientSubscriptionInfo s, {
    VoidCallback? onUpdateCard,
    Translator? t,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ClientPlanStatusCard(
              subscription: s,
              t: t ??
                  L10nTranslator(
                    language: AppLanguage.ru,
                    cache: const <String, String>{},
                  ),
              formats: L10nFormats(AppLanguage.fallback),
              onCancel: () {},
              onResume: () {},
              onUpdateCard: onUpdateCard,
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  const button = ValueKey('client-plan-update-card');

  testWidgets('«Обновить карту» opens the portal', (tester) async {
    var taps = 0;
    await pump(
      tester,
      sub(SubscriptionStatus.active),
      onUpdateCard: () => taps++,
    );
    expect(find.byKey(button), findsOneWidget);
    expect(find.text('Обновить карту'), findsOneWidget);
    await tester.tap(find.byKey(button));
    expect(taps, 1);
  });

  testWidgets('shown on a failed payment too', (tester) async {
    await pump(tester, sub(SubscriptionStatus.pastDue), onUpdateCard: () {});
    expect(find.byKey(button), findsOneWidget);
  });

  testWidgets('hidden once the subscription ended', (tester) async {
    await pump(tester, sub(SubscriptionStatus.canceled), onUpdateCard: () {});
    expect(find.byKey(button), findsNothing);
  });

  testWidgets('fits the longest language without overflow', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pump(
      tester,
      sub(SubscriptionStatus.active),
      onUpdateCard: () {},
      t: LongestTranslator(),
    );
    expect(tester.takeException(), isNull);
  });
}
