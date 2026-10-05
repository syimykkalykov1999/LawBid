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
  custom;

  static CasePaymentKind parse(String? v) => CasePaymentKind.values
      .firstWhere((k) => k.name == v, orElse: () => CasePaymentKind.custom);
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
  });
  final int amountCents;
  final int platformFeeCents;
  final int processingFeeCents;
  final int clientTotalCents;
  final int attorneyNetCents;
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
    required this.disclaimerEn,
    required this.disclaimerRu,
  });
  final bool enabled;
  final int minAmountCents;
  final int maxAmountCents;
  final bool allowCustomAmount;
  final bool allowPartial;
  final int refundWindowDays;
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
    required this.items,
    this.bidAmountCents,
    this.remainingCents,
  });
  final bool enabled;
  final bool attorneyReady;
  final bool canPay;
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
    this.disabledReason,
    this.updatedAt,
  });
  final PayoutAccountStatus status;
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
