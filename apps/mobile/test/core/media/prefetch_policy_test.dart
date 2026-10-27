import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/prefetch_policy.dart';
import 'package:lawbid/core/media/video_prefetch.dart';

/// S16-4 / S20-9: the reel warm-up has one gate: data saver off and the
/// server-controlled number of reels ahead above 0.
void main() {
  test('warms only with the data saver off and a server number above 0', () {
    expect(prefetchAllowed(dataSaver: false, ahead: 3), isTrue);
    expect(prefetchAllowed(dataSaver: true, ahead: 3), isFalse);
    expect(prefetchAllowed(dataSaver: false, ahead: 0), isFalse);
    expect(prefetchAllowed(dataSaver: true, ahead: 0), isFalse);
  });

  test('the prefetcher asks the gate before queueing', () {
    final p = HlsPrefetcher()..allow = () => false;
    // ignore: cascade_invocations
    p.prefetch('https://cdn.example/a.m3u8');
    expect(p.queued + p.running, 0);
    expect(p.warmed('https://cdn.example/a.m3u8'), isFalse);
  });
}
