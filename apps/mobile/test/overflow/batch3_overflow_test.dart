import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/presentation/case_payment_widgets.dart';
import 'package:lawbid/features/case_payments/presentation/case_payments_card.dart';
import 'package:lawbid/features/case_payments/presentation/payment_request_sheet.dart';

import '../helpers/long_locale.dart';
import '../helpers/overflow_harness.dart';
import '../helpers/overflow_payments_fixtures.dart';

/// Owner 2026-11-02, batch 3 of the screens no overflow test had covered:
/// the case payments card (client and attorney side) and its pay /
/// invoice sheets, with long notes and descriptions, long names and huge
/// amounts. 360 dp, the longest text of every key, right-to-left, ne, de,
/// mr, ar, ru, at text scale 1 and 1.3; then the four themes.

typedef _Case = (
  Widget Function() build,
  Future<void> Function(WidgetTester) act,
  bool attorneySide,
);

void main() {
  setUpAll(initializeDateFormatting);

  /// Opens the invoice sheet, types an amount and switches installments on
  /// with three parts, so the fee preview and the plan preview are built.
  Future<void> invoiceFilled(WidgetTester tester) async {
    await overflowShows(find.byType(TextField), sheet: true)(tester);
    await tester.enterText(find.byType(TextField).first, '1000000');
    await tester.pump(const Duration(seconds: 1));
    final plus = find.byWidgetPredicate(
      (w) => w is AppIcon && w.icon == AppIcons.addRounded,
    );
    final toggle = find.byType(Switch);
    expect(toggle, findsOneWidget);
    await tester.ensureVisible(toggle);
    await tester.tap(toggle);
    await tester.pump(const Duration(seconds: 1));
    expect(plus, findsWidgets);
    await tester.ensureVisible(plus.first);
    await tester.tap(plus.first);
    await tester.pump(const Duration(seconds: 2));
  }

  final longNote = find.textContaining('The landlord');
  final cases = <String, _Case>{
    'payments card (client)': (
      () => const Scaffold(
            body: SingleChildScrollView(
              child: CasePaymentsCard(caseId: 'c1', asAttorney: false),
            ),
          ),
      overflowShows(longNote),
      false,
    ),
    'payments card (attorney)': (
      () => const Scaffold(
            body: SingleChildScrollView(
              child: CasePaymentsCard(caseId: 'c1', asAttorney: true),
            ),
          ),
      overflowShows(longNote),
      true,
    ),
    'pay sheet': (
      () => overflowOpener(
            (c, _) => PaySheet.show(
              c,
              'c1',
              payState(attorneySide: false),
              onStarted: () {},
            ),
          ),
      overflowShows(find.byType(PaymentDisclaimer), sheet: true),
      false,
    ),
    'invoice sheet': (
      () => overflowOpener(
            (c, _) => PaymentRequestSheet.show(
              c,
              'c1',
              payState(attorneySide: true),
              onSent: () {},
            ),
          ),
      invoiceFilled,
      true,
    ),
  };

  List<Override> overridesFor({required bool attorneySide}) => [
        casePaymentsFlagProvider.overrideWithValue(true),
        casePaymentsRepositoryProvider.overrideWithValue(
          FakePayments(payState(attorneySide: attorneySide)),
        ),
      ];

  // Every language at both scales, then the four themes in the longest text.
  final variants = <(String, Translator, TextDirection, double, AppThemeId)>[
    for (final scale in overflowScales)
      for (final MapEntry(key: name, value: (t, dir))
          in overflowLocales().entries)
        ('$name, x$scale', t, dir, scale, AppThemeId.day),
    for (final themeId in overflowThemes)
      (
        'themes (${themeId.name}, longest, x1.3)',
        LongestTranslator(),
        TextDirection.ltr,
        DeviceTextScale.shellMax,
        themeId,
      ),
  ];

  for (final (name, t, dir, scale, themeId) in variants) {
    group('batch 3: no overflow at 360 dp ($name)', () {
      for (final MapEntry(key: label, value: (build, act, attorneySide))
          in cases.entries) {
        testWidgets(label, (tester) async {
          await pumpOverflowApp(
            tester,
            build(),
            t: t,
            dir: dir,
            scale: scale,
            theme: themeId,
            client: !attorneySide,
            extra: overridesFor(attorneySide: attorneySide),
            act: act,
          );
        });
      }
    });
  }
}
