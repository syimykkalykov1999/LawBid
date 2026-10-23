import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/media/playback_visibility.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:video_player/video_player.dart';

/// Owner 2026-10-18: a reel / video must stop (sound too) when its screen
/// is not on screen — another bottom-nav tab, a screen pushed over it,
/// back, the app in the background — and play on when it is back. And no
/// cover flash before the video in the feed / reels.

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

class _SlowPlayer extends _FakePlayer {
  _SlowPlayer(this._gate);
  final Future<void> _gate;

  @override
  Future<void> initialize() async {
    await _gate;
    await super.initialize();
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

  testWidgets('another bottom-nav tab pauses the reel; back on it plays on',
      (tester) async {
    await _pump(tester);
    expect(_player.value.isPlaying, isTrue);

    _shell.goBranch(1);
    await tester.pumpAndSettle();
    expect(find.text('profile'), findsOneWidget);
    // The reels tab is still alive (IndexedStack) but silent.
    expect(_player.disposed, isFalse);
    expect(_player.value.isPlaying, isFalse);

    _shell.goBranch(0);
    await tester.pumpAndSettle();
    expect(_player.value.isPlaying, isTrue);
    expect(_players, hasLength(1), reason: 'the same player plays on');
  });

  testWidgets('a screen pushed over the reel pauses it; back plays on',
      (tester) async {
    final router = await _pump(tester);
    expect(_player.value.isPlaying, isTrue);

    unawaited(router.push('/reels/over'));
    await tester.pump();
    // At once, not only when the new screen has slid in.
    expect(_player.value.isPlaying, isFalse);
    await tester.pumpAndSettle();
    expect(_player.value.isPlaying, isFalse);

    router.pop();
    await tester.pumpAndSettle();
    expect(_player.value.isPlaying, isTrue);
  });

  testWidgets('the app in the background pauses the reel; back plays on',
      (tester) async {
    await _pump(tester);
    expect(_player.value.isPlaying, isTrue);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(_player.value.isPlaying, isFalse);
    tester.binding
      ..handleAppLifecycleStateChanged(AppLifecycleState.hidden)
      ..handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    expect(_player.value.isPlaying, isFalse);

    tester.binding
      ..handleAppLifecycleStateChanged(AppLifecycleState.hidden)
      ..handleAppLifecycleStateChanged(AppLifecycleState.inactive)
      ..handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(_player.value.isPlaying, isTrue);
  });

  testWidgets('back from a pushed reel screen stops and frees its player',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const ReelVideo(video: _video, active: true),
              ),
            ),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(_player.value.isPlaying, isTrue);

    tester.state<NavigatorState>(find.byType(Navigator)).pop();
    await tester.pump();
    // Silent from the first frame of the back animation…
    expect(_player.value.isPlaying, isFalse);
    await tester.pumpAndSettle();
    // …and released once gone.
    expect(_player.disposed, isTrue);
  });

  testWidgets(
      'a playable reel shows its poster at once and hands over to the '
      'video when the first frame moves', (tester) async {
    // Time to first frame, measured in pumped frames: the stream is slow
    // (initialize never completes), yet the poster is already on screen in
    // the very first frame — no black box, no spinner before 1.2 s.
    final gate = Completer<void>();
    debugReelPlayerFactory = (_, __) {
      final p = _SlowPlayer(gate.future);
      _players.add(p);
      return p;
    };
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: const ReelVideo(video: _video, active: true),
      ),
    );
    expect(find.byKey(const ValueKey('reel-poster')), findsOneWidget);
    expect(find.byType(VideoPlayer), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    gate.complete();
    await tester.pump();
    await tester.pump();
    // Initialized and playing, but not moved yet: the poster still covers.
    expect(find.byType(VideoPlayer), findsOneWidget);
    expect(find.byKey(const ValueKey('reel-poster')), findsOneWidget);

    // The first frame moves: the poster leaves.
    _player.value = _player.value.copyWith(
      position: const Duration(milliseconds: 80),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('reel-poster')), findsNothing);
    expect(find.byType(VideoPlayer), findsOneWidget);
  });

  testWidgets('a video the viewer paused stays paused after coming back',
      (tester) async {
    final c = _FakePlayer();
    await c.initialize();
    await tester.pumpWidget(
      MaterialApp(home: _HoldProbe(controller: c)),
    );
    await c.play();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(c.value.isPlaying, isFalse);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(c.value.isPlaying, isTrue, reason: 'it was playing: plays on');

    await c.pause(); // the viewer's pause
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(c.value.isPlaying, isFalse);
  });
}

class _HoldProbe extends StatefulWidget {
  const _HoldProbe({required this.controller});

  final VideoPlayerController controller;

  @override
  State<_HoldProbe> createState() => _HoldProbeState();
}

class _HoldProbeState extends State<_HoldProbe> with PlaybackVisibility {
  @override
  void didChangePlaybackVisibility({required bool visible}) =>
      holdPlayback(widget.controller, visible: visible);

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
