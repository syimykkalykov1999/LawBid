import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/case_payments/presentation/case_payments_card.dart';
import 'package:lawbid/features/case_payments/presentation/case_payments_history_screen.dart';
import 'package:lawbid/features/case_payments/presentation/chat_payment_bar.dart';
import 'package:lawbid/features/case_payments/presentation/payment_request_sheet.dart';

import '../helpers/long_locale.dart';
import '../helpers/overflow_harness.dart';
import '../helpers/overflow_payments_fixtures.dart';

/// Owner 2026-11-02, batch 4 of the screens no overflow test had covered:
/// the rest of the case payments: the fee-payer counter sheet, the refund
/// sheet, the chat payment bar and the payments history list, with long
/// names, notes and huge amounts. 360 dp, the longest text of every key,
/// right-to-left, ne, de, mr, ar, ru, at text scale 1 and 1.3; then the four
/// themes.
typedef _Case = (
  Widget Function() build,
  Future<void> Function(WidgetTester) act,
  bool attorneySide,
);

void main() {
  setUpAll(initializeDateFormatting);

  final cases = <String, _Case>{
    'fee payer sheet': (
      () => overflowOpener(
            (c, _) => FeePayerSheet.show(
              c,
              payRequest('r1'),
              onDone: () {},
            ),
          ),
      overflowShows(find.byType(AppButton), sheet: true),
      false,
    ),
    'refund sheet': (
      () => overflowOpener(
            (c, _) => RefundSheet.show(
              c,
              payPayment('p1', CasePaymentStatus.succeeded),
              onDone: () {},
            ),
          ),
      overflowShows(find.byType(TextField), sheet: true),
      true,
    ),
    'chat payment bar (client)': (
      () => const Scaffold(
            body: Column(children: [ChatPaymentBar(caseId: 'c1')]),
          ),
      overflowShows(
        find.descendant(
          of: find.byType(ChatPaymentBar),
          matching: find.byType(AppButton),
        ),
      ),
      false,
    ),
    'chat payment bar (attorney)': (
      () => const Scaffold(
            body: Column(children: [ChatPaymentBar(caseId: 'c1')]),
          ),
      overflowShows(
        find.descendant(
          of: find.byType(ChatPaymentBar),
          matching: find.byType(AppButton),
        ),
      ),
      true,
    ),
    'history (client)': (
      () => const Scaffold(body: CasePaymentsHistoryList()),
      overflowShows(find.textContaining('Disputed commercial')),
      false,
    ),
    'history (attorney)': (
      () => const Scaffold(body: CasePaymentsHistoryList()),
      overflowShows(find.textContaining('Disputed commercial')),
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
    group('batch 4: no overflow at 360 dp ($name)', () {
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
