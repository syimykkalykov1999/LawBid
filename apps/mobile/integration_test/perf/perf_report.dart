// Pure Dart (no Flutter imports): the numbers of the on-device performance
// suite, their budgets and the Markdown report. Used by the suite on the
// phone, by the host driver and by test/perf_report_test.dart.
//
// Budgets: see docs/perf/APP_DEVICE_PERF.md (sources and assumptions).
import 'dart:convert';
import 'dart:math' as math;

/// One list of frame timings, in milliseconds.
class FrameStats {
  FrameStats({
    required this.build,
    required this.raster,
    required this.displayBudgetMs,
  });

  /// Per frame, in order of arrival.
  final List<double> build;
  final List<double> raster;

  /// 1000 / refresh rate of the display (16.67 at 60 Hz, 8.33 at 120 Hz).
  final double displayBudgetMs;

  int get frames => build.length;

  /// A frame is as slow as its slower thread.
  List<double> get worst => [
        for (var i = 0; i < build.length; i++) math.max(build[i], raster[i]),
      ];

  static double percentile(List<double> values, double p) {
    if (values.isEmpty) return 0;
    final sorted = [...values]..sort();
    return sorted[((sorted.length - 1) * p).round()];
  }

  static double average(List<double> v) =>
      v.isEmpty ? 0 : v.reduce((a, b) => a + b) / v.length;

  static double _r(double v) => double.parse(v.toStringAsFixed(2));

  double _pctOver(double limit) {
    if (frames == 0) return 0;
    final w = worst;
    return _r(100 * w.where((v) => v > limit).length / frames);
  }

  Map<String, Object> toJson() {
    final w = worst;
    return {
      'frames': frames,
      'display_budget_ms': _r(displayBudgetMs),
      'build_avg_ms': _r(average(build)),
      'build_p90_ms': _r(percentile(build, 0.9)),
      'build_p99_ms': _r(percentile(build, 0.99)),
      'raster_avg_ms': _r(average(raster)),
      'raster_p90_ms': _r(percentile(raster, 0.9)),
      'raster_p99_ms': _r(percentile(raster, 0.99)),
      'worst_p90_ms': _r(percentile(w, 0.9)),
      'worst_p99_ms': _r(percentile(w, 0.99)),
      'worst_max_ms': _r(w.isEmpty ? 0 : w.reduce((a, b) => a > b ? a : b)),
      'over_8_3_pct': _pctOver(8.34),
      'over_16_7_pct': _pctOver(16.7),
      'over_33_pct': _pctOver(33.4),
      'missed_display_budget': w.where((v) => v > displayBudgetMs).length,
      'missed_display_budget_pct': _pctOver(displayBudgetMs),
    };
  }
}

/// A budget that was checked: [ok] false = the run fails on it.
class Check {
  const Check(this.name, this.value, this.limit, this.unit, {required this.ok});

  final String name;
  final double value;
  final double limit;
  final String unit;
  final bool ok;

  Map<String, Object> toJson() => {
        'name': name,
        'value': double.parse(value.toStringAsFixed(2)),
        'limit': limit,
        'unit': unit,
        'ok': ok,
      };
}

/// The budgets (documented in docs/perf/APP_DEVICE_PERF.md).
abstract final class PerfBudgets {
  /// Process / app start to the first frame on the glass.
  static const coldFirstFrameMs = 2000.0;

  /// App start to the first post card drawn (local API; a slow link adds).
  static const coldFeedFrameMs = 3000.0;

  /// Scrolling at 60 Hz (and below): the 99th percentile frame fits 16.7 ms.
  static const scrollP99At60Ms = 16.7;

  /// Scrolling at 90-120 Hz: 90th percentile in the 8.3 ms budget of the
  /// display, 99th within two display frames (one dropped frame).
  static const scrollP90At120Ms = 8.34;
  static const scrollP99At120Ms = 16.7;

  /// At most this share of frames above 33 ms (a visible stutter).
  static const over33MaxPct = 1.0;

  /// Tap to the first frame of the next screen (RAIL: respond within 100 ms,
  /// a screen that has to build a long list gets a little more).
  static const tabSwitchMs = 150.0;
  static const sheetMs = 150.0;
  static const openScreenMs = 250.0;

  /// Growth of the app's memory across the scroll run.
  static const memoryGrowthMaxPct = 20.0;

  /// Round 2 to round 3 growth below this share = warm-up is over.
  static const warmupSettledPct = 5.0;

