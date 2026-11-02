import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/client_tuning.dart';

void main() {
  tearDown(ClientTuning.reset);

  test('starter values equal what the app did before the knobs existed', () {
    ClientTuning.reset();
    expect(ClientTuning.retryMax, 2);
    expect(ClientTuning.retryBase, const Duration(seconds: 1));
    expect(ClientTuning.retryAfterMax, const Duration(seconds: 10));
    expect(ClientTuning.callSync, const Duration(seconds: 30));
    expect(ClientTuning.qrPoll, const Duration(seconds: 10));
    expect(ClientTuning.eventsFlush, const Duration(seconds: 60));
    expect(ClientTuning.eventsEnabled, isTrue);
    expect(ClientTuning.videoPrefetchAhead, 3);
    expect(ClientTuning.chatPhotoMaxPx, 1600);
    expect(ClientTuning.chatPhotoQuality, 82);
    expect(ClientTuning.sentryTracesPercent, 0);
    expect(ClientTuning.traceparentPercent, 5);
    final waits = [for (var i = 1; i <= 8; i++) ClientTuning.outboxBackoff(i)];
    expect(waits.map((d) => d.inSeconds), [1, 2, 4, 8, 16, 30, 30, 30]);
  });

  test('the server moves the numbers', () {
    ClientTuning.apply({
      'client.retry_max': '0',
      'client.outbox_retry_max_s': '120',
      'client.events_enabled': 'false',
      'media.chat_photo_quality': '70',
      'client.video_prefetch_ahead': '0',
      'client.sentry_traces_percent': '0',
      'client.traceparent_percent': '250',
    });
    expect(ClientTuning.retryMax, 0);
    expect(ClientTuning.eventsEnabled, isFalse);
    expect(ClientTuning.chatPhotoQuality, 70);
    expect(ClientTuning.videoPrefetchAhead, 0);
    expect(ClientTuning.sentryTracesPercent, 0);
    expect(ClientTuning.traceparentPercent, 100);
    expect(ClientTuning.outboxBackoff(9).inSeconds, 120);
  });

  test('on mobile data the app warms up fewer reels (S20-9)', () {
    ClientTuning.apply({
      'client.video_prefetch_ahead': '3',
      'client.video_prefetch_cellular': '1',
    });
    ClientTuning.metered = false;
    expect(ClientTuning.videoPrefetchAhead, 3);
    ClientTuning.metered = true;
    expect(ClientTuning.videoPrefetchAhead, 1);
    // The server sends 0/0 while Bunny traffic is over its warning level.
    ClientTuning.apply({
      'client.video_prefetch_ahead': '0',
      'client.video_prefetch_cellular': '0',
    });
    expect(ClientTuning.videoPrefetchAhead, 0);
    ClientTuning.metered = false;
    expect(ClientTuning.videoPrefetchAhead, 0);
  });

  test('a wrong value can neither silence nor hammer the app', () {
    ClientTuning.apply({
      'client.retry_base_ms': '0',
      'client.retry_max': '999',
      'client.events_flush_s': '1',
      'client.qr_poll_s': '86400',
      'media.chat_photo_max_px': '100000',
    });
    expect(ClientTuning.retryBase, const Duration(milliseconds: 200));
    expect(ClientTuning.retryMax, 4);
    expect(ClientTuning.eventsFlush, const Duration(seconds: 15));
    expect(ClientTuning.qrPoll, const Duration(seconds: 60));
    expect(ClientTuning.chatPhotoMaxPx, 4096);
  });

  test(
      'outboxDelay: jitter, and Retry-After as a jittered floor',
      () {
    ClientTuning.reset();
    for (var seed = 0; seed < 20; seed++) {
      final d = ClientTuning.outboxDelay(3, random: Random(seed));
      expect(d, greaterThanOrEqualTo(const Duration(seconds: 4)));
      expect(d, lessThanOrEqualTo(const Duration(milliseconds: 5200)));
      // Told 12 s: never earlier, spread over the next 30%.
      final asked = ClientTuning.outboxDelay(
        1,
        retryAfter: const Duration(seconds: 12),
        random: Random(seed),
      );
      expect(asked, greaterThanOrEqualTo(const Duration(seconds: 12)));
      expect(asked, lessThanOrEqualTo(const Duration(milliseconds: 15600)));
    }
    // Clients told the same number do not return at the same instant.
    final spread = {
      for (var seed = 0; seed < 20; seed++)
        ClientTuning.outboxDelay(
          1,
          retryAfter: const Duration(seconds: 5),
          random: Random(seed),
        ),
    };
    expect(spread.length, greaterThan(10));
    // A huge ask is honoured up to the queue's own ceiling (2 min), not
    // cut to the 30 s of our own backoff.
    final big = ClientTuning.outboxDelay(
      1,
      retryAfter: const Duration(minutes: 30),
      random: Random(1),
    );
    expect(big, greaterThanOrEqualTo(ClientTuning.queueRetryAfterMax));
    expect(
      big,
      lessThanOrEqualTo(ClientTuning.queueRetryAfterMax * 1.3),
    );
    // A shorter ask than our own wait does not shorten it.
    expect(
      ClientTuning.outboxDelay(
        4,
        retryAfter: const Duration(seconds: 1),
        random: Random(1),
      ),
      greaterThanOrEqualTo(const Duration(seconds: 8)),
    );
  });

  test('outboxDelay at the ceiling still spreads (jitter goes downwards)', () {
    ClientTuning.reset();
    final seen = <Duration>{};
    for (var seed = 0; seed < 50; seed++) {
      final d = ClientTuning.outboxDelay(10, random: Random(seed));
      expect(d, lessThanOrEqualTo(const Duration(seconds: 30)));
      expect(d, greaterThanOrEqualTo(const Duration(seconds: 21)));
      seen.add(d);
    }
    expect(seen.length, greaterThan(20));
  });

  test('parseRetryAfter: seconds only, first header wins, huge is clamped', () {
    expect(ClientTuning.parseRetryAfter(['7']), const Duration(seconds: 7));
    expect(ClientTuning.parseRetryAfter([' 3 ']), const Duration(seconds: 3));
    // Two headers (a proxy added one): no throw, the first counts.
    expect(
      ClientTuning.parseRetryAfter(['5', '9']),
      const Duration(seconds: 5),
    );
    expect(
      ClientTuning.parseRetryAfter(['Wed, 21 Oct 2026 07:28:00 GMT']),
      isNull,
    );
    expect(ClientTuning.parseRetryAfter(['-1']), isNull);
    expect(ClientTuning.parseRetryAfter(const []), isNull);
    expect(ClientTuning.parseRetryAfter(null), isNull);
    expect(
      ClientTuning.parseRetryAfter(['99999999999999999']),
      const Duration(days: 1),
    );
  });
}
