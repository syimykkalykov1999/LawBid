import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05 — `/payments/*`, `/payout-account*`,
/// `/cases/:id/payments`.
class CasePaymentsRepository {
  CasePaymentsRepository(Dio dio)
      : _dio = dio,
        _api = api.CasePaymentsClient(dio);

  final Dio _dio;
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
      processingFeePayer: d.processingFeePayer.json ?? 'client',
      saveCards: d.saveCards,
      allowInvoices: d.allowInvoices,
      allowInstallments: d.allowInstallments,
      maxInstallments: d.maxInstallments,
      disclaimerEn: d.disclaimerEn,
      disclaimerRu: d.disclaimerRu,
    );
  }

  /// With [caseId] the case attorney's fee-payer choice applies; with
  /// [processingFeePayer] a choice is previewed (attorney composing an
  /// invoice).
  Future<PaymentQuote> quote(
    int amountCents, {
    String? caseId,
    String? processingFeePayer,
  }) async {
    final r = await guardApiCall(
      () => _api.getPaymentQuote(
        amountCents: amountCents,
        caseId: caseId,
        processingFeePayer: _payer(processingFeePayer),
      ),
    );
    return _quote(r.data);
  }

  static api.ProcessingFeePayer? _payer(String? v) => v == null
      ? null
      : api.ProcessingFeePayer.values.firstWhere(
          (e) => e.json == v,
          orElse: () => api.ProcessingFeePayer.client,
        );

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
      canRequest: d.canRequest,
      allowInstallments: d.allowInstallments,
      maxInstallments: d.maxInstallments,
      openRequestsCents: d.openRequestsCents,
      requests: d.requests.map(_request).toList(),
      items: d.items.map(_payment).toList(),
      processingFeePayer: d.processingFeePayer.json ?? 'client',
    );
  }

  Future<PaymentStart> pay(
    String caseId, {
    required CasePaymentKind kind,
    int? amountCents,
    String? note,
    String? requestId,
  }) async {
    final d = (await guardApiCall(
      () => _api.createCasePayment(
        id: caseId,
        body: api.CreateCasePaymentDto(
          kind: api.CasePaymentKind.fromJson(kind.name),
          amountCents: amountCents,
          note: note,
          requestId: requestId,
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    return PaymentStart(paymentId: d.paymentId, checkoutUrl: d.checkoutUrl);
  }

  /// The client pays an attorney's request in two taps.
  Future<PaymentStart> payRequest(PaymentRequest r) =>
      pay(r.caseId, kind: CasePaymentKind.invoice, requestId: r.id);

  Future<List<PaymentRequest>> createRequests(
    String caseId, {
    required String description,
    required List<({int amountCents, DateTime? dueAt, String? description})>
        items,
    String? processingFeePayer,
  }) async {
    final r = await guardApiCall(
      () => _api.createPaymentRequests(
        id: caseId,
        body: api.CreatePaymentRequestsDto(
          description: description,
          processingFeePayer: _payer(processingFeePayer),
          items: [
            for (final it in items)
              api.PaymentRequestItemDto(
                amountCents: it.amountCents,
                dueAt: it.dueAt?.toUtc(),
                description: it.description,
              ),
          ],
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    );
    return r.data.map(_request).toList();
  }

  /// Accept the other side's fee-payer proposal, or counter with another.
  Future<PaymentRequest> answerFeePayer(
    String id, {
    required bool accept,
    String? processingFeePayer,
  }) async =>
      _request(
        (await guardApiCall(
          () => _api.answerFeePayer(
            id: id,
            body: api.FeePayerAnswerDto(
              action: accept
                  ? api.FeePayerAnswerDtoAction.accept
                  : api.FeePayerAnswerDtoAction.counter,
              processingFeePayer: _payer(processingFeePayer),
            ),
          ),
        ))
            .data,
      );

  Future<PaymentRequest> cancelRequest(String id) async => _request(
        (await guardApiCall(() => _api.cancelPaymentRequest(id: id))).data,
      );

  /// PDF receipt bytes (both sides).
  Future<Uint8List> receiptPdf(String paymentId) async {
    final r = await guardApiCall(
      () => _dio.get<List<int>>(
        '/payments/$paymentId/receipt.pdf',
        options: Options(responseType: ResponseType.bytes),
      ),
    );
    return Uint8List.fromList(r.data ?? const []);
  }

  /// CSV of my payments for bookkeeping.
  Future<Uint8List> exportCsv() async {
    final r = await guardApiCall(
      () => _dio.get<List<int>>(
        '/payments/export.csv',
        options: Options(responseType: ResponseType.bytes),
      ),
    );
    return Uint8List.fromList(r.data ?? const []);
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

  /// The attorney's default for who covers Stripe's fee.
  Future<PayoutAccount> setFeePayer(String processingFeePayer) async =>
      _account(
        (await guardApiCall(
          () => _api.updatePayoutPreferences(
            body: api.PayoutPreferencesDto(
              processingFeePayer: _payer(processingFeePayer)!,
            ),
          ),
        ))
            .data,
      );

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
        stripeFeeEstimateCents: d.stripeFeeEstimateCents,
        attorneyReceivesCents: d.attorneyReceivesCents,
      );

  static PaymentRequest _request(api.PaymentRequestDto d) => PaymentRequest(
        id: d.id,
        caseId: d.caseId,
        caseTitle: d.caseTitle,
        amountCents: d.amountCents,
        description: d.description,
        dueAt: d.dueAt?.toLocal(),
        status: PaymentRequestStatus.parse(d.status.json),
        overdue: d.overdue,
        planId: d.planId,
        seq: d.seq,
        total: d.total,
        paymentId: d.paymentId,
        paidAt: d.paidAt?.toLocal(),
        createdAt: d.createdAt.toLocal(),
        processingFeePayer: d.processingFeePayer.json ?? 'client',
        processingFeeCents: d.processingFeeCents,
        clientTotalCents: d.clientTotalCents,
        attorneyReceivesCents: d.attorneyReceivesCents,
        feePayerStatus: d.feePayerStatus.json ?? 'proposed',
        feePayerBy: d.feePayerBy.json ?? 'attorney',
        feePayerRounds: d.feePayerRounds,
        feePayerMaxRounds: d.feePayerMaxRounds,
        canPay: d.canPay,
        client: _party(d.client),
        attorney: _party(d.attorney),
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
        requestId: d.requestId,
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
        processingFeePayer: d.processingFeePayer.json ?? 'client',
        processingFeePayerIsDefault: d.processingFeePayerIsDefault,
        updatedAt: d.updatedAt?.toLocal(),
      );
}
