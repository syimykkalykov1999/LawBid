import 'package:flutter/foundation.dart';

/// Owner 2026-10-02 — paid case promotion (about $10/day, set in the admin
/// panel): a client's open case sits near the top of attorneys' feeds.
enum PromotionStatus {
  pendingPayment('pending_payment'),
  active,
  finished,
  canceled,
  refunded;

  const PromotionStatus([this._wire]);
  final String? _wire;
  String get wire => _wire ?? name;

  static PromotionStatus parse(String? v) => PromotionStatus.values
      .firstWhere((s) => s.wire == v, orElse: () => PromotionStatus.finished);
}

@immutable
class PromotionQuote {
  const PromotionQuote({
    required this.days,
    required this.priceCentsPerDay,
    required this.grossCents,
    required this.totalCents,
    required this.creditDaysAvailable,
    required this.creditDaysUsed,
    required this.maxDays,
    required this.enabled,
  });

  final int days;
  final int priceCentsPerDay;
  final int grossCents;
  final int totalCents;
  final int creditDaysAvailable;
  final int creditDaysUsed;
  final int maxDays;
  final bool enabled;
}

@immutable
class CasePromotion {
  const CasePromotion({
    required this.status,
    required this.days,
    required this.totalCents,
    required this.impressions,
    this.startsAt,
    this.endsAt,
  });

  final PromotionStatus status;
  final int days;
  final int totalCents;
  final int impressions;
  final DateTime? startsAt;
  final DateTime? endsAt;
}

/// `GET /cases/:id/promotion`: the running/last promotion and whether a
/// new one can be bought now.
@immutable
class CasePromotionState {
  const CasePromotionState({
    required this.canPromote,
    required this.quote,
    this.promotion,
  });

  final CasePromotion? promotion;
  final bool canPromote;
  final PromotionQuote quote;
}

@immutable
class PromotionPurchase {
  const PromotionPurchase({
    required this.status,
    required this.totalCents,
    required this.creditDaysUsed,
    this.checkoutUrl,
  });

  final PromotionStatus status;
  final int totalCents;
  final int creditDaysUsed;

  /// Stripe's page when something is left to pay (null = fully covered by
  /// credits, already active).
  final String? checkoutUrl;
}
