import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/feature_flags/feature_flags_providers.dart';
import 'core/l10n/l10n_providers.dart';
import 'core/persistence/persistence_providers.dart';
import 'core/session/session_providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();

  final container = ProviderContainer(
    overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
  );

  // Real-backend wiring pass (docs/CHANGELOG.md, stage-1.7-auth): reads any
  // stored refresh token and resolves a session BEFORE the first frame, so
  // `authGuardRedirect`'s very first redirect decision (evaluated as part
  // of building the initial route) sees real session data instead of
  // racing an async bootstrap that only finishes after the app has already
  // redirected to `/welcome`. `bootstrap()` never throws — see
  // `SessionController.bootstrap`'s doc comment.
  await container.read(sessionControllerProvider.notifier).bootstrap();

  // L10n cache bootstrap (docs/01_FOUNDATION_AUTH.md §9.4: "читает кэш из
  // drift → показывает UI"): LOCAL-ONLY (Drift read, seeded from the
  // compiled-in static maps on a brand-new install) — no network call, so
  // this never delays first paint. See
  // `L10nCacheController.bootstrap`'s doc comment.
  await container.read(l10nCacheControllerProvider.notifier).bootstrap();

  runApp(UncontrolledProviderScope(container: container, child: const LawBidApp()));

  // The network half of the same boot sequence ("...→ в фоне запрашивает
  // bundle?since= → обновляет"), fired AFTER `runApp` so it can never delay
  // first paint. Best-effort — failures are swallowed inside
  // `L10nRepository.refresh`.
  unawaited(container.read(l10nCacheControllerProvider.notifier).refreshInBackground());

  // Feature flags + app_config bootstrap (docs/01_FOUNDATION_AUTH.md §15,
  // "Этап 1.8"): same non-blocking, fired-after-`runApp`, best-effort
  // shape as the L10n background refresh above — `build()` already
  // returned a safe synchronous default (`defaultFeatureFlags`, see
  // `FeatureFlagsController`'s doc comment), so there is nothing here
  // that first paint needs to wait on. A failure is swallowed inside
  // `FeatureFlagsController.refreshInBackground`.
  unawaited(container.read(featureFlagsControllerProvider.notifier).refreshInBackground());
}
