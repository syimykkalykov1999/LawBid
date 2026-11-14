import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/files/file_types.dart';
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
/// Now a phone gets only paths (`withData: false`, as the chat already does)
/// and the files are read here one at a time, after the size check, so a
/// file over [maxBytes] is never read at all. The browser has no paths, so
/// it keeps `withData` (file_picker's web reader).
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
  final result = await FilePicker.pickFiles(
    // Web: a big file from iCloud or a HEIC to convert arrives after the
    // window gets focus back; don't drop it.
    cancelUploadOnWindowBlur: false,
    type: type,
    allowedExtensions: allowedExtensions,
    allowMultiple: allowMultiple,
    withData: kIsWeb,
  );
  return readPickedFiles(
    result?.files ?? const [],
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
  Future<Uint8List> Function(String path)? read,
}) async {
  final out = <PickedFileBytes>[];
  var skipped = 0;
  for (final f in picked) {
    if (maxCount != null && out.length >= maxCount) break;
    if (maxBytes != null && f.size > maxBytes) {
      skipped++;
      continue;
    }
    final path = kIsWeb ? null : f.path;
    final Uint8List? bytes;
    try {
      bytes = f.bytes ??
          (path == null
              ? null
              : await (read ?? (p) => XFile(p).readAsBytes())(path));
    } on Object {
      skipped++;
      continue;
    }
    if (bytes == null) {
      skipped++;
      continue;
    }
    out.add(await cleanPickedPicture(bytes, f.name, photos: photos));
  }
  return (files: out, skipped: skipped);
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
