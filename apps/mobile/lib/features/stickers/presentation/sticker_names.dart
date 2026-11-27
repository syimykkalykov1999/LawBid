import 'package:lawbid/core/l10n/translator.dart';

/// Sticker pack name: `stickerpack.<shortName>` for the starter packs, else
/// the stored title.
String packTitle(Translator t, String shortName, String title) {
  final key = 'stickerpack.$shortName';
  final text = t.t(key);
  return text == key ? title : text;
}
