// The tools of the on-device performance suite: touches in real time, frame
// recording, tap-to-next-frame timing and memory samples.
import 'dart:async';
import 'dart:developer' as developer;
import 'dart:io';
import 'dart:isolate';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_bottom_nav.dart';
import 'package:vm_service/vm_service.dart' as vm;
import 'package:vm_service/vm_service_io.dart' as vm_io;

import 'perf_report.dart';

class PerfRig {
  PerfRig(this.binding, this.tester);

  final IntegrationTestWidgetsFlutterBinding binding;
  final WidgetTester tester;

  /// Everything recorded so far, in the shape of [PerfResult].
  final Map<String, Map<String, Object>> scenarios = {};
  final Map<String, List<double>> latency = {};
  final List<Map<String, Object?>> memory = [];

  double get refreshRate {
    final displays = ui.PlatformDispatcher.instance.displays;
    final hz = displays.isEmpty ? 60.0 : displays.first.refreshRate;
    return hz > 0 ? hz : 60.0;
  }

  double get budgetMs => 1000 / refreshRate;

  Size get screen {
    final view = binding.platformDispatcher.implicitView!;
    return view.physicalSize / view.devicePixelRatio;
  }

  Future<void> idle(Duration d) => Future<void>.delayed(d);

  Future<void> waitUntil(
    bool Function() done, {
    required Duration timeout,
    required String what,
  }) async {
    final end = DateTime.now().add(timeout);
    while (!done()) {
      if (DateTime.now().isAfter(end)) {
        fail('perf: timed out waiting for $what');
      }
      await idle(const Duration(milliseconds: 100));
    }
  }

  // --- touches ---------------------------------------------------------

  /// A thumb flick in the middle of the screen: [distance] logical pixels
  /// in 200 ms (about 2000 px/s, a brisk Instagram scroll), then the list
  /// coasts for a while.
  Future<void> fling({required bool up, double distance = 520}) async {
    final s = screen;
    final start = Offset(s.width / 2, up ? s.height * 0.72 : s.height * 0.3);
    await tester.timedDragFrom(
      start,
      Offset(0, up ? -distance : distance),
      const Duration(milliseconds: 200),
    );
    await idle(const Duration(milliseconds: 900));
  }

  /// One reel to the next: a quick swipe over most of the screen, then a
  /// moment to watch it (the video starts, the next one warms).
  Future<void> swipePage({
    required bool up,
    Duration watch = const Duration(milliseconds: 1500),
  }) async {
    final s = screen;
    final start = Offset(s.width / 2, up ? s.height * 0.75 : s.height * 0.25);
    await tester.timedDragFrom(
      start,
      Offset(0, (up ? -1 : 1) * s.height * 0.45),
      const Duration(milliseconds: 180),
    );
    await idle(watch);
  }

  /// Taps the centre of the first visible match of [finder].
  Future<void> tapFirst(Finder finder) async {
    final hit = finder.hitTestable();
    expect(hit, findsWidgets, reason: 'something to tap');
    await tester.tapAt(tester.getCenter(hit.first));
  }

  /// Taps slot [slot] (0 feed, 1 search, 3 mine, 4 profile; 2 is the "+")
  /// of the floating bottom bar.
  Future<void> tapNav(int slot) async {
    final box = tester.renderObject<RenderBox>(find.byType(AppBottomNav));
    final o = box.localToGlobal(Offset.zero);
    await tester.tapAt(
      Offset(
        o.dx + box.size.width * (slot + 0.5) / 5,
        o.dy + box.size.height / 2,
      ),
    );
  }

  // --- frames ----------------------------------------------------------

