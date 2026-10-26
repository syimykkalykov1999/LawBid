import 'dart:async';
import 'dart:io';

import 'package:audio_session/audio_session.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:lawbid/core/media/audio_takeover.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:proximity_sensor/proximity_sensor.dart';

/// The id the player shows while a not-yet-sent recording is previewed.
const kVoiceDraftId = '__draft__';

/// What the one app-wide voice player is doing (OQ-040): only one note
/// plays at a time, like Telegram.
@immutable
class VoicePlayback {
  const VoicePlayback({
    this.messageId,
    this.playing = false,
    this.position = Duration.zero,
    this.speed = 1,
    this.loading = false,
    this.title,
    this.threadId,
    this.durationMs = 0,
  });

  final String? messageId;

  /// Who sent the playing note and in which chat (the mini-player shows
  /// them once the chat is left).
  final String? title;
  final String? threadId;
  final int durationMs;
  final bool playing;
  final Duration position;
  final double speed;
  final bool loading;

  VoicePlayback copyWith({
    String? messageId,
    bool? playing,
    Duration? position,
    double? speed,
    bool? loading,
  }) =>
      VoicePlayback(
        title: title,
        threadId: threadId,
        durationMs: durationMs,
        messageId: messageId ?? this.messageId,
        playing: playing ?? this.playing,
        position: position ?? this.position,
        speed: speed ?? this.speed,
        loading: loading ?? this.loading,
      );
}

class VoicePlayer extends Notifier<VoicePlayback> {
  AudioPlayer? _player;
  final _subs = <StreamSubscription<Object?>>[];

  AudioPlayer get _p {
    final existing = _player;
    if (existing != null) return existing;
    final p = AudioPlayer();
    _subs
      ..add(
        p.positionStream.listen((pos) {
          if (ref.mounted) state = state.copyWith(position: pos);
        }),
      )
      ..add(
        p.playerStateStream.listen((s) {
          if (!ref.mounted) return;
          if (s.processingState == ProcessingState.completed) {
            // Finished: back to the start, paused (Telegram).
            unawaited(p.pause());
            unawaited(p.seek(Duration.zero));
            state = state.copyWith(playing: false, position: Duration.zero);
            if (_next.isEmpty) _unwatchProximity();
            // Owner 2026-10-17 (WhatsApp): the next voice note in a row
            // plays by itself.
            if (_next.isNotEmpty) {
              final next = _next.first;
              final rest = _next.sublist(1);
              final started = _onAutoPlay;
              unawaited(
                toggle(next, then: rest, onAutoPlay: started).then((_) {
                  started?.call(next);
                }),
              );
            }
            return;
          }
          state = state.copyWith(
            playing: s.playing,
            loading: s.processingState == ProcessingState.loading ||
                s.processingState == ProcessingState.buffering,
          );
        }),
      );
    return _player = p;
  }

  int _load = 0;
  StreamSubscription<int>? _proximity;
  bool _earpiece = false;

  @override
  VoicePlayback build() {
    ref.listen(
      audioTakeoverProvider,
      (_, __) => unawaited(pauseForOtherAudio()),
    );
    ref.onDispose(() {
      for (final s in _subs) {
        s.cancel();
      }
      unawaited(_proximity?.cancel());
      if (!kIsWeb) unawaited(ProximitySensor.setProximityScreenOff(false));
      _player?.dispose();
    });
    // A call (ringing or talking) takes the audio: the note stops.
    ref.listen(callControllerProvider.select((c) => c.phase), (_, phase) {
      if (phase != CallPhase.idle && state.messageId != null) {
        unawaited(stop());
      }
    });
    return VoicePlayback(speed: _savedSpeed());
  }

  static const _speedKey = 'chat.voice_speed';

  /// Owner 2026-10-17 (WhatsApp): the chosen speed stays for next notes.
  double _savedSpeed() {
    try {
      final v = ref.read(sharedPreferencesProvider).getDouble(_speedKey);
      return v == 1.5 || v == 2.0 ? v! : 1;
    } on Object {
      return 1; // no preferences (tests)
    }
  }

  /// Notes to play after the current one, oldest first.
  List<ChatMessage> _next = const [];
  void Function(ChatMessage)? _onAutoPlay;

  final _prefetching = <String>{};

  /// Owner 2026-10-15: a note on screen is downloaded in the background,
  /// so the tap starts the sound at once (also readies the player).
  void prefetch(ChatMessage m) {
    final v = m.voice;
    if (kIsWeb || v == null || v.url == null || v.localPath != null) return;
    if (!_prefetching.add(m.id)) return;
    _p; // create the player now, not on the first tap
    unawaited(
      _cached(m.id, v.url).then<void>(
        (_) {},
        onError: (Object _) {
          _prefetching.remove(m.id);
        },
      ),
    );
  }

