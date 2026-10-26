import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/client_tuning.dart';

void main() {
  tearDown(ClientTuning.reset);

  test('starter values equal what the app did before the knobs existed', () {
    ClientTuning.reset();
    expect(ClientTuning.retryMax, 2);
    expect(ClientTuning.retryBase, const Duration(seconds: 1));
    expect(ClientTuning.retryAfterMax, const Duration(seconds: 10));
    expect(ClientTuning.reconnectMinMs, 1000);
    expect(ClientTuning.reconnectMaxMs, 10000);
    expect(ClientTuning.callSync, const Duration(seconds: 30));
    expect(ClientTuning.qrPoll, const Duration(seconds: 10));
    expect(ClientTuning.eventsFlush, const Duration(seconds: 60));
    expect(ClientTuning.eventsEnabled, isTrue);
    expect(ClientTuning.videoPrefetchAhead, 3);
    expect(ClientTuning.chatPhotoMaxPx, 1600);
    expect(ClientTuning.chatPhotoQuality, 82);
    final waits = [for (var i = 1; i <= 8; i++) ClientTuning.outboxBackoff(i)];
    expect(waits.map((d) => d.inSeconds), [1, 2, 4, 8, 16, 30, 30, 30]);
  });

  test('the server moves the numbers', () {
    ClientTuning.apply({
      'client.retry_max': '0',
      'client.realtime_reconnect_max_ms': '120000',
      'client.outbox_retry_max_s': '120',
      'client.events_enabled': 'false',
      'media.chat_photo_quality': '70',
      'client.video_prefetch_ahead': '0',
    });
    expect(ClientTuning.retryMax, 0);
    expect(ClientTuning.reconnectMaxMs, 120000);
    expect(ClientTuning.eventsEnabled, isFalse);
    expect(ClientTuning.chatPhotoQuality, 70);
    expect(ClientTuning.videoPrefetchAhead, 0);
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
      'client.realtime_reconnect_min_ms': '1',
      'client.realtime_reconnect_max_ms': 'abc',
      'media.chat_photo_max_px': '100000',
    });
    expect(ClientTuning.retryBase, const Duration(milliseconds: 200));
    expect(ClientTuning.retryMax, 4);
    expect(ClientTuning.eventsFlush, const Duration(seconds: 15));
    expect(ClientTuning.qrPoll, const Duration(seconds: 60));
    expect(ClientTuning.reconnectMinMs, 500);
    expect(ClientTuning.reconnectMaxMs, 10000);
    expect(ClientTuning.chatPhotoMaxPx, 4096);
  });
}
