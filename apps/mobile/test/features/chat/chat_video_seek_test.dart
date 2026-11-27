import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/presentation/chat_video.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import '../../helpers/overflow_harness.dart';

/// Owner 26.11 (Samsung S26 Ultra): «тянешь, и он обрывается в любую
/// сторону». A player for widget tests: a 56 s video that remembers every
/// seek and every play / pause.
class _FakePlayer extends VideoPlayerPlatform {
  final seeks = <Duration>[];
  int plays = 0;
  int pauses = 0;
  Duration _at = Duration.zero;
  final _events = <int, StreamController<VideoEvent>>{};
  int _next = 0;

  @override
  Future<void> init() async {}

  @override
  Future<int?> createWithOptions(VideoCreationOptions options) async {
    final id = ++_next;
    final events = _events[id] = StreamController<VideoEvent>();
    scheduleMicrotask(
      () => events.add(
        VideoEvent(
          eventType: VideoEventType.initialized,
          duration: const Duration(seconds: 56),
          size: const Size(1280, 720),
        ),
      ),
    );
    return id;
  }

  @override
  Stream<VideoEvent> videoEventsFor(int playerId) => _events[playerId]!.stream;

  @override
  Future<void> dispose(int playerId) async => _events.remove(playerId)?.close();

  @override
  Future<void> setLooping(int playerId, bool looping) async {}

  @override
  Future<void> play(int playerId) async => plays++;

  @override
  Future<void> pause(int playerId) async => pauses++;

  @override
  Future<void> setVolume(int playerId, double volume) async {}

  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}

  @override
  Future<void> setMixWithOthers(bool mixWithOthers) async {}

  @override
  Future<void> seekTo(int playerId, Duration position) async {
    seeks.add(position);
    _at = position;
  }

  @override
  Future<Duration> getPosition(int playerId) async => _at;

  @override
  Widget buildViewWithOptions(VideoViewOptions options) => const SizedBox();
}

void main() {
  late _FakePlayer player;

  setUp(() {
    player = _FakePlayer();
    VideoPlayerPlatform.instance = player;
  });

  Slider slider(WidgetTester tester) =>
      tester.widget<Slider>(find.byType(Slider));

  /// The screen open and playing, its controls shown.
  Future<void> open(WidgetTester tester) async {
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.byType(Slider), findsOneWidget);
  }

  /// Track ends: the slider keeps its overlay radius (14) on each side.
  ({Offset start, double width}) track(WidgetTester tester) {
    final r = tester.getRect(find.byType(Slider));
    return (start: Offset(r.left + 14, r.center.dy), width: r.width - 28);
  }

  Future<void> run(
    WidgetTester tester,
    Future<void> Function(WidgetTester) act,
  ) =>
      pumpOverflowApp(
        tester,
        const ChatVideoScreen(url: 'https://example.test/v.mp4'),
        t: const StaticTranslatorEn(),
        dir: TextDirection.ltr,
        scale: 1,
        act: (tester) async {
          await open(tester);
          await act(tester);
        },
      );

  testWidgets(
      'a finger that rests on the thumb, then drags: the thumb and the clock '
      'follow it, the player seeks once on release and plays on',
      (tester) async {
    await run(tester, (tester) async {
      final tr = track(tester);
      final g = await tester.startGesture(tr.start);
      // A person lands on the thumb and holds it a moment before moving
      // (longer than a long press).
      await tester.pump(const Duration(milliseconds: 700));
      for (var i = 0; i < 10; i++) {
        await g.moveBy(Offset(tr.width / 20, 0));
        await tester.pump(const Duration(milliseconds: 16));
      }
      final half = slider(tester).max / 2;
      expect(slider(tester).value, closeTo(half, half * 0.05));
      expect(
        find.text(
          voiceClock(Duration(milliseconds: slider(tester).value.round())),
        ),
        findsOneWidget,
      );
      // While the finger is down: no seeks (the decoder is not flooded).
      expect(player.seeks, isEmpty);
      final playsBefore = player.plays;
      await g.up();
      await tester.pump(const Duration(milliseconds: 300));
      expect(player.seeks, hasLength(1));
      expect(
        player.seeks.single.inMilliseconds,
        closeTo(28000, 28000 * 0.05),
      );
      // The thumb stays where it was let go (no jump back).
      expect(slider(tester).value, closeTo(half, half * 0.05));
      // It was playing: it plays on from there.
      expect(player.plays, greaterThan(playsBefore));
    });
  });

  testWidgets(
      'a drag that starts a little downward still scrubs; the screen does '
      'not slide down or close', (tester) async {
    await run(tester, (tester) async {
      final tr = track(tester);
      final g = await tester.startGesture(tr.start);
      await g.moveBy(const Offset(3, 12));
      await tester.pump(const Duration(milliseconds: 16));
      await g.moveBy(const Offset(3, 12));
      await tester.pump(const Duration(milliseconds: 16));
      for (var i = 0; i < 10; i++) {
        await g.moveBy(Offset(tr.width / 20, 0));
        await tester.pump(const Duration(milliseconds: 16));
      }
      final half = slider(tester).max / 2;
      // The finger went 6 px right on its way down, then half the track.
      final at = half + 6 / tr.width * slider(tester).max;
      expect(slider(tester).value, closeTo(at, half * 0.05));
      expect(player.seeks, isEmpty);
      await g.up();
      await tester.pump(const Duration(milliseconds: 300));
      expect(player.seeks, hasLength(1));
      expect(find.byType(ChatVideoScreen), findsOneWidget);
      final shift = tester.widgetList<Transform>(
        find.descendant(
          of: find.byType(ChatVideoScreen),
          matching: find.byType(Transform),
        ),
      );
      for (final t in shift) {
        expect(t.transform.getTranslation().y, 0);
      }
    });
  });

  testWidgets('a tap on the bar seeks there once', (tester) async {
    await run(tester, (tester) async {
      final tr = track(tester);
      await tester.tapAt(tr.start + Offset(tr.width * 0.75, 0));
      await tester.pump(const Duration(milliseconds: 300));
      expect(player.seeks, hasLength(1));
      expect(
        player.seeks.single.inMilliseconds,
        closeTo(42000, 42000 * 0.1),
      );
    });
  });
}
