import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/stable_network_image.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid/features/stickers/presentation/sticker_widgets.dart';

/// SPEED_MATRIX 2026-11-09 §3 №15: a sticker picture is kept on the phone
/// under the FILE's address, not under the signed link — a link that
/// changes with every answer must never make the same sticker download
/// again (the rule every other picture already follows,
/// [stableImageCacheKey]).
void main() {
  const signed =
      'https://media.example.com/stickers/pack-1/s-1.png?X-Amz-Signature=abc&X-Amz-Expires=3600';
  const plain = 'https://media.example.com/stickers/pack-1/s-1.png';

  Future<CachedNetworkImage> pump(WidgetTester tester, String url) async {
    await tester.pumpWidget(
      MaterialApp(
        home: StickerImage(
          sticker: ChatSticker(id: 's-1', packId: 'p-1', emoji: '😀', url: url),
        ),
      ),
    );
    return tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
  }

  testWidgets('a signed link is cached under the file path', (tester) async {
    final image = await pump(tester, signed);
    expect(image.cacheKey, '/stickers/pack-1/s-1.png');
    expect(image.cacheKey, stableImageCacheKey(signed));
  });

  testWidgets('a permanent (R2) link keeps the link itself as the key',
      (tester) async {
    final image = await pump(tester, plain);
    expect(image.cacheKey, plain);
  });
}
