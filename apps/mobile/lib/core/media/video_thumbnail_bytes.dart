import 'dart:io' show File;
import 'dart:typed_data';

import 'package:v_video_compressor/v_video_compressor.dart';

/// One JPEG frame of a video on the phone, as bytes; null when it cannot be
/// made. CMV 17.11 №5: v_video_compressor (MIT, maintained) instead of the
/// abandoned video_compress — the plugin writes a temp file, read and
/// removed here, so callers keep working with bytes as before.
Future<Uint8List?> videoThumbnailBytes(
  String path, {
  required int positionMs,
  int quality = 45,
  int? maxWidth,
  VVideoCompressor? plugin,
}) async {
  try {
    final r = await (plugin ?? VVideoCompressor()).getVideoThumbnail(
      path,
      VVideoThumbnailConfig(
        timeMs: positionMs < 0 ? 0 : positionMs,
        maxWidth: maxWidth,
        quality: quality.clamp(1, 100),
      ),
    );
    if (r == null) return null;
    final f = File(r.thumbnailPath);
    try {
      return await f.readAsBytes();
    } finally {
      try {
        await f.delete();
      } on Object {
        // already gone
      }
    }
  } on Object {
    return null;
  }
}
