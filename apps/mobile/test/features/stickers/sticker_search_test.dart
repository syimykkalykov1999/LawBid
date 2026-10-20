import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid/features/stickers/presentation/sticker_widgets.dart';

/// Owner 2026-10-18 (option A): stickers are found by their pack's name
/// and by their emoji.
void main() {
  StickerPack pack(String id, String title, List<String> emoji) => StickerPack(
        id: id,
        title: title,
        shortName: id,
        isOfficial: true,
        isMine: false,
        installed: true,
        installCount: 0,
        stickers: [
          for (final (i, e) in emoji.indexed)
            ChatSticker(id: '$id-$i', packId: id, emoji: e),
        ],
      );

  final data = StickerLibrary(
    recent: const [],
    packs: [
      pack('cats', 'Котики', ['😺', '😹']),
      pack('law', 'Lawyer life', ['⚖️', '😺']),
    ],
  );

  test('a pack name finds its stickers (any case, small typo)', () {
    expect(searchStickers(data, 'котики').length, 2);
    expect(searchStickers(data, 'Котеки').length, 2);
    expect(searchStickers(data, 'lawyer').map((s) => s.packId), ['law', 'law']);
  });

  test('an emoji finds stickers with it in every pack', () {
    expect(searchStickers(data, '😺').map((s) => s.id), ['cats-0', 'law-1']);
  });

  test('nothing typed or nothing matching: empty', () {
    expect(searchStickers(data, ''), isEmpty);
    expect(searchStickers(data, 'собаки'), isEmpty);
  });
}
