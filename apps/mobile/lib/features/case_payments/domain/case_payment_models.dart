import 'package:flutter/foundation.dart';

/// Owner 2026-10-05 — the client pays the attorney at work on their case
/// through the platform (Stripe Connect). The money goes straight to the
/// attorney's own Stripe account; LawBid takes no share of the fee.
enum CasePaymentStatus {
  pendingPayment('pending_payment'),
  succeeded,
  failed,
  canceled,
  refunded,
  partiallyRefunded('partially_refunded'),
  disputed,
  unknown;

  const CasePaymentStatus([this._wire]);
  final String? _wire;
  String get wire => _wire ?? name;

  static CasePaymentStatus parse(String? v) => CasePaymentStatus.values
      .firstWhere((s) => s.wire == v, orElse: () => CasePaymentStatus.unknown);

  bool get isPaid =>
      this == succeeded || this == partiallyRefunded || this == disputed;
}

enum CasePaymentKind {
  bid,
  deposit,
  balance,
  custom,
  invoice;

  static CasePaymentKind parse(String? v) => CasePaymentKind.values
      .firstWhere((k) => k.name == v, orElse: () => CasePaymentKind.custom);
}

enum PaymentRequestStatus {
  open,
  paid,
  canceled,
  expired;

  static PaymentRequestStatus parse(String? v) => PaymentRequestStatus.values
      .firstWhere((s) => s.name == v, orElse: () => PaymentRequestStatus.open);
}

enum PayoutAccountStatus {
  none,
  pending,
  onboarding,
  active,
  restricted,
  disabled;

  static PayoutAccountStatus parse(String? v) => PayoutAccountStatus.values
      .firstWhere((s) => s.name == v, orElse: () => PayoutAccountStatus.none);
}

@immutable
class PaymentParty {
  const PaymentParty({
    required this.id,
    this.name,
    this.username,
    this.avatarUrl,
  });
  final String id;
  final String? name;
  final String? username;
  final String? avatarUrl;

  String get display => name ?? (username == null ? '' : '@$username');
}

@immutable
class CasePayment {
  const CasePayment({
    required this.id,
    required this.caseId,
    required this.kind,
    required this.status,
    required this.amountCents,
    required this.platformFeeCents,
    required this.processingFeeCents,
    required this.clientTotalCents,
    required this.attorneyNetCents,
    required this.refundedCents,
    required this.currency,
    required this.createdAt,
    required this.refundable,
    this.requestId,
    this.caseTitle,
    this.note,
    this.receiptUrl,
    this.disputeStatus,
    this.paidAt,
    this.client,
    this.attorney,
  });

  final String id;
  final String caseId;
  final String? caseTitle;
  final CasePaymentKind kind;
  final String? requestId;
  final CasePaymentStatus status;
  final int amountCents;
  final int platformFeeCents;
  final int processingFeeCents;
  final int clientTotalCents;
  final int attorneyNetCents;
  final int refundedCents;
  final String currency;
  final String? note;
  final String? receiptUrl;
  final String? disputeStatus;
  final DateTime? paidAt;
  final DateTime createdAt;
  final PaymentParty? client;
  final PaymentParty? attorney;
  final bool refundable;
}

@immutable
class PaymentQuote {
  const PaymentQuote({
    required this.amountCents,
    required this.platformFeeCents,
    required this.processingFeeCents,
    required this.clientTotalCents,
    required this.attorneyNetCents,
    required this.stripeFeeEstimateCents,
    required this.attorneyReceivesCents,
  });
  final int amountCents;
  final int platformFeeCents;
  final int processingFeeCents;
  final int clientTotalCents;
  final int attorneyNetCents;

  /// Stripe's card fee on the whole charge, at the admin's rate.
  final int stripeFeeEstimateCents;

  /// What the attorney keeps once Stripe took its fee (estimate).
  final int attorneyReceivesCents;
}

/// A payment request (invoice) the attorney sent from the case; several
/// with one [planId] are installments.
@immutable
class PaymentRequest {
  const PaymentRequest({
    required this.id,
    required this.caseId,
    required this.amountCents,
    required this.description,
    required this.status,
    required this.overdue,
    required this.seq,
    required this.total,
    required this.createdAt,
    required this.processingFeePayer,
    required this.processingFeeCents,
    required this.clientTotalCents,
    required this.attorneyReceivesCents,
    required this.feePayerStatus,
    required this.feePayerBy,
    required this.feePayerRounds,
    required this.feePayerMaxRounds,
    required this.canPay,
    this.caseTitle,
    this.dueAt,
    this.planId,
    this.paymentId,
    this.paidAt,
    this.client,
    this.attorney,
  });

  final String id;
  final String caseId;
  final String? caseTitle;
  final int amountCents;
  final String description;
  final DateTime? dueAt;
  final PaymentRequestStatus status;
  final bool overdue;
  final String? planId;
  final int seq;
  final int total;
  final String? paymentId;
  final DateTime? paidAt;
  final DateTime createdAt;
  final PaymentParty? client;
  final PaymentParty? attorney;

