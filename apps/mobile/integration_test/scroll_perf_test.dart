// On-device scroll measurements (2026-10-18, speed). Run in PROFILE mode on a
// real phone — debug numbers mean nothing:
//
// flutter drive --profile --flavor dev -t lib/main_dev.dart \
//   --dart-define-from-file=config/dev.json \
//   --driver=test_driver/perf_driver.dart \
//   --target=integration_test/scroll_perf_test.dart -d <device id>
//
// Optional: --dart-define=PERF_PHONE=+1... --dart-define=PERF_PASSWORD=...
// (defaults: the dev seed's test attorney). An existing session is reused.
//
// Every screen is measured with `binding.watchPerformance` (Flutter's own
// summary, 16 ms budget) and, from the same FrameTimings, against the real
// frame budget of this display (8.3 ms at 120 Hz, 16.7 ms at 60 Hz). The
// driver writes both to build/scroll_perf_*.json.
import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:lawbid/app.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/config/run_app.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

const _phone = String.fromEnvironment(
  'PERF_PHONE',
  defaultValue: '+12125550101',
);
const _password = String.fromEnvironment(
  'PERF_PASSWORD',
  defaultValue: 'Test1234!',
);

void main() {
  // Frames come from the engine's vsync, like in the real app; the test only
  // feeds touches in real time.
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized()
    ..framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.benchmarkLive;

  testWidgets(
    'scroll performance: feed, reels, chats, chat, attorney profile',
    (tester) async {
      final originalOnError = FlutterError.onError;
      await runLawBid(AppFlavor.dev);
      // A missing image or a dropped socket must not end the measurement;
      // the app's own error reporting stays out of the test's way.
      FlutterError.onError =
          (d) => debugPrint('perf: FlutterError ${d.exceptionAsString()}');

      final perf = _Perf(binding, tester);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(LawBidApp)),
      );
      final router = container.read(appRouterProvider);
      String location() => router.routerDelegate.currentConfiguration.uri.path;

      // --- sign in (or reuse the stored session) -------------------------
      await perf.waitUntil(
        () => location() != AppRoutes.splash,
        timeout: const Duration(seconds: 60),
        what: 'splash to finish',
      );
      if (!location().startsWith(AppRoutes.feed)) {
        debugPrint('perf: at ${location()}, signing in');
        final result = await container
            .read(authRepositoryProvider)
            .signInWithPassword(identifier: _phone, password: _password);
        expect(result.isSuccess, isTrue, reason: 'password sign-in');
      }
      await perf.waitUntil(
        () => location().startsWith(AppRoutes.feed),
        timeout: const Duration(seconds: 60),
        what: 'the feed',
      );
      await perf.waitUntil(
        () => find.byType(PostCard).hitTestable().evaluate().isNotEmpty,
        timeout: const Duration(seconds: 60),
        what: 'feed posts',
      );
      await perf.idle(const Duration(seconds: 3));

      // --- 1. feed (posts) -----------------------------------------------
      await perf.measure('feed_posts', () async {
        for (var i = 0; i < 14; i++) {
          await perf.fling(up: true);
        }
        for (var i = 0; i < 4; i++) {
          await perf.fling(up: false);
        }
      });

      final attorney = container
          .read(feedProvider)
          .value
          ?.items
          .map((p) => p.author)
          .where((a) => !a.isClient)
          .map((a) => a.username)
          .firstOrNull;

      // --- 2. reels (vertical swipes) ------------------------------------
      await perf.tapFeedTab(1);
      await perf.idle(const Duration(seconds: 4));
      await perf.measure('reels', () async {
        for (var i = 0; i < 8; i++) {
          await perf.swipePage(up: true);
        }
        for (var i = 0; i < 2; i++) {
          await perf.swipePage(up: false);
        }
      });
      await perf.tapFeedTab(0);
      await perf.idle(const Duration(seconds: 2));

      // --- 3. chats list ---------------------------------------------------
      unawaited(router.push(ChatRoutes.inbox));
      await perf.waitUntil(
        () => find.byType(ConversationRow).hitTestable().evaluate().isNotEmpty,
        timeout: const Duration(seconds: 30),
        what: 'chat rows',
      );
      await perf.idle(const Duration(seconds: 2));
      await perf.measure('chats_list', () async {
        for (var i = 0; i < 6; i++) {
          await perf.fling(up: true, distance: 450);
        }
        for (var i = 0; i < 6; i++) {
          await perf.fling(up: false, distance: 450);
        }
      });

      // --- 4. an open chat ------------------------------------------------
      final conversationId = tester
          .widget<ConversationRow>(find.byType(ConversationRow).first)
          .conversation
          .id;
      unawaited(router.push(ChatRoutes.conversation(conversationId)));
      await perf.idle(const Duration(seconds: 4));
      await perf.measure('chat_open', () async {
        // Older messages sit above: the finger moves down.
        for (var i = 0; i < 8; i++) {
          await perf.fling(up: false, distance: 450);
        }
        for (var i = 0; i < 8; i++) {
          await perf.fling(up: true, distance: 450);
        }
      });
      router
        ..pop()
        ..pop();
      await perf.idle(const Duration(seconds: 2));

      // --- 5. attorney profile -------------------------------------------
      if (attorney != null) {
        unawaited(router.push(AppRoutes.lawyer(attorney)));
        await perf.idle(const Duration(seconds: 5));
        await perf.measure('attorney_profile', () async {
          for (var i = 0; i < 8; i++) {
            await perf.fling(up: true, distance: 450);
          }
          for (var i = 0; i < 4; i++) {
            await perf.fling(up: false, distance: 450);
          }
        });
        router.pop();
      } else {
        debugPrint('perf: no attorney in the feed, profile skipped');
      }

      binding.reportData = {
        ...?binding.reportData,
        'device': {
          'refresh_rate_hz': perf.refreshRate,
          'frame_budget_ms': perf.budgetMs,
        },
      };
      FlutterError.onError = originalOnError;
    },
    timeout: const Timeout(Duration(minutes: 15)),
  );
}