  /// The biggest the app may get (iPhone jetsam / Android low-memory killer).
  static const rssPeakMaxMb = 1200.0;

  /// Video: from "told to play" to the picture moving.
  static const videoMedianMs = 500.0;
  static const videoP90Ms = 1000.0;
}

/// Everything the suite measured, ready to be judged and printed.
class PerfResult {
  PerfResult({
    required this.device,
    required this.coldStart,
    required this.scenarios,
    required this.latency,
    required this.memory,
    required this.video,
    this.nativeStart,
    this.notes = const [],
  });

  /// `{platform, model, refresh_rate_hz, mode, ...}`.
  final Map<String, Object?> device;

  /// App-side marks, ms since `runLawBid` began.
  final Map<String, double> coldStart;

  /// Optional: `flutter run --trace-startup` of the host (process start).
  final Map<String, double>? nativeStart;

  /// Scenario name -> [FrameStats.toJson].
  final Map<String, Map<String, Object>> scenarios;

  /// Name -> samples in ms.
  final Map<String, List<double>> latency;

  /// `{samples: [{at, rss_mb, heap_mb, image_cache_mb, image_cache_count}]}`.
  final List<Map<String, Object?>> memory;

  /// Name -> start times in ms.
  final Map<String, List<double>> video;

  /// Failed or skipped steps, in words (shown first in the report).
  final List<String> notes;

  double get refreshHz => (device['refresh_rate_hz'] as num?)?.toDouble() ?? 60;

  static double _median(List<double> v) => FrameStats.percentile(v, 0.5);

  List<Check> evaluate() {
    final checks = <Check>[];
    void add(String name, double value, double limit, String unit) =>
        checks.add(Check(name, value, limit, unit, ok: value <= limit));

    final first = nativeStart?['first_frame_ms'] ?? coldStart['lb.first_frame'];
    if (first != null) {
      add(
        nativeStart?['first_frame_ms'] != null
            ? 'cold start: process to first frame'
            : 'cold start: app main to first frame',
        first,
        PerfBudgets.coldFirstFrameMs,
        'ms',
      );
    }
    final feed = coldStart['lb.first_feed_frame'];
    if (feed != null) {
      add(
        'cold start: app main to first feed frame',
        feed,
        PerfBudgets.coldFeedFrameMs,
        'ms',
      );
    }

    final high = refreshHz > 75;
    scenarios.forEach((name, s) {
      final p99 = (s['worst_p99_ms']! as num).toDouble();
      final p90 = (s['worst_p90_ms']! as num).toDouble();
      final over33 = (s['over_33_pct']! as num).toDouble();
      if (high) {
        add('$name: p90 frame', p90, PerfBudgets.scrollP90At120Ms, 'ms');
        add('$name: p99 frame', p99, PerfBudgets.scrollP99At120Ms, 'ms');
      } else {
        add('$name: p99 frame', p99, PerfBudgets.scrollP99At60Ms, 'ms');
      }
      add('$name: frames over 33 ms', over33, PerfBudgets.over33MaxPct, '%');
    });

    latency.forEach((name, v) {
      if (v.isEmpty) return;
      final limit = name.startsWith('tab_')
          ? PerfBudgets.tabSwitchMs
          : name.startsWith('theme_')
              ? PerfBudgets.sheetMs
              : PerfBudgets.openScreenMs;
      add('latency $name (median)', _median(v), limit, 'ms');
    });

    if (memory.length >= 2) {
      double rss(Map<String, Object?> m) => (m['rss_mb']! as num).toDouble();
      // The first sample is after the feed settled (the warm-up), the last
      // is after the whole run and a settle pause.
      // With PERF_ROUNDS >= 2 the first pass is the warm-up (caches fill once:
      // image decode, fonts, shaders, sockets), so growth is judged from the
      // end of round 1 to the end of the run: a leak keeps growing, a
      // warm-up does not. One round has nothing else to compare to.
      final perRound = roundSummary();
      final fromRound1 = perRound.length >= 2;
      final base = fromRound1 ? perRound.first.rss : rss(memory.first);
      final end = rss(memory.last);
      final peak = memory.map(rss).reduce((a, b) => a > b ? a : b);
      if (base > 0) {
        add(
          fromRound1
              ? 'memory: RSS growth, end of round 1 to end of run'
              : 'memory: RSS growth over the run',
          100 * (end - base) / base,
          PerfBudgets.memoryGrowthMaxPct,
          '%',
        );
      }
      add('memory: RSS peak', peak, PerfBudgets.rssPeakMaxMb, 'MB');
      final heaps = memory
          .map((m) => (m['heap_mb'] as num?)?.toDouble())
          .whereType<double>()
          .toList();
      if (heaps.length >= 2 && heaps.first > 0) {
        add(
          'memory: Dart heap growth over the run',
          100 * (heaps.last - heaps.first) / heaps.first,
          PerfBudgets.memoryGrowthMaxPct,
          '%',
        );
      }
    }

    video.forEach((name, v) {
      if (v.isEmpty) return;
      add('video $name (median)', _median(v), PerfBudgets.videoMedianMs, 'ms');
      add(
        'video $name (p90)',
        FrameStats.percentile(v, 0.9),
        PerfBudgets.videoP90Ms,
        'ms',
      );
    });
    return checks;
  }

