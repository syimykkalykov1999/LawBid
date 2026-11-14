import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/media/video_compression.dart';

/// The browser side of a video re-encode (WebCodecs through Mediabunny,
/// web/js/video_compress.js). Behind an interface so the decisions below
/// are tested without a browser.
abstract interface class BrowserVideoEncoder {
  /// The browser has the encoders (WebCodecs) at all.
  bool get supported;

  /// The re-encoded video, or null to keep the original (also when it is
  /// already H.264, no taller, no faster and no heavier than the target:
  /// a second encode only loses quality).
  Future<XFile?> encode(
    XFile source, {
    required int maxShortSide,
    required int frameRate,
    required int bitrateKbps,
    void Function(double progress)? onProgress,
  });

  Future<void> cancel();
}

/// Owner 2026-11-08 (approved MPL-2.0 exception): videos sent from the
/// website follow the same admin limits as the app's (`media.video_max_height`,
/// `media.video_frame_rate`). Whenever the browser cannot do it — no
/// WebCodecs, a codec missing, an error, a result not smaller — the
/// original is uploaded, exactly as before. Owner rows 101/102: the
/// bitrate is the admin's ladder (`media.video_bitrate_*_kbps`), the same
/// number the phones use, instead of Mediabunny's own QUALITY_HIGH
/// (≈ 6 Mbit/s at 1080p).
class BrowserVideoCompressor implements VideoCompressor {
  BrowserVideoCompressor(this._encoder, {VideoBitrateLadder Function()? ladder})
      : _ladder = ladder;

  final BrowserVideoEncoder _encoder;
  final VideoBitrateLadder Function()? _ladder;

  @override
  Future<XFile?> compress(
    XFile source, {
    required VideoLimits limits,
    void Function(double progress)? onProgress,
  }) async {
    if (limits.maxHeight <= 0 || !_encoder.supported) return null;
    try {
      final ladder =
          _ladder?.call() ?? (kbps1080: 4500, kbps720: 2000, kbps540: 1200);
      final out = await _encoder.encode(
        source,
        maxShortSide: limits.maxHeight,
        frameRate: limits.frameRate,
        bitrateKbps: videoBitrateKbpsFor(limits, ladder),
        onProgress: onProgress,
      );
      if (out == null) return null;
      if (await out.length() >= await source.length()) return null;
      return out;
    } on Object {
      return null;
    }
  }

  @override
  Future<void> cancel() async {
    try {
      await _encoder.cancel();
    } on Object {
      // Nothing to stop.
    }
  }
}
