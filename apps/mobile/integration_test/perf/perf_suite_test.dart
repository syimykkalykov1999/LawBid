// LawBid on-device performance suite (docs/perf/APP_DEVICE_PERF.md).
//
// Run it with tool/perf/run_device_perf.sh <device-id> (PROFILE mode, a real
// phone — debug numbers mean nothing). By hand:
//
// flutter drive --profile --flavor dev -t lib/main_dev.dart \
//   --dart-define-from-file=config/dev.json \
//   --driver=test_driver/perf_suite_driver.dart \
//   --target=integration_test/perf/perf_suite_test.dart -d <device id>
//
// Data: the dev seed's test attorney (defaults below) or, with
// --dart-define=PERF_DEMO_CODE=<8 characters>, a demo-world invite. Never a
// real account. Optional: PERF_PHONE, PERF_PASSWORD.
//
// Order: cold start marks -> feed scroll -> reels (10 videos) -> search
// grid -> chats list -> long chat -> cases list -> tap latencies -> memory.
// The result (JSON + Markdown) goes to the host through the driver and to
// the app's documents folder on the phone (lb_perf/).
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:lawbid/app.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/config/run_app.dart';
import 'package:lawbid/core/diagnostics/perf_marks.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/theme/theme_picker_sheet.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/reels/presentation/reels_screen.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:path_provider/path_provider.dart';

import 'perf_report.dart';
import 'perf_rig.dart';

const _phone = String.fromEnvironment(
  'PERF_PHONE',
  defaultValue: '+12125550101',
);
const _password = String.fromEnvironment(
  'PERF_PASSWORD',
  defaultValue: 'Test1234!',
);
const _demoCode = String.fromEnvironment('PERF_DEMO_CODE');
const _platform = String.fromEnvironment('PERF_PLATFORM');
const _model = String.fromEnvironment('PERF_MODEL');
// From the script's `flutter run --trace-startup` runs (engine start -> first
// frame), in ms; empty when they were skipped.
const _nativeFirstFrame = String.fromEnvironment('PERF_NATIVE_FIRST_FRAME_MS');
const _nativeInit = String.fromEnvironment('PERF_NATIVE_FRAMEWORK_INIT_MS');

