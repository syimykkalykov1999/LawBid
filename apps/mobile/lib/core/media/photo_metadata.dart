import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart' show XFile;

/// Media audit 13.11 (R8, batch C7): a picked photo never takes its location
/// with it. The pickers are asked for no extra metadata
/// (`requestFullMetadata: false`), but a resized pick still copies the
/// original's EXIF, GPS included (image_picker_android `ExifDataCopier`,
/// the iOS picker the same from the photo's data), so the bytes are cleaned
/// here before they are kept or sent.
///
/// Lossless: only the JPEG's EXIF block is replaced (package:image
/// `injectJpgExif`, MIT); the picture data is not re-encoded. The
/// orientation tag is the one thing kept, so the photo still stands upright.
/// XMP, IPTC and comments are dropped too ([dropJpegTextMetadata]).
/// Anything that is not a JPEG with metadata comes back unchanged.
Uint8List stripPhotoMetadata(Uint8List bytes) {
  if (bytes.length < 4 || bytes[0] != 0xff || bytes[1] != 0xd8) return bytes;
  final noXmp = dropJpegTextMetadata(bytes);
  final exif = img.decodeJpgExif(noXmp);
  if (exif == null || exif.isEmpty) return noXmp;
  final kept = img.ExifData();
  final orientation = exif.imageIfd.orientation;
  if (orientation != null && orientation != 1) {
    kept.imageIfd.orientation = orientation;
  }
  return img.injectJpgExif(noXmp, kept) ?? noXmp;
}

/// Media check 14.11 (rows 97/144): measured on a real camera JPEG, the
/// EXIF block was cleaned but the XMP packet (which holds the position too,
/// `exif:GPSLatitude`, in edited / Google / Lightroom photos), the IPTC
/// block (city, by-line) and comments stayed. These header segments are
/// dropped as they are, like `jpegtran -copy none` / `exiftool -xmp:all=
/// -iptc:all= -comment=`: APP1 with the XMP namespaces, APP13 (Photoshop /
/// IPTC) and COM. Everything else (JFIF, EXIF, ICC colours, MPF) and the
/// picture data are copied byte for byte. A broken header: unchanged.
Uint8List dropJpegTextMetadata(Uint8List b) {
  if (b.length < 4 || b[0] != 0xff || b[1] != 0xd8) return b;
  const xmp = 'http://ns.adobe.com/xap/1.0/';
  const xmpExt = 'http://ns.adobe.com/xmp/extension/';
  bool startsWith(int at, String s) {
    if (at + s.length > b.length) return false;
    for (var i = 0; i < s.length; i++) {
      if (b[at + i] != s.codeUnitAt(i)) return false;
    }
    return true;
  }

  final drop = <(int, int)>[];
  var off = 2;
  while (off + 4 <= b.length) {
    if (b[off] != 0xff) return b;
    final marker = b[off + 1];
    if (marker == 0xff) {
      off++; // fill byte
      continue;
    }
    // Start of scan (picture data follows) or end: the header is over.
    if (marker == 0xda || marker == 0xd9) break;
    if (marker == 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    final len = (b[off + 2] << 8) | b[off + 3];
    if (len < 2 || off + 2 + len > b.length) return b;
    final data = off + 4;
    final isXmp =
        marker == 0xe1 && (startsWith(data, xmp) || startsWith(data, xmpExt));
    if (isXmp || marker == 0xed || marker == 0xfe) {
      drop.add((off, off + 2 + len));
    }
    off += 2 + len;
  }
  if (drop.isEmpty) return b;
  final out = BytesBuilder(copy: false);
  var from = 0;
  for (final (start, end) in drop) {
    out.add(Uint8List.sublistView(b, from, start));
    from = end;
  }
  out.add(Uint8List.sublistView(b, from));
  return out.takeBytes();
}

/// [stripPhotoMetadata] off the UI thread on a phone (a browser runs it in
/// place: it only rewrites the header).
Future<Uint8List> stripPhotoMetadataAsync(Uint8List bytes) async {
  if (kIsWeb || bytes.length < 64 * 1024) return stripPhotoMetadata(bytes);
  return compute(
    stripPhotoMetadata,
    bytes,
    debugLabel: 'stripPhotoMetadata',
  );
}

/// The bytes of a photo picked from the gallery or the camera, without its
/// location or any other EXIF but the orientation.
Future<Uint8List> readPickedPhoto(XFile file) async =>
    stripPhotoMetadataAsync(await file.readAsBytes());