  /// Who covers Stripe's fee on this invoice (the attorney's choice):
  /// client | attorney | split. The client sees the breakdown before paying.
  final String processingFeePayer;
  final int processingFeeCents;
  final int clientTotalCents;
  final int attorneyReceivesCents;

  /// Agreed like a bid: proposed (by the attorney with the invoice),
  /// countered, agreed. [feePayerBy] made the current proposal; the other
  /// side answers. [canPay]: agreed, or the attorney's proposal stands
  /// (paying accepts it).
  final String feePayerStatus;
  final String feePayerBy;
  final int feePayerRounds;
  final int feePayerMaxRounds;
  final bool canPay;

  bool get feeAgreed => feePayerStatus == 'agreed';
  bool get canCounter => feePayerRounds < feePayerMaxRounds;

  /// Whether [side] ('client' | 'attorney') is the one to answer now.
  bool awaits(String side) => payable && !feeAgreed && feePayerBy != side;

  bool get payable =>
      status == PaymentRequestStatus.open ||
      status == PaymentRequestStatus.expired;
}

@immutable
class PaymentSettings {
  const PaymentSettings({
    required this.enabled,
    required this.minAmountCents,
    required this.maxAmountCents,
    required this.allowCustomAmount,
    required this.allowPartial,
    required this.refundWindowDays,
    required this.processingFeePayer,
    required this.saveCards,
    required this.allowInvoices,
    required this.allowInstallments,
    required this.maxInstallments,
    required this.disclaimerEn,
    required this.disclaimerRu,
  });
  final bool enabled;
  final int minAmountCents;
  final int maxAmountCents;
  final bool allowCustomAmount;
  final bool allowPartial;
  final int refundWindowDays;

  /// client | attorney | split — who covers Stripe's card fee.
  final String processingFeePayer;
  final bool saveCards;
  final bool allowInvoices;
  final bool allowInstallments;
  final int maxInstallments;
  final String disclaimerEn;
  final String disclaimerRu;

  /// Russian for the Russian UI, English for every other language.
  String disclaimer(String locale) =>
      locale.toLowerCase().startsWith('ru') ? disclaimerRu : disclaimerEn;
}

/// `GET /cases/:id/payments` — what the case screen shows.
@immutable
class CasePaymentsState {
  const CasePaymentsState({
    required this.enabled,
    required this.attorneyReady,
    required this.canPay,
    required this.paidCents,
    required this.refundedCents,
    required this.minAmountCents,
    required this.maxAmountCents,
    required this.allowCustomAmount,
    required this.allowPartial,
    required this.canRequest,
    required this.allowInstallments,
    required this.maxInstallments,
    required this.openRequestsCents,
    required this.requests,
    required this.items,
    required this.processingFeePayer,
    this.bidAmountCents,
    this.remainingCents,
  });
  final bool enabled;
  final bool attorneyReady;
  final bool canPay;
  final bool canRequest;
  final bool allowInstallments;
  final int maxInstallments;
  final int openRequestsCents;
  final List<PaymentRequest> requests;

  /// The case attorney's default for who covers Stripe's fee.
  final String processingFeePayer;
  final int? bidAmountCents;
  final int paidCents;
  final int refundedCents;
  final int? remainingCents;
  final int minAmountCents;
  final int maxAmountCents;
  final bool allowCustomAmount;
  final bool allowPartial;
  final List<CasePayment> items;

  bool get hasPending =>
      items.any((p) => p.status == CasePaymentStatus.pendingPayment);

  List<PaymentRequest> get openRequests =>
      requests.where((r) => r.payable).toList();
}

@immutable
class PayoutAccount {
  const PayoutAccount({
    required this.status,
    required this.canReceive,
    required this.chargesEnabled,
    required this.payoutsEnabled,
    required this.detailsSubmitted,
    required this.requirementsDue,
    required this.available,
    required this.processingFeePayer,
    required this.processingFeePayerIsDefault,
    this.disabledReason,
    this.updatedAt,
  });
  final PayoutAccountStatus status;

  /// The attorney's default for who covers Stripe's fee on their invoices;
  /// [processingFeePayerIsDefault] while they have not chosen.
  final String processingFeePayer;
  final bool processingFeePayerIsDefault;
  final bool canReceive;
  final bool chargesEnabled;
  final bool payoutsEnabled;
  final bool detailsSubmitted;
  final List<String> requirementsDue;
  final String? disabledReason;
  final bool available;
  final DateTime? updatedAt;
}

@immutable
class PaymentsSummary {
  const PaymentsSummary({
    required this.totalCents,
    required this.count,
    required this.refundedCents,
  });
  final int totalCents;
  final int count;
  final int refundedCents;
}

@immutable
class PaymentStart {
  const PaymentStart({required this.paymentId, required this.checkoutUrl});
  final String paymentId;
  final String checkoutUrl;
}
