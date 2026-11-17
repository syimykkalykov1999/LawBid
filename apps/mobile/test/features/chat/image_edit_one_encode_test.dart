import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:lawbid/features/chat/application/image_edit.dart';

/// Row 199 (WhatsApp / Telegram): a chat photo that is turned and cut in
/// the preview is compressed once, from the original, at the chat size.
///
/// A camera-like picture (smooth light, fine detail, grain) stands in for a
/// phone photo; `PHOTO=/path/to.jpg` measures a real one instead.
img.Image _cameraLike(int w, int h) {
  final r = math.Random(7);
  final out = img.Image(width: w, height: h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final light = 90 + 110 * (x / w) * (1 - 0.5 * y / h);
      final detail = 30 * math.sin(x / 3.1) * math.cos(y / 4.7);
      final grain = r.nextDouble() * 16 - 8;
      out.setPixelRgb(
        x,
        y,
        (light + detail + grain).clamp(0, 255),
        (light * 0.8 - detail + grain).clamp(0, 255),
        (light * 0.6 + detail * 0.5 + grain).clamp(0, 255),
      );
    }
  }
  return out;
}

Future<img.Image> _decode(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes);
  final frame = (await codec.getNextFrame()).image;
  final data = await frame.toByteData();
  return img.Image.fromBytes(
    width: frame.width,
    height: frame.height,
    bytes: data!.buffer,
    numChannels: 4,
    order: img.ChannelOrder.rgba,
  );
}

/// PSNR (dB) of [a] against [b] (same size), RGB.
double _psnr(img.Image a, img.Image b) {
  var sum = 0.0;
  var n = 0;
  for (var y = 0; y < a.height; y++) {
    for (var x = 0; x < a.width; x++) {
      final p = a.getPixel(x, y);
      final q = b.getPixel(x, y);
      for (final d in [p.r - q.r, p.g - q.g, p.b - q.b]) {
        sum += d * d;
        n++;
      }
    }
  }
  final mse = sum / n;
  return mse == 0
      ? double.infinity
      : 10 * math.log(255 * 255 / mse) / math.ln10;
}

