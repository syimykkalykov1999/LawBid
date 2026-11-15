import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/files/file_types.dart';
import 'package:lawbid/core/files/picker_web_options.dart';
import 'package:lawbid/core/media/photo_jpeg.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/core/media/photo_metadata.dart';

/// A file picked through «Files», read.
typedef PickedFileBytes = ({Uint8List bytes, String name});

/// Media audit 13.11 (R2, batch D8): «Files» never loads every picked file
/// into memory at once on a phone. `withData: true` made file_picker read
/// each file whole on the native side and copy it over the platform channel
/// (two copies per file, up to ten case videos at once) before the size was
/// even checked: the out-of-memory crash of the audit.
///
/// Now the files are read here one at a time, after the size check, so a
/// file over [maxBytes] is never read at all (file_picker 13 reads only when
/// asked: `PlatformFile.readAsBytes`, the size from `lengthSync`).
///
/// A picture is cleaned on the way (C7): with [photos] it becomes a JPEG at
/// most that long side (a HEIC from an iPhone included), else at least its
/// location is dropped (EXIF other than the orientation).
Future<({List<PickedFileBytes> files, int skipped})> pickFilesRead({
  FileType type = FileType.custom,
  List<String>? allowedExtensions,
  bool allowMultiple = false,
  int? maxBytes,
  int? maxCount,
  PhotoLimits? photos,
}) async {
  // file_picker 13: a list (empty when cancelled); one file via pickFile.
  final List<PlatformFile> picked;
  if (allowMultiple) {
    picked = await FilePicker.pickFiles(
      type: type,
      allowedExtensions: allowedExtensions,
      // The stub equals the default; the web build passes other options.
      // ignore: avoid_redundant_argument_values
      webOptions: pickerWebOptions,
    );
  } else {
    final one = await FilePicker.pickFile(
      type: type,
      allowedExtensions: allowedExtensions,
      // The stub equals the default; the web build passes other options.
      // ignore: avoid_redundant_argument_values
      webOptions: pickerWebOptions,
    );
    picked = one == null ? const [] : [one];
  }
  return readPickedFiles(
    picked,
    maxBytes: maxBytes,
    maxCount: maxCount,
    photos: photos,
  );
}

/// The reading half of [pickFilesRead] (tests pass files on disk).
@visibleForTesting
Future<({List<PickedFileBytes> files, int skipped})> readPickedFiles(
  List<PlatformFile> picked, {
  int? maxBytes,
  int? maxCount,
  PhotoLimits? photos,
}) async {
  final out = <PickedFileBytes>[];
  var skipped = 0;
  for (final f in picked) {
    if (maxCount != null && out.length >= maxCount) break;
    final Uint8List bytes;
    try {
      // The size the picker reported, else from disk; unknown = unreadable.
      final size = f.lengthSync() ?? await f.length();
      if (size == null || (maxBytes != null && size > maxBytes)) {
        skipped++;
        continue;
      }
      bytes = await f.readAsBytes();
    } on Object {
      skipped++;
      continue;
    }
    out.add(await cleanPickedPicture(bytes, f.name, photos: photos));
  }
  return (files: out, skipped: skipped);
}

/// Row 149: a file of [size] bytes picked from «Files» may be read. Over
/// [maxBytes] only a picture may (it is shrunk afterwards, as WhatsApp and
/// Telegram do), and only up to `media.picked_image_read_x` times the limit
/// (0 = no cap). Anything else over the limit is refused unread.
bool pickedFileReadable(int size, int maxBytes, {required bool image}) {
  if (size <= maxBytes) return true;
  if (!image) return false;
  final x = ClientTuning.pickedImageReadX;
  return x == 0 || size <= maxBytes * x;
}

/// A picture picked as a file (told by its first bytes): shrunk and
/// rewritten as JPEG with [photos], else only its location dropped. Other
/// files come back unchanged.
Future<PickedFileBytes> cleanPickedPicture(
  Uint8List bytes,
  String name, {
  PhotoLimits? photos,
}) async {
  final mime = sniffImageMime(bytes);
  // A GIF stays as it is (it may move); anything else is not a photo.
  if (mime == null || mime == 'image/gif') return (bytes: bytes, name: name);
  if (photos == null) {
    return (bytes: await stripPhotoMetadataAsync(bytes), name: name);
  }
  final out = await shrinkPhotoToJpeg(
    bytes,
    maxPx: photos.maxPx.round(),
    quality: photos.quality,
  );
  if (identical(out, bytes)) {
    // Small enough already (or not decodable here): only the location goes.
    return (bytes: await stripPhotoMetadataAsync(bytes), name: name);
  }
  return (bytes: out, name: jpegName(name));
}
