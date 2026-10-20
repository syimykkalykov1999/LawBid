import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';

/// Gift name in the user's language: `gift.<code>` when the catalog has it,
/// else the title the admin typed (custom gifts have no code).
String giftTitle(Translator t, Gift gift) {
  final code = gift.code;
  if (code == null || code.isEmpty) return gift.title;
  final key = 'gift.$code';
  final text = t.t(key);
  return text == key ? gift.title : text;
}

/// Sticker pack name: `stickerpack.<shortName>` for the starter packs, else
/// the stored title.
String packTitle(Translator t, String shortName, String title) {
  final key = 'stickerpack.$shortName';
  final text = t.t(key);
  return text == key ? title : text;
}
