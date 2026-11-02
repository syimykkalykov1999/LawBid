import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/data/case_payments_repository.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/case_payments/presentation/case_payments_card.dart';
import 'package:lawbid/features/case_payments/presentation/payment_request_sheet.dart';

import '../helpers/long_locale.dart';
import '../helpers/overflow_fixtures.dart';
import '../helpers/overflow_harness.dart';

/// Owner 2026-11-02, batch 3 of the screens no overflow test had covered:
/// the case payments card (client and attorney side) and its pay /
/// invoice sheets, with long notes and descriptions, long names and huge
/// amounts. 360 dp, the longest text of every key, right-to-left, ne, de,
/// mr, ar, ru, at text scale 1 and 1.3; then the four themes.

const _party = PaymentParty(
  id: 'u1',
  name: 'Bartholomew-Alexander-Maximilian Wolfeschlegelsteinhausen',
  username: 'a_very_long_username_of_thirty_chars',
);

CasePayment _payment(String id, CasePaymentStatus status) => CasePayment(
      id: id,
      caseId: 'c1',
      caseTitle: longTitle,
      kind: CasePaymentKind.custom,
      status: status,
      amountCents: 99999999999,
      platformFeeCents: 9999999999,
      processingFeeCents: 2999999999,
      clientTotalCents: 99999999999,
      attorneyNetCents: 88888888888,
      refundedCents:
          status == CasePaymentStatus.partiallyRefunded ? 12345678900 : 0,
      currency: 'usd',
      note: longText,
      createdAt: DateTime(2026, 10, 20),
      paidAt: DateTime(2026, 10, 21),
      refundable: true,
      client: _party,
      attorney: _party,
    );

PaymentRequest _request(String id, {bool overdue = false}) => PaymentRequest(
      id: id,
      caseId: 'c1',
      caseTitle: longTitle,
      amountCents: 99999999999,
      description: longText,
      dueAt: DateTime(2026, 11, 20),
      status: PaymentRequestStatus.open,
      overdue: overdue,
      seq: 3,
      total: 12,
      createdAt: DateTime(2026, 10, 20),
      processingFeePayer: 'client',
      processingFeeCents: 2999999999,
      clientTotalCents: 99999999999,
      attorneyReceivesCents: 88888888888,
      feePayerStatus: 'proposed',
      feePayerBy: 'attorney',
      feePayerRounds: 1,
      feePayerMaxRounds: 3,
      canPay: true,
      client: _party,
      attorney: _party,
    );

CasePaymentsState _state({required bool attorney}) => CasePaymentsState(
      enabled: true,
      attorneyReady: true,
      canPay: !attorney,
      canRequest: attorney,
      paidCents: 99999999999,
      refundedCents: 12345678900,
      minAmountCents: 100,
      maxAmountCents: 99999999999,
      allowCustomAmount: true,
      allowPartial: true,
      allowInstallments: true,
      maxInstallments: 12,
      openRequestsCents: 99999999999,
      bidAmountCents: 99999999999,
      remainingCents: 99999999999,
      processingFeePayer: 'client',
      requests: [_request('r1'), _request('r2', overdue: true)],
      items: [
        _payment('p1', CasePaymentStatus.succeeded),
        _payment('p2', CasePaymentStatus.pendingPayment),
        _payment('p3', CasePaymentStatus.partiallyRefunded),
        _payment('p4', CasePaymentStatus.failed),
      ],
    );

class _FakePayments implements CasePaymentsRepository {
  _FakePayments(this.state);

  final CasePaymentsState state;

  @override
  Future<CasePaymentsState> caseState(String caseId) async => state;

