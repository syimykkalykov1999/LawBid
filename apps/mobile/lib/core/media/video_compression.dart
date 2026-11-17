import 'dart:io' show File;
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show MethodCall, MethodChannel;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/media/browser_video_compressor.dart';
import 'package:lawbid/core/media/browser_video_encoder_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/media/browser_video_encoder_web.dart';
import 'package:lawbid/core/media/video_thumbnail_bytes.dart';
import 'package:v_video_compressor/v_video_compressor.dart';

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

/// Owner row 42 (review 13.11): the target video bitrate of the phone's
/// re-encode, by height, in kbit/s at 30 fps — the admin's ladder
/// (Система → Настройки: `media.video_bitrate_1080_kbps` 4500,
/// `media.video_bitrate_720_kbps` 2000, `media.video_bitrate_540_kbps`
/// 1200), Telegram-like: a Full HD reel ≈ half of what the old encoder
/// wrote (≈ 8.7 Mbit/s), no visible loss on a phone. Android (Media3),
/// iPhone (AVAssetWriter, owner rows 101/102) and the browser (Mediabunny)
/// all get the same number; the encoder never goes above the source's own
/// bitrate.
typedef VideoBitrateLadder = ({int kbps1080, int kbps720, int kbps540});

VideoBitrateLadder videoBitrateLadderOf(FeatureFlagsState flags) => (
      kbps1080: flags
          .configInt('media.video_bitrate_1080_kbps', 4500)
          .clamp(300, 50000),
      kbps720: flags
          .configInt('media.video_bitrate_720_kbps', 2000)
          .clamp(300, 50000),
      kbps540: flags
          .configInt('media.video_bitrate_540_kbps', 1200)
          .clamp(300, 50000),
    );

/// The rung for a target short side; above 1080 (the admin allows up to
/// 2160) the 1080 rung grows with the pixel count. More than 30 fps gets
/// more bits in proportion (60 fps = ×2).
int videoBitrateKbpsFor(VideoLimits limits, VideoBitrateLadder ladder) {
  final h = limits.maxHeight;
  final base = h <= 540
      ? ladder.kbps540
      : h <= 720
          ? ladder.kbps720
          : (ladder.kbps1080 * (h / 1080) * (h / 1080)).round();
  final fps = limits.frameRate > 30 ? limits.frameRate / 30 : 1.0;
  return (base * fps).round();
}

/// Owner rows 101/102 (13.11, «проверить каждое сжатие»): a reel, story
/// or channel video no taller than the admin's limit is re-encoded only
/// above this bitrate, kbit/s (Система → Настройки:
/// `media.video_reencode_above_kbps`, 8000 = the old built-in ~8 Mbit/s;
/// a phone's 1080p recording is 12–20). Below it the original goes up as
/// it is: a second encode of an already light file only loses quality.
int videoReencodeAboveKbpsOf(FeatureFlagsState flags) =>
    flags.configInt('media.video_reencode_above_kbps', 8000).clamp(300, 200000);

/// Owner rows 101/102: a chat, case or support video is re-encoded to at
/// most this height (`media.chat_video_max_height`, 720 = WhatsApp's, the
/// old built-in number; 0 = sent as recorded), and never above the reel
/// limit.
VideoLimits chatVideoLimitsOf(FeatureFlagsState flags) {
  final reel = videoLimitsOf(flags);
  final h = flags.configInt('media.chat_video_max_height', 720);
  final chat = h <= 0 ? 0 : h.clamp(240, 2160);
  return (
    maxHeight: chat <= 0
        ? 0
        : reel.maxHeight <= 0
            ? chat
            : math.min(chat, reel.maxHeight),
    frameRate: reel.frameRate,
  );
}

/// Owner row 199 (16.11, WhatsApp / Telegram: one encode, not two): Bunny
/// re-encodes every reel, story and channel video, so one no taller than
/// the admin's limit goes up as recorded and Bunny's encode is the only
/// one (Система → Настройки: `media.bunny_one_encode`, on by default; off
/// = the phone re-encodes above [videoReencodeAboveKbpsOf] as before).
bool bunnyOneEncodeOf(FeatureFlagsState flags) {
  final v = flags.appConfig['media.bunny_one_encode']?.trim().toLowerCase();
  return v != 'false' && v != '0';
}

/// The server's upload limit of a reel / story / channel video, bytes
/// (`video.max_size_mb`, 1000); a video over it is shrunk on the phone so
/// that it is accepted.
int videoMaxBytesOf(FeatureFlagsState flags) =>
    flags.configInt('video.max_size_mb', 1000).clamp(1, 1 << 20) * 1024 * 1024;

