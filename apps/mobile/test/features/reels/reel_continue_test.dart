import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:video_player/video_player.dart';

/// Owner 2026-10-19: a video half watched in the feed goes on from that spot
/// when it is opened full screen (it used to start over).
class _FakePlayer extends VideoPlayerController {
  _FakePlayer() : super.networkUrl(Uri.parse('https://cdn.test/c.m3u8'));

  final seeks = <Duration>[];

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
  Future<void> setVolume(double volume) async {}

  @override
  Future<void> seekTo(Duration position) async {
    seeks.add(position);
    value = value.copyWith(position: position);
  }

  @override
  Future<Duration?> get position async => value.position;
}

const _video = PostVideo(
  status: 'ready',
  playbackUrl: 'https://cdn.test/continue.m3u8',
  thumbnailUrl: 'https://cdn.test/cover.jpg',
  durationSec: 30,
);

void main() {
  final players = <_FakePlayer>[];
  setUp(() {
    players.clear();
    debugReelPlayerFactory = (_, __) {
      final p = _FakePlayer();
      players.add(p);
      return p;
    };
  });
  tearDown(() => debugReelPlayerFactory = null);

  testWidgets('the full-screen player goes on from the feed\'s spot',
      (tester) async {
    Widget app(Key key) => MaterialApp(
          theme: AppTheme.dark(),
          home: Scaffold(
            body: ReelVideo(key: key, video: _video, active: true),
          ),
        );
    // In the feed: playing, watched up to 12 s.
    await tester.pumpWidget(app(const ValueKey('feed')));
    await tester.pumpAndSettle();
    final feed = players.single;
    expect(feed.value.isPlaying, isTrue);
    feed.value = feed.value.copyWith(position: const Duration(seconds: 12));
    await tester.pump();

    // Opened full screen: a new player starts at 12 s, not at 0.
    await tester.pumpWidget(app(const ValueKey('player')));
    await tester.pumpAndSettle();
    final full = players.last;
    expect(identical(full, feed), isFalse);
    expect(full.seeks, contains(const Duration(seconds: 12)));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
