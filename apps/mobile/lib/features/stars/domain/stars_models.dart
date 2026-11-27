import 'package:flutter/foundation.dart';

/// Owner 2026-10-20 — Telegram-style stars: the balance bought on the web,
/// spent on paid sticker packs, reactions and promotions.
@immutable
class StarPack {
  const StarPack({
    required this.id,
    required this.stars,
    required this.priceCents,
  });

  final String id;
  final int stars;

  /// Shown on the web build only; the apps never print money prices.
  final int priceCents;
}

@immutable
class StarsOverview {
  const StarsOverview({
    required this.enabled,
    required this.balance,
    required this.packs,
    this.reactionStars = 3,
    this.premiumReactions = const [],
    this.freeReactions = const [],
  });

  static const off = StarsOverview(
    enabled: false,
    balance: 0,
    packs: [],
  );

  final bool enabled;
  final int balance;
  final List<StarPack> packs;

  /// Reactions: the price of a premium one and the two lists.
  final int reactionStars;
  final List<String> premiumReactions;
  final List<String> freeReactions;
}

enum StarLedgerKind {
  topup,
  stickerPack,
  boost,
  boostRefund,
  reaction,
  adminGrant,
  refund,
  other,
}

@immutable
class StarLedgerItem {
  const StarLedgerItem({
    required this.id,
    required this.delta,
    required this.balanceAfter,
    required this.kind,
    required this.createdAt,
    this.note,
  });

  final String id;
  final int delta;
  final int balanceAfter;
  final StarLedgerKind kind;
  final String? note;
  final DateTime createdAt;
}

@immutable
class StarsPurchaseResult {
  const StarsPurchaseResult({
    required this.paid,
    required this.canceled,
    required this.stars,
    required this.balance,
  });

  final bool paid;
  final bool canceled;
  final int stars;
  final int balance;
}
