import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:lawbid/core/media/photo_metadata.dart';

/// A camera-like JPEG: turned (orientation 6), with a maker and a GPS
/// position, as a resized pick still carries them (image_picker copies the
/// original EXIF).
Uint8List _cameraJpeg() {
  final image = img.Image(width: 40, height: 20);
  for (final p in image) {
    p
      ..r = p.x * 6
      ..g = p.y * 12
      ..b = 90;
  }
  image.exif.imageIfd.orientation = 6;
  image.exif.imageIfd['Make'] = img.IfdValueAscii('TestPhone');
  image.exif.gpsIfd[0x0001] = img.IfdValueAscii('N');
  image.exif.gpsIfd[0x0003] = img.IfdValueAscii('W');
  return img.encodeJpg(image, quality: 90);
}

void main() {
  test('C7 / R8: the location and the rest of EXIF go, orientation stays',
      () async {
    final original = _cameraJpeg();
    final before = img.decodeJpgExif(original)!;
    expect(before.gpsIfd.isEmpty, isFalse);
    expect(before.imageIfd['Make'], isNotNull);

    final clean = await stripPhotoMetadataAsync(original);
    final after = img.decodeJpgExif(clean)!;
    expect(after.gpsIfd.isEmpty, isTrue, reason: 'no GPS left');
    expect(after.imageIfd['Make'], isNull);
    expect(after.imageIfd.orientation, 6, reason: 'the photo stays upright');

    // Lossless: the picture itself is the same, pixel for pixel.
    final a = img.decodeJpg(original)!;
    final b = img.decodeJpg(clean)!;
    expect(b.width, a.width);
    expect(b.height, a.height);
    expect(b.toUint8List(), a.toUint8List());
  });

  test('a picture without EXIF, or not a JPEG, is returned as it is', () {
    final plain = img.encodeJpg(img.Image(width: 4, height: 4));
    expect(identical(stripPhotoMetadata(plain), plain), isTrue);
    final png = img.encodePng(img.Image(width: 4, height: 4));
    expect(identical(stripPhotoMetadata(png), png), isTrue);
    final junk = Uint8List.fromList([0xff, 0xd8, 0, 1]);
    expect(stripPhotoMetadata(junk), junk);
  });
}
