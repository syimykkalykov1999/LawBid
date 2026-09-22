import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
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

  runApp(UncontrolledProviderScope(container: container, child: const LawBidApp()));
}
