import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:lawbid/app.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/deeplinks/deep_link_controller.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/diagnostics/crash_reporter.dart';
import 'package:lawbid/core/diagnostics/perf_marks.dart';
import 'package:lawbid/core/diagnostics/sentry_native.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/prefetch_policy.dart';
import 'package:lawbid/core/network/device_key.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/platform/spotlight_index.dart';
import 'package:lawbid/core/platform/web_consent_notice.dart';
import 'package:lawbid/core/platform/web_gate.dart';
import 'package:lawbid/core/platform/web_lifecycle.dart';
import 'package:lawbid/core/security/app_check.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid/features/channels/application/channel_forward_port.dart';
import 'package:lawbid/features/chat/domain/forward.dart';
import 'package:lawbid/features/chat/presentation/forward_sheet.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/notifications/presentation/qa_notify_switch.dart';
import 'package:lawbid/features/referrals/application/install_referrer.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// How long a local step before `runApp` may take on its own (a lookup, a
/// storage read) before the app starts without its answer.
const _startStepTimeout = Duration(seconds: 3);

/// Shared body of every entry point (`lib/main_dev.dart`,
/// `lib/main_staging.dart`, `lib/main_prod.dart`; `lib/main.dart` = dev):
///
/// ```sh
/// flutter run --flavor dev     -t lib/main_dev.dart     --dart-define-from-file=config/dev.json
/// flutter run --flavor staging -t lib/main_staging.dart --dart-define-from-file=config/staging.json
/// flutter run --flavor prod    -t lib/main_prod.dart    --dart-define-from-file=config/prod.json
/// ```
Future<void> runLawBid(AppFlavor flavor) async {
  PerfMarks.start();
  SentryNative.markProcessStart();
  WidgetsFlutterBinding.ensureInitialized();
  // Owner 2026-10-15 (web): an address is the screen (`/lawyer/anna`), not
  // `/#/lawyer/anna` — links, reload and the back button all work. A no-op
  // on the phone.
  usePathUrlStrategy();
  // Owner 2026-10-23: tab visibility / online / page freeze events for the
  // connectivity and realtime code (core/platform/web_lifecycle.dart).
  if (kIsWeb) WebLifecycle.attach();
  // Web is closed until it is switched on (see web_gate.dart).
  if (kIsWeb && !kWebEnabled) {
    runApp(const WebGateApp());
    return;
  }
  AppEnvironment.current = AppEnvironment.forFlavor(flavor);

  // Real installed version for X-App-Version (docs/01_FOUNDATION_AUTH.md
  // §7) — before any request, including the splash's /config/bootstrap.
  // Local platform call, no network.
  // Owner 2026-10-05 (docs/CLIENT_FRAUD.md): the phone's X-Device-Key.
  // Owner 2026-10-24 (slow-link pass): AppVersion.load() is an HTTP fetch of
  // version.json on the web and DeviceKey.load() a platform call; neither
  // may hold the first frame on a bad connection. After 3 s the app starts
  // with the fallback version (see AppVersion.fallback) and the lookup
  // finishes in the background.
  final (prefs, _, _) = await (
    SharedPreferences.getInstance(),
    AppVersion.load().timeout(
      _startStepTimeout,
      onTimeout: () => AppVersion.current,
    ),
    DeviceKey.load().timeout(_startStepTimeout, onTimeout: () {}),
  ).wait;

  // Owner 2026-10-15: the app's own crash reports (admin → Вылеты).
  CrashReporter.install(prefs, AppEnvironment.current);
  // Owner 2026-10-22: Sentry's native SDK (native crashes, ANRs) with the
  // DSN the last bootstrap saved — prod release only, never delays paint.
  unawaited(SentryNative.start(prefs, flavor));
  // Owner 2026-10-15: the app's own usage events (admin → Аналитика).
  // Owner 2026-10-22 (audit #4 §5): the web notice's answer first — the
  // events start only after a yes.
  applyWebNoticeChoice(prefs);
  AppEvents.install(prefs, AppEnvironment.current);
  // Security research #5 (2026-10-22), B1: Firebase App Check starts now so
  // the first code request already carries its token; a build without the
  // Firebase files just logs «off» (core/security/app_check.dart).
  unawaited(FirebaseAppCheckClient.instance.start());

  final container = ProviderContainer(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      // OQ-041: calls ring through the phone's own call screen (web: the
      // in-app screen only).
      if (!kIsWeb)
        systemCallUiProvider.overrideWithValue(const CallkitSystemUi()),
      // OQ-044: ringback / busy / end tones and message sounds.
      appSoundsProvider.overrideWithValue(JustAudioAppSounds()),
      // "Add participant" offers the LawBid people of the phone book.
      groupVideoCallsProvider.overrideWith(
        (ref) => ref.watch(videoCallsEnabledProvider),
      ),
      // Owner 2026-10-23: the Q&A's notification switch.
      qaNotifySwitchProvider.overrideWithValue(() => const QaNotifySwitch()),
      // Owner 2026-10-21 (Telegram «Переслать»): a channel post into chats.
      channelForwardPortProvider.overrideWithValue(
        (context, ref, {required postId}) => forwardWithSheet(
          context,
          ref,
          [ForwardSource(ForwardSourceKind.channelPost, postId)],
        ),
      ),
      groupCallPortProvider.overrideWith(
        (ref) => GroupCallPort(
          start: (
            groupId, {
            required title,
            avatarUrl,
            video = false,
            userIds = const [],
          }) =>
              ref.read(callControllerProvider.notifier).startGroupCall(
                    groupId,
                    peer: CallPeer(
                      id: groupId,
                      isAttorney: false,
                      displayName: title,
                      avatarUrl: avatarUrl,
                    ),
                    video: video,
                    userIds: userIds,
                  ),
          running: (groupId) async => _runningCall(
            ref,
            await ref.read(callsRepositoryProvider).groupCall(groupId),
            ownerId: groupId,
          ),
          // Owner 2026-10-21 (inbox 20e): the call of a channel.
          startChannel: (
            channelId, {
            required title,
            avatarUrl,
            video = false,
          }) =>
              ref.read(callControllerProvider.notifier).startChannelCall(
                    channelId,
                    peer: CallPeer(
                      id: channelId,
                      isAttorney: false,
                      displayName: title,
                      avatarUrl: avatarUrl,
                    ),
                    video: video,
                  ),
          runningChannel: (channelId) async => _runningCall(
            ref,
            await ref.read(callsRepositoryProvider).channelCall(channelId),
            ownerId: channelId,
          ),
        ),
      ),
    ],
  );

  // S16-1: the session check (keychain + token refresh + `GET /me/session`)
  // starts now and runs beside the translation load and the first frame;
  // the splash only waits for its result (AppStartupController.start).
  // The prefetch gate is created first (it listens to connectivity).
  final startup = (container..read(prefetchGateProvider)).read(
    appStartupProvider.notifier,
  );
  unawaited(startup.prime());

  // L10n cache bootstrap (docs/01_FOUNDATION_AUTH.md §9.4: "читает кэш из
  // drift → показывает UI"): LOCAL-ONLY (Drift read, seeded from the
  // compiled-in static maps on a brand-new install) — no network call, so
  // this never delays first paint and even the splash is localized.
  // Owner 2026-10-24 (slow-link pass): the first frame must not depend on
  // the browser's storage. On the web this is the shared worker +
  // IndexedDB database (drift); when it is slow or stuck the translator
  // answers from the compiled-in seed (L10nTranslator's layered fallback)
  // and the cached bundle lands by itself when the read finishes.
  await container
      .read(l10nCacheControllerProvider.notifier)
      .bootstrap()
      .timeout(_startStepTimeout, onTimeout: () {})
      .onError<Object>((_, __) {});

  // Deep links (§12, §10.2 E/F magic link): subscribe now so a cold-start
  // link is captured; DeepLinkController holds it until the splash
  // sequence below has finished.
  unawaited(container.read(deepLinkControllerProvider.notifier).start());

  // Owner 2026-10-27 (app indexing): iPhone Spotlight index — created now so
  // it empties itself when the account signs out. No-op off iOS.
  if (spotlightSupported) container.read(spotlightIndexerProvider);

  // docs/ops/demo-world.md: Android Play install referrer → pending referral
  // code (first launch only). Fire-and-forget, never delays first paint.
  unawaited(captureInstallReferrer(container));

  // Owner 2026-10-22 (load audit finding 8): case files not opened for a
  // week leave the phone — in the background, after the first screens.
  if (!kIsWeb) {
    unawaited(
      Future<void>.delayed(
        const Duration(seconds: 20),
        CaseFileCache.cleanUp,
      ),
    );
  }

  // Everything network-bound — session check (refresh token → access
  // token), `/config/bootstrap` flags + legal docs + min version, the
  // translation bundle refresh, and `GET /users/me` — runs on the Splash
  // screen (stage 1.7 mobile, docs/01_FOUNDATION_AUTH.md §10.2 A; see
  // AppStartupController). AppRouterGuard holds every route at `/splash`
  // until it finishes, so there is no first-redirect race.
  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const LawBidApp(),
    ),
  );
  // Perf suite markers (no-ops in release): the first frame on the glass.
  PerfMarks.mark('lb.run_app');
  unawaited(
    WidgetsBinding.instance.waitUntilFirstFrameRasterized
        .then((_) {
      PerfMarks.mark('lb.first_frame');
      SentryNative.markFirstFrame();
    }),
  );
}