  static String _signed(double v) =>
      '${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}';

  /// The last scenario sample of every round (the final settle sample is not
  /// part of a round), in round order.
  List<({int round, double rss, double? heap, int cacheItems})> roundSummary() {
    final last = <int, Map<String, Object?>>{};
    for (final m in memory) {
      if ('${m['at']}'.startsWith('end of run')) continue;
      last[(m['round'] as num?)?.toInt() ?? 1] = m;
    }
    final keys = last.keys.toList()..sort();
    return [
      for (final k in keys)
        (
          round: k,
          rss: (last[k]!['rss_mb']! as num).toDouble(),
          heap: (last[k]!['heap_mb'] as num?)?.toDouble(),
          cacheItems: (last[k]!['image_cache_count'] as num?)?.toInt() ?? 0,
        ),
    ];
  }

  /// Warm-up or leak. Warm-up: growth sits in round 1 and the step from round
  /// 2 to round 3 is under 5 %. Leak: the app keeps growing about as much in
  /// every round (the round 2 to 3 step is at least 5 % and at least 60 % of
  /// the round 1 to 2 step).
  String leakVerdict() {
    final r = roundSummary();
    if (r.length < 3) {
      return 'not enough rounds to tell (run with PERF_ROUNDS=3 or more).';
    }
    final g12 = r[1].rss - r[0].rss;
    final g23 = r[2].rss - r[1].rss;
    final pct23 = 100 * g23 / r[1].rss;
    final line = 'round 2 to 3 grew ${_signed(g23)} MB '
        '(${_signed(pct23)} %), round 1 to 2 ${_signed(g12)} MB';
    if (pct23 < PerfBudgets.warmupSettledPct) {
      return 'WARM-UP, not a leak: $line. The growth is a one-time fill of '
          'caches, it stops.';
    }
    if (g12 > 0 && g23 >= 0.6 * g12) {
      return 'LEAK suspected: $line. Memory keeps rising about the same in '
          'every round.';
    }
    return 'STILL SETTLING: $line. Growth is slowing but not under '
        '${PerfBudgets.warmupSettledPct.toStringAsFixed(0)} % yet; run more '
        'rounds.';
  }

  Map<String, Object?> toJson() {
    final checks = evaluate();
    return {
      'generated_at': DateTime.now().toUtc().toIso8601String(),
      'passed': checks.every((c) => c.ok),
      'device': device,
      'cold_start_ms': coldStart,
      if (nativeStart != null) 'native_start_ms': nativeStart,
      'scenarios': scenarios,
      'latency_ms': {
        for (final e in latency.entries)
          e.key: {
            'samples': e.value,
            'median': FrameStats.percentile(e.value, 0.5),
          },
      },
      'memory': memory,
      if (roundSummary().length >= 2) 'leak_verdict': leakVerdict(),
      'video_start_ms': {
        for (final e in video.entries)
          e.key: {
            'samples': e.value,
            'median': FrameStats.percentile(e.value, 0.5),
            'p90': FrameStats.percentile(e.value, 0.9),
          },
      },
      'notes': notes,
      'checks': [for (final c in checks) c.toJson()],
    };
  }

