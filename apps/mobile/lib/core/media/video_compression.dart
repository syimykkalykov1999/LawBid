import 'dart:convert' show jsonDecode;
import 'dart:io' show Platform;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show MethodChannel;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:video_compress/video_compress.dart';

/// Owner 2026-10-05: a reel is re-encoded on the phone before upload — at
/// most Full HD (no visible loss on a phone screen), much smaller files
/// and faster uploads. The admin tunes it (Система → Настройки):
/// `media.video_max_height` (1080 / 720 / 540; 0 = upload as recorded) and
/// `media.video_frame_rate`.
typedef VideoLimits = ({int maxHeight, int frameRate});

VideoLimits videoLimitsOf(FeatureFlagsState flags) {
  final h = flags.configInt('media.video_max_height', 1080);
  return (
    maxHeight: h <= 0 ? 0 : h.clamp(540, 2160),
    frameRate: flags.configInt('media.video_frame_rate', 30).clamp(24, 60),
  );
}

/// Above this a video is re-encoded even at a small size (~8 Mbit/s; a
/// phone's 1080p recording is 12–20).
const kVideoMaxBytesPerSecond = 1000 * 1000;

/// Whether a video of [shortSide] px (the smaller of width / height),
/// [bytes] and [durationMs] is worth re-encoding under [limits].
bool needsVideoCompression({
  required int shortSide,
  required int bytes,
  required int durationMs,
  required VideoLimits limits,
}) {
  if (limits.maxHeight <= 0) return false;
  if (shortSide > limits.maxHeight) return true;
  if (durationMs <= 0) return false;
  return bytes * 1000 / durationMs > kVideoMaxBytesPerSecond;
}

/// The plugin preset for a target short side.
VideoQuality videoQualityFor(int maxHeight) => maxHeight <= 540
    ? VideoQuality.Res960x540Quality
    : maxHeight <= 720
        ? VideoQuality.Res1280x720Quality
        : VideoQuality.Res1920x1080Quality;

/// Re-encodes a video on the device; null = keep the original (failed,
/// cancelled, not smaller, or the browser build — no encoder there, the
/// original is uploaded).
abstract class VideoCompressor {
  Future<XFile?> compress(
    XFile source, {
    required VideoLimits limits,
    void Function(double progress)? onProgress,
  });

  Future<void> cancel();
}

/// The free open-source `video_compress` plugin (AVFoundation on iOS,
/// MediaCodec on Android) — no paid service, nothing leaves the phone.
class PluginVideoCompressor implements VideoCompressor {
  @override
  Future<XFile?> compress(
    XFile source, {
    required VideoLimits limits,
    void Function(double progress)? onProgress,
  }) async {
    if (kIsWeb) return null;
    final sub = VideoCompress.compressProgress$.subscribe(
      (p) => onProgress?.call((p / 100).clamp(0, 1)),
    );
    try {
      final info = !kIsWeb && Platform.isIOS
          ? await _compressIos(source.path, limits)
          : await VideoCompress.compressVideo(
              source.path,
              quality: videoQualityFor(limits.maxHeight),
              includeAudio: true,
              frameRate: limits.frameRate,
            );
      final out = info?.file;
      if (out == null || (info!.isCancel ?? false)) return null;
      if (await out.length() >= await source.length()) return null;
      // Safety net: a black result of a picture that isn't black → keep
      // the original.
      if (await _isBlack(out.path) && !await _isBlack(source.path)) {
        return null;
      }
      return XFile(out.path, mimeType: 'video/mp4');
    } on Object {
      return null;
    } finally {
      sub.unsubscribe();
    }
  }

  @override
  Future<void> cancel() async {
    if (!kIsWeb) await VideoCompress.cancelCompression();
  }

  static const _channel = MethodChannel('video_compress');

  /// Owner 2026-10-17: on iOS the plugin's frame-rate path builds its video
  /// composition from the source asset but exports a different one (the
  /// trimmed composition), so every frame comes out black. Its Dart API
  /// always sends a frame rate; called directly without one, iOS exports
  /// with the 720p/1080p preset only (picture and rotation kept).
  static Future<MediaInfo?> _compressIos(
    String path,
    VideoLimits limits,
  ) async {
    final json = await _channel.invokeMethod<String>('compressVideo', {
      'path': path,
      'quality': videoQualityFor(limits.maxHeight).index,
      'deleteOrigin': false,
      'startTime': null,
      'duration': null,
      'includeAudio': true,
    });
    if (json == null) return null;
    return MediaInfo.fromJson(jsonDecode(json) as Map<String, dynamic>);
  }

  /// A frame near the start is (almost) pure black.
  static Future<bool> _isBlack(String path) async {
    try {
      final jpg = await VideoCompress.getByteThumbnail(
        path,
        quality: 30,
        position: 500,
      );
      if (jpg == null || jpg.isEmpty) return false;
      final codec = await ui.instantiateImageCodec(jpg, targetWidth: 32);
      final frame = await codec.getNextFrame();
      final data = await frame.image.toByteData();
      frame.image.dispose();
      if (data == null) return false;
      var sum = 0;
      final n = data.lengthInBytes ~/ 4;
      for (var i = 0; i < n; i++) {
        sum += data.getUint8(i * 4) +
            data.getUint8(i * 4 + 1) +
            data.getUint8(i * 4 + 2);
      }
      return sum / (n * 3) < 12;
    } on Object {
      return false;
    }
  }
}

final videoCompressorProvider =
    Provider<VideoCompressor>((ref) => PluginVideoCompressor());
