import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/profile/profile_fakes.dart';
import 'long_locale.dart';
import 'onboarding_harness.dart' show FixedUserController;
import 'referral_overrides.dart';
import 'ux_harness.dart';

/// Shared setup of the newer overflow tests (owner 2026-11-02): one list of
/// languages, one signed-in attorney, one way to put a screen on a 360 dp
/// phone at a given text scale. New overflow tests use this instead of
/// copying the setup. (The older overflow tests keep their own copies;
/// moving them over is a mechanical follow-up.)

/// The worst cases the owner named: the longest text of every key, the same
/// right-to-left, and Nepali, German, Marathi, Arabic and Russian.
Map<String, (Translator, TextDirection)> overflowLocales() => {
      'longest of all languages': (LongestTranslator(), TextDirection.ltr),
      'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
      'ne': (ShippedTranslator('ne'), TextDirection.ltr),
      'de': (ShippedTranslator('de'), TextDirection.ltr),
      'mr': (ShippedTranslator('mr'), TextDirection.ltr),
      'ar': (ShippedTranslator('ar'), TextDirection.rtl),
      'ru': (
        L10nTranslator(language: AppLanguage.ru, cache: const {}),
        TextDirection.ltr,
      ),
    };

/// Text scales: normal, and the app shell's cap.
const overflowScales = [1.0, DeviceTextScale.shellMax];

/// A signed-in, verified attorney.
class AttorneySession extends SessionController {
  @override
  SessionState? build() => SessionState(
        accessToken: 'at',
        sub: 'user-1',
        role: 'attorney',
        sid: 's1',
        verified: true,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2030),
      );
}

/// Puts [home] on a 360 dp phone with a signed-in attorney, in [t]'s
/// language and [dir], at text scale [scale], waits half a second, expects
/// no exception (overflow or otherwise), then tears everything down so no
/// timer stays pending.
Future<void> pumpOverflowApp(
  WidgetTester tester,
  Widget home, {
  required Translator t,
  required TextDirection dir,
  required double scale,
  bool reduceMotion = true,
  Future<void> Function(WidgetTester tester)? act,
}) async {
  useNarrowPhone(tester);
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...uxOverrides(translator: t),
        sharedPreferencesProvider.overrideWithValue(prefs),
        referralOffOverride,
        partnerOffOverride,
        templatesOffOverride,
        sessionControllerProvider.overrideWith(AttorneySession.new),
        currentUserControllerProvider.overrideWith(
          () => FixedUserController(CurrentUserState.ready(attorneyMe())),
        ),
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        builder: (context, child) => Directionality(
          textDirection: dir,
          child: MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(scale),
              disableAnimations: reduceMotion,
            ),
            child: child!,
          ),
        ),
        home: home,
      ),
    ),
  );
  await act?.call(tester);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
  expect(tester.takeException(), isNull);
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(minutes: 5));
}
