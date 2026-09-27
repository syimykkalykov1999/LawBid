import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/l10n/l10n_providers.dart';
import 'core/persistence/persistence_providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();

  final container = ProviderContainer(
    overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
  );

  // L10n cache bootstrap (docs/01_FOUNDATION_AUTH.md §9.4: "читает кэш из
  // drift → показывает UI"): LOCAL-ONLY (Drift read, seeded from the
  // compiled-in static maps on a brand-new install) — no network call, so
  // this never delays first paint and even the splash is localized.
  await container.read(l10nCacheControllerProvider.notifier).bootstrap();

  // Everything network-bound — session check (refresh token → access
  // token), `/config/bootstrap` flags + legal docs + min version, the
  // translation bundle refresh, and `GET /users/me` — now runs on the
  // Splash screen (stage 1.7 mobile, docs/01_FOUNDATION_AUTH.md §10.2 A;
  // see AppStartupController). AppRouterGuard holds every route at
  // `/splash` until it finishes, so there is no first-redirect race.
  runApp(UncontrolledProviderScope(container: container, child: const LawBidApp()));
}
