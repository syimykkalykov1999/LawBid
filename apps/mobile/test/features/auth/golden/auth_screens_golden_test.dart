import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/auth/presentation/screens/otp_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/phone_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/role_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/welcome_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Golden coverage for the 4 auth/onboarding screens (file 07 §9: "4 экрана
/// × 2 темы (приветствие, телефон, код, роль)").
///
/// KNOWN GAP (docs/CHANGELOG.md stage 1.7): file 07 §9 also asks for 3
/// state-variant goldens — field error, button loading, selected role card.
/// Not included here. Those need interaction-driven `tester.tap`/
/// `tester.enterText` sequences timed against the stub repository's
/// simulated network delay, and this whole session has had NO way to
/// actually run `flutter test` to iterate on them (see the sandbox
/// constraint noted throughout docs/CHANGELOG.md) — shipping untested,
/// possibly-flaky interaction goldens seemed worse than flagging the gap
/// honestly. Left as follow-up work once you can run tests on your Mac.
void main() {
  final screens = <String, Widget Function()>{
    'welcome': () => const WelcomeScreen(),
    'phone': () => const PhoneScreen(),
    'otp': () => const OtpScreen(),
    'role': () => const RoleScreen(),
  };

  for (final entry in screens.entries) {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      final themeName = brightness == Brightness.light ? 'light' : 'dark';
      final theme =
          brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();

      testGoldens('${entry.key} screen - $themeName', (tester) async {
        SharedPreferences.setMockInitialValues({});
        final prefs = await SharedPreferences.getInstance();
        // In-memory drift DB: the default L10nDatabase opens a file via
        // path_provider, which has no platform implementation under
        // `flutter test` (MissingPluginException on getTemporaryDirectory).
        final l10nDb = L10nDatabase(NativeDatabase.memory());
        addTearDown(l10nDb.close);

        await tester.pumpWidgetBuilder(
          entry.value(),
          wrapper: (child) => ProviderScope(
            overrides: [
              sharedPreferencesProvider.overrideWithValue(prefs),
              l10nDatabaseProvider.overrideWithValue(l10nDb),
            ],
            child: MaterialApp(theme: theme, home: child),
          ),
          surfaceSize: const Size(390, 844),
        );
        if (entry.key == 'welcome') {
          // WelcomeScreen renders ScalesLogo(animated: true), which drives an
          // AnimationController.repeat() (1-day duration, infinite) per file
          // 07 SS5.2 - the default internal pumpAndSettle() inside
          // screenMatchesGolden never settles against it (same root cause as
          // the AppButton loading golden, see that test's file-level note).
          // Pump one fixed frame instead.
          await screenMatchesGolden(
            tester,
            'auth_${entry.key}_screen_$themeName',
            customPump: (tester) =>
                tester.pump(const Duration(milliseconds: 100)),
          );
        } else {
          await screenMatchesGolden(
            tester,
            'auth_${entry.key}_screen_$themeName',
          );
        }
      });
    }
  }
}
