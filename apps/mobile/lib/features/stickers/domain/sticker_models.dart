import 'package:flutter/foundation.dart';

/// Owner 2026-10-01 — Telegram-style stickers.
@immutable
class ChatSticker {
  const ChatSticker({
    required this.id,
    required this.packId,
    required this.emoji,
    this.url,
  });

  final String id;
  final String packId;
  final String emoji;

  /// Null while the image is still being checked.
  final String? url;
}

@immutable
class StickerPack {
  const StickerPack({
    required this.id,
    required this.title,
    required this.shortName,
    required this.isOfficial,
    required this.isMine,
    required this.installed,
    required this.installCount,
    required this.stickers,
  });

  final String id;
  final String title;
  final String shortName;
  final bool isOfficial;
  final bool isMine;
  final bool installed;
  final int installCount;
  final List<ChatSticker> stickers;

  ChatSticker? get cover => stickers.isEmpty ? null : stickers.first;
}

/// The picker: recently used, then my packs in my order.
@immutable
class StickerLibrary {
  const StickerLibrary({required this.recent, required this.packs});

  static const empty = StickerLibrary(recent: [], packs: []);

  final List<ChatSticker> recent;
  final List<StickerPack> packs;
}
