// Records the Dart VM timeline of a running PROFILE app for N seconds and
// prints build / raster / GC stats. Same approach as flutter_driver's TimelineSummary
// ("Frame" = UI-thread build, "GPURasterizer::Draw" = raster).
// Usage: dart run tool/perf/timeline_probe.dart <ws-vm-service-uri> <seconds> <label> [hz]
import 'dart:convert';
import 'dart:io';
import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

double _pct(List<double> s, double p) {
  if (s.isEmpty) return 0;
  s.sort();
  return s[((s.length - 1) * p).round()];
}

Future<void> main(List<String> a) async {
  final uri = a[0];
  final secs = int.parse(a[1]);
  final label = a[2];
  final hz = a.length > 3 ? int.parse(a[3]) : 120;
  final svc = await vmServiceConnectUri(uri);
  await svc.setVMTimelineFlags(['Dart', 'Embedder', 'GC']);
  await svc.clearVMTimeline();
  await Future<void>.delayed(Duration(seconds: secs));
  final tl = await svc.getVMTimeline();
  final ev = tl.traceEvents ?? const [];
  final stacks = <String, List<TimelineEvent>>{};
  final build = <double>[];
  final raster = <double>[];
  final gc = <double>[];
  final other = <String, List<double>>{};
  void add(String name, double ms, String cat) {
    if (name == 'Frame') {
      build.add(ms);
    } else if (name == 'GPURasterizer::Draw') {
      raster.add(ms);
    } else if (cat.contains('GC')) {
      gc.add(ms);
    } else if (ms > 4) {
      (other[name] ??= []).add(ms);
    }
  }

  for (final e in ev) {
    final j = e.json!;
    final ph = j['ph'] as String?;
    final key = '${j['pid']}:${j['tid']}';
    if (ph == 'X') {
      add(j['name'] as String, (j['dur'] as num) / 1000, '${j['cat']}');
    } else if (ph == 'B') {
      (stacks[key] ??= []).add(e);
    } else if (ph == 'E') {
      final st = stacks[key];
      if (st != null && st.isNotEmpty) {
        final b = st.removeLast();
        final n = b.json!['name'] as String;
        add(
          n,
          ((j['ts'] as num) - (b.json!['ts'] as num)) / 1000,
          '${b.json!['cat']}',
        );
      }
    }
  }
  const b16 = 1000 / 60;
  final b8 = 1000 / hz;
  final n = build.length > raster.length ? build.length : raster.length;
  final worst = <double>[];
  for (var i = 0; i < n; i++) {
    final x = i < build.length ? build[i] : 0.0;
    final y = i < raster.length ? raster[i] : 0.0;
    worst.add(x > y ? x : y);
  }
  int over(List<double> l, double t) => l.where((v) => v > t).length;
  final out = {
    'label': label,
    'seconds': secs,
    'frames': n,
    'build_avg':
        build.isEmpty ? 0 : build.reduce((x, y) => x + y) / build.length,
    'build_p99': _pct([...build], .99),
    'build_max': build.isEmpty ? 0 : build.reduce((x, y) => x > y ? x : y),
    'raster_avg':
        raster.isEmpty ? 0 : raster.reduce((x, y) => x + y) / raster.length,
    'raster_p99': _pct([...raster], .99),
    'raster_max': raster.isEmpty ? 0 : raster.reduce((x, y) => x > y ? x : y),
    'over_16.7ms': over(worst, b16),
    'over_${b8.toStringAsFixed(1)}ms': over(worst, b8),
    'over_33ms': over(worst, 33.3),
    'gc_events': gc.length,
    'gc_total_ms': gc.isEmpty ? 0 : gc.reduce((x, y) => x + y),
    'gc_max_ms': gc.isEmpty ? 0 : gc.reduce((x, y) => x > y ? x : y),
    'long_events_gt4ms': {
      for (final k in (other.keys.toList()
            ..sort((x, y) => other[y]!.length.compareTo(other[x]!.length)))
          .take(12))
        k: {
          'n': other[k]!.length,
          'max': other[k]!.reduce((x, y) => x > y ? x : y),
        },
    },
  };
  stdout.writeln(const JsonEncoder.withIndent(' ').convert(out));
  exit(0);
}