/// How many times each tap latency is repeated (the median is judged).
const _reps = 3;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized()
    ..framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.benchmarkLive;

  testWidgets(
    'LawBid performance suite',
    (tester) async {
      final originalOnError = FlutterError.onError;
      await runLawBid(AppFlavor.dev);
      // A missing image or a dropped socket must not end the measurement.
      FlutterError.onError =
          (d) => debugPrint('perf: FlutterError ${d.exceptionAsString()}');

      final rig = PerfRig(binding, tester);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(LawBidApp)),
      );
      final router = container.read(appRouterProvider);
      String location() => router.routerDelegate.currentConfiguration.uri.path;
      final video = <String, List<double>>{};
      PerfMarks.takeVideoStarts();

      // --- sign in (a stored session is reused) -------------------------
      await rig.waitUntil(
        () => location() != AppRoutes.splash,
        timeout: const Duration(seconds: 60),
        what: 'splash to finish',
      );
      if (!location().startsWith(AppRoutes.feed)) {
        if (_demoCode.isNotEmpty) {
          debugPrint('perf: entering the demo with a code');
          final session =
              await container.read(demoRepositoryProvider).redeem(_demoCode);
          await container
              .read(demoSessionControllerProvider.notifier)
              .enterDemo(session);
          await container
              .read(currentUserControllerProvider.notifier)
              .ensureLoaded();
          router.go(AppRoutes.feed);
        } else {
          debugPrint('perf: at ${location()}, signing in');
          final result = await container
              .read(authRepositoryProvider)
              .signInWithPassword(identifier: _phone, password: _password);
          expect(result.isSuccess, isTrue, reason: 'password sign-in');
        }
      }
      await rig.waitUntil(
        () => location().startsWith(AppRoutes.feed),
        timeout: const Duration(seconds: 60),
        what: 'the feed',
      );
      await rig.waitUntil(
        () => find.byType(PostCard).hitTestable().evaluate().isNotEmpty,
        timeout: const Duration(seconds: 60),
        what: 'feed posts',
      );
      await rig.idle(const Duration(seconds: 4));
      final attorneyMode = container.read(actsAsAttorneyProvider);
      await rig.sampleMemory('feed idle (baseline)');

      // --- 1. feed scroll -------------------------------------------------
      final authorName = container
          .read(feedProvider)
          .value
          ?.items
          .map((p) => p.author)
          .where((a) => !a.isClient)
          .map((a) => a.username)
          .firstOrNull;
      await rig.scroll('feed_scroll', () async {
        for (var i = 0; i < 14; i++) {
          await rig.fling(up: true);
        }
        for (var i = 0; i < 4; i++) {
          await rig.fling(up: false);
        }
      });
      video['feed'] = PerfMarks.takeVideoStarts();
      await rig.sampleMemory('after feed scroll');

      // --- 2. reels: swipe through 10 videos ---------------------------
      await _tapFeedTab(rig, 1);
      await rig.idle(const Duration(seconds: 4));
      PerfMarks.takeVideoStarts();
      await rig.scroll('reels_swipe_10', () async {
        for (var i = 0; i < 10; i++) {
          await rig.swipePage(up: true);
        }
        await rig.swipePage(up: false);
      });
      video['reels'] = PerfMarks.takeVideoStarts();
      await _tapFeedTab(rig, 0);
      await rig.idle(const Duration(seconds: 2));
      await rig.sampleMemory('after reels');

      // --- 3. search grid (posts with video previews) ----------------------
      await rig.tapNav(1);
      await rig.waitUntil(
        () => find.byType(SearchScreen).evaluate().isNotEmpty,
        timeout: const Duration(seconds: 10),
        what: 'search',
      );
      await rig.idle(const Duration(seconds: 1));
      // Posts is the 3rd pill for an attorney (People, Cases, Posts, Topics)
      // and the 2nd for a client (Attorneys, Posts, Topics).
      await _tapPill(rig, attorneyMode ? 2 : 1);
      await rig.waitUntil(
        () => find.byType(PostGridTile).hitTestable().evaluate().isNotEmpty,
        timeout: const Duration(seconds: 30),
        what: 'search grid',
      );
      await rig.idle(const Duration(seconds: 3));
      PerfMarks.takeVideoStarts();
      await rig.scroll('search_grid_scroll', () async {
        for (var i = 0; i < 8; i++) {
          await rig.fling(up: true, distance: 450);
        }
        for (var i = 0; i < 4; i++) {
          await rig.fling(up: false, distance: 450);
        }
      });
      video['search_grid'] = PerfMarks.takeVideoStarts();
      await rig.sampleMemory('after search grid');

      // Open a reel from the grid (latency): the first video tile.
      for (var i = 0; i < _reps; i++) {
        final tile = find.byWidgetPredicate(
          (w) => w is PostGridTile && w.post.video != null,
        );
        if (tile.hitTestable().evaluate().isEmpty) {
          debugPrint('perf: no video tile in the search grid');
          break;
        }
        await rig.timeToFrame(
          'open_reel_from_grid',
          () => rig.tapFirst(tile),
          find.byType(ReelsScreen),
        );
        await rig.idle(const Duration(seconds: 2));
        router.pop();
        await rig.idle(const Duration(seconds: 1));
      }

      // --- 4. chats list ---------------------------------------------------
      unawaited(router.push(ChatRoutes.inbox));
      await rig.waitUntil(
        () => find.byType(ConversationRow).hitTestable().evaluate().isNotEmpty,
        timeout: const Duration(seconds: 30),
        what: 'chat rows',
      );
      await rig.idle(const Duration(seconds: 2));
      await rig.scroll('chats_list_scroll', () async {
        for (var i = 0; i < 6; i++) {
          await rig.fling(up: true, distance: 450);
        }
        for (var i = 0; i < 6; i++) {
          await rig.fling(up: false, distance: 450);
        }
      });
      await rig.sampleMemory('after chats list');

      // Open a chat by tapping its row (latency, repeated), then keep the
      // last one open for the long-history scroll.
      for (var i = 0; i < _reps; i++) {
        await rig.timeToFrame(
          'open_chat',
          () => rig.tapFirst(find.byType(ConversationRow)),
          find.byType(ConversationScreen),
        );
        await rig.idle(const Duration(seconds: 3));
        if (i < _reps - 1) {
          router.pop();
          await rig.idle(const Duration(seconds: 1));
        }
      }
      await rig.scroll('chat_history_scroll', () async {
        // Older messages sit above: the finger moves down.
        for (var i = 0; i < 12; i++) {
          await rig.fling(up: false, distance: 450);
        }
        for (var i = 0; i < 12; i++) {
          await rig.fling(up: true, distance: 450);
        }
      });
      router
        ..pop()
        ..pop();
      await rig.idle(const Duration(seconds: 2));
      await rig.sampleMemory('after chat');

      // --- 5. cases list (Mine) ------------------------------------------
      await rig.timeToFrame(
        'tab_switch_mine',
        () => rig.tapNav(3),
        find.byType(MineScreen),
      );
      await rig.idle(const Duration(seconds: 3));
      await rig.scroll('cases_list_scroll', () async {
        for (var i = 0; i < 6; i++) {
          await rig.fling(up: true, distance: 450);
        }
        for (var i = 0; i < 6; i++) {
          await rig.fling(up: false, distance: 450);
        }
      });
      await rig.sampleMemory('after cases list');

      // --- 6. the rest of the tap latencies ----------------------------
      for (var i = 0; i < _reps; i++) {
        await rig.timeToFrame(
          'tab_switch_search',
          () => rig.tapNav(1),
          find.byType(SearchScreen),
        );
        await rig.idle(const Duration(seconds: 1));
        await rig.timeToFrame(
          'tab_switch_feed',
          () => rig.tapNav(0),
          find.byType(FeedScreen),
        );
        await rig.idle(const Duration(seconds: 1));
      }
      if (authorName != null) {
        for (var i = 0; i < _reps; i++) {
          await rig.timeToFrame(
            'open_profile',
            () async => unawaited(router.push(AppRoutes.lawyer(authorName))),
            find.byType(AttorneyProfileScreen),
          );
          await rig.idle(const Duration(seconds: 3));
          router.pop();
          await rig.idle(const Duration(seconds: 1));
        }
      } else {
        debugPrint('perf: no attorney in the feed, profile latency skipped');
      }
      for (var i = 0; i < _reps; i++) {
        final context = tester.element(find.byType(FeedScreen));
        await rig.timeToFrame(
          'theme_picker_open',
          () async => unawaited(ThemePickerSheet.show(context)),
          find.byType(ThemePickerSheet),
        );
        await rig.idle(const Duration(seconds: 1));
        router.pop();
        await rig.idle(const Duration(seconds: 1));
      }

      // --- 7. memory after the whole run -----------------------------------
      await rig.idle(const Duration(seconds: 5));
      await rig.sampleMemory('end of run (settled)');

      // --- result -----------------------------------------------------------
      final result = PerfResult(
        device: {
          'platform': _platform.isEmpty ? Platform.operatingSystem : _platform,
          'model': _model,
          'os_version': Platform.operatingSystemVersion,
          'mode': 'profile',
          'refresh_rate_hz': rig.refreshRate,
          'frame_budget_ms': double.parse(rig.budgetMs.toStringAsFixed(2)),
          'acts_as_attorney': attorneyMode,
        },
        coldStart: {
          for (final e in PerfMarks.all.entries)
            e.key: double.parse((e.value / 1000).toStringAsFixed(1)),
        },
        nativeStart: double.tryParse(_nativeFirstFrame) == null
            ? null
            : {
                'first_frame_ms': double.parse(_nativeFirstFrame),
                if (double.tryParse(_nativeInit) != null)
                  'framework_init_ms': double.parse(_nativeInit),
              },
        scenarios: rig.scenarios,
        latency: rig.latency,
        memory: rig.memory,
        video: video,
      );
      final json = const JsonEncoder.withIndent('  ').convert(result.toJson());
      final markdown = result.toMarkdown();
      debugPrint('perf: RESULT\n$markdown');
      try {
        final dir = Directory(
          '${(await getApplicationDocumentsDirectory()).path}/lb_perf',
        )..createSync(recursive: true);
        File('${dir.path}/perf_result.json').writeAsStringSync(json);
        File('${dir.path}/perf_result.md').writeAsStringSync(markdown);
      } on Object catch (e) {
        debugPrint('perf: could not write the result on the phone ($e)');
      }
      binding.reportData = {
        ...?binding.reportData,
        'perf_result': result.toJson(),
        'perf_markdown': markdown,
      };
      await rig.dispose();
      FlutterError.onError = originalOnError;
    },
    timeout: const Timeout(Duration(minutes: 25)),
  );
}

/// Taps segment [index] of the topmost PillTabs on screen.
Future<void> _tapPill(PerfRig rig, int index) async {
  final pills = find.byWidgetPredicate((w) => w is PillTabs).hitTestable();
  final elements = pills.evaluate().toList()
    ..sort((a, b) {
      final ay = (a.renderObject! as RenderBox).localToGlobal(Offset.zero);
      final by = (b.renderObject! as RenderBox).localToGlobal(Offset.zero);
      return ay.dy.compareTo(by.dy);
    });
  expect(elements, isNotEmpty, reason: 'pill tabs');
  final pill = elements.first;
  final box = pill.renderObject! as RenderBox;
  final n = (pill.widget as PillTabs<Object?>).tabs.length;
  final origin = box.localToGlobal(Offset.zero);
  await rig.tester.tapAt(
    Offset(
      origin.dx + box.size.width * (index + 0.5) / n,
      origin.dy + box.size.height / 2,
    ),
  );
}

/// Posts | Reels (| Cases) of the feed header.
Future<void> _tapFeedTab(PerfRig rig, int index) => _tapPill(rig, index);
