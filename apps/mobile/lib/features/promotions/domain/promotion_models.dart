import 'package:flutter/foundation.dart';

/// Owner 2026-10-02 — paid case promotion: a client's open case sits near
/// the top of attorneys' feeds. Owner 2026-10-05 — Instagram-style: posts
/// too, for everyone, no subscription; pick a daily budget and days, see
/// "about N people", pay, then watch reach and clicks.
enum PromotionStatus {
  pendingPayment('pending_payment'),
  pendingReview('pending_review'),
  active,
  finished,
  canceled,
  refunded,
  rejected;

  const PromotionStatus([this._wire]);
  final String? _wire;
  String get wire => _wire ?? name;

  static PromotionStatus parse(String? v) => PromotionStatus.values.firstWhere(
        (s) => s.wire == v,
        orElse: () => PromotionStatus.finished,
      );
}

/// What is promoted.
enum PromotionTarget {
  post,
  case_('case');

  const PromotionTarget([this._wire]);
  final String? _wire;
  String get wire => _wire ?? name;

  static PromotionTarget parse(String? v) =>
      v == 'post' ? PromotionTarget.post : PromotionTarget.case_;
}

/// Who sees a promoted post; empty lists = everyone ("Automatic").
@immutable
class PromotionAudience {
  const PromotionAudience({
    this.role = 'all',
    this.states = const [],
    this.countries = const [],
    this.topics = const [],
  });

  /// `all` | `attorneys` | `clients`.
  final String role;
  final List<String> states;
  final List<String> countries;
  final List<String> topics;

  bool get isAutomatic =>
      role == 'all' && states.isEmpty && countries.isEmpty && topics.isEmpty;

  PromotionAudience copyWith({
    String? role,
    List<String>? states,
    List<String>? topics,
  }) =>
      PromotionAudience(
        role: role ?? this.role,
        states: states ?? this.states,
        countries: countries,
        topics: topics ?? this.topics,
      );
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
    this.dailyBudgetCents = 0,
    this.minDailyBudgetCents = 100,
    this.maxDailyBudgetCents = 100000,
    this.budgetPresetsCents = const [],
    this.durationPresets = const [],
    this.estImpressions = 0,
    this.estReachMin = 0,
    this.estReachMax = 0,
  });

  final int days;
  final int priceCentsPerDay;
  final int grossCents;
  final int totalCents;

  /// Referral credit days; may be fractional (0.5 = 12 hours).
  final num creditDaysAvailable;
  final num creditDaysUsed;
  final int maxDays;
  final bool enabled;

  /// Owner 2026-10-05: the chosen daily budget and the admin's limits.
  final int dailyBudgetCents;
  final int minDailyBudgetCents;
  final int maxDailyBudgetCents;
  final List<int> budgetPresetsCents;
  final List<int> durationPresets;

  /// "We'll show it to about [estReachMin]–[estReachMax] people".
  final int estImpressions;
  final int estReachMin;
  final int estReachMax;
}

@immutable
class CasePromotion {
  const CasePromotion({
    required this.status,
    required this.days,
    required this.totalCents,
    required this.impressions,
    this.id = '',
    this.target = PromotionTarget.case_,
    this.caseId,
    this.postId,
    this.reach = 0,
    this.clicks = 0,
    this.targetImpressions,
    this.priceCentsPerDay = 0,
    this.cancelReason,
    this.startsAt,
    this.endsAt,
    this.createdAt,
    this.title = '',
  });

  final String id;
  final PromotionTarget target;
  final String? caseId;
  final String? postId;
  final PromotionStatus status;
  final int days;
  final int totalCents;
  final int impressions;
  final int reach;
  final int clicks;

  /// Impressions the budget buys (null on older promotions).
  final int? targetImpressions;
  final int priceCentsPerDay;
  final String? cancelReason;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final DateTime? createdAt;

  /// "My promotions": the case title or the post's title / text.
  final String title;

  /// 0..1 of the bought impressions delivered (null = no cap).
  double? get progress => targetImpressions == null || targetImpressions == 0
      ? null
      : (impressions / targetImpressions!).clamp(0, 1).toDouble();

  bool get isRunning =>
      status == PromotionStatus.active ||
      status == PromotionStatus.pendingReview;
}

/// `GET /cases/:id/promotion` / `GET /posts/:id/promotion`: the running /
/// last promotion and whether a new one can be bought now.
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
  final num creditDaysUsed;

  /// Stripe's page when something is left to pay (null = fully covered by
  /// credits, already active).
  final String? checkoutUrl;
}

/// A page of "My promotions".
@immutable
class PromotionPage {
  const PromotionPage({required this.items, this.nextCursor});

  final List<CasePromotion> items;
  final String? nextCursor;
}
