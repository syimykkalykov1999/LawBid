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

    test('mobile data and a weak phone keep to two', () {
      ClientTuning.reset();
      ClientTuning.metered = true;
      expect(ClientTuning.uploadsAtOnce, 2);
      ClientTuning.metered = false;
      ClientTuning.weakDevice = true;
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
