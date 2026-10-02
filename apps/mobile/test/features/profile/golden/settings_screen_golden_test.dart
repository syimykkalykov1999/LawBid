import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/presence_providers.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/referral_overrides.dart';

/// Golden + reduce-motion coverage for the settings screen redesign (UI
/// modernization pass, 2026-09-27, docs/CHANGELOG.md).
void main() {
  Future<Widget Function(Widget)> wrapper(
    ThemeData theme, {
    bool disableAnimations = false,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final l10nDb = L10nDatabase(NativeDatabase.memory());
    addTearDown(l10nDb.close);
    return (Widget child) => ProviderScope(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            l10nDatabaseProvider.overrideWithValue(l10nDb),
            activityStatusProvider.overrideWith(_ActivityOn.new),
          ],
          child: MaterialApp(
            theme: theme,
            home: MediaQuery(
              data: MediaQueryData(
                size: const Size(390, 844),
                disableAnimations: disableAnimations,
              ),
              child: child,
            ),
          ),
        );
  }

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness == Brightness.light ? 'light' : 'dark';
    final theme =
        brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();

    testGoldens('settings screen - $name', (tester) async {
      await tester.pumpWidgetBuilder(
        const SettingsScreen(),
        wrapper: await wrapper(theme),
        surfaceSize: const Size(390, 844),
      );
      await screenMatchesGolden(tester, 'settings_screen_$name');
    });
  }

  testWidgets('reduce-motion renders final state on the first frame',
      (tester) async {
    final wrap = await wrapper(AppTheme.light(), disableAnimations: true);
    await tester.pumpWidget(wrap(const SettingsScreen()));
    await tester.pump();

    // AppEntrance returns its child as-is under reduce-motion, so rows are
    // on screen immediately and nothing is left ticking.
    expect(find.byType(AppEntrance), findsWidgets);
    expect(find.byType(AppListRow), findsWidgets);
    expect(tester.hasRunningAnimations, isFalse);

    // Let drift's zero-duration stream-cleanup timers fire before teardown.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  });
}

class _ActivityOn extends ActivityStatusNotifier {
  @override
  Future<bool> build() async => true;
}
