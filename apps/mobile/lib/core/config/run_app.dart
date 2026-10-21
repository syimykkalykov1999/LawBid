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
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/device_key.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/platform/web_consent_notice.dart';
import 'package:lawbid/core/platform/web_gate.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/features/channels/application/channel_forward_port.dart';
import 'package:lawbid/features/chat/domain/forward.dart';
import 'package:lawbid/features/chat/presentation/forward_sheet.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/presentation/contact_picker.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/referrals/application/install_referrer.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Shared body of every entry point (`lib/main_dev.dart`,
/// `lib/main_staging.dart`, `lib/main_prod.dart`; `lib/main.dart` = dev):
///
/// ```sh
/// flutter run --flavor dev     -t lib/main_dev.dart     --dart-define-from-file=config/dev.json
/// flutter run --flavor staging -t lib/main_staging.dart --dart-define-from-file=config/staging.json
/// flutter run --flavor prod    -t lib/main_prod.dart    --dart-define-from-file=config/prod.json
/// ```
Future<void> runLawBid(AppFlavor flavor) async {
  WidgetsFlutterBinding.ensureInitialized();
  // Owner 2026-10-15 (web): an address is the screen (`/lawyer/anna`), not
  // `/#/lawyer/anna` — links, reload and the back button all work. A no-op
  // on the phone.
  usePathUrlStrategy();
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
  final (prefs, _, _) = await (
    SharedPreferences.getInstance(),
    AppVersion.load(),
    DeviceKey.load(),
  ).wait;

  // Owner 2026-10-15: the app's own crash reports (admin → Вылеты).
  CrashReporter.install(prefs, AppEnvironment.current);
  // Owner 2026-10-15: the app's own usage events (admin → Аналитика).
  AppEvents.install(prefs, AppEnvironment.current);
  applyWebNoticeChoice(prefs);

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
          running: (groupId) async {
            final call = await ref.read(callsRepositoryProvider).groupCall(
                  groupId,
                );
            if (call == null) return null;
            final me = ref.read(callMyIdProvider);
            final mine =
                call.participants.where((m) => m.userId == me).firstOrNull;
            // Taken out by the host / a vote: no way back into this call.
            if (mine?.status == CallMemberStatus.removed) return null;
            return GroupRunningCall(
              video: call.video,
              members: call.participants.where((m) => m.joined).length,
              returning: mine != null &&
                  (mine.joined || mine.status == CallMemberStatus.left),
              join: (title, avatarUrl) =>
                  ref.read(callControllerProvider.notifier).joinGroupCall(
                        call,
                        peer: CallPeer(
                          id: groupId,
                          isAttorney: false,
                          displayName: title,
                          avatarUrl: avatarUrl,
                        ),
                      ),
            );
          },
        ),
      ),
      callContactPickerProvider.overrideWithValue(
        (context, skip) async => [
          for (final c in await showContactPicker(
                context,
                excludeUserIds: skip,
              ) ??
              const <LawBidContact>[])
            c.userId,
        ],
      ),
    ],
  );

  // L10n cache bootstrap (docs/01_FOUNDATION_AUTH.md §9.4: "читает кэш из
  // drift → показывает UI"): LOCAL-ONLY (Drift read, seeded from the
  // compiled-in static maps on a brand-new install) — no network call, so
  // this never delays first paint and even the splash is localized.
  await container.read(l10nCacheControllerProvider.notifier).bootstrap();

  // Deep links (§12, §10.2 E/F magic link): subscribe now so a cold-start
  // link is captured; DeepLinkController holds it until the splash
  // sequence below has finished.
  unawaited(container.read(deepLinkControllerProvider.notifier).start());

  // docs/ops/demo-world.md: Android Play install referrer → pending referral
  // code (first launch only). Fire-and-forget, never delays first paint.
  unawaited(captureInstallReferrer(container));

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
}