  String toMarkdown() {
    final checks = evaluate();
    final b = StringBuffer();
    final passed = checks.every((c) => c.ok);
    b
      ..writeln('# LawBid on-device performance')
      ..writeln()
      ..writeln('Result: **${passed ? 'PASS' : 'FAIL'}** '
          '(${checks.where((c) => c.ok).length}/${checks.length} checks)')
      ..writeln()
      ..writeln('Device: `${jsonEncode(device)}`')
      ..writeln();
    if (notes.isNotEmpty) {
      b.writeln('## Notes (failed or skipped)\n');
      for (final n in notes) {
        b.writeln('- $n');
      }
      b.writeln();
    }
    b
      ..writeln('## Budgets')
      ..writeln()
      ..writeln('| Check | Value | Limit | |')
      ..writeln('| --- | ---: | ---: | --- |');
    for (final c in checks) {
      b.writeln(
        '| ${c.name} | ${c.value.toStringAsFixed(1)} ${c.unit} '
        '| ${c.limit} ${c.unit} | ${c.ok ? 'ok' : '**FAIL**'} |',
      );
    }
    b
      ..writeln()
      ..writeln('## Cold start (ms since the app began)')
      ..writeln();
    coldStart.forEach((k, v) => b.writeln('- `$k`: ${v.toStringAsFixed(0)}'));
    nativeStart?.forEach(
      (k, v) => b.writeln('- native `$k`: ${v.toStringAsFixed(0)}'),
    );
    b
      ..writeln()
      ..writeln('## Scrolling (frames)')
      ..writeln()
      ..writeln(
        '| Scenario | Frames | Build avg/p90/p99 | Raster avg/p90/p99 '
        '| >8.3 ms | >16.7 ms | >33 ms | Missed (display budget) |',
      )
      ..writeln('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    scenarios.forEach((name, s) {
      String f(String k) => '${s[k]}';
      b.writeln(
        '| $name | ${s['frames']} '
        '| ${f('build_avg_ms')} / ${f('build_p90_ms')} / ${f('build_p99_ms')} '
        '| ${f('raster_avg_ms')} / ${f('raster_p90_ms')} / '
        '${f('raster_p99_ms')} '
        '| ${f('over_8_3_pct')} % | ${f('over_16_7_pct')} % '
        '| ${f('over_33_pct')} % '
        '| ${f('missed_display_budget')} (${f('missed_display_budget_pct')} %) '
        '|',
      );
    });
    b
      ..writeln()
      ..writeln('## Tap to the next screen (ms)')
      ..writeln()
      ..writeln('| Interaction | Median | Samples |')
      ..writeln('| --- | ---: | --- |');
    latency.forEach((k, v) {
      b.writeln(
        '| $k | ${FrameStats.percentile(v, 0.5).toStringAsFixed(0)} '
        '| ${v.map((e) => e.toStringAsFixed(0)).join(', ')} |',
      );
    });
    b
      ..writeln()
      ..writeln('## Video: told to play to moving picture (ms)')
      ..writeln()
      ..writeln('| Where | Median | p90 | Samples |')
      ..writeln('| --- | ---: | ---: | ---: |');
    video.forEach((k, v) {
      b.writeln(
        '| $k | ${FrameStats.percentile(v, 0.5).toStringAsFixed(0)} '
        '| ${FrameStats.percentile(v, 0.9).toStringAsFixed(0)} | ${v.length} |',
      );
    });
    b
      ..writeln()
      ..writeln('## Memory')
      ..writeln()
      ..writeln('| Round | After | RSS MB | Dart heap MB '
          '| Image cache MB (items) |')
      ..writeln('| ---: | --- | ---: | ---: | ---: |');
    for (final m in memory) {
      b.writeln(
        '| ${m['round'] ?? 1} | ${m['at']} | ${m['rss_mb']} '
        '| ${m['heap_mb'] ?? '-'} '
        '| ${m['image_cache_mb']} (${m['image_cache_count']}) |',
      );
    }
    final rounds = roundSummary();
    if (rounds.length >= 2) {
      b
        ..writeln()
        ..writeln('## Memory per round (end of each round)')
        ..writeln()
        ..writeln('| Round | RSS MB | Growth vs previous | Dart heap MB '
            '| Image cache items |')
        ..writeln('| ---: | ---: | ---: | ---: | ---: |');
      for (var i = 0; i < rounds.length; i++) {
        final r = rounds[i];
        final prev = i == 0 ? null : rounds[i - 1].rss;
        b.writeln(
          '| ${r.round} | ${r.rss} '
          '| ${prev == null ? '-' : '${_signed(r.rss - prev)} MB '
              '(${_signed(100 * (r.rss - prev) / prev)} %)'} '
          '| ${r.heap ?? '-'} | ${r.cacheItems} |',
        );
      }
      b
        ..writeln()
        ..writeln('**Verdict:** ${leakVerdict()}');
    }
    return b.toString();
  }
}
