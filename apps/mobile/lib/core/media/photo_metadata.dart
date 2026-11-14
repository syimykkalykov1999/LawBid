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
/// Anything that is not a JPEG with EXIF comes back unchanged.
Uint8List stripPhotoMetadata(Uint8List bytes) {
  if (bytes.length < 4 || bytes[0] != 0xff || bytes[1] != 0xd8) return bytes;
  final exif = img.decodeJpgExif(bytes);
  if (exif == null || exif.isEmpty) return bytes;
  final kept = img.ExifData();
  final orientation = exif.imageIfd.orientation;
  if (orientation != null && orientation != 1) {
    kept.imageIfd.orientation = orientation;
  }
  return img.injectJpgExif(bytes, kept) ?? bytes;
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
