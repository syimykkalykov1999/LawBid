import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/media/audio_takeover.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:video_player/video_player.dart';

/// R-373 (owner 2026-11-04, «рилсы зависают и не играют»): on Android a
/// call holds the audio focus; a player that asks for it stands on its first
/// frame. [moves]: whether play() really plays (false = focus refused).
class _Player extends VideoPlayerController {
  _Player({required this.moves})
      : super.networkUrl(Uri.parse('https://cdn.test/v.m3u8'));

  final bool moves;
  int plays = 0;

  @override
  Future<void> initialize() async {
    value = value.copyWith(
      isInitialized: true,
      duration: const Duration(seconds: 30),
      size: const Size(720, 1280),
    );
  }

  Timer? _clock;

  @override
  Future<void> play() async {
    plays++;
    value = value.copyWith(isPlaying: true);
    if (!moves) return;
    _clock?.cancel();
    _clock = Timer.periodic(const Duration(milliseconds: 100), (_) {
      value = value.copyWith(
        position: value.position + const Duration(milliseconds: 100),
      );
    });
  }

  @override
  Future<void> pause() async {
    _clock?.cancel();
    value = value.copyWith(isPlaying: false);
  }

  @override
  Future<void> dispose() async {
    _clock?.cancel();
    await super.dispose();
  }

  @override
  Future<void> setLooping(bool looping) async {}

  @override
  Future<void> setVolume(double volume) async =>
      value = value.copyWith(volume: volume);

  @override
  Future<void> seekTo(Duration position) async {}
}

const _video = PostVideo(
  status: 'ready',
  playbackUrl: 'https://cdn.test/v.m3u8',
  durationSec: 30,
);

Future<ProviderContainer> _pump(WidgetTester t) async {
  final container = ProviderContainer();
  addTearDown(container.dispose);
  await t.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: const ReelVideo(video: _video, active: true, muted: false),
      ),
    ),
  );
  return container;
}

void main() {
  setUp(debugResetReelFocus);
  tearDown(() {
    debugReelPlayerFactory = null;
    debugResetReelFocus();
  });

  test('the call flag follows set()', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(c.read(callAudioActiveProvider), isFalse);
    c.read(callAudioActiveProvider.notifier).set(active: true);
    expect(c.read(callAudioActiveProvider), isTrue);
    c.read(callAudioActiveProvider.notifier).set(active: false);
    expect(c.read(callAudioActiveProvider), isFalse);
  });

  testWidgets('a reel held by the refused focus opens again, silent',
      (t) async {
    final opened = <(bool, _Player)>[];
    debugReelPlayerFactory = (_, o) {
      // The first player asks for the focus and is refused; the second
      // mixes, so it plays.
      final p = _Player(moves: opened.isNotEmpty);
      opened.add((o.mixWithOthers, p));
      return p;
    };
    await _pump(t);
    await t.pump(const Duration(milliseconds: 50));
    expect(opened.map((e) => e.$1), [false]);
    await t.pump(kReelStallAfter);
    await t.pump(const Duration(milliseconds: 50));
    expect(opened.map((e) => e.$1), [false, true]);
    final second = opened.last.$2;
    expect(second.plays, greaterThan(0));
    await t.pump(const Duration(milliseconds: 400));
    expect(second.value.volume, 0, reason: 'silent while focus is refused');
    // No third player: the silent one moves.
    await t.pump(kReelStallAfter * 2);
    expect(opened, hasLength(2));
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(milliseconds: 300));
  });

  testWidgets('a reel that plays is left alone', (t) async {
    final opened = <bool>[];
    debugReelPlayerFactory = (_, o) {
      opened.add(o.mixWithOthers);
      return _Player(moves: true);
    };
    await _pump(t);
    await t.pump(const Duration(milliseconds: 50));
    await t.pump(kReelStallAfter * 2);
    expect(opened, [false]);
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(milliseconds: 300));
  });

  testWidgets('during a call a reel opens silent and plays on after it',
      (t) async {
    final opened = <(bool, _Player)>[];
    debugReelPlayerFactory = (_, o) {
      final p = _Player(moves: true);
      opened.add((o.mixWithOthers, p));
      return p;
    };
    final container = ProviderContainer();
    addTearDown(container.dispose);
    container.read(callAudioActiveProvider.notifier).set(active: true);
    await t.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AppTheme.dark(),
          home: const ReelVideo(video: _video, active: true, muted: false),
        ),
      ),
    );
    await t.pump(const Duration(milliseconds: 400));
    expect(opened.single.$1, isTrue, reason: 'never asks for the focus');
    final p = opened.single.$2;
    expect(p.plays, 1);
    expect(p.value.volume, 0);
    container.read(callAudioActiveProvider.notifier).set(active: false);
    await t.pump(const Duration(milliseconds: 400));
    expect(p.plays, 2, reason: 'the end of the call plays it again');
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(milliseconds: 300));
  });
}
