import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/auth/application/passkeys_providers.dart';
import 'package:lawbid/features/auth/presentation/screens/login_screen.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-23: the Log in screen carries «Forgot password?» at the
/// start of a row and «Face ID / fingerprint» at its end. The row must not
/// overflow at 360 dp in the longest translation of every key, right to
/// left, Nepali, Arabic and Russian, at text scale 1 and 1.3, in every
/// theme; with no passkeys the link is simply absent.
void main() {
  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  for (final scale in [1.0, 1.3]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      for (final id in AppThemeId.values) {
        testWidgets('login: no overflow ($name, x$scale, ${id.name})', (
          tester,
        ) async {
          useNarrowPhone(tester);
          final overrides = <Override>[
            ...uxOverrides(translator: t),
            passkeysAvailableProvider.overrideWith((ref) async => true),
          ];
          await tester.pumpWidget(
            ProviderScope(
              overrides: overrides,
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: AppTheme.of(id),
                builder: (context, child) => Directionality(
                  textDirection: dir,
                  child: MediaQuery(
                    data: MediaQuery.of(context).copyWith(
                      textScaler: TextScaler.linear(scale),
                      disableAnimations: true,
                    ),
                    child: child!,
                  ),
                ),
                home: const LoginScreen(),
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          expect(tester.takeException(), isNull);
          // On the same row as «Forgot password?».
          final link = find.byKey(const ValueKey('login-passkey'));
          expect(link, findsOneWidget);
          final forgot = find.text(t.t('auth.login.forgot'));
          expect(forgot, findsOneWidget);
          final a = tester.getRect(find.ancestor(
            of: forgot,
            matching: find.byType(InkWell),
          ));
          final b = tester.getRect(link);
          expect((a.top - b.top).abs(), lessThan(1));
          // Not past the screen edge on either side.
          expect(b.left, greaterThanOrEqualTo(0));
          expect(b.right, lessThanOrEqualTo(360));
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(seconds: 1));
        });
      }
    }
  }

  testWidgets('login: no link when passkeys are not available', (
    tester,
  ) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(translator: LongestTranslator()),
          passkeysAvailableProvider.overrideWith((ref) async => false),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const LoginScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const ValueKey('login-passkey')), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
