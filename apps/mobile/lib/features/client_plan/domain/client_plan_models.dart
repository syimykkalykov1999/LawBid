import 'package:flutter/foundation.dart';
import 'package:lawbid/features/plans/domain/plan_models.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';

/// Owner 2026-10-05 (plan builder): the client's plan subscription as
/// `GET /client-plans/me` presents it.
@immutable
class ClientSubscriptionInfo {
  const ClientSubscriptionInfo({
    required this.id,
    required this.status,
    required this.isActive,
    required this.priceCents,
    required this.cancelAtPeriodEnd,
    this.planCode,
    this.trialEndsAt,
    this.currentPeriodEnd,
    this.canceledAt,
  });

  final String id;
  final SubscriptionStatus status;

  /// The server's verdict — the only source of truth for access.
  final bool isActive;
  final String? planCode;
  final int priceCents;
  final DateTime? trialEndsAt;
  final DateTime? currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final DateTime? canceledAt;

  bool get inTrial => status == SubscriptionStatus.trialing;
  bool get paymentFailed => status == SubscriptionStatus.pastDue;
  bool get ended =>
      status == SubscriptionStatus.canceled ||
      status == SubscriptionStatus.expired;

  /// When the current paid (or trial) period ends.
  DateTime? get periodEnd => inTrial ? trialEndsAt : currentPeriodEnd;
}

/// `GET /client-plans/me`: the client's plan screen in one call.
@immutable
class ClientPlanOverview {
  const ClientPlanOverview({
    required this.isActive,
    required this.trialEligible,
    this.subscription,
    this.plan,
    this.entitlements = PlanEntitlements.none,
    this.plans = const [],
  });

  final ClientSubscriptionInfo? subscription;
  final bool isActive;

  /// The plan the client is on (the baseline when nothing is bought).
  final PlanOffer? plan;
  final PlanEntitlements entitlements;

  /// Every client plan for sale (the baseline may be among them).
  final List<PlanOffer> plans;

  /// A first purchase of a plan with trial days gets them.
  final bool trialEligible;

  /// The plan the client pays for right now (null = none / baseline).
  PlanOffer? get paidPlan {
    final s = subscription;
    if (s == null || !s.isActive) return null;
    final code = s.planCode ?? plan?.code;
    for (final p in plans) {
      if (p.code == code) return p;
    }
    final current = plan;
    return current != null && current.code == code ? current : null;
  }
}

/// `POST /client-plans/checkout`: Stripe's hosted page.
@immutable
class ClientPlanCheckout {
  const ClientPlanCheckout({
    required this.url,
    required this.sessionId,
    required this.priceCents,
    required this.trialDays,
  });

  final Uri url;
  final String sessionId;
  final int priceCents;
  final int trialDays;
}
