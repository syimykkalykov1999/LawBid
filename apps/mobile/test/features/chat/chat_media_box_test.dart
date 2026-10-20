import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/image_size.dart';
import 'package:lawbid/features/chat/presentation/chat_album.dart';

/// Owner 2026-10-20 (WhatsApp / Telegram): a photo / video bubble has its
/// final shape from the server's width / height before the bytes arrive, and
/// is never drawn bigger than the media itself.
void main() {
  test('a big picture stretches to the bubble limit, keeping its shape', () {
    final box = chatPhotoBox(
      16 / 9,
      maxWidth: 240,
      maxHeight: 320,
      original: const Size(4000, 2250),
    );
    expect(box.width, 240);
    expect(box.height, closeTo(135, 0.5));
  });

  test('a small picture is not stretched past its own size', () {
    final box = chatPhotoBox(
      1,
      maxWidth: 240,
      maxHeight: 320,
      original: const Size(120, 120),
    );
    expect(box.width, 120);
    expect(box.height, 120);
  });

  test('a tiny picture keeps a tappable minimum', () {
    final box = chatPhotoBox(
      1,
      maxWidth: 240,
      maxHeight: 320,
      original: const Size(20, 20),
    );
    expect(box.width, kChatMediaMinSide);
  });

  test('a tall picture is cropped to the height limit', () {
    final box = chatPhotoBox(
      0.2,
      maxWidth: 240,
      maxHeight: 320,
      original: const Size(500, 2500),
    );
    expect(box.height, 320);
  });

  test('without a size the box is the default shape', () {
    final box = chatPhotoBox(null, maxWidth: 240, maxHeight: 320);
    expect(box.width / box.height, closeTo(4 / 3, 0.01));
  });

  testWidgets('imageSizeOf reads the header of a picked picture', (t) async {
    // 3 x 2 PNG.
    // ignore: lines_longer_than_80_chars
    final png = Uint8List.fromList(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg==',
      ),
    );
    final size = await t.runAsync(() => imageSizeOf(png));
    expect(size, const Size(3, 2));
    expect(await t.runAsync(() => imageSizeOf(Uint8List(4))), isNull);
  });
}
