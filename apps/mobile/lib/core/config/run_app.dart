import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/app.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/deeplinks/deep_link_controller.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
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
  AppEnvironment.current = AppEnvironment.forFlavor(flavor);

  // Real installed version for X-App-Version (docs/01_FOUNDATION_AUTH.md
  // §7) — before any request, including the splash's /config/bootstrap.
  // Local platform call, no network.
  final (prefs, _) =
      await (SharedPreferences.getInstance(), AppVersion.load()).wait;

  final container = ProviderContainer(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      // OQ-041: calls ring through the phone's own call screen.
      systemCallUiProvider.overrideWithValue(const CallkitSystemUi()),
      // OQ-044: ringback / busy / end tones and message sounds.
      appSoundsProvider.overrideWithValue(JustAudioAppSounds()),
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
