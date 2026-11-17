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

/// [jpeg] with an XMP packet (APP1), a Photoshop/IPTC block (APP13) and a
/// comment put right after SOI — what edited / Google / Lightroom photos
/// carry. XMP can hold the position (`exif:GPSLatitude`) as well.
Uint8List _withXmpIptc(Uint8List jpeg) {
  Uint8List seg(int marker, List<int> payload) {
    final len = payload.length + 2;
    return Uint8List.fromList(
      [0xff, marker, len >> 8, len & 0xff, ...payload],
    );
  }

  final xmp = seg(0xe1, [
    ...'http://ns.adobe.com/xap/1.0/'.codeUnits,
    0,
    ...'<x:xmpmeta><exif:GPSLatitude>40,26.0N</exif:GPSLatitude></x:xmpmeta>'
        .codeUnits,
  ]);
  final iptc = seg(0xed, [
    ...'Photoshop 3.0'.codeUnits,
    0,
    ...'8BIMCity:Pittsburgh'.codeUnits,
  ]);
  final com = seg(0xfe, 'owner home'.codeUnits);
  return Uint8List.fromList(
    [...jpeg.sublist(0, 2), ...xmp, ...iptc, ...com, ...jpeg.sublist(2)],
  );
}

bool _has(Uint8List b, String s) => String.fromCharCodes(b).contains(s);

void main() {
  // Media check 14.11 (rows 97/144), measured on a real camera JPEG written
  // with exiv2: EXIF GPS went, but the XMP GPS and the IPTC city stayed.
  test('XMP (GPS), IPTC and comments go too, pixels and orientation stay',
      () async {
    for (final original in [
      _withXmpIptc(_cameraJpeg()),
      _withXmpIptc(img.encodeJpg(img.Image(width: 8, height: 8))), // no EXIF
    ]) {
      expect(_has(original, 'GPSLatitude'), isTrue);
      final clean = await stripPhotoMetadataAsync(original);
      expect(_has(clean, 'GPSLatitude'), isFalse, reason: 'no XMP GPS');
      expect(_has(clean, 'Pittsburgh'), isFalse, reason: 'no IPTC');
      expect(_has(clean, 'owner home'), isFalse, reason: 'no comment');
      expect(
        img.decodeJpg(clean)!.toUint8List(),
        img.decodeJpg(original)!.toUint8List(),
      );
    }
    final turned = await stripPhotoMetadataAsync(_withXmpIptc(_cameraJpeg()));
    expect(img.decodeJpgExif(turned)!.imageIfd.orientation, 6);
    expect(img.decodeJpgExif(turned)!.gpsIfd.isEmpty, isTrue);
  });

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
