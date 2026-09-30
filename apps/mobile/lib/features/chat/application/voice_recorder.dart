import 'dart:async';
import 'dart:math' as math;

import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import 'package:lawbid/features/chat/domain/chat_models.dart';

/// OQ-040: 0.5 s … 15 min, like the server's rule.
const kVoiceMinDuration = Duration(milliseconds: 500);
const kVoiceMaxDuration = Duration(minutes: 15);

/// Bars stored with a note (the bubble draws them).
const kVoiceBars = 48;

/// A finished recording.
typedef VoiceRecording = ({String path, int durationMs, List<int> waveform});

/// Records a voice note (AAC in .m4a, mono, 64 kbit/s), sampling the level
/// every 80 ms for the live meter and the stored waveform.
class VoiceRecorder {
  VoiceRecorder() : _rec = AudioRecorder();

  final AudioRecorder _rec;
  final _levels = StreamController<double>.broadcast();
  StreamSubscription<Amplitude>? _ampSub;
  final List<double> _samples = [];
  DateTime? _startedAt;
  Timer? _cap;

  /// 0…1 while recording (for the pulsing mic and the live bars).
  Stream<double> get levels => _levels.stream;

  bool get recording => _startedAt != null;

  Duration get elapsed => _startedAt == null
      ? Duration.zero
      : DateTime.now().difference(_startedAt!);

  /// Asks for the microphone once; false when refused.
  Future<bool> hasPermission() => _rec.hasPermission();

  /// Starts; [onCap] fires when the 15-minute limit is reached.
  Future<bool> start({void Function()? onCap}) async {
    if (recording) return true;
    if (!await _rec.hasPermission()) return false;
    final dir = await getTemporaryDirectory();
    final path =
        '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _rec.start(
      const RecordConfig(
        encoder: AudioEncoder.aacLc,
        bitRate: 64000,
        sampleRate: 44100,
        numChannels: 1,
      ),
      path: path,
    );
    _samples.clear();
    _startedAt = DateTime.now();
    _ampSub =
        _rec.onAmplitudeChanged(const Duration(milliseconds: 80)).listen((a) {
      // dBFS −60…0 → 0…1.
      final v = ((a.current + 60) / 60).clamp(0.0, 1.0);
      _samples.add(v);
      if (!_levels.isClosed) _levels.add(v);
    });
    _cap = Timer(kVoiceMaxDuration, () => onCap?.call());
    return true;
  }

  /// Stops and returns the note, or null when shorter than 0.5 s.
  Future<VoiceRecording?> stop() async {
    if (!recording) return null;
    final took = elapsed;
    await _ampSub?.cancel();
    _cap?.cancel();
    _startedAt = null;
    final path = await _rec.stop();
    if (path == null || took < kVoiceMinDuration) return null;
    return (
      path: path,
      durationMs:
          math.min(took.inMilliseconds, kVoiceMaxDuration.inMilliseconds),
      waveform: bars(_samples, kVoiceBars),
    );
  }

  /// Throws the recording away (swipe to cancel).
  Future<void> cancel() async {
    await _ampSub?.cancel();
    _cap?.cancel();
    _startedAt = null;
    await _rec.cancel();
  }

  Future<void> dispose() async {
    await _ampSub?.cancel();
    _cap?.cancel();
    await _levels.close();
    await _rec.dispose();
  }

  /// Downsamples levels to [count] bars 0–100 (peak per bucket, then
  /// normalized so a quiet note still has a visible shape).
  static List<int> bars(List<double> samples, int count) {
    if (samples.isEmpty) return List.filled(count, 8);
    final out = <double>[];
    for (var i = 0; i < count; i++) {
      final from = (i * samples.length / count).floor();
      final to = math.max(from + 1, ((i + 1) * samples.length / count).floor());
      out.add(samples
          .sublist(from, math.min(to, samples.length))
          .fold(0.0, (double a, b) => math.max(a, b)));
    }
    final peak = out.fold(0.0, (double a, b) => math.max(a, b));
    return [
      for (final v in out)
        (peak <= 0 ? 8 : (8 + 92 * v / peak)).round().clamp(0, 100),
    ];
  }
}

/// Clock for bubbles and the recorder: "0:07", "12:30".
String voiceClock(Duration d) {
  final m = d.inMinutes;
  final s = d.inSeconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

/// The duration a bubble shows for [v].
Duration voiceLength(VoiceNote v) => Duration(milliseconds: v.durationMs);
