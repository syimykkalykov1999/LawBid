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
    });
    expect(ClientTuning.retryMax, 0);
    expect(ClientTuning.eventsEnabled, isFalse);
    expect(ClientTuning.chatPhotoQuality, 70);
    expect(ClientTuning.videoPrefetchAhead, 0);
    expect(ClientTuning.outboxBackoff(9).inSeconds, 120);
  });

  test('the reel warm-up switch is a word: off | on | auto', () {
    expect(ClientTuning.videoPrefetchMode, 'auto');
    ClientTuning.apply({'client.video_prefetch_mode': 'off'});
    expect(ClientTuning.videoPrefetchMode, 'off');
    ClientTuning.apply({'client.video_prefetch_mode': 'On'});
    expect(ClientTuning.videoPrefetchMode, 'on');
    ClientTuning.apply({'client.video_prefetch_mode': '2'});
    expect(ClientTuning.videoPrefetchMode, 'auto');
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
}
