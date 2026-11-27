import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/app.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/memory_pressure.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/deeplinks/deep_link_controller.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/diagnostics/crash_reporter.dart';
import 'package:lawbid/core/diagnostics/perf_marks.dart';
import 'package:lawbid/core/diagnostics/sentry_native.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/licenses/bundled_licenses.dart';
import 'package:lawbid/core/media/prefetch_policy.dart';
import 'package:lawbid/core/network/device_key.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/platform/high_refresh_rate.dart';
import 'package:lawbid/core/platform/spotlight_index.dart';
import 'package:lawbid/core/platform/web_consent_notice.dart';
import 'package:lawbid/core/platform/web_gate.dart';
import 'package:lawbid/core/platform/web_isolation.dart';
import 'package:lawbid/core/platform/web_lifecycle.dart';
import 'package:lawbid/core/platform/web_semantics.dart';
import 'package:lawbid/core/security/app_check.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/core/startup/startup_idle_queue.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_book_sync.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/application/people_candidates.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/notifications/application/push_service.dart';
import 'package:lawbid/features/notifications/presentation/qa_notify_switch.dart';
import 'package:lawbid/features/referrals/application/install_referrer.dart';
import 'package:material_ui/material_ui.dart';
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
  // Licence audit 17.11: fonts, copied code and native SDK notices join the
  // Dart packages' licences (read only when a licence list is opened).
  registerBundledLicenses();
  // Owner 2026-10-15 (web): an address is the screen (`/lawyer/anna`), not
  // `/#/lawyer/anna` — links, reload and the back button all work. A no-op
  // on the phone.
  usePathUrlStrategy();
  // Owner 2026-11-08 (web, like Instagram / Telegram Web): a screen opened
  // with push (settings, a chat, a profile) puts its own address in the
  // bar, so reload / bookmark / share keep it (go_router's documented
  // switch; DeepLinkController restores the address after the splash).
  if (kIsWeb) GoRouter.optionURLReflectsImperativeAPIs = true;
  // Owner 2026-10-23: tab visibility / online / page freeze events for the
  // connectivity and realtime code (core/platform/web_lifecycle.dart).
  if (kIsWeb) WebLifecycle.attach();
  // Web is closed until it is switched on (see web_gate.dart).
  if (kIsWeb && !kWebEnabled) {
    runApp(const WebGateApp());
    return;
  }
  AppEnvironment.current = AppEnvironment.forFlavor(flavor);
  // Owner 2026-11-03: 120 Hz phones draw at 60 Hz unless asked. Android
  // only, fire-and-forget, never throws (core/platform/high_refresh_rate).
  unawaited(HighRefreshRate.enable());

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
  // D1-49 (13.11): screen readers on the website get the semantics tree
  // from the first frame (admin switch client.web_semantics_enabled).
  WebSemantics.start(prefs);
  // Row 173: the website's cross-origin isolation (admin switch
  // web.cross_origin_isolation), kept for boot_head.js.
  WebIsolation.start(prefs);
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
      deviceTracesCleanerProvider.overrideWith(
        (ref) => ref.read(pushServiceProvider).clearDeviceTraces,
      ),
      // OQ-044: ringback / busy / end tones and message sounds.
      appSoundsProvider.overrideWithValue(JustAudioAppSounds()),
      // "Add participant" offers the LawBid people of the phone book.
      groupVideoCallsProvider.overrideWith(
        (ref) => ref.watch(videoCallsEnabledProvider),
      ),
      // Owner 2026-11-04 (R-376): group calls only while `calls_group` is on.
      groupCallsProvider.overrideWith(
        (ref) => ref.watch(groupCallsEnabledProvider),
      ),
      // Owner 2026-11-16 (WhatsApp «Контакты»): the «Новая группа» picker
      // offers my phone book's LawBid people from the last contacts sync
      // kept on the phone; never fails the picker.
      groupContactPeopleProvider.overrideWith((ref) async {
        try {
          final saved = await ref.read(contactsBookSyncProvider).loadSaved();
          return peopleFromContacts([
            for (final c in saved?.people ?? const <ContactPerson>[])
              (
                userId: c.userId,
                displayName: c.displayName,
                avatarUrl: c.avatarUrl,
              ),
          ]);
        } on Object {
          return const [];
        }
      }),
      // Owner 2026-10-23: the Q&A's notification switch.
      qaNotifySwitchProvider.overrideWithValue(() => const QaNotifySwitch()),
      groupCallPortProvider.overrideWith(
        (ref) => GroupCallPort(
          start:
              (
                groupId, {
                required title,
                avatarUrl,
                video = false,
                userIds = const [],
              }) => ref
                  .read(callControllerProvider.notifier)
                  .startGroupCall(
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
  // Web bundle budget (17.11): on the web the built-in ru/en strings are
  // assets (core/l10n/static_strings.dart, pre-downloaded by boot_head.js
  // beside main.dart.wasm). No frame before they are in memory — the HTML
  // splash stays, a failed read is tried again with pauses — so the first
  // frame never shows a raw key. No timeout here, by design. Phones: no wait.
  await container
      .read(l10nCacheControllerProvider.notifier)
      .builtInStringsReady();

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

  // Perf batch 4 (row 127): the phone's low-memory warning frees the app's
  // own memory copies too (core/cache/memory_pressure.dart).
  container.read(memoryPressureProvider);

  // Verify 18.11 (AN2): usage events carry the session's token so the
  // server applies the account's analytics / «Do not sell» answers.
  AppEvents.bearer = () =>
      container.read(sessionControllerProvider)?.accessToken;

  // docs/ops/demo-world.md: Android Play install referrer → pending referral
  // code (first launch only). Fire-and-forget, never delays first paint.
  unawaited(captureInstallReferrer(container));

  // Broken case-file downloads leave the phone — in the background, after
  // the first screens (finished files stay until someone deletes them).
  if (!kIsWeb) {
    unawaited(
      Future<void>.delayed(
        StartupDelays.caseFileCleanUp,
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
    UncontrolledProviderScope(container: container, child: const LawBidApp()),
  );
  // Perf suite markers (no-ops in release): the first frame on the glass.
  PerfMarks.mark('lb.run_app');
  unawaited(
    WidgetsBinding.instance.waitUntilFirstFrameRasterized.then((_) {
      PerfMarks.mark('lb.first_frame');
      SentryNative.markFirstFrame();
      // The pickers' CLDR language names (deferred, language_catalog.dart)
      // arrive at idle after the first frame, before anyone opens a picker.
      StartupIdleQueue.enqueue(loadLanguageDisplayNames);
    }),
  );
}

/// A running group call as the «Join» bar and its people list see
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
  final joined =
      [
        for (final m in call.participants)
          if (m.joined) m,
      ]..sort(
        (a, b) => (b.userId == call.hostId ? 1 : 0).compareTo(
          a.userId == call.hostId ? 1 : 0,
        ),
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
    join: (title, avatarUrl) => ref
        .read(callControllerProvider.notifier)
        .joinGroupCall(
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
