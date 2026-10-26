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

  /// Which pass over the scroll scenarios this is (PERF_ROUNDS). Frame stats,
  /// latencies and video starts are recorded in round 1 only; every round
  /// samples memory.
  int round = 1;

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
    Future<void> Function()? onTick,
  }) async {
    final end = DateTime.now().add(timeout);
    var tick = 0;
    while (!done()) {
      if (DateTime.now().isAfter(end)) {
        fail('perf: timed out waiting for $what');
      }
      await idle(const Duration(milliseconds: 100));
      // Every ~4 s, e.g. press "Retry" on a no-connection splash (the first
      // request of a fresh iOS install can lose to the Local Network prompt).
      if (onTick != null && ++tick % 40 == 0) await onTick();
    }
  }

  bool _probed = false;

  /// Presses the "Повторить" button of the no-connection screen, if shown.
  Future<void> tapRetryIfShown() async {
    final f = find.text('Повторить').hitTestable();
    if (f.evaluate().isEmpty) return;
    debugPrint('perf: no-connection screen, pressing Retry');
    if (!_probed) {
      _probed = true;
      const base = String.fromEnvironment('API_BASE_URL');
      try {
        final c = HttpClient()..connectionTimeout = const Duration(seconds: 8);
        final r =
            await (await c.getUrl(Uri.parse('$base/config/bootstrap'))).close();
        debugPrint('perf: probe $base -> HTTP ${r.statusCode}');
      } on Object catch (e) {
        debugPrint('perf: probe $base failed: $e');
      }
    }
    await tester.tapAt(tester.getCenter(f.first));
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

  /// "Not now" on the notification explanation that follows a sign-in
  /// (it covers the app and blocks every tap); true when it was there.
  Future<bool> dismissPrimer() async {
    // The explanations come one after another (notifications, then the
    // microphone, ...): keep pressing "Not now" until none shows up for 3 s.
    var any = false;
    for (var i = 0; i < 6; i++) {
      final f = find.byKey(const ValueKey<String>('permission-primer-later'));
      if (f.evaluate().isEmpty) {
        await idle(const Duration(seconds: 3));
        if (f.evaluate().isEmpty) break;
      }
      await tester.tapAt(tester.getCenter(f.first));
      await idle(const Duration(milliseconds: 800));
      any = true;
    }
    return any;
  }

  /// Taps the first hit-testable widget with this [ValueKey] string.
  Future<void> tapKey(String key) async {
    final f = find.byKey(ValueKey<String>(key)).hitTestable();
    if (f.evaluate().isEmpty) fail('perf: nothing to tap with key "$key"');
    await tester.tapAt(tester.getCenter(f.first));
  }

  /// Taps a tab of the bottom bar by its key (`nav-tab-<name>`).
  Future<void> tapNav(AppTabKey tab) => tapKey('nav-tab-${tab.name}');

  // --- frames ----------------------------------------------------------

  /// Runs [action] and records every FrameTiming for [FrameStats].
  Future<void> scroll(String name, Future<void> Function() action) async {
    final timings = <ui.FrameTiming>[];
    void collect(List<ui.FrameTiming> t) => timings.addAll(t);
    // FrameTimings only: binding.watchPerformance needs the VM service, which
    // a phone cannot reach from inside (its ws://localhost is the Mac's).
    SchedulerBinding.instance.addTimingsCallback(collect);
    await action();
    if (round > 1) {
      SchedulerBinding.instance.removeTimingsCallback(collect);
      return;
    }
    // FrameTimings arrive in batches (about once a second).
    await idle(const Duration(milliseconds: 2500));
    SchedulerBinding.instance.removeTimingsCallback(collect);
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
    if (round > 1) return v;
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

  bool _triedConnect = false;

  Future<void> _connect() async {
    if (_service != null || _triedConnect) return;
    _triedConnect = true;
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
      'round': round,
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
