import 'package:flutter/painting.dart';

/// Owner 2026-10-26 (calls rework, «like WhatsApp — audio and video»,
/// docs/dev/calls-rework/whatsapp-style.png): the call screens keep one
/// look in every app theme (Day / Night / Blue / Green) — a dark green-grey
/// control sheet, the WhatsApp green ring on whoever speaks, a deep green
/// gradient behind voice calls. Named here once so the call screens carry
/// no raw colours.
abstract final class AppCallColors {
  /// Behind everything (a video that has not arrived yet, the grid gaps).
  static const Color stage = Color(0xFF0B1A16);

  /// The control sheet at the bottom (WhatsApp's dark sheet).
  static const Color sheet = Color(0xFF1F2C28);

  /// A camera that is off: the tile's dark fill under the avatar.
  static const Color tileOff = Color(0xFF2A3A35);

  /// The ring around whoever is speaking.
  static const Color speaking = Color(0xFF25D366);

  /// The «accept» button and the green of a call.
  static const Color accept = Color(0xFF1FAF5A);

  /// The «end» / «decline» button.
  static const Color end = Color(0xFFE53935);

  /// Voice calls: the background gradient, top to bottom.
  static const Color audioTop = Color(0xFF0F3B2E);
  static const Color audioBottom = Color(0xFF07211A);

  /// Avatar fills for people without a photo (one per person, stable).
  static const List<Color> avatarFills = [
    Color(0xFF1D9E75),
    Color(0xFF378ADD),
    Color(0xFFD4537E),
    Color(0xFF7F77DD),
    Color(0xFF5DCAA5),
    Color(0xFFEF9F27),
    Color(0xFFD85A30),
    Color(0xFF2C7A7B),
  ];
}
