import 'package:flutter_test/flutter_test.dart';

import '../integration_test/perf/perf_report.dart';

void main() {
  test('frame statistics use the slower thread of every frame', () {
    final s = FrameStats(
      build: [2, 3, 40, 5],
      raster: [4, 20, 3, 5],
      displayBudgetMs: 16.67,
    ).toJson();
    expect(s['frames'], 4);
    expect(s['over_33_pct'], 25.0);
    expect(s['over_16_7_pct'], 50.0);
    expect(s['missed_display_budget'], 2);
  });

  PerfResult result({required double hz, required double p99}) => PerfResult(
        device: {'refresh_rate_hz': hz},
        coldStart: {'lb.first_frame': 900, 'lb.first_feed_frame': 1800},
        scenarios: {
          'feed_scroll': {
            'worst_p90_ms': 6.0,
            'worst_p99_ms': p99,
            'over_33_pct': 0.0,
          },
        },
        latency: {
          'tab_switch_search': [80, 90, 100],
        },
        memory: [
          {'at': 'a', 'rss_mb': 400.0, 'heap_mb': 50.0},
          {'at': 'b', 'rss_mb': 430.0, 'heap_mb': 52.0},
        ],
        video: {
          'reels': [200, 300, 400],
        },
      );

  test('a healthy run passes every budget', () {
    final r = result(hz: 120, p99: 12);
    expect(r.evaluate().every((c) => c.ok), isTrue);
    expect(r.toJson()['passed'], isTrue);
    expect(r.toMarkdown(), contains('PASS'));
  });

  test('a slow 99th percentile fails, the display decides the limit', () {
    expect(result(hz: 60, p99: 17).toJson()['passed'], isFalse);
    expect(result(hz: 120, p99: 17).toJson()['passed'], isFalse);
    expect(result(hz: 60, p99: 15).toJson()['passed'], isTrue);
  });

  test('memory growth over 20 percent fails', () {
    final r = PerfResult(
      device: const {'refresh_rate_hz': 60},
      coldStart: const {},
      scenarios: const {},
      latency: const {},
      memory: [
        {'at': 'a', 'rss_mb': 400.0},
        {'at': 'b', 'rss_mb': 500.0},
      ],
      video: const {},
    );
    expect(r.evaluate().any((c) => !c.ok), isTrue);
  });
}
