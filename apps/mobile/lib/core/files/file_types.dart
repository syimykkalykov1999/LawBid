import 'dart:typed_data';

// Owner 2026-10-19: a file's type, shared by every feature that uploads
// (moved from profile/data and chat/data so features don't reach into each
// other's data layer).

/// Real image type from the first bytes (docs/03 §4.1: JPEG/PNG/HEIC), or
/// null for anything else. The server re-checks magic bytes on confirm.
String? sniffImageMime(Uint8List bytes) {
  if (bytes.length >= 3 &&
      bytes[0] == 0xFF &&
      bytes[1] == 0xD8 &&
      bytes[2] == 0xFF) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47) {
    return 'image/png';
  }
  // Owner 2026-10-16: WebP (RIFF....WEBP) and GIF are post photos too.
  if (bytes.length >= 12 &&
      String.fromCharCodes(bytes.sublist(0, 4)) == 'RIFF' &&
      String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 6 &&
      String.fromCharCodes(bytes.sublist(0, 4)) == 'GIF8') {
    return 'image/gif';
  }
  if (bytes.length >= 12 &&
      String.fromCharCodes(bytes.sublist(4, 8)) == 'ftyp') {
    final brand = String.fromCharCodes(bytes.sublist(8, 12));
    // Owner 2026-10-19: every HEVC brand the server accepts (iPhone burst
    // and sequence photos say heim / heis / hevx).
    if (const {'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'}
        .contains(brand)) {
      return 'image/heic';
    }
  }
  return null;
}

/// OQ-047: what the server accepts in a chat, by extension (the server
/// re-checks the bytes). Null for anything else.
String? chatMimeForName(String name) {
  final dot = name.lastIndexOf('.');
  final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  return switch (ext) {
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'heic' || 'heif' => 'image/heic',
    'webp' => 'image/webp',
    'gif' => 'image/gif',
    'pdf' => 'application/pdf',
    'doc' => 'application/msword',
    'docx' =>
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' =>
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt' => 'application/vnd.ms-powerpoint',
    'pptx' =>
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'odt' => 'application/vnd.oasis.opendocument.text',
    'ods' => 'application/vnd.oasis.opendocument.spreadsheet',
    'odp' => 'application/vnd.oasis.opendocument.presentation',
    'rtf' => 'application/rtf',
    'txt' => 'text/plain',
    'csv' => 'text/csv',
    'mp4' => 'video/mp4',
    'mov' => 'video/quicktime',
    'webm' => 'video/webm',
    _ => null,
  };
}
