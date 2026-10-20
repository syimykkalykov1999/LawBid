import 'package:flutter/foundation.dart';

/// Owner 2026-10-20 — Telegram-style stars: the balance bought on the web,
/// spent on gifts and paid sticker packs.
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
    required this.giftConvertPercent,
    this.reactionStars = 3,
    this.premiumReactions = const [],
    this.freeReactions = const [],
  });

  static const off = StarsOverview(
    enabled: false,
    balance: 0,
    packs: [],
    giftConvertPercent: 70,
  );

  final bool enabled;
  final int balance;
  final List<StarPack> packs;
  final int giftConvertPercent;

  /// Reactions: the price of a premium one and the two lists.
  final int reactionStars;
  final List<String> premiumReactions;
  final List<String> freeReactions;
}

enum StarLedgerKind {
  topup,
  giftSent,
  giftConverted,
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

/// A gift of the catalog (the picture is an uploaded sticker-like image).
@immutable
class Gift {
  const Gift({
    required this.id,
    required this.title,
    required this.priceStars,
    this.url,
    this.code,
  });

  final String id;
  final String title;
  final int priceStars;
  final String? url;

  /// Stable catalog code (`rose`…); the name is translated by `gift.<code>`.
  final String? code;
}

/// A gift that was given (in a chat message or to a profile).
@immutable
class GiftSend {
  const GiftSend({
    required this.id,
    required this.gift,
    required this.anonymous,
    required this.shown,
    required this.createdAt,
    this.senderId,
    this.senderName,
    this.note,
    this.convertedStars,
  });

  final String id;
  final Gift gift;
  final String? senderId;
  final String? senderName;
  final bool anonymous;
  final String? note;
  final bool shown;

  /// Set once the recipient turned the gift into stars.
  final int? convertedStars;
  final DateTime createdAt;

  bool get converted => convertedStars != null;
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