void main() {
  test('then: one edit gives the same picture as the two in turn', () {
    const crop = ImageEdit(crop: ui.Rect.fromLTRB(0.1, 0.2, 0.6, 0.9));
    final turnThenCrop = const ImageEdit().turned().then(crop);
    expect(turnThenCrop.quarterTurns, 1);
    expect(turnThenCrop.crop, crop.crop);
    // Cut, then turned: the kept part turns with the picture.
    final cropThenTurn = crop.then(const ImageEdit().turned());
    expect(cropThenTurn.quarterTurns, 1);
    final r = cropThenTurn.crop!;
    expect(r.left, closeTo(1 - 0.9, 1e-9));
    expect(r.top, closeTo(0.1, 1e-9));
    expect(r.right, closeTo(1 - 0.2, 1e-9));
    expect(r.bottom, closeTo(0.6, 1e-9));
    // Four turns: the picture as picked.
    var e = const ImageEdit();
    for (var i = 0; i < 4; i++) {
      e = e.then(const ImageEdit().turned());
    }
    expect(e.isIdentity, isTrue);
  });

  test('then matches the old one-after-another result on pixels', () async {
    final src = Uint8List.fromList(img.encodePng(_cameraLike(400, 300)));
    const a = ImageEdit(quarterTurns: 1);
    const b = ImageEdit(crop: ui.Rect.fromLTRB(0.25, 0, 1, 0.5));
    final twice = await _decode(
      await applyImageEdit(await applyImageEdit(src, a), b),
    );
    final once = await _decode(await applyImageEdit(src, a.then(b)));
    expect((once.width, once.height), (twice.width, twice.height));
    expect(_psnr(once, twice), greaterThan(30));
  });

  test('the original is shrunk to the chat size in the same pass', () async {
    final src = Uint8List.fromList(img.encodeJpg(_cameraLike(2000, 1500)));
    final out = await _decode(
      await applyImageEdit(
        src,
        const ImageEdit(quarterTurns: 1),
        maxPx: 1600,
      ),
    );
    expect((out.width, out.height), (1200, 1600));
    final cut = await _decode(
      await applyImageEdit(
        src,
        const ImageEdit(crop: ui.Rect.fromLTRB(0, 0, 0.5, 0.5)),
        maxPx: 1600,
      ),
    );
    // 1000 x 750 kept: already under the chat size, not blown up.
    expect((cut.width, cut.height), (1000, 750));
  });

  test('before / after: picker JPEG + an encode per edit vs one encode',
      () async {
    final path = Platform.environment['PHOTO'];
    final original = path == null
        ? Uint8List.fromList(
            img.encodeJpg(_cameraLike(4032, 3024), quality: 95),
          )
        : File(path).readAsBytesSync();
    const q = 82;
    const maxPx = 1600;
    final edits = [
      const ImageEdit().turned(),
      const ImageEdit(crop: ui.Rect.fromLTRB(0.1, 0.1, 0.9, 0.9)),
      const ImageEdit().turned(),
    ];
    // Reference: the same turns and cut drawn without any JPEG, at the
    // chat size (what a perfect phone would send).
    var all = const ImageEdit();
    for (final e in edits) {
      all = all.then(e);
    }
    // Before: the picker's JPEG (1600 px, q82), then one JPEG per edit.
    final big = await _decode(original);
    final pickerJpeg = Uint8List.fromList(
      img.encodeJpg(
        img.copyResize(
          big,
          width: big.width >= big.height ? maxPx : null,
          height: big.width < big.height ? maxPx : null,
          interpolation: img.Interpolation.average,
        ),
        quality: q,
      ),
    );
    var before = pickerJpeg;
    for (final e in edits) {
      before = await applyImageEdit(before, e);
    }
    // After: one JPEG from the original.
    final after = await applyImageEdit(original, all, maxPx: maxPx);

    final b = await _decode(before);
    final a = await _decode(after);
    // Before, the cut part was cut from the 1600 px picture (fewer pixels);
    // now from the original, so it keeps the chat size.
    expect(math.max(a.width, a.height), maxPx);
    expect(math.max(b.width, b.height), lessThan(maxPx));
    // Each against the same turns and cut drawn from the original without
    // any JPEG, at its own size (what a perfect phone would send).
    final refB = await _decode(await _lossless(original, all, b));
    final refA = await _decode(await _lossless(original, all, a));
    final psnrBefore = _psnr(b, refB);
    final psnrAfter = _psnr(a, refA);
    // ignore: avoid_print
    print(
      'row199 photo: before 4 JPEGs ${b.width}x${b.height} ${before.length} B '
      'PSNR ${psnrBefore.toStringAsFixed(2)} dB; after 1 JPEG '
      '${a.width}x${a.height} ${after.length} B '
      'PSNR ${psnrAfter.toStringAsFixed(2)} dB',
    );
    expect(psnrAfter, greaterThan(psnrBefore));
  });
}

/// [edit] drawn from [bytes] at the size of [size], no JPEG on the way.
Future<Uint8List> _lossless(
  Uint8List bytes,
  ImageEdit edit,
  img.Image size,
) async {
  final src = await _decode(bytes);
  var turned = src;
  for (var i = 0; i < edit.quarterTurns % 4; i++) {
    turned = img.copyRotate(turned, angle: 90);
  }
  final c = edit.crop ?? const ui.Rect.fromLTRB(0, 0, 1, 1);
  final cut = img.copyCrop(
    turned,
    x: (c.left * turned.width).round(),
    y: (c.top * turned.height).round(),
    width: (c.width * turned.width).round(),
    height: (c.height * turned.height).round(),
  );
  return Uint8List.fromList(
    img.encodePng(
      img.copyResize(
        cut,
        width: size.width,
        height: size.height,
        interpolation: img.Interpolation.average,
      ),
    ),
  );
}