  /// Play/pause [m]; another note stops the current one. [then]: the
  /// notes right after it, played in turn when it ends; [onAutoPlay] runs
  /// for each of them as it starts.
  Future<void> toggle(
    ChatMessage m, {
    List<ChatMessage> then = const [],
    void Function(ChatMessage)? onAutoPlay,
    String? title,
    String? threadId,
  }) async {
    final v = m.voice;
    if (v == null || callBusy) return;
    final p = _p;
    if (state.messageId == m.id) {
      if (p.playing) {
        await _pauseFaded(p);
      } else {
        await _playFaded(p);
      }
      return;
    }
    final load = ++_load;
    if (p.playing || state.messageId != null) await _pauseFaded(p, stop: true);
    if (load != _load) return;
    _next = then;
    _onAutoPlay = onAutoPlay;
    state = VoicePlayback(
      messageId: m.id,
      speed: state.speed,
      loading: true,
      title: title ?? state.title,
      threadId: threadId ?? state.threadId,
      durationMs: v.durationMs,
    );
    try {
      // Web: no file system — stream the signed link (or the unsent blob).
      if (kIsWeb) {
        final url = v.localPath ?? v.url;
        if (url == null) {
          state = state.copyWith(loading: false);
          return;
        }
        await p.setUrl(url);
        if (load != _load) return;
        await p.setSpeed(state.speed);
        await _playFaded(p);
        return;
      }
      final path = v.localPath ?? await _cached(m.id, v.url);
      if (!ref.mounted || load != _load) return;
      if (path != null) {
        await p.setFilePath(path);
        if (load != _load) return;
      } else {
        state = state.copyWith(loading: false);
        return;
      }
      await p.setSpeed(state.speed);
      await _playFaded(p);
    } on Object {
      if (ref.mounted) state = state.copyWith(loading: false, playing: false);
    }
  }

  /// Bumped by every fade / start / stop: a ramp that finds a newer number
  /// stops at once (pause + play within 90 ms, two notes at the same time).
  int _gen = 0;

  Future<bool> _ramp(AudioPlayer p, double from, double to, int gen) async {
    const steps = 6;
    for (var i = 1; i <= steps; i++) {
      if (gen != _gen) return false;
      await p.setVolume(from + (to - from) * i / steps);
      await Future<void>.delayed(const Duration(milliseconds: 18));
    }
    return gen == _gen;
  }

  /// No click: the sound rises over ~110 ms when it starts or resumes and
  /// falls over ~110 ms before it pauses (a hard cut is a pop on speakers).
  Future<void> _playFaded(AudioPlayer p) async {
    final gen = ++_gen;
    await p.setVolume(0);
    unawaited(p.play());
    _watchProximity();
    await _ramp(p, 0, 1, gen);
  }

  Future<void> _pauseFaded(AudioPlayer p, {bool stop = false}) async {
    final gen = ++_gen;
    if (p.playing && !await _ramp(p, p.volume, 0, gen)) return;
    if (stop) {
      await p.stop();
    } else {
      await p.pause();
    }
    await p.setVolume(1);
    // A paused note listens to nothing: sensor and screen lock released.
    if (stop || !(_player?.playing ?? false)) _unwatchProximity();
  }

  /// WhatsApp: held to the ear the note moves to the earpiece and the
  /// screen goes dark; taken away it returns to the loudspeaker.
  void _watchProximity() {
    if (kIsWeb || _proximity != null) return;
    try {
      _proximity = ProximitySensor.events.listen(
        (near) => unawaited(_setEarpiece(near > 0)),
        onError: (Object _) {},
      );
    } on Object {
      // No sensor: the loudspeaker stays.
    }
  }

  void _unwatchProximity() {
    final sub = _proximity;
    _proximity = null;
    if (sub != null) unawaited(sub.cancel());
    if (_earpiece) unawaited(_setEarpiece(false));
  }

  /// Earpiece (voice-call route: iOS playAndRecord + voiceChat without
  /// defaultToSpeaker; Android voiceCommunication / speech) or the normal
  /// loudspeaker. The session category never changes under live sound: the
  /// note fades out, the route is switched in silence, and it fades back.
  Future<void> _setEarpiece(bool on) async {
    if (_earpiece == on) return;
    final p = _player;
    final wasPlaying = p?.playing ?? false;
    if (on && !wasPlaying) return;
    final gen = ++_gen;
    try {
      if (wasPlaying && p != null) {
        // Interrupted (paused / another note meanwhile): nothing switched,
        // the flag stays, the next proximity event tries again.
        if (!await _ramp(p, p.volume, 0, gen)) return;
        await p.pause();
      }
      final session = await AudioSession.instance;
      await session.configure(on ? _earpieceConfig : _music);
      await ProximitySensor.setProximityScreenOff(on);
      // The route is switched: only now does the flag change.
      _earpiece = on;
      if (wasPlaying && p != null && ref.mounted && gen == _gen) {
        await p.setVolume(0);
        unawaited(p.play());
        await _ramp(p, 0, 1, gen);
      }
    } on Object {
      // The session stays as it was (and so does the flag).
    }
  }

