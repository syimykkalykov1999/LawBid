import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:video_player/video_player.dart';

/// Owner 2026-10-20: a reel opened muted mixes with other audio and cannot
/// switch mode, so giving it sound must pause a voice note by hand.
class _Player extends VideoPlayerController {
  _Player() : super.networkUrl(Uri.parse('https://cdn.test/v.m3u8'));

  @override
  Future<void> initialize() async {
    value = value.copyWith(
      isInitialized: true,
      duration: const Duration(seconds: 30),
      size: const Size(720, 1280),
    );
  }

  @override
  Future<void> play() async => value = value.copyWith(isPlaying: true);

  @override
  Future<void> pause() async => value = value.copyWith(isPlaying: false);

  @override
  Future<void> setLooping(bool looping) async {}

  @override
  Future<void> setVolume(double volume) async =>
      value = value.copyWith(volume: volume);

  @override
  Future<void> seekTo(Duration position) async {}
}

var _paused = 0;

class _Voice extends VoicePlayer {
  @override
  VoicePlayback build() => const VoicePlayback();

  @override
  Future<void> pauseForOtherAudio() async => _paused++;
}

const _video = PostVideo(
  status: 'ready',
  playbackUrl: 'https://cdn.test/v.m3u8',
  durationSec: 30,
);

void main() {
  testWidgets('unmuting an open reel pauses the voice note', (t) async {
    _paused = 0;
    final options = <bool>[];
    debugReelPlayerFactory = (_, o) {
      options.add(o.mixWithOthers);
      return _Player();
    };
    addTearDown(() => debugReelPlayerFactory = null);
    final muted = ValueNotifier(true);
    await t.pumpWidget(
      ProviderScope(
        overrides: [voicePlayerProvider.overrideWith(_Voice.new)],
        child: MaterialApp(
          theme: AppTheme.dark(),
          home: ValueListenableBuilder<bool>(
            valueListenable: muted,
            builder: (_, m, __) =>
                ReelVideo(video: _video, active: true, muted: m),
          ),
        ),
      ),
    );
    await t.pump(const Duration(milliseconds: 50));
    expect(options, [true]);
    expect(_paused, 0);
    muted.value = false;
    await t.pump(const Duration(milliseconds: 50));
    expect(_paused, 1);
    expect(options, [true], reason: 'no restart of the player');
    muted.value = true;
    await t.pump(const Duration(milliseconds: 50));
    expect(_paused, 1);
  });
}
