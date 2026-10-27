import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/thumb_image.dart';

/// Owner 2026-10-26 (smoothness): previews of picked photos are decoded at
/// the box's size, never smaller than the box (no visual change).
Future<Uint8List> _png(int w, int h) async {
  final rec = ui.PictureRecorder();
  Canvas(rec).drawRect(
    Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
    Paint()..color = const Color(0xFF336699),
  );
  final image = await rec.endRecording().toImage(w, h);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return data!.buffer.asUint8List();
}

Future<ui.Image> _resolve(ImageProvider provider) {
  final done = Completer<ui.Image>();
  provider.resolve(ImageConfiguration.empty).addListener(
        ImageStreamListener(
          (info, _) => done.complete(info.image),
          onError: (e, _) => done.completeError(e),
        ),
      );
  return done.future;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('the shorter side becomes minSide, the shape is kept', () {
    final f = thumbTargetSize(132);
    final wide = f(4000, 3000);
    expect([wide.width, wide.height], [null, 132]);
    final tall = f(3000, 4000);
    expect([tall.width, tall.height], [132, null]);
    // Already small: as it is (never upscaled).
    final small = f(120, 90);
    expect([small.width, small.height], [null, null]);
  });

  test('a 400x300 photo for a 150 px box decodes at 200x150', () async {
    final bytes = await _png(400, 300);
    final image = await _resolve(ThumbMemoryImage(bytes, minSide: 150));
    // Covers a 150x150 box both ways.
    expect(image.height, 150);
    expect(image.width, 200);
    image.dispose();
  });

  test('a small picture is decoded as it is', () async {
    final bytes = await _png(80, 60);
    final image = await _resolve(ThumbMemoryImage(bytes, minSide: 150));
    expect([image.width, image.height], [80, 60]);
    image.dispose();
  });

  test('cache key: the same bytes at another size is another picture', () {
    final bytes = Uint8List(4);
    expect(
      ThumbMemoryImage(bytes, minSide: 10),
      ThumbMemoryImage(bytes, minSide: 10),
    );
    expect(
      ThumbMemoryImage(bytes, minSide: 10) ==
          ThumbMemoryImage(bytes, minSide: 20),
      isFalse,
    );
    expect(ThumbMemoryImage(bytes, minSide: 10) == MemoryImage(bytes), isFalse);
  });
}
