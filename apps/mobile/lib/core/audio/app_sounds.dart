import 'dart:async';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

/// OQ-044 (owner 2026-09-30): the app's own sounds — ringback tones while
/// our call rings on the other side, "busy", call end, and soft
/// Telegram-like sounds for messages in an open chat. Every call is
/// best-effort: no sound (tests, no audio device) never breaks a flow.
abstract interface class AppSounds {
  Future<void> startRingback();
  Future<void> stopRingback();

  /// Audit 2026-10-02: the incoming-call melody while the app is open
  /// (the system call screen rings only in the background).
  Future<void> startRingtone();
  Future<void> stopRingtone();
  Future<void> busy();
  Future<void> callEnded();
  Future<void> messageIn();
  Future<void> messageOut();
}

class NoAppSounds implements AppSounds {
  const NoAppSounds();
  @override
  Future<void> startRingback() async {}
  @override
  Future<void> stopRingback() async {}
  @override
  Future<void> startRingtone() async {}
  @override
  Future<void> stopRingtone() async {}
  @override
  Future<void> busy() async {}
  @override
  Future<void> callEnded() async {}
  @override
  Future<void> messageIn() async {}
  @override
  Future<void> messageOut() async {}
}

class JustAudioAppSounds implements AppSounds {
  AudioPlayer? _loop;
  AudioPlayer? _fx;
  AudioPlayer? _ring;

  Future<void> _play(String asset, {double volume = 0.6}) async {
    try {
      final p = _fx ??= AudioPlayer();
      await p.stop();
      await p.setAsset('assets/sounds/$asset.wav');
      await p.setVolume(volume);
      unawaited(p.play());
    } on Object catch (e) {
      debugPrint('sound $asset: $e');
    }
  }

  @override
  Future<void> startRingback() async {
    try {
      final p = _loop ??= AudioPlayer(
        handleInterruptions: false,
        androidApplyAudioAttributes: false,
      );
      // Audit 2026-10-02: the call's audio mode (WebRTC) silenced media
      // playback — ringback now plays on the call's own signalling path,
      // so the caller hears it in the earpiece or the speaker.
      await p.setAndroidAudioAttributes(
        const AndroidAudioAttributes(
          contentType: AndroidAudioContentType.sonification,
          usage: AndroidAudioUsage.voiceCommunicationSignalling,
        ),
      );
      await p.setAsset('assets/sounds/ringback.wav');
      await p.setLoopMode(LoopMode.one);
      await p.setVolume(0.5);
      unawaited(p.play());
    } on Object catch (e) {
      debugPrint('ringback: $e');
    }
  }

  @override
  Future<void> stopRingback() async {
    try {
      await _loop?.stop();
    } on Object {
      // Nothing playing.
    }
  }

  @override
  Future<void> startRingtone() async {
    try {
      final p = _ring ??= AudioPlayer(
        handleInterruptions: false,
        androidApplyAudioAttributes: false,
      );
      await p.setAndroidAudioAttributes(
        const AndroidAudioAttributes(
          contentType: AndroidAudioContentType.sonification,
          usage: AndroidAudioUsage.notificationRingtone,
        ),
      );
      await p.setAsset('assets/sounds/ringtone.wav');
      await p.setLoopMode(LoopMode.one);
      await p.setVolume(1);
      unawaited(p.play());
    } on Object catch (e) {
      debugPrint('ringtone: $e');
    }
  }

  @override
  Future<void> stopRingtone() async {
    try {
      await _ring?.stop();
    } on Object {
      // Nothing playing.
    }
  }

  @override
  Future<void> busy() async {
    await stopRingback();
    await _play('busy', volume: 0.5);
  }

  @override
  Future<void> callEnded() async {
    await stopRingback();
    await _play('call_end', volume: 0.5);
  }

  @override
  Future<void> messageIn() => _play('message_in', volume: 0.45);

  @override
  Future<void> messageOut() => _play('message_out', volume: 0.35);
}

/// The real sounds are set up in `run_app.dart`; tests keep silence.
final appSoundsProvider = Provider<AppSounds>((ref) => const NoAppSounds());
