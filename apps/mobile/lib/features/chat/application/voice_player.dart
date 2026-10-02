import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:path_provider/path_provider.dart';

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
  });

  final String? messageId;
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

  @override
  VoicePlayback build() {
    ref.onDispose(() {
      for (final s in _subs) {
        s.cancel();
      }
      _player?.dispose();
    });
    return const VoicePlayback();
  }

  /// Play/pause [m]; another note stops the current one.
  Future<void> toggle(ChatMessage m) async {
    final v = m.voice;
    if (v == null) return;
    final p = _p;
    if (state.messageId == m.id) {
      if (p.playing) {
        await p.pause();
      } else {
        unawaited(p.play());
      }
      return;
    }
    await p.stop();
    state = VoicePlayback(messageId: m.id, speed: state.speed, loading: true);
    try {
      final path = v.localPath ?? await _cached(m.id, v.url);
      if (!ref.mounted) return;
      if (path != null) {
        await p.setFilePath(path);
      } else {
        state = state.copyWith(loading: false);
        return;
      }
      await p.setSpeed(state.speed);
      unawaited(p.play());
    } on Object {
      if (ref.mounted) state = state.copyWith(loading: false, playing: false);
    }
  }

  /// Telegram-style: a note is downloaded once into the cache and played
  /// from the file (replays work offline; the signed link may expire).
  /// Storage links carry no app headers ([storageDioProvider]).
  Future<String?> _cached(String messageId, String? url) async {
    if (url == null) return null;
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/voice_cache_$messageId.m4a');
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
  }

  Future<void> stop() async {
    await _player?.stop();
    if (ref.mounted) state = VoicePlayback(speed: state.speed);
  }
}

final voicePlayerProvider =
    NotifierProvider<VoicePlayer, VoicePlayback>(VoicePlayer.new);