/// Whether a video of [shortSide] px (the smaller of width / height),
/// [bytes] and [durationMs] is worth re-encoding under [limits]; at or
/// under [reencodeAboveKbps] (the admin's [videoReencodeAboveKbpsOf]) it
/// is kept. [oneEncode] ([bunnyOneEncodeOf]): only a taller one, or one
/// over [maxBytes], is re-encoded.
bool needsVideoCompression({
  required int shortSide,
  required int bytes,
  required int durationMs,
  required VideoLimits limits,
  int reencodeAboveKbps = 8000,
  bool oneEncode = false,
  int? maxBytes,
}) {
  if (limits.maxHeight <= 0) return false;
  if (shortSide > limits.maxHeight) return true;
  if (oneEncode) return maxBytes != null && bytes > maxBytes;
  if (durationMs <= 0) return false;
  // bytes per ms × 8 = kbit/s.
  return bytes * 8 / durationMs > reencodeAboveKbps;
}

/// The fallback plugin's preset for a target short side (CMV 17.11 №5:
/// v_video_compressor has 1080p / 720p / 480p; the main hardware path above
/// keeps the admin's exact height, 540 included).
VVideoCompressQuality videoQualityFor(int maxHeight) => maxHeight < 720
    ? VVideoCompressQuality.low
    : maxHeight < 1080
        ? VVideoCompressQuality.medium
        : VVideoCompressQuality.high;

/// The fallback plugin's settings: the admin's preset height, frame rate and
/// bitrate (the same ladder as the hardware path), H.264 + AAC MP4, moov
/// first; the original is never deleted and is kept when not smaller.
VVideoCompressionConfig pluginConfigFor(VideoLimits limits, int bitrateKbps) =>
    VVideoCompressionConfig(
      quality: videoQualityFor(limits.maxHeight),
      includeMetadata: false,
      copyMetadata: false,
      advanced: VVideoAdvancedConfig(
        videoBitrate: bitrateKbps * 1000,
        frameRate: limits.frameRate.toDouble(),
        videoCodec: VVideoCodec.h264,
        audioCodec: VAudioCodec.aac,
        autoCorrectOrientation: true,
      ),
    );

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

/// R-256: a phone low on power skips the re-encode of a video up to this
/// size: encoding drains the battery, and a small clip gains little. A bigger
/// one is still encoded, so it fits the upload limits.
const kLowPowerKeepOriginalBytes = 30 * 1024 * 1024;

/// Whether to send the original as it is.
bool keepOriginalForPower({required bool lowPower, required int bytes}) =>
    lowPower && bytes <= kLowPowerKeepOriginalBytes;

/// The phone's hardware encoder, nothing leaves the phone, no paid service.
///
/// Owner row 42 (13.11, «медленно, качество ниже»): on Android the re-encode
/// runs on AndroidX Media3 Transformer (`lawbid/video_encoder`,
/// android/.../VideoEncoder.kt): H.264 High profile where the phone has it,
/// HDR tone-mapped to normal colours, AAC audio copied as it is. Owner rows
/// 101/102: the iPhone answers the same channel with AVAssetWriter
/// (ios/Runner/VideoEncoder.swift, NextLevelSessionExporter, MIT): the
/// admin's bitrate instead of the export preset's own, H.264 High, moov
/// first, HDR → SDR, and an already light H.264 file is kept as it is.
/// When that path fails (an old phone, an odd file) the fallback plugin
/// runs: v_video_compressor (MIT, maintained; CMV 17.11 №5 replaced the
/// abandoned video_compress 3.1.4 of 13.02.2025) — Media3 Transformer on
/// Android and AVFoundation on iOS, both hardware encoders. Same output as
/// before: H.264 + AAC MP4, at most the admin's height and frame rate.
class PluginVideoCompressor implements VideoCompressor {
  PluginVideoCompressor({
    MethodChannel hardwareChannel = const MethodChannel('lawbid/video_encoder'),
    TargetPlatform? platform,
    Future<XFile?> Function(XFile source, VideoLimits limits)? fallback,
    VideoBitrateLadder Function()? ladder,
    VVideoCompressor? plugin,
  })  : _hw = hardwareChannel,
        _platform = platform,
        _fallback = fallback,
        _ladder = ladder,
        _plugin = plugin ?? VVideoCompressor();

  final MethodChannel _hw;
  final TargetPlatform? _platform;
  final Future<XFile?> Function(XFile source, VideoLimits limits)? _fallback;
  final VideoBitrateLadder Function()? _ladder;
  final VVideoCompressor _plugin;

  /// The videos this compressor runs now, by id: each its own progress
  /// (the encoder queues them, one hardware encoder at a time).
  final _progress = <String, void Function(double progress)?>{};
  final _cancelledIds = <String>{};
  var _seq = 0;

  bool get _android =>
      (_platform ?? defaultTargetPlatform) == TargetPlatform.android;

  bool get _ios => (_platform ?? defaultTargetPlatform) == TargetPlatform.iOS;

