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
// Data: the perf attorney `npm run seed:perf --workspace apps/api` makes
// (+12125550190 / Test1234!; defaults below) or, with
// --dart-define=PERF_DEMO_CODE=<8 characters>, a demo-world invite. Never a
// real account. Optional: PERF_PHONE, PERF_PASSWORD.
//
// Every scenario is a guarded step: a failure is logged with its stack, noted
// in the result and the run goes on; the result is ALWAYS written.
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
import 'package:lawbid/core/design_system/widgets/bars/app_bottom_nav.dart';
import 'package:lawbid/core/diagnostics/perf_marks.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/theme/theme_picker_sheet.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
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
  defaultValue: '+12125550190',
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

// Run only some scenarios (comma list of: feed, reels, search, chats, cases,
// taps), e.g. --dart-define=PERF_ONLY=search,chats. Empty = all. The sign-in
// and the feed warm-up always run.
const _only = String.fromEnvironment('PERF_ONLY');

/// How many times the scroll scenarios (feed, reels, search, chats, cases) run
/// in a row, e.g. --dart-define=PERF_ROUNDS=3. Memory is sampled after every
/// scenario of every round: warm-up (growth only in round 1) or a leak
/// (growth in every round) shows in the per-round table.
final _rounds = (int.tryParse(const String.fromEnvironment('PERF_ROUNDS')) ?? 1)
    .clamp(1, 10);