  static const _music = AudioSessionConfiguration.music();

  static const _earpieceConfig = AudioSessionConfiguration(
    avAudioSessionCategory: AVAudioSessionCategory.playAndRecord,
    avAudioSessionCategoryOptions: AVAudioSessionCategoryOptions.allowBluetooth,
    avAudioSessionMode: AVAudioSessionMode.voiceChat,
    avAudioSessionRouteSharingPolicy:
        AVAudioSessionRouteSharingPolicy.defaultPolicy,
    androidAudioAttributes: AndroidAudioAttributes(
      contentType: AndroidAudioContentType.speech,
      usage: AndroidAudioUsage.voiceCommunication,
    ),
  );

  /// A call is on (ringing, dialling or talking): sound from notes would
  /// fight the call for the audio session.
  bool get callBusy => ref.read(callControllerProvider).phase != CallPhase.idle;

  /// Telegram-style: a note is downloaded once into the cache and played
  /// from the file (replays work offline; the signed link may expire).
  /// Storage links carry no app headers ([storageDioProvider]).
  Future<String?> _cached(String messageId, String? url) async {
    if (url == null) return null;
    final target = await voiceCachePath(messageId);
    if (target == null) return null;
    final file = File(target);
    // ignore: avoid_slow_async_io
    if (await file.exists() && await file.length() > 0) return file.path;
    final res = await ref.read(storageDioProvider).get<List<int>>(
          url,
          options: Options(responseType: ResponseType.bytes),
        );
    final data = res.data;
    if (data == null || data.isEmpty) return null;
    await file.writeAsBytes(data, flush: true);
    return file.path;
  }

  /// The preview of a recording not sent yet (lock mode): same player, same
  /// fades, never two sounds at once. [kVoiceDraftId] marks it.
  Future<void> toggleLocal(String path, int durationMs) async {
    if (callBusy) return;
    final p = _p;
    if (state.messageId == kVoiceDraftId) {
      if (p.playing) {
        await _pauseFaded(p);
      } else {
        await _playFaded(p);
      }
      return;
    }
    final load = ++_load;
    if (p.playing || state.messageId != null) await _pauseFaded(p, stop: true);
    if (load != _load) return;
    _next = const [];
    state = VoicePlayback(
      messageId: kVoiceDraftId,
      loading: true,
      durationMs: durationMs,
    );
    try {
      if (kIsWeb) {
        await p.setUrl(path);
      } else {
        await p.setFilePath(path);
      }
      if (load != _load) return;
      await p.setSpeed(1);
      await _playFaded(p);
    } on Object {
      if (ref.mounted) state = state.copyWith(loading: false, playing: false);
    }
  }

  /// The preview of an unsent recording ends with its composer.
  Future<void> stopDraft() async {
    if (state.messageId == kVoiceDraftId) await stop();
  }

  Future<void> seekTo(Duration at) async => _player?.seek(at);

  /// Play/pause the current note (the mini-player).
  Future<void> playPause() async {
    final p = _player;
    if (p == null || state.messageId == null) return;
    if (p.playing) {
      await _pauseFaded(p);
    } else {
      await _playFaded(p);
    }
  }

  /// Another source (a reel that just got its sound) takes the speakers:
  /// the note pauses where it is, the mini-player stays to resume it.
  Future<void> pauseForOtherAudio() async {
    final p = _player;
    if (p != null && p.playing) await _pauseFaded(p);
  }

  Future<void> seek(ChatMessage m, double fraction) async {
    final v = m.voice;
    if (v == null) return;
    if (state.messageId != m.id) await toggle(m);
    await _p.seek(
      Duration(
        milliseconds: (v.durationMs * fraction.clamp(0.0, 1.0)).round(),
      ),
    );
  }

  /// 1× → 1.5× → 2× → 1×.
  Future<void> cycleSpeed() async {
    final next = switch (state.speed) { 1.0 => 1.5, 1.5 => 2.0, _ => 1.0 };
    state = state.copyWith(speed: next);
    await _player?.setSpeed(next);
    try {
      await ref.read(sharedPreferencesProvider).setDouble(_speedKey, next);
    } on Object {
      // No preferences (tests): the speed lasts for this run only.
    }
  }

  Future<void> stop() async {
    _next = const [];
    _load++;
    final p = _player;
    if (p != null && p.playing) {
      await _pauseFaded(p, stop: true);
    } else {
      await p?.stop();
    }
    _unwatchProximity();
    if (ref.mounted) state = VoicePlayback(speed: state.speed);
  }
}

final voicePlayerProvider =
    NotifierProvider<VoicePlayer, VoicePlayback>(VoicePlayer.new);
