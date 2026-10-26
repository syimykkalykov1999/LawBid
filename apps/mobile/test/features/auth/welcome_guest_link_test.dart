import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/features/auth/application/passkeys_providers.dart';
import 'package:lawbid/features/auth/presentation/screens/welcome_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/email_flows_overrides.dart';
import '../../helpers/long_locale.dart';

/// Owner 2026-10-23: the Welcome screen has no Face ID / fingerprint
/// button any more (it moved to the Log in screen), and «Browse without
/// signing in» shows only while guest browsing is on.
void main() {
  Future<void> pump(WidgetTester tester, {required bool guest}) async {
    useNarrowPhone(tester);
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final db = L10nDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          l10nDatabaseProvider.overrideWithValue(db),
          ...emailFlowsOnOverrides(),
          guestBrowsingEnabledProvider.overrideWithValue(guest),
          // Passkeys available: the old button would have been shown.
          passkeysAvailableProvider.overrideWith((ref) async => true),
        ],
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.blue),
          home: const WelcomeScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('guest browsing off: no browse link, no Face ID button', (
    tester,
  ) async {
    await pump(tester, guest: false);
    expect(find.byKey(const ValueKey('welcome-browse')), findsNothing);
    expect(find.byKey(const ValueKey('welcome-passkey')), findsNothing);
    expect(find.byKey(const ValueKey('welcome-login')), findsOneWidget);
  });

  testWidgets('guest browsing on: the browse link is there', (tester) async {
    await pump(tester, guest: true);
    expect(find.byKey(const ValueKey('welcome-browse')), findsOneWidget);
    expect(find.byKey(const ValueKey('welcome-passkey')), findsNothing);
  });
}
