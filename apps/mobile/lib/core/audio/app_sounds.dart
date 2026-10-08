import 'dart:async';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

/// OQ-044 (owner 2026-09-30): call progress tones — ringback while our
/// call rings on the other side, "busy" and call end. Owner 2026-10-07:
/// no melodies of LawBid's own — an incoming call rings with the phone's
/// ringtone and an open chat makes no sound of its own (messages outside
/// it use the phone's notification sound). Every call is best-effort: no
/// sound (tests, no audio device) never breaks a flow.
abstract interface class AppSounds {
  Future<void> startRingback();
  Future<void> stopRingback();

  /// Audit 2026-10-02: the phone's own ringtone while the app is open on
  /// Android (iOS CallKit rings by itself).
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
  static const _ringtone = MethodChannel('lawbid/ringtone');

  AudioPlayer? _loop;
  AudioPlayer? _fx;

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
    // Web: a page can't reach the device ringtone — loop the ringback.
    if (kIsWeb) return startRingback();
    try {
      await _ringtone.invokeMethod<void>('start');
    } on Object catch (e) {
      debugPrint('ringtone: $e');
    }
  }

  @override
  Future<void> stopRingtone() async {
    if (kIsWeb) return stopRingback();
    try {
      await _ringtone.invokeMethod<void>('stop');
    } on Object {
      // Nothing playing / not Android.
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
  Future<void> messageIn() async {}

  @override
  Future<void> messageOut() async {}
}

/// The real sounds are set up in `run_app.dart`; tests keep silence.
final appSoundsProvider = Provider<AppSounds>((ref) => const NoAppSounds());