  @override
  Future<PaymentQuote> quote(
    int amountCents, {
    String? caseId,
    String? processingFeePayer,
  }) async =>
      PaymentQuote(
        amountCents: amountCents,
        platformFeeCents: amountCents ~/ 10,
        processingFeeCents: amountCents ~/ 30,
        clientTotalCents: amountCents,
        attorneyNetCents: amountCents - amountCents ~/ 10,
        stripeFeeEstimateCents: amountCents ~/ 30,
        attorneyReceivesCents: amountCents - amountCents ~/ 10,
      );

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      Future<Never>.error(UnimplementedError('$invocation'));
}

typedef _Case = (
  Widget Function() build,
  Future<void> Function(WidgetTester)? act,
  bool client,
  bool attorneySide,
);

void main() {
  setUpAll(initializeDateFormatting);

  Widget opener(void Function(BuildContext) open) => Scaffold(
        body: Center(
          child: Builder(
            builder: (context) => TextButton(
              key: const Key('open'),
              onPressed: () => open(context),
              child: const Text('open'),
            ),
          ),
        ),
      );

  Future<void> Function(WidgetTester) shows(
    Finder what, {
    bool sheet = false,
  }) =>
      (tester) async {
        if (sheet) {
          await tester.tap(find.byKey(const Key('open')));
          await tester.pump();
        }
        await tester.pump(const Duration(seconds: 2));
        await tester.pump(const Duration(seconds: 2));
        if (sheet) expect(find.byType(BottomSheet), findsOneWidget);
        expect(what, findsWidgets);
      };

  final longNote = find.textContaining('The landlord');
  final cases = <String, _Case>{
    'payments card (client)': (
      () => const Scaffold(
            body: SingleChildScrollView(
              child: CasePaymentsCard(caseId: 'c1', asAttorney: false),
            ),
          ),
      shows(longNote),
      true,
      false,
    ),
    'payments card (attorney)': (
      () => const Scaffold(
            body: SingleChildScrollView(
              child: CasePaymentsCard(caseId: 'c1', asAttorney: true),
            ),
          ),
      shows(longNote),
      false,
      true,
    ),
    'pay sheet': (
      () => opener(
            (c) => PaySheet.show(
              c,
              'c1',
              _state(attorney: false),
              onStarted: () {},
            ),
          ),
      shows(find.byType(TextField), sheet: true),
      true,
      false,
    ),
    'invoice sheet': (
      () => opener(
            (c) => PaymentRequestSheet.show(
              c,
              'c1',
              _state(attorney: true),
              onSent: () {},
            ),
          ),
      shows(find.byType(TextField), sheet: true),
      false,
      true,
    ),
  };

  List<Override> overridesFor({required bool attorneySide}) => [
        casePaymentsFlagProvider.overrideWithValue(true),
        casePaymentsRepositoryProvider
            .overrideWithValue(_FakePayments(_state(attorney: attorneySide))),
      ];

  for (final scale in overflowScales) {
    for (final MapEntry(key: name, value: (t, dir))
        in overflowLocales().entries) {
      group('batch 3: no overflow at 360 dp ($name, x$scale)', () {
        for (final MapEntry(
              key: label,
              value: (build, act, client, attorneySide),
            ) in cases.entries) {
          testWidgets(label, (tester) async {
            await pumpOverflowApp(
              tester,
              build(),
              t: t,
              dir: dir,
              scale: scale,
              client: client,
              extra: overridesFor(attorneySide: attorneySide),
              act: act,
            );
          });
        }
      });
    }
  }
  for (final themeId in overflowThemes) {
    group('batch 3: themes (${themeId.name}, longest, x1.3)', () {
      for (final MapEntry(
            key: label,
            value: (build, act, client, attorneySide),
          ) in cases.entries) {
        testWidgets(label, (tester) async {
          await pumpOverflowApp(
            tester,
            build(),
            t: LongestTranslator(),
            dir: TextDirection.ltr,
            scale: DeviceTextScale.shellMax,
            theme: themeId,
            client: client,
            extra: overridesFor(attorneySide: attorneySide),
            act: act,
          );
        });
      }
    });
  }
}
