import 'package:flutter/foundation.dart';

/// docs/06 §1.3 `subscription_status`. [unknown] guards against a status
/// a newer server may add.
enum SubscriptionStatus {
  incomplete,
  trialing,
  active,
  pastDue,
  canceled,
  expired,
  unknown;

  static SubscriptionStatus parse(String? raw) => switch (raw) {
        'incomplete' => incomplete,
        'trialing' => trialing,
        'active' => active,
        'past_due' => pastDue,
        'canceled' => canceled,
        'expired' => expired,
        _ => unknown,
      };
}

/// OQ-048: monthly ($399 + $100 per assistant seat) or yearly (attorney
/// + all six assistants, −20%).
enum SubscriptionPlan {
  monthly,
  yearly;

  static SubscriptionPlan parse(String? raw) =>
      raw == 'yearly' ? yearly : monthly;
}

/// OQ-048: the prices the plan picker shows (server is the source).
@immutable
class PlanPrices {
  const PlanPrices({
    this.monthlyCents = 39900,
    this.seatCents = 10000,
    this.yearlyCents = 959000,
    this.maxSeats = 6,
  });

  final int monthlyCents;
  final int seatCents;
  final int yearlyCents;
  final int maxSeats;

  int monthlyTotal(int seats) => monthlyCents + seats * seatCents;

  /// What the yearly plan saves against 12 months of the monthly plan
  /// with every seat.
  int get yearlySavingsCents => 12 * monthlyTotal(maxSeats) - yearlyCents;
}

/// Owner 2026-10-02: a free subscription granted by contract (blogger
/// attorneys etc.) — access without payment until [endsAt].
@immutable
class ContractGrant {
  const ContractGrant({required this.endsAt, required this.assistantSeats});

  final DateTime endsAt;
  final int assistantSeats;
}

/// Owner 2026-10-02: the answer to "can I use this promo code here?".
@immutable
class PromoCheck {
  const PromoCheck({
    required this.valid,
    this.percentOff,
    this.amountOffCents,
    this.freeDays,
    this.reason,
  });

  final bool valid;
  final int? percentOff;
  final int? amountOffCents;
  final int? freeDays;

  /// not_found · inactive · not_started · expired · exhausted ·
  /// wrong_audience · wrong_plan · already_used.
  final String? reason;
}

/// The attorney's subscription row as `GET /subscriptions/me` presents it.
@immutable
class SubscriptionInfo {
  const SubscriptionInfo({
    required this.id,
    required this.status,
    required this.isActive,
    required this.priceCents,
    required this.cancelAtPeriodEnd,
    required this.createdAt,
    this.plan = SubscriptionPlan.monthly,
    this.assistantSeats = 0,
    this.trialEndsAt,
    this.currentPeriodEnd,
    this.canceledAt,
    this.graceEndsAt,
  });

  final String id;
  final SubscriptionPlan plan;

  /// Seats bought on the monthly plan (yearly always has every seat).
  final int assistantSeats;
  final SubscriptionStatus status;

  /// The server's verdict (docs/06 §1.2) — the only source of truth for
  /// access; the app never recomputes it from dates.
  final bool isActive;
  final int priceCents;
  final DateTime? trialEndsAt;
  final DateTime? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final DateTime? canceledAt;

  /// `past_due`: access continues until this moment (§1.2 grace period).
  final DateTime? graceEndsAt;
  final DateTime createdAt;

  bool get inTrial => status == SubscriptionStatus.trialing;
  bool get paymentFailed => status == SubscriptionStatus.pastDue;
  bool get pendingConfirmation => status == SubscriptionStatus.incomplete;

  /// `canceled` / `expired`: a new subscription goes through the same
  /// flow without a trial (§1.4).
  bool get ended =>
      status == SubscriptionStatus.canceled ||
      status == SubscriptionStatus.expired;

  /// When the current paid (or trial) period ends.
  DateTime? get periodEnd => inTrial ? trialEndsAt : currentPeriodEnd;
}

/// `GET /subscriptions/me`.
@immutable
class SubscriptionOverview {
  const SubscriptionOverview({
    required this.isActive,
    required this.canStart,
    required this.trialEligible,
    required this.priceCents,
    this.prices = const PlanPrices(),
    this.subscription,
    this.contractGrant,
  });

  /// Owner 2026-10-02: free under contract (isActive is true then).
  final ContractGrant? contractGrant;

  final SubscriptionInfo? subscription;
  final PlanPrices prices;
  final bool isActive;

  /// Verified attorney without an active subscription (server-side rule,
  /// docs/06 §1.1 "триал доступен только после одобрения верификации").
  final bool canStart;

  /// No trial used yet on this account; the card is checked at confirm.
  final bool trialEligible;
  final int priceCents;
}

/// `POST /subscriptions/start` (docs/06 §1.4 step 1).
@immutable
class SubscriptionStart {
  const SubscriptionStart({
    required this.clientSecret,
    required this.setupIntentId,
    required this.customerId,
    required this.trialEligible,
    required this.priceCents,
    required this.trialDays,
  });

  final String clientSecret;
  final String setupIntentId;
  final String customerId;
  final bool trialEligible;
  final int priceCents;
  final int trialDays;
}

enum PaymentStatus {
  pending,
  succeeded,
  failed,
  refunded,
  unknown;

  static PaymentStatus parse(String? raw) => switch (raw) {
        'pending' => pending,
        'succeeded' => succeeded,
        'failed' => failed,
        'refunded' => refunded,
        _ => unknown,
      };
}

/// One row of `GET /subscriptions/payments` (docs/06 §1.7 п.4).
@immutable
class PaymentRecord {
  const PaymentRecord({
    required this.id,
    required this.amountCents,
    required this.currency,
    required this.status,
    required this.createdAt,
    this.paidAt,
    this.failureCode,
  });

  final String id;
  final int amountCents;

  /// ISO code, lower or upper case as Stripe sends it (`usd`).
  final String currency;
  final PaymentStatus status;
  final DateTime? paidAt;
  final String? failureCode;
  final DateTime createdAt;
}

/// Owner 2026-09-30: a hosted Stripe Checkout page for the subscription.
@immutable
class WebCheckout {
  const WebCheckout({
    required this.url,
    required this.sessionId,
    required this.trialEligible,
    required this.priceCents,
    required this.trialDays,
  });

  final Uri url;
  final String sessionId;
  final bool trialEligible;
  final int priceCents;
  final int trialDays;
}