  @override
  Future<XFile?> compress(
    XFile source, {
    required VideoLimits limits,
    void Function(double progress)? onProgress,
  }) async {
    // The browser uses [BrowserVideoCompressor] (see the provider).
    if (kIsWeb || limits.maxHeight <= 0) return null;
    if (keepOriginalForPower(
      lowPower: ClientTuning.lowPower,
      bytes: await source.length(),
    )) {
      return null;
    }
    if (_android || _ios) {
      final id = '${identityHashCode(this)}-${_seq++}';
      final r = await _compressMedia3(id, source, limits, onProgress);
      final cancelled = _cancelledIds.remove(id);
      // Encoded (kept or not), or cancelled: the plugin does not run again.
      if (r.ran || cancelled) return r.file;
    }
    final fallback = _fallback;
    if (fallback != null) return fallback(source, limits);
    return _compressPlugin(source, limits, onProgress);
  }

  /// Media3 Transformer (Android) / AVAssetWriter (iOS). `ran` false = it
  /// failed (then the plugin runs); `file` null = keep the original
  /// (cancelled, already light, not smaller, black).
  Future<({bool ran, XFile? file})> _compressMedia3(
    String id,
    XFile source,
    VideoLimits limits,
    void Function(double progress)? onProgress,
  ) async {
    _progress[id] = onProgress;
    _hw.setMethodCallHandler(_onCall);
    try {
      final ladder =
          _ladder?.call() ?? (kbps1080: 4500, kbps720: 2000, kbps540: 1200);
      final path = await _hw.invokeMethod<String>('compress', {
        'id': id,
        'path': source.path,
        'maxShortSide': limits.maxHeight,
        'frameRate': limits.frameRate,
        'bitrateKbps': videoBitrateKbpsFor(limits, ladder),
      });
      if (path == null) return (ran: true, file: null);
      final out = XFile(path, mimeType: 'video/mp4');
      return (ran: true, file: await _acceptOrNull(source, out));
    } on Object {
      return (ran: false, file: null);
    } finally {
      _progress.remove(id);
      if (_progress.isEmpty) _hw.setMethodCallHandler(null);
    }
  }

  /// `progress` {id, progress} from the encoder → that video's listener.
  Future<void> _onCall(MethodCall call) async {
    if (call.method != 'progress') return;
    final a = call.arguments;
    if (a is! Map) return;
    final p = a['progress'];
    if (p is num) _progress[a['id']]?.call(p.toDouble().clamp(0, 1));
  }

  /// The fallback plugin (both phones), with the admin's settings.
  Future<XFile?> _compressPlugin(
    XFile source,
    VideoLimits limits,
    void Function(double progress)? onProgress,
  ) async {
    try {
      final ladder =
          _ladder?.call() ?? (kbps1080: 4500, kbps720: 2000, kbps540: 1200);
      final info = await _plugin.compressVideo(
        source.path,
        pluginConfigFor(limits, videoBitrateKbpsFor(limits, ladder)),
        onProgress: (p) => onProgress?.call(p.clamp(0, 1).toDouble()),
      );
      if (info == null ||
          info.usedOriginalFile ||
          info.compressedFilePath == source.path) {
        return null;
      }
      return await _acceptOrNull(
        source,
        XFile(info.compressedFilePath, mimeType: 'video/mp4'),
      );
    } on Object {
      return null;
    }
  }

  /// The encoded file, or null when it is not smaller or comes out black
  /// (then the encoded temp file is deleted; the source never is).
  static Future<XFile?> _acceptOrNull(XFile source, XFile out) async {
    if (await out.length() < await source.length() &&
        // Safety net: a black result of a picture that isn't black → keep
        // the original.
        !(await _isBlack(out.path) && !await _isBlack(source.path))) {
      return out;
    }
    if (out.path != source.path) {
      try {
        await File(out.path).delete();
      } on Object {
        // already gone
      }
    }
    return null;
  }

  @override
  Future<void> cancel() async {
    if (kIsWeb) return;
    // This compressor's videos only (queued or running).
    final ids = _progress.keys.toList();
    _cancelledIds.addAll(ids);
    if (_android || _ios) {
      for (final id in ids) {
        try {
          await _hw.invokeMethod<void>('cancel', {'id': id});
        } on Object {
          // no hardware encoder on this build: only the plugin can be running
        }
      }
    }
    try {
      await _plugin.cancelCompression();
    } on Object {
      // nothing of the plugin running
    }
  }

  /// A frame near the start is (almost) pure black.
  static Future<bool> _isBlack(String path) async {
    try {
      final jpg = await videoThumbnailBytes(
        path,
        positionMs: 500,
        quality: 30,
        maxWidth: 64,
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

/// The phone's plugin; in the browser, WebCodecs via Mediabunny (owner
/// 2026-11-08), the original when the browser cannot.
final videoCompressorProvider = Provider<VideoCompressor>(
  (ref) => kIsWeb
      ? BrowserVideoCompressor(
          createBrowserVideoEncoder(),
          ladder: () =>
              videoBitrateLadderOf(ref.read(featureFlagsControllerProvider)),
        )
      : PluginVideoCompressor(
          ladder: () =>
              videoBitrateLadderOf(ref.read(featureFlagsControllerProvider)),
        ),
);
