import 'package:flutter/foundation.dart';

/// Owner 2026-10-02 — referrals: invite a colleague or client with a code,
/// both sides get a reward (set in the admin panel).
enum RewardType {
  balanceCents('balance_cents'),
  percentFirstInvoice('percent_first_invoice'),
  promotionDays('promotion_days'),
  unknown('');

  const RewardType(this.wire);
  final String wire;

  static RewardType parse(String? v) => RewardType.values.firstWhere(
        (r) => r.wire == v,
        orElse: () => RewardType.unknown,
      );
}

@immutable
class Reward {
  const Reward({required this.type, required this.value});

  final RewardType type;
  final int value;
}

@immutable
class ReferralInvite {
  const ReferralInvite({
    required this.status,
    required this.refereeIsAttorney,
    required this.reward,
    required this.createdAt,
  });

  /// pending · qualified · rewarded · rejected.
  final String status;
  final bool refereeIsAttorney;
  final Reward reward;
  final DateTime createdAt;
}

@immutable
class ReferralMe {
  const ReferralMe({
    required this.enabled,
    required this.code,
    required this.shareUrl,
    required this.invited,
    required this.qualified,
    required this.rewarded,
    required this.invites,
    required this.promotionCreditDays,
    required this.pendingDiscountPercent,
    required this.applyWindowDays,
    required this.canApply,
    required this.inviterReward,
    this.title = '',
    this.summary = '',
    this.terms = '',
    this.shareMessage = '',
    this.referredByStatus,
    this.referredByReward,
  });

  /// The program is switched on in the admin panel.
  final bool enabled;
  final String code;
  final String shareUrl;
  final int invited;
  final int qualified;
  final int rewarded;
  final List<ReferralInvite> invites;
  final int promotionCreditDays;
  final int pendingDiscountPercent;
  final int applyWindowDays;
  final bool canApply;
  final Reward inviterReward;

  /// Words written in the admin (user's language); empty = use app texts.
  final String title;
  final String summary;
  final String terms;

  /// Ready to send: the server already put the code and link in.
  final String shareMessage;
  final String? referredByStatus;
  final Reward? referredByReward;
}
