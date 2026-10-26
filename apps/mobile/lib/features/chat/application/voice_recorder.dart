import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// OQ-040: 0.5 s … 15 min, like the server's rule.
const kVoiceMinDuration = Duration(milliseconds: 500);
const kVoiceMaxDuration = Duration(minutes: 15);

/// Bars stored with a note (the bubble draws them).
const kVoiceBars = 48;

/// A finished recording.
typedef VoiceRecording = ({String path, int durationMs, List<int> waveform});

/// How often the recorder samples the microphone level.
const kVoiceSamplePeriod = Duration(milliseconds: 50);

/// What the live recording strip and clock read: the raw level stream, the
/// levels so far and a monotonic recording time (pauses not counted).
abstract interface class VoiceLevelSource {
  /// 0…1, one value per [kVoiceSamplePeriod] while recording.
  Stream<double> get levels;

  /// Every level recorded so far (the strip starts from them).
  List<double> get samples;

  /// Recording time; never goes back while one recording runs.
  Duration get elapsed;
}

/// Records a voice note (AAC in .m4a, mono, 16 kHz, 32 kbit/s), sampling the
/// level every 50 ms for the live meter and the stored waveform. In a
/// browser the note is AAC in MP4 where the browser can (Safari) and Opus in
/// WebM otherwise (Chrome, Firefox); `stop` then gives a blob: URL, not a
/// file.
class VoiceRecorder implements VoiceLevelSource {
  VoiceRecorder() : _rec = AudioRecorder();

  final AudioRecorder _rec;
  final _levels = StreamController<double>.broadcast();
  StreamSubscription<Amplitude>? _ampSub;
  final List<double> _samples = [];
  Timer? _cap;

  /// Owner inbox 32: the time comes from a monotonic stopwatch (stopped on
  /// pause), not from wall-clock differences that can jump.
  final Stopwatch _clock = Stopwatch();
  bool _active = false;
  bool _paused = false;

  /// A start in flight: a second press joins it instead of restarting the
  /// microphone (that reset the clock and the bars mid-note).
  Future<bool>? _starting;

  /// WhatsApp: the tail of the last word is not cut when the finger lifts.
  static const _tail = Duration(milliseconds: 150);

  /// 0…1 while recording (for the pulsing mic and the live bars).
  @override
  Stream<double> get levels => _levels.stream;

  @override
  List<double> get samples => List.unmodifiable(_samples);

  bool get recording => _active;

  bool get paused => _paused;

  @override
  Duration get elapsed => _clock.elapsed;

  /// Asks for the microphone once; false when refused.
  Future<bool> hasPermission() => _rec.hasPermission();

  /// Starts; [onCap] fires when the 15-minute limit is reached.
  Future<bool> start({void Function()? onCap}) {
    if (recording) return Future.value(true);
    return _starting ??= _start(onCap).whenComplete(() => _starting = null);
  }

  Future<bool> _start(void Function()? onCap) async {
    if (!await _rec.hasPermission()) return false;
    var encoder = AudioEncoder.aacLc;
    var path = '';
    if (kIsWeb) {
      if (!await _rec.isEncoderSupported(encoder)) encoder = AudioEncoder.opus;
    } else {
      final dir = await getTemporaryDirectory();
      path = '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    }
    await _rec.start(
      RecordConfig(
        encoder: encoder,
        bitRate: 32000,
        // 32 kbit/s needs 16 kHz: at 44.1 kHz AAC bubbles and warbles.
        sampleRate: 16000,
        numChannels: 1,
      ),
      path: path,
    );
    _samples.clear();
    _paused = false;
    _active = true;
    _clock
      ..reset()
      ..start();
    _onCap = onCap;
    await _listen();
    _armCap();
    return true;
  }

  void Function()? _onCap;

  Future<void> _listen() async {
    await _ampSub?.cancel();
    _ampSub = _rec.onAmplitudeChanged(kVoiceSamplePeriod).listen((a) {
      // dBFS −60…0 → 0…1.
      final v = ((a.current + 60) / 60).clamp(0.0, 1.0);
      _samples.add(v);
      if (!_levels.isClosed) _levels.add(v);
    });
  }

  void _armCap() {
    _cap?.cancel();
    _cap = Timer(kVoiceMaxDuration - elapsed, () => _onCap?.call());
  }

  void _halt() {
    _cap?.cancel();
    _clock
      ..stop()
      ..reset();
    _active = false;
    _paused = false;
  }

  /// Lock mode: pause (the file stays open; the meter freezes).
  Future<void> pause() async {
    if (!recording || _paused) return;
    _clock.stop();
    _paused = true;
    _cap?.cancel();
    await _ampSub?.cancel();
    _ampSub = null;
    await _rec.pause();
  }

  /// Lock mode: carry on into the same file.
  Future<void> resume() async {
    if (!recording || !_paused) return;
    await _rec.resume();
    _paused = false;
    _clock.start();
    await _listen();
    _armCap();
  }

  /// The waveform recorded so far (for the frozen / preview bars).
  List<int> get waveformNow => bars(_samples, kVoiceBars);

  /// Stops and returns the note, or null when shorter than 0.5 s.
  Future<VoiceRecording?> stop() async {
    if (!recording) return null;
    // Keep listening a moment: the end of the last word must not be cut.
    if (!_paused) await Future<void>.delayed(_tail);
    final took = elapsed;
    await _ampSub?.cancel();
    _halt();
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
    _halt();
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
      out.add(
        // ignore: prefer_int_literals
        samples.sublist(from, math.min(to, samples.length)).fold(0.0, math.max),
      );
    }
    // ignore: prefer_int_literals
    final peak = out.fold(0.0, math.max);
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

/// A recording left in a chat's composer (lock mode, call came in, screen
/// left): it waits there to be played, sent or deleted — never lost.
class VoiceDrafts extends Notifier<Map<String, VoiceRecording>> {
  @override
  Map<String, VoiceRecording> build() => const {};

  VoiceRecording? of(String chatId) => state[chatId];

  void put(String chatId, VoiceRecording r) => state = {...state, chatId: r};

  void clear(String chatId) {
    if (!state.containsKey(chatId)) return;
    state = {...state}..remove(chatId);
  }
}

final voiceDraftsProvider =
    NotifierProvider<VoiceDrafts, Map<String, VoiceRecording>>(
  VoiceDrafts.new,
);
