import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:video_compress/video_compress.dart';

/// Owner 2026-10-08: the reel composer's cover row — the still frame of
/// the picked video at [positionMs]. null = no frame (the browser build,
/// or the plugin failed); the row then shows an empty tile there.
typedef VideoFrameReader = Future<Uint8List?> Function(
  XFile video,
  int positionMs,
);

/// The free `video_compress` plugin's thumbnail call (already in the app
/// for re-encoding; nothing leaves the phone).
Future<Uint8List?> pluginVideoFrame(XFile video, int positionMs) async {
  if (kIsWeb) return null;
  try {
    return await VideoCompress.getByteThumbnail(
      video.path,
      quality: 60,
      position: positionMs,
    );
  } on Object {
    return null;
  }
}

final videoFramesProvider =
    Provider<VideoFrameReader>((ref) => pluginVideoFrame);

/// [count] moments spread over a [durationMs] video, from its first frame
/// to just before its end.
List<int> coverFrameTimes(int durationMs, {int count = 8}) {
  if (durationMs <= 0 || count <= 0) return const [];
  if (count == 1) return const [0];
  final last = durationMs > 500 ? durationMs - 500 : 0;
  return [for (var i = 0; i < count; i++) (last * i / (count - 1)).round()];
}