  /// Runs [action] under `watchPerformance` (Flutter's own summary, stored
  /// as `<name>.flutter`) and records every FrameTiming for [FrameStats].
  Future<void> scroll(String name, Future<void> Function() action) async {
    final timings = <ui.FrameTiming>[];
    void collect(List<ui.FrameTiming> t) => timings.addAll(t);
    await binding.watchPerformance(
      () async {
        SchedulerBinding.instance.addTimingsCallback(collect);
        await action();
        // FrameTimings arrive in batches (about once a second).
        await idle(const Duration(milliseconds: 2500));
        SchedulerBinding.instance.removeTimingsCallback(collect);
      },
      reportKey: '$name.flutter',
    );
    double ms(Duration d) => d.inMicroseconds / 1000;
    final stats = FrameStats(
      build: [for (final f in timings) ms(f.buildDuration)],
      raster: [for (final f in timings) ms(f.rasterDuration)],
      displayBudgetMs: budgetMs,
    );
    scenarios[name] = stats.toJson();
    debugPrint('perf: $name ${scenarios[name]}');
  }

  // --- tap to next frame ---------------------------------------------------

  /// Time from [trigger] (a tap or a route push) to the end of the first
  /// frame that holds [destination]. Frame end = build, layout and paint
  /// done; the raster of that frame (a few ms) comes after.
  Future<double> timeToFrame(
    String name,
    Future<void> Function() trigger,
    Finder destination, {
    Duration timeout = const Duration(seconds: 10),
  }) async {
    final done = Completer<double>();
    final sw = Stopwatch()..start();
    void check(Duration _) {
      if (done.isCompleted) return;
      if (destination.evaluate().isNotEmpty) {
        done.complete(sw.elapsedMicroseconds / 1000);
        return;
      }
      if (sw.elapsed > timeout) {
        done.complete(-1);
        return;
      }
      SchedulerBinding.instance
        ..addPostFrameCallback(check)
        ..scheduleFrame();
    }

    SchedulerBinding.instance.addPostFrameCallback(check);
    await trigger();
    final v = await done.future;
    if (v >= 0) {
      latency
          .putIfAbsent(name, () => [])
          .add(double.parse(v.toStringAsFixed(1)));
    } else {
      debugPrint('perf: $name never reached its screen');
    }
    return v;
  }

  // --- memory ----------------------------------------------------------

  vm.VmService? _service;
  String? _isolateId;

  Future<void> _connect() async {
    if (_service != null) return;
    try {
      var info = await developer.Service.getInfo();
      if (info.serverWebSocketUri == null) {
        info = await developer.Service.controlWebServer(enable: true);
      }
      final ws = info.serverWebSocketUri;
      if (ws == null) return;
      final service = await vm_io.vmServiceConnectUri(ws.toString());
      final isolate = developer.Service.getIsolateId(Isolate.current);
      _service = service;
      _isolateId = isolate;
    } on Object catch (e) {
      debugPrint('perf: no VM service for the Dart heap ($e)');
    }
  }

  /// RSS, Dart heap (after a GC) and the image cache, labelled [at].
  Future<void> sampleMemory(String at) async {
    await _connect();
    double? heapMb;
    final s = _service;
    final id = _isolateId;
    if (s != null && id != null) {
      try {
        final profile = await s.getAllocationProfile(id, gc: true);
        final usage = profile.memoryUsage;
        if (usage != null) {
          heapMb = (usage.heapUsage ?? 0) / 1048576;
        }
      } on Object catch (e) {
        debugPrint('perf: heap sample failed ($e)');
      }
    }
    final cache = PaintingBinding.instance.imageCache;
    memory.add({
      'at': at,
      'rss_mb':
          double.parse((ProcessInfo.currentRss / 1048576).toStringAsFixed(1)),
      if (heapMb != null) 'heap_mb': double.parse(heapMb.toStringAsFixed(1)),
      'image_cache_mb':
          double.parse((cache.currentSizeBytes / 1048576).toStringAsFixed(1)),
      'image_cache_count': cache.currentSize,
    });
    debugPrint('perf: memory ${memory.last}');
  }

  Future<void> dispose() async => _service?.dispose();
}
