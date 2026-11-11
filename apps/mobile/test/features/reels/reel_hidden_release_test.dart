import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:video_player/video_player.dart';

/// App audit 2026-10-26 C16 (Instagram): a reel whose tab is hidden (another
/// bottom-nav tab, the app in the background) gives its video decoder back
/// after a short while instead of holding it paused; back on screen it opens
/// again at the same spot and plays on. A quick look elsewhere keeps the
/// player (reel_video_visibility_test).

/// A player with no platform behind it: records play / pause / dispose.
class _FakePlayer extends VideoPlayerController {
  _FakePlayer() : super.networkUrl(Uri.parse('https://cdn.test/v.m3u8'));

  int plays = 0;
  bool disposed = false;

  @override
  Future<void> initialize() async {
    value = value.copyWith(
      isInitialized: true,
      duration: const Duration(seconds: 30),
      size: const Size(720, 1280),
    );
  }

  @override
  Future<void> play() async {
    plays++;
    value = value.copyWith(isPlaying: true);
  }

  @override
  Future<void> pause() async {
    value = value.copyWith(isPlaying: false);
  }

  @override
  Future<void> setLooping(bool looping) async {
    value = value.copyWith(isLooping: looping);
  }

  @override
  Future<void> setVolume(double volume) async {
    value = value.copyWith(volume: volume);
  }

  @override
  Future<void> seekTo(Duration position) async {
    value = value.copyWith(position: position);
  }

  @override
  Future<Duration?> get position async => value.position;

  @override
  Future<void> dispose() async {
    disposed = true;
    await super.dispose();
  }
}

const _video = PostVideo(
  status: 'ready',
  playbackUrl: 'https://cdn.test/v.m3u8',
  thumbnailUrl: 'https://cdn.test/cover.jpg',
  durationSec: 30,
);

late StatefulNavigationShell _shell;
final _players = <_FakePlayer>[];

_FakePlayer get _player => _players.last;

GoRouter _router() => GoRouter(
      initialLocation: '/reels',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (_, __, shell) {
            _shell = shell;
            return Scaffold(body: shell);
          },
          branches: [
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/reels',
                  builder: (_, __) =>
                      const ReelVideo(video: _video, active: true),
                  routes: [
                    GoRoute(
                      path: 'over',
                      builder: (_, __) =>
                          const Scaffold(body: Text('over the reel')),
                    ),
                  ],
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/profile',
                  builder: (_, __) => const Scaffold(body: Text('profile')),
                ),
              ],
            ),
          ],
        ),
      ],
    );

Future<GoRouter> _pump(WidgetTester tester) async {
  final router = _router();
  await tester.pumpWidget(
    MaterialApp.router(theme: AppTheme.dark(), routerConfig: router),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  setUp(() {
    _players.clear();
    debugReelPlayerFactory = (_, __) {
      final p = _FakePlayer();
      _players.add(p);
      return p;
    };
  });
  tearDown(() => debugReelPlayerFactory = null);

  testWidgets('another tab for a while frees the player; back it plays on',
      (tester) async {
    await _pump(tester);
    final first = _player;
    expect(first.value.isPlaying, isTrue);
    first.value = first.value.copyWith(position: const Duration(seconds: 7));

    _shell.goBranch(1);
    await tester.pumpAndSettle();
    expect(first.disposed, isFalse, reason: 'not at once');
    await tester.pump(kReelReleaseWhenHidden + const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 300));
    expect(first.disposed, isTrue, reason: 'the decoder is given back');

    _shell.goBranch(0);
    await tester.pumpAndSettle();
    expect(_players, hasLength(2));
    expect(_player.value.isPlaying, isTrue);
    expect(_player.value.position, const Duration(seconds: 7));
  });

  testWidgets('the app in the background for a while frees the player',
      (tester) async {
    await _pump(tester);
    final first = _player;
    tester.binding
      ..handleAppLifecycleStateChanged(AppLifecycleState.inactive)
      ..handleAppLifecycleStateChanged(AppLifecycleState.hidden)
      ..handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(kReelReleaseWhenHidden + const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 300));
    expect(first.disposed, isTrue);

    tester.binding
      ..handleAppLifecycleStateChanged(AppLifecycleState.hidden)
      ..handleAppLifecycleStateChanged(AppLifecycleState.inactive)
      ..handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(_players, hasLength(2));
    expect(_player.value.isPlaying, isTrue);
  });

  testWidgets('a short look away (inactive) keeps the same player',
      (tester) async {
    await _pump(tester);
    final first = _player;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump(kReelReleaseWhenHidden + const Duration(seconds: 1));
    expect(first.disposed, isFalse);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(_players, hasLength(1));
    expect(first.value.isPlaying, isTrue);
  });
}