/// Touches in real time, waits and the per-screen frame statistics.
class _Perf {
  _Perf(this.binding, this.tester);

  final IntegrationTestWidgetsFlutterBinding binding;
  final WidgetTester tester;

  double get refreshRate {
    final displays = ui.PlatformDispatcher.instance.displays;
    final hz = displays.isEmpty ? 60.0 : displays.first.refreshRate;
    return hz > 0 ? hz : 60.0;
  }

  double get budgetMs => 1000 / refreshRate;

  Size get _screen {
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
      await idle(const Duration(milliseconds: 200));
    }
  }

  /// A thumb flick in the middle of the screen: [distance] logical pixels
  /// in 200 ms (about 2000 px/s, a brisk Instagram scroll), then the list
  /// coasts for a while.
  Future<void> fling({required bool up, double distance = 520}) async {
    final s = _screen;
    final start = Offset(s.width / 2, up ? s.height * 0.72 : s.height * 0.3);
    await tester.timedDragFrom(
      start,
      Offset(0, up ? -distance : distance),
      const Duration(milliseconds: 200),
    );
    await idle(const Duration(milliseconds: 900));
  }

  /// One reel to the next: a short, quick swipe over most of the screen.
  Future<void> swipePage({required bool up}) async {
    final s = _screen;
    final start = Offset(s.width / 2, up ? s.height * 0.75 : s.height * 0.25);
    await tester.timedDragFrom(
      start,
      Offset(0, (up ? -1 : 1) * s.height * 0.45),
      const Duration(milliseconds: 180),
    );
    // Watch the reel a moment (the video starts, the next one warms).
    await idle(const Duration(milliseconds: 1500));
  }

  /// Taps segment [index] of the feed header's Posts | Reels (| Cases).
  Future<void> tapFeedTab(int index) async {
    final pills = find.byWidgetPredicate((w) => w is PillTabs).hitTestable();
    final elements = pills.evaluate().toList()
      ..sort((a, b) {
        final ay = (a.renderObject! as RenderBox).localToGlobal(Offset.zero);
        final by = (b.renderObject! as RenderBox).localToGlobal(Offset.zero);
        return ay.dy.compareTo(by.dy);
      });
    expect(elements, isNotEmpty, reason: 'feed header tabs');
    final pill = elements.first;
    final box = pill.renderObject! as RenderBox;
    final n = (pill.widget as PillTabs<Object?>).tabs.length;
    final origin = box.localToGlobal(Offset.zero);
    await tester.tapAt(
      Offset(
        origin.dx + box.size.width * (index + 0.5) / n,
        origin.dy + box.size.height / 2,
      ),
    );
  }

  /// Runs [action] under `watchPerformance` and stores, next to Flutter's
  /// own summary, the same frames measured against this display's budget.
  Future<void> measure(String name, Future<void> Function() action) async {
    final timings = <ui.FrameTiming>[];
    void collect(List<ui.FrameTiming> t) => timings.addAll(t);
    final started = DateTime.now();
    await binding.watchPerformance(
      () async {
        SchedulerBinding.instance.addTimingsCallback(collect);
        await action();
        // FrameTimings arrive in batches (about once a second).
        await idle(const Duration(milliseconds: 2500));
        SchedulerBinding.instance.removeTimingsCallback(collect);
      },
      reportKey: name,
    );
    final summary = _summary(timings, DateTime.now().difference(started));
    binding.reportData = {...?binding.reportData, '$name.budget': summary};
    debugPrint('perf: $name $summary');
  }

  Map<String, Object> _summary(List<ui.FrameTiming> t, Duration wall) {
    double ms(Duration d) => d.inMicroseconds / 1000;
    final build = [for (final f in t) ms(f.buildDuration)]..sort();
    final raster = [for (final f in t) ms(f.rasterDuration)]..sort();
    final total = [for (final f in t) ms(f.totalSpan)]..sort();
    double pct(List<double> v, double p) {
      if (v.isEmpty) return 0;
      final i = ((v.length - 1) * p).round();
      return double.parse(v[i].toStringAsFixed(2));
    }

    double avg(List<double> v) => v.isEmpty
        ? 0
        : double.parse(
            (v.reduce((a, b) => a + b) / v.length).toStringAsFixed(2),
          );
    final b = budgetMs;
    return {
      'frames': t.length,
      'budget_ms': double.parse(b.toStringAsFixed(2)),
      'build_avg_ms': avg(build),
      'build_p90_ms': pct(build, 0.9),
      'build_p99_ms': pct(build, 0.99),
      'build_worst_ms': build.isEmpty ? 0 : build.last,
      'raster_avg_ms': avg(raster),
      'raster_p90_ms': pct(raster, 0.9),
      'raster_p99_ms': pct(raster, 0.99),
      'raster_worst_ms': raster.isEmpty ? 0 : raster.last,
      'total_p90_ms': pct(total, 0.9),
      'total_p99_ms': pct(total, 0.99),
      'missed_build': build.where((v) => v > b).length,
      'missed_raster': raster.where((v) => v > b).length,
      'missed_any': [
        for (final f in t)
          if (ms(f.buildDuration) > b || ms(f.rasterDuration) > b) f,
      ].length,
      'missed_pct': t.isEmpty
          ? 0
          : double.parse(
              (100 *
                      [
                        for (final f in t)
                          if (ms(f.buildDuration) > b ||
                              ms(f.rasterDuration) > b)
                            f,
                      ].length /
                      t.length)
                  .toStringAsFixed(1),
            ),
      'wall_s': double.parse((wall.inMilliseconds / 1000).toStringAsFixed(1)),
    };
  }
}
