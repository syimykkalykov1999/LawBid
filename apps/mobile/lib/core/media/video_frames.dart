import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/painting.dart' show Size;
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:video_compress/video_compress.dart';
import 'package:video_player/video_player.dart';

/// Owner 2026-10-15: what the post screen and the video editor need from a
/// picked video — its length and size, and single frames for the trim strip
/// and the cover. Every call fails soft: no frame means a plain block.
typedef VideoInfo = ({int totalMs, Size size});

Future<VideoInfo?> probeVideo(XFile file) async {
  final c = kIsWeb
      ? VideoPlayerController.networkUrl(Uri.parse(file.path))
      : VideoPlayerController.file(File(file.path));
  try {
    await c.initialize();
    final ms = c.value.duration.inMilliseconds;
    if (ms <= 0) return null;
    return (totalMs: ms, size: c.value.size);
  } on Object {
    return null;
  } finally {
    await c.dispose();
  }
}

/// One JPEG frame at [ms]; null on the web or when the plugin fails.
Future<Uint8List?> videoFrame(XFile file, int ms, {int quality = 45}) async {
  if (kIsWeb) return null;
  try {
    return await VideoCompress.getByteThumbnail(
      file.path,
      quality: quality,
      position: ms,
    );
  } on Object {
    return null;
  }
}