/// How many times each tap latency is repeated (the median is judged).
const _reps = 3;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized()
    ..framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.benchmarkLive;

  testWidgets(
    'LawBid performance suite',
    (tester) async {
      final originalOnError = FlutterError.onError;
      final notes = <String>[];
      PerfRig? rig;
      var attorneyMode = false;
      final video = <String, List<double>>{};

      Future<void> emit() async {
        final r = rig;
        final result = PerfResult(
          device: {
            'platform':
                _platform.isEmpty ? Platform.operatingSystem : _platform,
            'model': _model,
            'os_version': Platform.operatingSystemVersion,
            'mode': 'profile',
            'refresh_rate_hz': r?.refreshRate ?? 60,
            'frame_budget_ms':
                double.parse((r?.budgetMs ?? 16.67).toStringAsFixed(2)),
            'acts_as_attorney': attorneyMode,
            if (_only.isNotEmpty) 'only': _only,
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
          scenarios: r?.scenarios ?? {},
          latency: r?.latency ?? {},
          memory: r?.memory ?? [],
          video: video,
          notes: notes,
        );
        final json =
            const JsonEncoder.withIndent('  ').convert(result.toJson());
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
      }

      try {
        await runLawBid(AppFlavor.dev);
        // A missing image or a dropped socket must not end the measurement.
        FlutterError.onError =
            (d) => debugPrint('perf: FlutterError ${d.exceptionAsString()}');

        final rg = rig = PerfRig(binding, tester);
        await rg.waitUntil(
          () => find.byType(LawBidApp).evaluate().isNotEmpty,
          timeout: const Duration(seconds: 30),
          what: 'the app widget',
        );
        final container = ProviderScope.containerOf(
          tester.element(find.byType(LawBidApp)),
        );
        final router = container.read(appRouterProvider);
        String location() =>
            router.routerDelegate.currentConfiguration.uri.path;
        PerfMarks.takeVideoStarts();

        Future<bool> step(
          String name,
          Future<void> Function() body, {
          bool always = false,
        }) async {
          final wanted = _only.isEmpty ||
              always ||
              _only.split(',').map((e) => e.trim()).contains(name);
          if (!wanted) {
            debugPrint('perf: step $name not selected');
            return false;
          }
          debugPrint('perf: >>> step $name');
          try {
            await body();
            debugPrint('perf: <<< step $name ok');
            return true;
          } on Object catch (e, st) {
            debugPrint('perf: !!! step $name failed: $e\n$st');
            notes.add('step `$name` failed: ${'$e'.split('\n').first}');
            // Back to a known place for the next step.
            try {
              router.go(AppRoutes.feed);
              await rg.idle(const Duration(seconds: 2));
            } on Object catch (_) {}
            return false;
          }
        }

        /// Goes to a tab by tapping it (the real thing) once the shell is up.
        Future<void> goTab(AppTabKey tab) async {
          await rg.tapNav(tab);
          await rg.idle(const Duration(milliseconds: 600));
        }

        // --- sign in (a stored session is reused) -----------------------
        Future<void> signIn() async {
          try {
            await rg.waitUntil(
              () => location() != AppRoutes.splash,
              timeout: const Duration(seconds: 60),
              what: 'splash to finish',
              onTick: rg.tapRetryIfShown,
            );
          } on Object {
            final texts = find
                .byType(Text)
                .evaluate()
                .map((e) => (e.widget as Text).data)
                .whereType<String>()
                .take(25)
                .join(' | ');
            debugPrint('perf: stuck at ${location()}, texts: $texts');
            rethrow;
          }
          if (!location().startsWith(AppRoutes.feed)) {
            if (_demoCode.isNotEmpty) {
              debugPrint('perf: entering the demo with a code');
              final session = await container
                  .read(demoRepositoryProvider)
                  .redeem(_demoCode);
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
              expect(
                result.isSuccess,
                isTrue,
                reason: 'password sign-in: ${result.status}',
              );
              await container
                  .read(currentUserControllerProvider.notifier)
                  .ensureLoaded();
            }
          }
          await rg.waitUntil(
            () => location().startsWith(AppRoutes.feed),
            timeout: const Duration(seconds: 60),
            what: 'the feed (at ${location()})',
          );
          await rg.idle(const Duration(seconds: 3));
          if (await rg.dismissPrimer()) {
            debugPrint('perf: dismissed the notification explanation');
          }
          try {
            await rg.waitUntil(
              () => find.byType(PostCard).hitTestable().evaluate().isNotEmpty,
              timeout: const Duration(seconds: 60),
              what: 'feed posts',
            );
          } on Object {
            final texts = find
                .byType(Text)
                .evaluate()
                .map((e) => (e.widget as Text).data)
                .whereType<String>()
                .take(25)
                .join(' | ');
            debugPrint(
              'perf: no feed posts. at ${location()}, PostCard widgets: '
              '${find.byType(PostCard).evaluate().length}, '
              'feed state: ${container.read(feedProvider)}, texts: $texts',
            );
            final more = find
                .byType(Text)
                .evaluate()
                .map((e) => (e.widget as Text).data)
                .whereType<String>()
                .skip(25)
                .take(60)
                .join(' | ');
            debugPrint(
              'perf: overlays: barriers '
              '${find.byType(ModalBarrier).evaluate().length}, '
              'dialogs ${find.byType(Dialog).evaluate().length}, '
              'sheets ${find.byType(BottomSheet).evaluate().length}, '
              'more texts: $more',
            );
            rethrow;
          }
          await rg.idle(const Duration(seconds: 4));
          attorneyMode = container.read(actsAsAttorneyProvider);
          await rg.sampleMemory('feed idle (baseline)');
        }

        await step('signin', signIn, always: true);

        String? authorName;
        for (var round = 1; round <= _rounds; round++) {
          rg.round = round;
          PerfMarks.takeVideoStarts();
          // --- 1. feed scroll ---------------------------------------------
          await step('feed', () async {
            if (round > 1) await goTab(AppTabKey.feed);
            authorName = container
                .read(feedProvider)
                .value
                ?.items
                .map((p) => p.author)
                .where((a) => !a.isClient)
                .map((a) => a.username)
                .firstOrNull;
            PerfMarks.takeVideoStarts();
            await rg.scroll('feed_scroll', () async {
              for (var i = 0; i < 14; i++) {
                await rg.fling(up: true);
              }
              for (var i = 0; i < 4; i++) {
                await rg.fling(up: false);
              }
            });
            if (round == 1) video['feed'] = PerfMarks.takeVideoStarts();
            await rg.sampleMemory('after feed scroll');
          });

          // --- 2. reels: swipe through 10 videos --------------------------
          await step('reels', () async {
            await rg.tapKey('pill-_FeedTab.reels');
            await rg.idle(const Duration(seconds: 4));
            PerfMarks.takeVideoStarts();
            await rg.scroll('reels_swipe_10', () async {
              for (var i = 0; i < 10; i++) {
                await rg.swipePage(up: true);
              }
              await rg.swipePage(up: false);
            });
            if (round == 1) video['reels'] = PerfMarks.takeVideoStarts();
            await rg.tapKey('pill-_FeedTab.posts');
            await rg.idle(const Duration(seconds: 2));
            await rg.sampleMemory('after reels');
          });

          // --- 3. search grid (posts with video previews) ------------------
          await step('search', () async {
            await goTab(AppTabKey.search);
            await rg.waitUntil(
              () => find.byType(SearchScreen).evaluate().isNotEmpty,
              timeout: const Duration(seconds: 10),
              what: 'search',
            );
            await rg.idle(const Duration(seconds: 1));
            await rg.tapKey('pill-${SearchTab.posts}');
            await rg.waitUntil(
              () =>
                  find.byType(PostGridTile).hitTestable().evaluate().isNotEmpty,
              timeout: const Duration(seconds: 30),
              what: 'search grid',
            );
            await rg.idle(const Duration(seconds: 3));
            PerfMarks.takeVideoStarts();
            await rg.scroll('search_grid_scroll', () async {
              for (var i = 0; i < 8; i++) {
                await rg.fling(up: true, distance: 450);
              }
              for (var i = 0; i < 4; i++) {
                await rg.fling(up: false, distance: 450);
              }
            });
            if (round == 1) video['search_grid'] = PerfMarks.takeVideoStarts();
            await rg.sampleMemory('after search grid');

            // Open a reel from the grid (latency): the first video tile.
            for (var i = 0; i < _reps; i++) {
              final tile = find.byWidgetPredicate(
                (w) => w is PostGridTile && w.post.video != null,
              );
              if (tile.hitTestable().evaluate().isEmpty) {
                notes.add('open_reel_from_grid skipped: no video tile in the '
                    'search grid');
                break;
              }
              await rg.timeToFrame(
                'open_reel_from_grid',
                () => rg.tapFirst(tile),
                find.byType(ReelsScreen),
              );
              await rg.idle(const Duration(seconds: 2));
              router.pop();
              await rg.idle(const Duration(seconds: 1));
            }
          });

          // --- 4. chats list ----------------------------------------------
          await step('chats', () async {
            unawaited(router.push(ChatRoutes.inbox));
            await rg.waitUntil(
              () => find
                  .byType(ConversationRow)
                  .hitTestable()
                  .evaluate()
                  .isNotEmpty,
              timeout: const Duration(seconds: 30),
              what: 'chat rows',
            );
            await rg.idle(const Duration(seconds: 2));
            await rg.scroll('chats_list_scroll', () async {
              for (var i = 0; i < 6; i++) {
                await rg.fling(up: true, distance: 450);
              }
              for (var i = 0; i < 6; i++) {
                await rg.fling(up: false, distance: 450);
              }
            });
            await rg.sampleMemory('after chats list');

            // Open a chat by tapping its row (latency, repeated), then keep
            // the last one open for the long-history scroll.
            for (var i = 0; i < _reps; i++) {
              await rg.timeToFrame(
                'open_chat',
                () => rg.tapFirst(find.byType(ConversationRow)),
                find.byType(ConversationScreen),
              );
              await rg.idle(const Duration(seconds: 3));
              if (i < _reps - 1) {
                router.pop();
                await rg.idle(const Duration(seconds: 1));
              }
            }
            await rg.scroll('chat_history_scroll', () async {
              // Older messages sit above: the finger moves down.
              for (var i = 0; i < 12; i++) {
                await rg.fling(up: false, distance: 450);
              }
              for (var i = 0; i < 12; i++) {
                await rg.fling(up: true, distance: 450);
              }
            });
            router
              ..pop()
              ..pop();
            await rg.idle(const Duration(seconds: 2));
            await rg.sampleMemory('after chat');
          });

          // --- 5. cases list (Mine) ----------------------------------------
          await step('cases', () async {
            await rg.timeToFrame(
              'tab_switch_mine',
              () => rg.tapNav(AppTabKey.mine),
              find.byType(MineScreen),
            );
            await rg.idle(const Duration(seconds: 3));
            await rg.scroll('cases_list_scroll', () async {
              for (var i = 0; i < 6; i++) {
                await rg.fling(up: true, distance: 450);
              }
              for (var i = 0; i < 6; i++) {
                await rg.fling(up: false, distance: 450);
              }
            });
            await rg.sampleMemory('after cases list');
          });
        }
        rg.round = _rounds;

        // --- 6. the rest of the tap latencies ----------------------------
        await step('taps', () async {
          for (var i = 0; i < _reps; i++) {
            await rg.timeToFrame(
              'tab_switch_search',
              () => rg.tapNav(AppTabKey.search),
              find.byType(SearchScreen),
            );
            await rg.idle(const Duration(seconds: 1));
            await rg.timeToFrame(
              'tab_switch_feed',
              () => rg.tapNav(AppTabKey.feed),
              find.byType(FeedScreen),
            );
            await rg.idle(const Duration(seconds: 1));
          }
          final author = authorName ??
              container
                  .read(feedProvider)
                  .value
                  ?.items
                  .map((p) => p.author)
                  .where((a) => !a.isClient)
                  .map((a) => a.username)
                  .firstOrNull;
          if (author != null) {
            for (var i = 0; i < _reps; i++) {
              await rg.timeToFrame(
                'open_profile',
                () async => unawaited(router.push(AppRoutes.lawyer(author))),
                find.byType(AttorneyProfileScreen),
              );
              await rg.idle(const Duration(seconds: 3));
              router.pop();
              await rg.idle(const Duration(seconds: 1));
            }
          } else {
            notes.add('open_profile skipped: no attorney in the feed');
          }
          for (var i = 0; i < _reps; i++) {
            final context = tester.element(find.byType(FeedScreen));
            await rg.timeToFrame(
              'theme_picker_open',
              () async => unawaited(ThemePickerSheet.show(context)),
              find.byType(ThemePickerSheet),
            );
            await rg.idle(const Duration(seconds: 1));
            router.pop();
            await rg.idle(const Duration(seconds: 1));
          }
        });

        // --- 7. memory after the whole run ---------------------------------
        Future<void> settle() async {
          await rg.idle(const Duration(seconds: 5));
          await rg.sampleMemory('end of run (settled)');
        }

        await step('end', settle, always: true);

        // Videos that could not play here are told, not failed.
        for (final e in video.entries) {
          if (e.value.isEmpty) {
            notes.add('video start `${e.key}` skipped: no video started '
                'playing (no local video in that list)');
          }
        }
      } on Object catch (e, st) {
        debugPrint('perf: run aborted: $e\n$st');
        notes.add('run aborted: ${'$e'.split('\n').first}');
      } finally {
        try {
          await emit();
        } on Object catch (e, st) {
          debugPrint('perf: could not build the result: $e\n$st');
          binding.reportData = {
            ...?binding.reportData,
            'perf_markdown': '# LawBid on-device performance\n\n'
                'The result could not be built: $e\nNotes: $notes\n',
          };
        }
        await rig?.dispose();
        FlutterError.onError = originalOnError;
      }
    },
    timeout: const Timeout(Duration(minutes: 25)),
  );
}
