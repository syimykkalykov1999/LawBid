import 'package:lawbid/features/case_payments/data/case_payments_repository.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import 'overflow_fixtures.dart';

/// Long, huge-amount payment data and a fake repository for the overflow
/// tests of the case payments screens (batches 3 and 4).
const payParty = PaymentParty(
  id: 'u1',
  name: 'Bartholomew-Alexander-Maximilian Wolfeschlegelsteinhausen',
  username: 'a_very_long_username_of_thirty_chars',
);

CasePayment payPayment(String id, CasePaymentStatus status) => CasePayment(
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
      receiptUrl: 'https://example.test/receipt/$id',
      disputeStatus:
          status == CasePaymentStatus.disputed ? 'needs_response' : null,
      client: payParty,
      attorney: payParty,
    );

PaymentRequest payRequest(
  String id, {
  bool overdue = false,
  String feePayerBy = 'attorney',
}) =>
    PaymentRequest(
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
      feePayerBy: feePayerBy,
      feePayerRounds: 1,
      feePayerMaxRounds: 3,
      canPay: true,
      client: payParty,
      attorney: payParty,
    );

CasePaymentsState payState({required bool attorneySide}) => CasePaymentsState(
      enabled: true,
      attorneyReady: true,
      canPay: !attorneySide,
      canRequest: attorneySide,
      paidCents: 50000000000,
      refundedCents: 12345678900,
      minAmountCents: 100,
      maxAmountCents: 99999999999,
      allowCustomAmount: true,
      allowPartial: true,
      allowInstallments: true,
      maxInstallments: 12,
      openRequestsCents: 99999999999,
      bidAmountCents: 99999999999,
      remainingCents: 49999999999,
      processingFeePayer: 'client',
      requests: [
        payRequest('r1'),
        payRequest('r2', overdue: true, feePayerBy: 'client'),
      ],
      items: [
        payPayment('p1', CasePaymentStatus.succeeded),
        payPayment('p2', CasePaymentStatus.pendingPayment),
        payPayment('p3', CasePaymentStatus.partiallyRefunded),
        payPayment('p4', CasePaymentStatus.failed),
        payPayment('p5', CasePaymentStatus.disputed),
        payPayment('p6', CasePaymentStatus.refunded),
      ],
    );

class FakePayments implements CasePaymentsRepository {
  FakePayments(this.state);

  final CasePaymentsState state;

  @override
  Future<CursorPage<CasePayment>> history({String? cursor}) async => CursorPage(
        items: state.items,
      );

  @override
  Future<PaymentsSummary> summary() async => const PaymentsSummary(
        totalCents: 99999999999,
        count: 1234567,
        refundedCents: 12345678900,
      );

  @override
  Future<CasePaymentsState> caseState(String caseId) async => state;

  @override
  Future<PaymentSettings> settings() async => const PaymentSettings(
        enabled: true,
        minAmountCents: 100,
        maxAmountCents: 99999999999,
        allowCustomAmount: true,
        allowPartial: true,
        refundWindowDays: 30,
        processingFeePayer: 'client',
        saveCards: true,
        allowInvoices: true,
        allowInstallments: true,
        maxInstallments: 12,
        disclaimerEn: '$longText $longText',
        disclaimerRu: '$longText $longText',
      );

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