/// A running group / channel call as the «Join» bar and its people list see
/// it (host first); null when there is none or we were taken out of it.
GroupRunningCall? _runningCall(
  Ref ref,
  AppCall? call, {
  required String ownerId,
}) {
  if (call == null) return null;
  final me = ref.read(callMyIdProvider);
  final mine = call.participants.where((m) => m.userId == me).firstOrNull;
  // Taken out by the host / a vote: no way back into this call.
  if (mine?.status == CallMemberStatus.removed) return null;
  final joined = [
    for (final m in call.participants)
      if (m.joined) m,
  ]..sort(
      (a, b) => (b.userId == call.hostId ? 1 : 0)
          .compareTo(a.userId == call.hostId ? 1 : 0),
    );
  return GroupRunningCall(
    video: call.video,
    members: joined.length,
    people: [
      for (final m in joined)
        RunningCallMember(
          userId: m.userId,
          name: m.name,
          avatarUrl: m.avatarUrl,
          muted: m.muted,
          host: m.userId == call.hostId,
        ),
    ],
    returning:
        mine != null && (mine.joined || mine.status == CallMemberStatus.left),
    join: (title, avatarUrl) =>
        ref.read(callControllerProvider.notifier).joinGroupCall(
              call,
              peer: CallPeer(
                id: ownerId,
                isAttorney: false,
                displayName: title,
                avatarUrl: avatarUrl,
              ),
            ),
  );
}
