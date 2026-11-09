import 'dart:async';
import 'dart:math' as math;

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/transfers/adaptive_limiter.dart';

void main() {
  group('AdaptiveLimiter', () {
    test('never more than the limit at once, and the limit is reached',
        () async {
      final l = AdaptiveLimiter(() => 3);
      var now = 0;
      var most = 0;
      await Future.wait([
        for (var i = 0; i < 12; i++)
          l.run(() async {
            most = math.max(most, ++now);
            await Future<void>.delayed(const Duration(milliseconds: 2));
            now--;
          }),
      ]);
      expect(most, 3);
      expect(l.active, 0);
    });

    test('a failed task frees its place', () async {
      final l = AdaptiveLimiter(() => 1);
      await expectLater(
        l.run<void>(() async => throw StateError('x')),
        throwsStateError,
      );
      expect(await l.run(() async => 7), 7);
    });

    test('a failure holds new work, drops to one, then climbs back', () {
      fakeAsync((clock) {
        final l = AdaptiveLimiter(() => 8)
          ..rateLimit(const Duration(seconds: 1));
        expect(l.limit, 1);
        expect(l.isPaused, isTrue);
        var started = false;
        unawaited(
          l.run(() async {
            started = true;
          }),
        );
        clock.elapse(const Duration(milliseconds: 900));
        expect(started, isFalse, reason: 'held while paused');
        clock.elapse(const Duration(milliseconds: 200));
        expect(started, isTrue);
        expect(l.limit, greaterThan(1));
        expect(l.limit, lessThan(8));
      });
    });

    test('the next file starts at the full limit, the admin number included',
        () {
      fakeAsync((clock) {
        var max = 4;
        final l = AdaptiveLimiter(() => max)..rateLimit(Duration.zero);
        clock.elapse(const Duration(seconds: 5));
        expect(l.limit, lessThan(4));
        max = 2;
        l.restoreIfIdle();
        expect(l.limit, 2);
        expect(l.isPaused, isFalse);
      });
    });

    test('restoreIfIdle leaves a running transfer alone', () async {
      final l = AdaptiveLimiter(() => 4);
      final gate = Completer<void>();
      final run = l.run(() => gate.future);
      l
        ..limit = 1
        ..restoreIfIdle();
      expect(l.limit, 1);
      gate.complete();
      await run;
    });

    test('the limit never reaches zero, however many failures', () {
      fakeAsync((clock) {
        final l = AdaptiveLimiter(() => 4);
        for (var i = 0; i < 6; i++) {
          l.rateLimit(const Duration(milliseconds: 10));
          clock.elapse(const Duration(seconds: 3));
          expect(l.limit, greaterThanOrEqualTo(1));
        }
      });
    });
  });

  // Owner 2026-11-09: how many parts at once is not a fixed four. It starts
  // at four, climbs while the total speed keeps growing (up to the admin
  // ceiling, 8), and a failure drops it to the floor (2).
  group('ThroughputClimb', () {
    const part = 1000000;

    /// Runs [rounds] rounds; [roundSeconds] says how long a round of n parts
    /// at once takes on the simulated link. Returns the limits seen.
    List<int> drive(
      AdaptiveLimiter l,
      double Function(int n) roundSeconds, {
      int rounds = 12,
    }) {
      var t = DateTime(2026, 11, 9);
      final climb = ThroughputClimb(l, now: () => t);
      final seen = <int>[];
      for (var r = 0; r < rounds; r++) {
        final n = l.limit;
        seen.add(n);
        for (var i = 0; i < n; i++) {
          climb.started();
        }
        t = t.add(
          Duration(microseconds: (roundSeconds(n) * 1e6).round()),
        );
        for (var i = 0; i < n; i++) {
          climb.finished(part);
        }
      }
      return seen;
    }

    AdaptiveLimiter limiter() =>
        AdaptiveLimiter(() => 8, start: () => 4, floor: () => 2);

    test('a fast link (more at once = more speed) climbs from 4 to 8', () {
      final l = limiter();
      final seen = drive(l, (n) => 1.0);
      expect(seen.first, 4);
      expect(l.limit, 8);
      expect(seen.reduce(math.max), 8, reason: 'never past the ceiling');
    });

    test('a full link (same speed at any number) stays at the start', () {
      final l = limiter();
      final seen = drive(l, (n) => n.toDouble());
      expect(seen.first, 4);
      expect(l.limit, 4, reason: 'the extra part gave nothing: back to 4');
      expect(seen.reduce(math.max), lessThanOrEqualTo(5));
    });

    test('a failing link drops to the floor of two, never under it', () {
      fakeAsync((clock) {
        final l = limiter();
        for (var i = 0; i < 5; i++) {
          l.rateLimit(const Duration(milliseconds: 10));
          expect(l.limit, 2);
          clock.elapse(const Duration(milliseconds: 20));
          expect(l.limit, greaterThanOrEqualTo(2));
        }
      });
    });

    test('no climbing while a failure is being waited out', () {
      fakeAsync((clock) {
        final l = limiter()..rateLimit(const Duration(seconds: 1));
        expect(l.raise(), isFalse);
        expect(l.limit, 2);
      });
    });
  });

  group('mapAtOnce', () {
    test('keeps the order of the items, whatever finishes first', () async {
      final out = await mapAtOnce([3, 1, 2], 3, (n) async {
        await Future<void>.delayed(Duration(milliseconds: n * 3));
        return n * 10;
      });
      expect(out, [30, 10, 20]);
    });

    test('with 1 it is a plain loop', () async {
      final seen = <int>[];
      var now = 0;
      await mapAtOnce([1, 2, 3], 1, (n) async {
        expect(++now, 1);
        seen.add(n);
        await Future<void>.delayed(Duration.zero);
        now--;
      });
      expect(seen, [1, 2, 3]);
    });

    test('the first failure stops new work and reaches the caller', () async {
      final seen = <int>[];
      await expectLater(
        mapAtOnce([1, 2, 3, 4], 1, (n) async {
          seen.add(n);
          if (n == 2) throw StateError('no');
        }),
        throwsStateError,
      );
      expect(seen, [1, 2]);
    });
  });

  group('uploadThenSendInOrder (several files of a group chat)', () {
    test('together: uploads overlap up to the limit, messages keep the order',
        () async {
      var now = 0;
      var most = 0;
      final sent = <String>[];
      await uploadThenSendInOrder<String, String>(
        items: ['slow', 'mid', 'fast', 'last'],
        atOnce: 3,
        upload: (f) async {
          most = math.max(most, ++now);
          await Future<void>.delayed(
            Duration(milliseconds: f == 'slow' ? 20 : 2),
          );
          now--;
          return 'id-$f';
        },
        send: (i, f, id) async => sent.add('$i:$id'),
      );
      expect(most, 3);
      expect(sent, ['0:id-slow', '1:id-mid', '2:id-fast', '3:id-last']);
    });

    test('together: a failed file sends nothing, a retry cannot double',
        () async {
      final sent = <String>[];
      await expectLater(
        uploadThenSendInOrder<String, String>(
          items: ['a', 'bad', 'c'],
          atOnce: 3,
          upload: (f) async => f == 'bad' ? throw StateError('no') : f,
          send: (i, f, id) async => sent.add(id),
        ),
        throwsStateError,
      );
      expect(sent, isEmpty);
    });

    test('flag off (1): file, message, file, message, as before', () async {
      final steps = <String>[];
      await uploadThenSendInOrder<String, String>(
        items: ['a', 'b'],
        atOnce: 1,
        upload: (f) async {
          steps.add('up $f');
          return f;
        },
        send: (i, f, id) async => steps.add('send $f'),
      );
      expect(steps, ['up a', 'send a', 'up b', 'send b']);
    });

    test('one file never waits for a second round', () async {
      final steps = <String>[];
      await uploadThenSendInOrder<String, String>(
        items: ['a'],
        atOnce: 4,
        upload: (f) async {
          steps.add('up');
          return f;
        },
        send: (i, f, id) async => steps.add('send'),
      );
      expect(steps, ['up', 'send']);
    });

    test('the screen closed: no further message', () async {
      var open = true;
      final sent = <String>[];
      await uploadThenSendInOrder<String, String>(
        items: ['a', 'b'],
        atOnce: 2,
        upload: (f) async => f,
        alive: () => open,
        send: (i, f, id) async {
          sent.add(f);
          open = false;
        },
      );
      expect(sent, ['a']);
    });
  });

  group('ClientTuning limits', () {
    tearDown(ClientTuning.reset);

    test('admin numbers are clamped to 1…4; 4 by default', () {
      ClientTuning.reset();
      expect(ClientTuning.uploadsAtOnce, 4);
      expect(ClientTuning.downloadsAtOnce, 4);
      ClientTuning.apply(const {
        'client.uploads_at_once': '99',
        'client.downloads_at_once': '0',
      });
      expect(ClientTuning.uploadsAtOnce, 4);
      expect(ClientTuning.downloadsAtOnce, 1);
    });

    test('parts at once: start 4, ceiling 8, floor 2 by default (auto)', () {
      ClientTuning.reset();
      expect(ClientTuning.uploadPartsStart, 4);
      expect(ClientTuning.uploadPartsCeiling, 8);
      expect(ClientTuning.uploadPartsFloor, 2);
      ClientTuning.apply(const {
        'client.upload_parts_max': '99',
        'client.upload_parts_min': '0',
      });
      expect(ClientTuning.uploadPartsCeiling, 16);
      expect(ClientTuning.uploadPartsFloor, 1);
      ClientTuning.apply(const {'client.upload_parts_mode': 'fixed'});
      expect(ClientTuning.uploadPartsCeiling, 4, reason: 'fixed, as before');
      expect(ClientTuning.uploadPartsFloor, 1);
    });

    test('mobile data keeps the parts to two at most', () {
      ClientTuning.reset();
      ClientTuning.metered = true;
      expect(ClientTuning.uploadPartsCeiling, 2);
      expect(ClientTuning.uploadPartsStart, 2);
      expect(ClientTuning.uploadPartsFloor, 2);
    });

    test('mobile data and a weak phone keep to two', () {
      ClientTuning.reset();
      ClientTuning.metered = true;
      expect(ClientTuning.uploadsAtOnce, 2);
      ClientTuning.metered = false;
      ClientTuning.weakDevice = true;
      expect(ClientTuning.downloadsAtOnce, 2);
      ClientTuning.weakDevice = false;
      ClientTuning.lowPower = true;
      expect(ClientTuning.uploadsAtOnce, 2);
      expect(ClientTuning.downloadsAtOnce, 2);
    });

    test('with the flags off, one stream and one block as before', () {
      ClientTuning.reset();
      expect(ClientTuning.downloadPieces, 1);
      expect(ClientTuning.videoBlocksAtOnce, 1);
      ClientTuning.downloadsParallel = true;
      ClientTuning.videoCacheParallel = true;
      expect(ClientTuning.downloadPieces, 4);
      expect(ClientTuning.videoBlocksAtOnce, 4);
    });
  });
}
