import 'package:flutter/foundation.dart';
import 'package:lawbid/features/plans/domain/plan_models.dart';

/// Owner 2026-10-02 — the client's paid gold badge: documents → approval in
/// the admin → $10/month. The server decides when the badge is on.
enum ClientBadgeStatus {
  none,
  pending,
  approved,
  rejected,
  revoked;

  static ClientBadgeStatus parse(String? v) => ClientBadgeStatus.values
      .firstWhere((s) => s.name == v, orElse: () => ClientBadgeStatus.none);
}

@immutable
class ClientBadgeSubscription {
  const ClientBadgeSubscription({
    required this.status,
    required this.cancelAtPeriodEnd,
    this.currentPeriodEnd,
  });

  /// none · active · past_due · canceled · comped (given free).
  final String status;
  final bool cancelAtPeriodEnd;
  final DateTime? currentPeriodEnd;
}

@immutable
class ClientBadgeState {
  const ClientBadgeState({
    required this.status,
    required this.badgeActive,
    required this.priceCents,
    required this.canSubmit,
    required this.canSubscribe,
    this.discount,
    this.includedInPlan = false,
    this.subscription,
    this.rejectReason,
    this.revokeReason,
  });

  /// Owner 2026-10-05 (plan builder): the client's plan includes the
  /// badge — no separate payment; it shows once the documents are
  /// approved.
  final bool includedInPlan;

  final ClientBadgeStatus status;
  final bool badgeActive;
  final int priceCents;

  /// Owner 2026-10-07: the strikethrough old price, or null.
  final PriceDiscount? discount;
  final bool canSubmit;
  final bool canSubscribe;
  final ClientBadgeSubscription? subscription;
  final String? rejectReason;
  final String? revokeReason;
}
