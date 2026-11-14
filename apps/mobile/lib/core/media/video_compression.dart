import 'dart:convert' show jsonDecode;
import 'dart:io' show File, Platform;
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

/// Whether a video of [shortSide] px (the smaller of width / height),
/// [bytes] and [durationMs] is worth re-encoding under [limits]; at or
/// under [reencodeAboveKbps] (the admin's [videoReencodeAboveKbpsOf]) it
/// is kept.
bool needsVideoCompression({
  required int shortSide,
  required int bytes,
  required int durationMs,
  required VideoLimits limits,
  int reencodeAboveKbps = 8000,
}) {
  if (limits.maxHeight <= 0) return false;
  if (shortSide > limits.maxHeight) return true;
  if (durationMs <= 0) return false;
  // bytes per ms × 8 = kbit/s.
  return bytes * 8 / durationMs > reencodeAboveKbps;
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
/// When that path fails (an old phone, an odd file) the `video_compress`
/// plugin (Transcoder / MediaCodec on Android, the AVAssetExportSession
/// preset on iOS) runs as before. Same output as before: H.264 + AAC MP4,
/// at most the admin's height and frame rate.
class PluginVideoCompressor implements VideoCompressor {
  PluginVideoCompressor({
    MethodChannel hardwareChannel = const MethodChannel('lawbid/video_encoder'),
    TargetPlatform? platform,
    Future<XFile?> Function(XFile source, VideoLimits limits)? fallback,
    VideoBitrateLadder Function()? ladder,
  })  : _hw = hardwareChannel,
        _platform = platform,
        _fallback = fallback,
        _ladder = ladder;

  final MethodChannel _hw;
  final TargetPlatform? _platform;
  final Future<XFile?> Function(XFile source, VideoLimits limits)? _fallback;
  final VideoBitrateLadder Function()? _ladder;

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

  /// The `video_compress` plugin (the fallback on both phones).
  Future<XFile?> _compressPlugin(
    XFile source,
    VideoLimits limits,
    void Function(double progress)? onProgress,
  ) async {
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
      return await _acceptOrNull(
        source,
        XFile(out.path, mimeType: 'video/mp4'),
      );
    } on Object {
      return null;
    } finally {
      sub.unsubscribe();
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
      await VideoCompress.cancelCompression();
    } on Object {
      // nothing of the plugin running
    }
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
