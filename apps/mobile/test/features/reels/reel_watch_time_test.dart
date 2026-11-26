import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/reels/application/reel_watch_queue.dart';
import 'package:lawbid/features/reels/application/watch_time_meter.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

/// Owner 25.11 (TikTok / YouTube watch-time logging): a reel view, when it
/// ends, reports how long it really played and whether it played to the
/// end — one batched, idempotent event per view (the reels model's best
/// labels: completion > share > save > like > 3 s view).

class _FakePlayer extends VideoPlayerController {
  _FakePlayer() : super.networkUrl(Uri.parse('https://cdn.test/w.m3u8'));

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
  Future<void> setLooping(bool looping) async {}

  @override
  Future<void> setVolume(double volume) async {}

  @override
  Future<void> seekTo(Duration position) async =>
      value = value.copyWith(position: position);

  @override
  Future<Duration?> get position async => value.position;

  /// The video moved on to [at] (a frame of real playback).
  void at(Duration at) => value = value.copyWith(position: at);
}

const _video = PostVideo(
  status: 'ready',
  playbackUrl: 'https://cdn.test/w.m3u8',
  thumbnailUrl: 'https://cdn.test/cover.jpg',
  durationSec: 10,
);

void main() {
  group('WatchTimeMeter', () {
    test('adds up only the playing time; completion only while playing', () {
      var now = DateTime(2026, 11, 25, 12);
      final m = WatchTimeMeter(now: () => now)..playing(value: true);
      now = now.add(const Duration(seconds: 4));
      m.playing(value: false); // paused / buffering / covered
      now = now.add(const Duration(seconds: 30));
      m
        ..completed() // not playing: not a completion
        ..playing(value: true);
      now = now.add(const Duration(milliseconds: 1500));
      expect(m.end(), (watchedMs: 5500, completed: false));
      // A fresh view starts from zero.
      m.playing(value: true);
      now = now.add(const Duration(seconds: 2));
      m.completed();
      expect(m.end(), (watchedMs: 2000, completed: true));
      expect(m.end(), isNull); // never played: nothing to report
    });
  });

  group('ReelWatchQueue', () {
    test('one report per view, batched, each with its own view id', () {
      fakeAsync((t) {
        final sent = <List<ReelWatchReport>>[];
        var n = 0;
        final q = ReelWatchQueue(
          send: (v) async => sent.add(v),
          newId: () => 'view-${n++}',
        )
          ..ended('r1', (watchedMs: 4200, completed: false), 10000)
          ..ended('r1', (watchedMs: 9900, completed: true), 10000)
          ..ended('r2', (watchedMs: 0, completed: false), 10000);
        expect(q.pending, hasLength(2));
        t.elapse(const Duration(seconds: 5));
        expect(sent, hasLength(1));
        final json = [for (final r in sent.single) r.toJson()];
        expect(json, [
          {'p': 'r1', 'v': 'view-0', 'w': 4200, 'd': 10000, 'c': false},
          {'p': 'r1', 'v': 'view-1', 'w': 9900, 'd': 10000, 'c': true},
        ]);
      });
    });

    test('a lost answer keeps the view id; a 4xx is dropped', () {
      fakeAsync((t) {
        final ids = <String>[];
        var fail = 'network';
        final q = ReelWatchQueue(
          send: (v) async {
            ids.addAll(v.map((r) => r.viewId));
            if (fail == 'network') {
              throw DioException(requestOptions: RequestOptions());
            }
            if (fail == '404') {
              throw const ApiException(
                code: 'NOT_FOUND',
                message: 'no route',
                statusCode: 404,
              );
            }
          },
          newId: () => 'same-view',
        )..ended('r1', (watchedMs: 3000, completed: false), 0);
        t.elapse(const Duration(seconds: 5));
        expect(q.pending, isEmpty); // taken for sending
        // A failed send: the row stays on disk (no store here) — re-added
        // by the next start; the same id keeps it idempotent.
        fail = '404';
        q.ended('r2', (watchedMs: 3000, completed: true), 0);
        t.elapse(const Duration(seconds: 5));
        expect(ids, ['same-view', 'same-view']);
        expect(q.pending, isEmpty);
      });
    });

    test('a guest or an assistant sends nothing', () {
      fakeAsync((t) {
        final sent = <List<ReelWatchReport>>[];
        ReelWatchQueue(send: (v) async => sent.add(v), enabled: false)
            .ended('r1', (watchedMs: 3000, completed: true), 0);
        t.elapse(const Duration(seconds: 10));
        expect(sent, isEmpty);
      });
    });
  });

  group('ReelVideo reports a view when it ends', () {
    late _FakePlayer player;
    var now = DateTime(2026, 11, 25, 12);
    setUp(() {
      debugReelPlayerFactory = (_, __) => player = _FakePlayer();
      debugReelWatchClock = () => now;
    });
    tearDown(() {
      debugReelPlayerFactory = null;
      debugReelWatchClock = null;
    });

    testWidgets('scrolled away after the end: watched ms + completed',
        (tester) async {
      final reports = <(ReelWatchTotals, int)>[];
      var active = true;
      late StateSetter set;
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark(),
          home: StatefulBuilder(
            builder: (_, s) {
              set = s;
              return ReelVideo(
                video: _video,
                active: active,
                onWatched: (w, ms) => reports.add((w, ms)),
              );
            },
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(player.value.isPlaying, isTrue);
      player.at(const Duration(milliseconds: 100)); // first frame drawn
      await tester.pump();
      player.at(const Duration(milliseconds: 200)); // now really playing
      now = now.add(const Duration(seconds: 6));
      player.at(const Duration(milliseconds: 9900));
      now = now.add(const Duration(seconds: 2));
      player.at(const Duration(milliseconds: 300)); // looped: the end reached
      now = now.add(const Duration(seconds: 1));
      player.at(const Duration(milliseconds: 1300));
      expect(reports, isEmpty); // still the same view
      set(() => active = false);
      await tester.pump();
      expect(reports, hasLength(1));
      final (totals, clipMs) = reports.single;
      expect(totals, (watchedMs: 9000, completed: true));
      expect(clipMs, 10000);
      // Disposed afterwards: that view was already reported.
      await tester.pumpWidget(const SizedBox());
      expect(reports, hasLength(1));
    });

    testWidgets('closed while still playing, short of the end: not completed',
        (tester) async {
      final reports = <(ReelWatchTotals, int)>[];
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark(),
          home: ReelVideo(
            video: _video,
            active: true,
            onWatched: (w, ms) => reports.add((w, ms)),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      player.at(const Duration(milliseconds: 100));
      await tester.pump();
      player.at(const Duration(milliseconds: 200));
      now = now.add(const Duration(milliseconds: 3500));
      player.at(const Duration(milliseconds: 3700));
      await tester.pumpWidget(const SizedBox());
      expect(reports.single.$1, (watchedMs: 3500, completed: false));
    });
  });
}
