import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/settings/storage/presentation/storage_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (client economy plan §5.2): «Данные и память» in both
/// themes, with something in every store so the bar has its colours.
void main() {
  Future<Widget Function(Widget)> wrapper(ThemeData theme) async {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final cache = CacheDatabase(NativeDatabase.memory());
    addTearDown(cache.close);
    await cache.putHttpEntry(
      key: 'k',
      etag: 'e',
      json: 'x' * (300 * 1024),
      bytes: 300 * 1024,
      now: DateTime(2026),
    );
    await cache.putMessages(
      'me',
      'c1',
      [(id: 'm1', createdAt: DateTime(2026), json: 'y' * (900 * 1024))],
    );
    return (Widget child) => uxApp(
          child,
          theme: theme,
          overrides: uxOverrides(
            extra: [
              sharedPreferencesProvider.overrideWithValue(prefs),
              cacheDatabaseProvider.overrideWithValue(cache),
            ],
          ),
        );
  }

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness == Brightness.light ? 'light' : 'dark';
    final theme =
        brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();

    testGoldens('storage screen - $name', (tester) async {
      await tester.pumpWidgetBuilder(
        const StorageScreen(),
        wrapper: await wrapper(theme),
        surfaceSize: const Size(390, 844),
      );
      await tester.pumpAndSettle();
      await screenMatchesGolden(tester, 'storage_screen_$name');
    });
  }
}
