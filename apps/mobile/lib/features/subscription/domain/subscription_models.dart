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
    this.trialEndsAt,
    this.currentPeriodEnd,
    this.canceledAt,
    this.graceEndsAt,
  });

  final String id;
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
    this.subscription,
  });

  final SubscriptionInfo? subscription;
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
