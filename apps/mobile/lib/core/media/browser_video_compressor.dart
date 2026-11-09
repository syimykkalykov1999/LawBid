import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/media/video_compression.dart';

/// The browser side of a video re-encode (WebCodecs through Mediabunny,
/// web/js/video_compress.js). Behind an interface so the decisions below
/// are tested without a browser.
abstract interface class BrowserVideoEncoder {
  /// The browser has the encoders (WebCodecs) at all.
  bool get supported;

  /// The re-encoded video, or null to keep the original.
  Future<XFile?> encode(
    XFile source, {
    required int maxShortSide,
    required int frameRate,
    void Function(double progress)? onProgress,
  });

  Future<void> cancel();
}

/// Owner 2026-11-08 (approved MPL-2.0 exception): videos sent from the
/// website follow the same admin limits as the app's (`media.video_max_height`,
/// `media.video_frame_rate`). Whenever the browser cannot do it — no
/// WebCodecs, a codec missing, an error, a result not smaller — the
/// original is uploaded, exactly as before.
class BrowserVideoCompressor implements VideoCompressor {
  BrowserVideoCompressor(this._encoder);

  final BrowserVideoEncoder _encoder;

  @override
  Future<XFile?> compress(
    XFile source, {
    required VideoLimits limits,
    void Function(double progress)? onProgress,
  }) async {
    if (limits.maxHeight <= 0 || !_encoder.supported) return null;
    try {
      final out = await _encoder.encode(
        source,
        maxShortSide: limits.maxHeight,
        frameRate: limits.frameRate,
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
