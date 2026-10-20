import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

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

  @override
  VoicePlayback build() {
    ref.onDispose(() {
      for (final s in _subs) {
        s.cancel();
      }
      _player?.dispose();
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
  }) async {
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
    if (p.playing || state.messageId != null) await p.stop();
    _next = then;
    _onAutoPlay = onAutoPlay;
    state = VoicePlayback(messageId: m.id, speed: state.speed, loading: true);
    try {
      // Web: no file system — stream the signed link (or the unsent blob).
      if (kIsWeb) {
        final url = v.localPath ?? v.url;
        if (url == null) {
          state = state.copyWith(loading: false);
          return;
        }
        await p.setUrl(url);
        await p.setSpeed(state.speed);
        unawaited(p.play());
        return;
      }
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
    await _player?.stop();
    if (ref.mounted) state = VoicePlayback(speed: state.speed);
  }
}

final voicePlayerProvider =
    NotifierProvider<VoicePlayer, VoicePlayback>(VoicePlayer.new);
