import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Resolved [SharedPreferences] instance. Has no default implementation —
/// `main.dart` MUST override this in `ProviderScope(overrides: [...])` after
/// `await SharedPreferences.getInstance()`, before the first frame. Reading
/// it un-overridden is a programming error (fails fast, not silently).
///
/// MOVED here from `design_system/theme/theme_mode_providers.dart` in stage
/// 1.7 (docs/CHANGELOG.md): local-storage bootstrap isn't a design-system
/// concern — `theme_mode_providers.dart` was just the first (stage 1.5)
/// consumer. Stage 1.7's `OnboardingLocalStore` is the second, and neither
/// should have to import through the design system's theme folder to reach
/// it. `theme_mode_providers.dart` now imports [localKvStoreProvider] from
/// here instead of defining it.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError(
    'sharedPreferencesProvider must be overridden in main.dart after '
    'awaiting SharedPreferences.getInstance().',
  ),
);

final localKvStoreProvider = Provider<LocalKvStore>(
  (ref) => LocalKvStore(ref.watch(sharedPreferencesProvider)),
);
