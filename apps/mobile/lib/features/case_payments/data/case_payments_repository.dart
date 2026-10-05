import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05 — `/payments/*`, `/payout-account*`,
/// `/cases/:id/payments`.
class CasePaymentsRepository {
  CasePaymentsRepository(Dio dio) : _api = api.CasePaymentsClient(dio);

  final api.CasePaymentsClient _api;

  Future<PaymentSettings> settings() async {
    final d = (await guardApiCall(_api.getPaymentSettings)).data;
    return PaymentSettings(
      enabled: d.enabled,
      minAmountCents: d.minAmountCents,
      maxAmountCents: d.maxAmountCents,
      allowCustomAmount: d.allowCustomAmount,
      allowPartial: d.allowPartial,
      refundWindowDays: d.refundWindowDays,
      disclaimerEn: d.disclaimerEn,
      disclaimerRu: d.disclaimerRu,
    );
  }

  Future<PaymentQuote> quote(int amountCents) async {
    final r = await guardApiCall(
      () => _api.getPaymentQuote(amountCents: amountCents),
    );
    return _quote(r.data);
  }

  Future<CasePaymentsState> caseState(String caseId) async {
    final d = (await guardApiCall(() => _api.getCasePayments(id: caseId))).data;
    return CasePaymentsState(
      enabled: d.enabled,
      attorneyReady: d.attorneyReady,
      canPay: d.canPay,
      bidAmountCents: d.bidAmountCents,
      paidCents: d.paidCents,
      refundedCents: d.refundedCents,
      remainingCents: d.remainingCents,
      minAmountCents: d.minAmountCents,
      maxAmountCents: d.maxAmountCents,
      allowCustomAmount: d.allowCustomAmount,
      allowPartial: d.allowPartial,
      items: d.items.map(_payment).toList(),
    );
  }

  Future<PaymentStart> pay(
    String caseId, {
    required CasePaymentKind kind,
    int? amountCents,
    String? note,
  }) async {
    final d = (await guardApiCall(
      () => _api.createCasePayment(
        id: caseId,
        body: api.CreateCasePaymentDto(
          kind: api.CasePaymentKind.fromJson(kind.name),
          amountCents: amountCents,
          note: note,
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    return PaymentStart(paymentId: d.paymentId, checkoutUrl: d.checkoutUrl);
  }

  Future<CasePayment> cancel(String paymentId) async => _payment(
        (await guardApiCall(() => _api.cancelCasePayment(id: paymentId))).data,
      );

  Future<CasePayment> refund(
    String paymentId, {
    required String reason,
    int? amountCents,
  }) async =>
      _payment(
        (await guardApiCall(
          () => _api.refundCasePayment(
            id: paymentId,
            body: api.RefundCasePaymentDto(
              amountCents: amountCents,
              reason: reason,
            ),
          ),
        ))
            .data,
      );

  Future<CursorPage<CasePayment>> history({String? cursor}) async {
    final r = await guardApiCall(() => _api.listMyCasePayments(cursor: cursor));
    return CursorPage(
      items: r.data.map(_payment).toList(),
      nextCursor: r.meta?.nextCursor,
    );
  }

  Future<PaymentsSummary> summary() async {
    final d = (await guardApiCall(_api.getMyCasePaymentsSummary)).data;
    return PaymentsSummary(
      totalCents: d.totalCents,
      count: d.count,
      refundedCents: d.refundedCents,
    );
  }

  Future<PayoutAccount> payoutAccount() async =>
      _account((await guardApiCall(_api.getPayoutAccount)).data);

  Future<String> startOnboarding() async =>
      (await guardApiCall(_api.startPayoutOnboarding)).data.url;

  Future<String> dashboardLink() async =>
      (await guardApiCall(_api.getPayoutDashboard)).data.url;

  static PaymentQuote _quote(api.PaymentQuoteDto d) => PaymentQuote(
        amountCents: d.amountCents,
        platformFeeCents: d.platformFeeCents,
        processingFeeCents: d.processingFeeCents,
        clientTotalCents: d.clientTotalCents,
        attorneyNetCents: d.attorneyNetCents,
      );

  static PaymentParty? _party(api.CasePaymentPartyDto? d) => d == null
      ? null
      : PaymentParty(
          id: d.id,
          name: d.name,
          username: d.username,
          avatarUrl: d.avatarUrl,
        );

  static CasePayment _payment(api.CasePaymentDto d) => CasePayment(
        id: d.id,
        caseId: d.caseId,
        caseTitle: d.caseTitle,
        kind: CasePaymentKind.parse(d.kind.json),
        status: CasePaymentStatus.parse(d.status.json),
        amountCents: d.amountCents,
        platformFeeCents: d.platformFeeCents,
        processingFeeCents: d.processingFeeCents,
        clientTotalCents: d.clientTotalCents,
        attorneyNetCents: d.attorneyNetCents,
        refundedCents: d.refundedCents,
        currency: d.currency,
        note: d.note,
        receiptUrl: d.receiptUrl,
        disputeStatus: d.disputeStatus,
        paidAt: d.paidAt?.toLocal(),
        createdAt: d.createdAt.toLocal(),
        client: _party(d.client),
        attorney: _party(d.attorney),
        refundable: d.refundable,
      );

  static PayoutAccount _account(api.PayoutAccountDto d) => PayoutAccount(
        status: PayoutAccountStatus.parse(d.status.json),
        canReceive: d.canReceive,
        chargesEnabled: d.chargesEnabled,
        payoutsEnabled: d.payoutsEnabled,
        detailsSubmitted: d.detailsSubmitted,
        requirementsDue: d.requirementsDue,
        disabledReason: d.disabledReason,
        available: d.available,
        updatedAt: d.updatedAt?.toLocal(),
      );
}
