import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/auth/application/qr_login_providers.dart';
import 'package:lawbid/features/auth/data/qr_login_repository.dart';
import 'package:lawbid/features/auth/presentation/screens/web_qr_login_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/qr/presentation/my_qr_screen.dart';
import 'package:lawbid/features/qr/presentation/qr_scanner_screen.dart';
import 'package:lawbid/features/qr/presentation/web_login_link_screen.dart';

import '../features/profile/profile_fakes.dart';
import '../helpers/long_locale.dart';
import '../helpers/onboarding_harness.dart' show FixedUserController;
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20: the QR screens (my code, scanner, website sign-in,
/// the phone's «Sign in on the web?») on a 360 dp phone in the longest
/// translation of every key, right-to-left, Nepali, Arabic and Russian, at
/// text scale 1 and 1.1. Any overflow fails.
class _FakeQr implements QrLoginRepository {
  @override
  Future<WebLoginCode> createCode() async => const WebLoginCode(
        qrId: 'AbCdEf1234567890abcd',
        pollSecret: 'secret',
        url: 'https://lawbid.dev/q/AbCdEf1234567890abcd',
        expiresIn: Duration(seconds: 120),
      );

  @override
  Future<WebLoginStatus> poll(WebLoginCode code) async =>
      WebLoginStatus.pending;

  @override
  Future<WebLoginPreview> preview(String qrId) async => WebLoginPreview(
        deviceName: 'Chrome · Windows',
        userAgent: 'Mozilla/5.0',
        ipHint: '203.0.113.x',
        createdAt: DateTime.utc(2026, 10, 20),
        expiresIn: const Duration(seconds: 120),
      );

  @override
  Future<void> answer(String qrId, {required bool approve}) async {}
}

class _Session extends SessionController {
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

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      group('QR screens: no overflow at 360 dp ($name, text x$scale)', () {
        Future<void> pump(WidgetTester tester, Widget home) async {
          useNarrowPhone(tester);
          final List<Override> overrides = [
            ...uxOverrides(translator: t),
            qrLoginRepositoryProvider.overrideWithValue(_FakeQr()),
            sessionControllerProvider.overrideWith(_Session.new),
            currentUserControllerProvider.overrideWith(
              () => FixedUserController(CurrentUserState.ready(attorneyMe())),
            ),
          ];
          await tester.pumpWidget(
            ProviderScope(
              overrides: overrides,
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: AppTheme.light(),
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
                home: home,
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(seconds: 3));
        }

        testWidgets('my QR code', (tester) async {
          await pump(tester, const MyQrScreen());
        });
        testWidgets('scanner', (tester) async {
          await pump(tester, const QrScannerScreen());
        });
        testWidgets('website sign-in code', (tester) async {
          await pump(tester, const WebQrLoginScreen());
        });
        testWidgets('«Sign in on the web?»', (tester) async {
          await pump(
            tester,
            const WebLoginLinkScreen(qrId: 'AbCdEf1234567890abcd'),
          );
        });
      });
    }
  }
}
