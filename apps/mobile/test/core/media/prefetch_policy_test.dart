import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/prefetch_policy.dart';
import 'package:lawbid/core/media/video_prefetch.dart';

/// S16-4: the reel warm-up has three states and never spends mobile data
/// in «Авто» or anything while the data saver is on.
void main() {
  test('mode words map to the three states, unknown means auto', () {
    expect(prefetchModeOf('off'), PrefetchMode.off);
    expect(prefetchModeOf('on'), PrefetchMode.on);
    expect(prefetchModeOf('auto'), PrefetchMode.auto);
    expect(prefetchModeOf('0'), PrefetchMode.auto);
    expect(prefetchModeOf('whatever'), PrefetchMode.auto);
  });

  test('auto warms on an unmetered link only', () {
    bool allow({required bool? unmetered, bool saver = false}) =>
        prefetchAllowed(
          mode: PrefetchMode.auto,
          dataSaver: saver,
          unmetered: unmetered,
        );
    expect(allow(unmetered: true), isTrue);
    expect(allow(unmetered: false), isFalse, reason: 'mobile data');
    expect(allow(unmetered: null), isFalse, reason: 'unknown link');
    expect(allow(unmetered: true, saver: true), isFalse);
  });

  test('on ignores the link but not the data saver; off is off', () {
    bool ok(PrefetchMode m, {required bool saver, required bool wifi}) =>
        prefetchAllowed(mode: m, dataSaver: saver, unmetered: wifi);
    expect(ok(PrefetchMode.on, saver: false, wifi: false), isTrue);
    expect(ok(PrefetchMode.on, saver: true, wifi: true), isFalse);
    expect(ok(PrefetchMode.off, saver: false, wifi: true), isFalse);
  });

  test('the prefetcher asks the gate before queueing', () {
    final p = HlsPrefetcher()..allow = () => false;
    // ignore: cascade_invocations
    p.prefetch('https://cdn.example/a.m3u8');
    expect(p.queued + p.running, 0);
    expect(p.warmed('https://cdn.example/a.m3u8'), isFalse);
  });
}
