import 'dart:isolate';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/video_cache/video_cache.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_video.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

class _FakePlayer extends VideoPlayerController {
  _FakePlayer(super.uri) : super.networkUrl();

  @override
  Future<void> initialize() async {
    value = value.copyWith(
      isInitialized: true,
      duration: const Duration(seconds: 10),
      size: const Size(720, 1280),
    );
  }

  @override
  Future<void> play() async => value = value.copyWith(isPlaying: true);

  @override
  Future<void> pause() async => value = value.copyWith(isPlaying: false);

  @override
  Future<void> setVolume(double volume) async {}

  @override
  Future<void> seekTo(Duration position) async =>
      value = value.copyWith(position: position);
}

/// Owner 24.11 (works check row 76): a video story plays through the same
/// video disk cache as reels, so the bytes warmed for the next stories are
/// read from the phone (before, the player asked the CDN again).
void main() {
  final opened = <Uri>[];
  late ReceivePort port;
  setUp(() {
    opened.clear();
    port = ReceivePort();
    VideoCache.debugAttach(port.sendPort, sentMaxBytes: 100 << 20);
    debugStoryPlayerFactory = (uri) {
      opened.add(uri);
      return _FakePlayer(uri);
    };
  });
  tearDown(() {
    debugStoryPlayerFactory = null;
    VideoCache.debugReset();
    port.close();
  });

  testWidgets('the story player opens the cached URL, like a reel',
      (tester) async {
    const url = 'https://cdn.test/story/playlist.m3u8';
    await tester.pumpWidget(
      MaterialApp(
        home: StoryVideoPlayer(
          video: const StoryVideo(ready: true, playbackUrl: url),
          paused: false,
          onProgress: (_) {},
          onEnded: () {},
          onFailed: () {},
        ),
      ),
    );
    await tester.pump();
    expect(opened, hasLength(1));
    expect(opened.single.toString(), VideoCache.resolve(url, feed: true));
    expect(opened.single.host, isNot('cdn.test'));
  });
}
