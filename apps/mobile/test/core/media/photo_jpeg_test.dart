import 'dart:math';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart' show Size;
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:lawbid/core/media/photo_jpeg.dart';
import 'package:lawbid/features/social/presentation/screens/photo_crop_screen.dart'
    show cropOutputSize;

/// A photo-like picture (smooth light plus a little sensor noise), RGBA.
Uint8List _photoRgba(int w, int h, {int alpha = 0xff}) {
  final r = Random(7);
  final out = Uint8List(w * h * 4);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final i = (y * w + x) * 4;
      out[i] = (x * 255 ~/ w + r.nextInt(12)).clamp(0, 255);
      out[i + 1] = (y * 255 ~/ h + r.nextInt(12)).clamp(0, 255);
      out[i + 2] =
          ((x + y) * 128 ~/ (w + h) + 60 + r.nextInt(12)).clamp(0, 255);
      out[i + 3] = alpha;
    }
  }
  return out;
}

Future<ui.Image> _image(Uint8List rgba, int w, int h) async {
  final buffer = await ui.ImmutableBuffer.fromUint8List(rgba);
  final descriptor = ui.ImageDescriptor.raw(
    buffer,
    width: w,
    height: h,
    pixelFormat: ui.PixelFormat.rgba8888,
  );
  final codec = await descriptor.instantiateCodec();
  return (await codec.getNextFrame()).image;
}

Future<(int, int)> _sizeOf(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes);
  final frame = await codec.getNextFrame();
  return (frame.image.width, frame.image.height);
}

void main() {
  test('C5: a 2048 px photo as JPEG q90 is several times smaller than PNG',
      () async {
    const w = 2048;
    const h = 1536;
    final rgba = _photoRgba(w, h);
    final image = await _image(rgba, w, h);
    final png = (await image.toByteData(format: ui.ImageByteFormat.png))!
        .buffer
        .asUint8List();
    final jpeg = (await encodeImageJpeg(image, quality: 90))!;
    image.dispose();
    expect(jpeg.sublist(0, 2), [0xff, 0xd8]);
    expect(await _sizeOf(jpeg), (w, h));
    // Printed for the PR (before / after in KB).
    // ignore: avoid_print
    print(
      'C5 2048x1536: PNG ${png.length ~/ 1024} KB -> JPEG q90 '
      '${jpeg.length ~/ 1024} KB '
      '(${(png.length / jpeg.length).toStringAsFixed(1)}x)',
    );
    expect(jpeg.length * 2, lessThan(png.length));
    // No metadata at all in the new file.
    expect(img.decodeJpgExif(jpeg)?.isEmpty ?? true, isTrue);
  });

  test('a see-through picture is not turned into JPEG', () async {
    final rgba = _photoRgba(16, 16, alpha: 0x80);
    expect(isOpaqueRgba(rgba), isFalse);
    expect(await encodeRgbaJpeg(rgba, 16, 16, quality: 90), isNull);
    expect(isOpaqueRgba(_photoRgba(16, 16)), isTrue);
  });

  test('C7: a big photo is shrunk to the long side as JPEG, a small one stays',
      () async {
    final big = img.encodePng(
      img.Image.fromBytes(
        width: 600,
        height: 300,
        bytes: _photoRgba(600, 300).buffer,
        numChannels: 4,
        order: img.ChannelOrder.rgba,
      ),
    );
    final out = await shrinkPhotoToJpeg(big, maxPx: 300, quality: 90);
    expect(out.sublist(0, 2), [0xff, 0xd8]);
    expect(await _sizeOf(out), (300, 150));
    expect(
      identical(await shrinkPhotoToJpeg(big, maxPx: 600, quality: 90), big),
      isTrue,
    );
    final junk = Uint8List.fromList([1, 2, 3, 4]);
    expect(
      identical(await shrinkPhotoToJpeg(junk, maxPx: 100, quality: 90), junk),
      isTrue,
      reason: 'what cannot be decoded stays as it is',
    );
  });

  test('HEIC is told by its brand; names become .jpg', () {
    Uint8List box(String brand) => Uint8List.fromList(
          [0, 0, 0, 24, ...'ftyp'.codeUnits, ...brand.codeUnits],
        );
    expect(isHeic(box('heic')), isTrue);
    expect(isHeic(box('mif1')), isTrue);
    expect(isHeic(box('isom')), isFalse);
    expect(jpegName('IMG_1.HEIC'), 'IMG_1.jpg');
    expect(jpegName('scan'), 'scan.jpg');
  });

  test('C5: the crop is written at the admin long side, never upscaled', () {
    // A 4:3 frame cut from a 3000 px photo, admin 2048: 2048 x 1536.
    expect(
      cropOutputSize(const Size(3000, 2250), 4 / 3, 2048),
      const Size(2048, 1536),
    );
    // A portrait 4:5 set: the long side is the height.
    expect(
      cropOutputSize(const Size(1600, 2000), 4 / 5, 1440),
      const Size(1152, 1440),
    );
    // Smaller than the limit: kept as it is (was capped at 1080 wide).
    expect(
      cropOutputSize(const Size(1200, 1200), 1, 2048),
      const Size(1200, 1200),
    );
  });
}
