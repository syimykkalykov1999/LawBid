// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/domain/login_identifier.dart';
import 'package:lawbid/features/auth/domain/password_auth_result.dart';
import 'package:lawbid/features/auth/presentation/screens/change_password_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/forgot_password_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/login_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/set_password_screen.dart';

import 'auth_test_harness.dart';

/// Records the password calls; the answers are set per test.
class PasswordRepo extends RecordingAuthRepository {
  PasswordAuthResult loginResult = const PasswordAuthResult.success();
  PasswordAuthResult setResult = const PasswordAuthResult.success();
  PasswordAuthResult requestResult =
      const PasswordAuthResult.success(channel: 'phone');
  PasswordAuthResult resetResult = const PasswordAuthResult.success();
  final List<({String identifier, String password})> logins = [];
  final List<String> passwordsSet = [];
  final List<String?> currentPasswords = [];
  final List<String> resetRequests = [];
  final List<({String identifier, String code, String password})> resets = [];

  @override
  Future<PasswordAuthResult> signInWithPassword({
    required String identifier,
    required String password,
  }) async {
    logins.add((identifier: identifier, password: password));
    return loginResult;
  }

  @override
  Future<PasswordAuthResult> setPassword(
    String password, {
    String? currentPassword,
  }) async {
    passwordsSet.add(password);
    currentPasswords.add(currentPassword);
    return setResult;
  }

  @override
  Future<PasswordAuthResult> requestPasswordReset(String identifier) async {
    resetRequests.add(identifier);
    return requestResult;
  }

  @override
  Future<PasswordAuthResult> resetPassword({
    required String identifier,
    required String code,
    required String newPassword,
  }) async {
    resets.add((identifier: identifier, code: code, password: newPassword));
    return resetResult;
  }
}

/// The longest languages the owner checks, as a stand-in for the bundles
/// that arrive from the server: Nepali, German and Arabic strings for every
/// key of the password screens, English for the rest.
class _SampleTranslator implements Translator {
  const _SampleTranslator(this.strings);

  final Map<String, String> strings;
  static const _en = StaticTranslatorEn();

  @override
  String t(String key, [Map<String, String>? params]) =>
      strings[key] ?? _en.t(key, params);

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      _en.plural(key, count, params);
}

const _ne = _SampleTranslator({
  'auth.login.title': 'लग इन गर्नुहोस्',
  'auth.login.subtitle':
      'आफ्नो फोन नम्बर वा इमेल र पासवर्ड प्रविष्ट गर्नुहोस् ताकि तपाईं खातामा प्रवेश गर्न सक्नुहुन्छ।',
  'auth.login.identifier.hint': 'फोन नम्बर वा इमेल ठेगाना',
  'auth.login.password.hint': 'पासवर्ड',
  'auth.login.submit': 'लग इन गर्नुहोस्',
  'auth.login.forgot': 'पासवर्ड बिर्सनुभयो?',
  'auth.login.create': 'नयाँ खाता बनाउनुहोस्',
  'auth.setPassword.title': 'पासवर्ड सेट गर्नुहोस्',
  'auth.setPassword.body':
      'यसको प्रयोग गरेर तपाईं SMS कोड बिना नै लग इन गर्न सक्नुहुनेछ।',
  'auth.setPassword.rule': 'कम्तिमा ८ वटा अक्षर',
  'auth.setPassword.submit': 'जारी राख्नुहोस्',
});

const _de = _SampleTranslator({
  'auth.login.title': 'Anmelden',
  'auth.login.subtitle':
      'Gib deine Telefonnummer oder E-Mail-Adresse und dein Passwort ein.',
  'auth.login.identifier.hint': 'Telefonnummer oder E-Mail-Adresse',
  'auth.login.password.hint': 'Passwort',
  'auth.login.submit': 'Anmelden',
  'auth.login.forgot': 'Passwort vergessen?',
  'auth.login.create': 'Konto erstellen',
  'auth.setPassword.title': 'Passwort festlegen',
  'auth.setPassword.body':
      'Damit meldest du dich künftig ohne SMS-Code an – Zugangsdaten-Verwaltung inklusive.',
  'auth.setPassword.rule': 'Mindestens 8 Zeichen',
  'auth.setPassword.submit': 'Weiter',
});

const _ar = _SampleTranslator({
  'auth.login.title': 'تسجيل الدخول',
  'auth.login.subtitle': 'أدخل رقم هاتفك أو بريدك الإلكتروني وكلمة المرور.',
  'auth.login.identifier.hint': 'رقم الهاتف أو البريد الإلكتروني',
  'auth.login.password.hint': 'كلمة المرور',
  'auth.login.submit': 'تسجيل الدخول',
  'auth.login.forgot': 'هل نسيت كلمة المرور؟',
  'auth.login.create': 'إنشاء حساب',
  'auth.setPassword.title': 'أنشئ كلمة مرور',
  'auth.setPassword.body': 'ستستخدمها لتسجيل الدخول بدون رمز SMS.',
  'auth.setPassword.rule': '8 أحرف على الأقل',
  'auth.setPassword.submit': 'متابعة',
});

void main() {
  group('LoginIdentifier', () {
    test('a bare US number gets +1, punctuation is dropped', () {
      expect(LoginIdentifier.tryParse('(415) 555-2680')!.value, '+14155552680');
      expect(
        LoginIdentifier.tryParse('+1 415 555 2680')!.value,
        '+14155552680',
      );
      expect(LoginIdentifier.tryParse('(415) 555-2680')!.isEmail, isFalse);
    });

    test('an e-mail is lower-cased', () {
      final id = LoginIdentifier.tryParse(' Sofia@Example.COM ')!;
      expect(id.value, 'sofia@example.com');
      expect(id.isEmail, isTrue);
    });

    test('junk is refused', () {
      expect(LoginIdentifier.tryParse(''), isNull);
      expect(LoginIdentifier.tryParse('sofia@'), isNull);
      expect(LoginIdentifier.tryParse('12345'), isNull);
    });

    test('password length rule', () {
      expect(isAcceptablePassword('1234567'), isFalse);
      expect(isAcceptablePassword('12345678'), isTrue);
    });
  });

  group('password screens', () {
    late PasswordRepo repo;

    Future<GoRouter> open(
      WidgetTester tester,
      String location, {
      Translator? translator,
      Size size = const Size(390, 800),
      double textScale = 1,
      TextDirection direction = TextDirection.ltr,
      Object? extra,
    }) async {
      tester.view
        ..physicalSize = size * tester.view.devicePixelRatio
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final c = ProviderContainer(
        overrides: [
          ...await authOverrides(repo: repo),
          if (translator != null)
            translatorProvider.overrideWithValue(translator),
        ],
      );
      addTearDown(c.dispose);
      final router = GoRouter(
        initialLocation: location,
        initialExtra: extra,
        routes: authRoutes(),
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp.router(
            theme: AppTheme.light(),
            routerConfig: router,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(textScale),
              ),
              child: Directionality(textDirection: direction, child: child!),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return router;
    }

    setUp(() => repo = PasswordRepo());

    Finder button(String label) => find.widgetWithText(AppButton, label);

    testWidgets(
        'log in stays off until both fields are filled, then signs in '
        'with the normalized number', (tester) async {
      await open(tester, AuthRoutes.login);
      expect(find.byType(LoginScreen), findsOneWidget);
      await tester.tap(button('Log in'), warnIfMissed: false);
      await tester.pump();
      expect(repo.logins, isEmpty);

      await tester.enterText(
        find.byType(TextField).first,
        '(415) 555-2680',
      );
      await tester.enterText(find.byType(TextField).last, 'Demo1234!');
      await tester.pump();
      await tester.tap(button('Log in'));
      await tester.pump();
      expect(
        repo.logins,
        [(identifier: '+14155552680', password: 'Demo1234!')],
      );
      expect(repo.requested, isEmpty, reason: 'no SMS on a password sign-in');
    });

    testWidgets('a wrong password shows one generic error', (tester) async {
      repo.loginResult =
          const PasswordAuthResult(PasswordAuthStatus.invalidCredentials);
      await open(tester, AuthRoutes.login);
      await tester.enterText(find.byType(TextField).first, 'sofia@example.com');
      await tester.enterText(find.byType(TextField).last, 'wrong-pass');
      await tester.pump();
      await tester.tap(button('Log in'));
      await tester.pumpAndSettle();
      expect(
        find.text('Incorrect phone number, email or password.'),
        findsOneWidget,
      );
    });

    testWidgets('the password is hidden until the eye is tapped',
        (tester) async {
      await open(tester, AuthRoutes.login);
      TextField password() => tester.widget<TextField>(
            find.byType(TextField).last,
          );
      expect(password().obscureText, isTrue);
      await tester.tap(find.byTooltip('Show password'));
      await tester.pump();
      expect(password().obscureText, isFalse);
    });

    testWidgets('set password needs 8 characters and saves it', (tester) async {
      await open(tester, AuthRoutes.setPassword);
      expect(find.byType(SetPasswordScreen), findsOneWidget);
      await tester.enterText(find.byType(TextField), '1234567');
      await tester.pump();
      await tester.tap(button('Continue'), warnIfMissed: false);
      await tester.pump();
      expect(repo.passwordsSet, isEmpty);

      await tester.enterText(find.byType(TextField), '12345678');
      await tester.pump();
      await tester.tap(button('Continue'));
      await tester.pump();
      expect(repo.passwordsSet, ['12345678']);
    });

    testWidgets('change password sends the current and the new one',
        (tester) async {
      await open(tester, AuthRoutes.changePassword);
      expect(find.byType(ChangePasswordScreen), findsOneWidget);
      await tester.enterText(find.byType(TextField).first, 'Old-pass-1');
      await tester.enterText(find.byType(TextField).last, 'short');
      await tester.pump();
      await tester.tap(button('Save'), warnIfMissed: false);
      await tester.pump();
      expect(repo.passwordsSet, isEmpty);

      await tester.enterText(find.byType(TextField).last, 'New-pass-22');
      await tester.pump();
      await tester.tap(button('Save'));
      await tester.pump();
      expect(repo.passwordsSet, ['New-pass-22']);
      expect(repo.currentPasswords, ['Old-pass-1']);
    });

    testWidgets(
        'forgot password: code to the phone, then code + new '
        'password', (tester) async {
      await open(
        tester,
        AuthRoutes.forgotPassword,
        extra: '(415) 555-2680',
      );
      expect(find.byType(ForgotPasswordScreen), findsOneWidget);
      await tester.tap(button('Send code'));
      await tester.pumpAndSettle();
      expect(repo.resetRequests, ['+14155552680']);
      expect(find.text('We sent a code by SMS.'), findsOneWidget);

      await tester.enterText(find.byType(TextField).first, '000000');
      await tester.enterText(find.byType(TextField).last, 'Brand-new-1');
      await tester.pump();
      await tester.tap(button('Save and log in'));
      await tester.pump();
      expect(repo.resets, [
        (identifier: '+14155552680', code: '000000', password: 'Brand-new-1'),
      ]);
    });

    testWidgets('forgot password: an e-mail is refused, nothing is sent',
        (tester) async {
      await open(tester, AuthRoutes.forgotPassword, extra: 'a@b.co');
      await tester.tap(button('Send code'));
      await tester.pumpAndSettle();
      expect(repo.requested, isEmpty);
    });

    for (final (name, translator, direction) in [
      ('ru', const StaticTranslatorRu(), TextDirection.ltr),
      ('ne', _ne, TextDirection.ltr),
      ('de', _de, TextDirection.ltr),
      ('ar', _ar, TextDirection.rtl),
    ]) {
      for (final location in [
        AuthRoutes.login,
        AuthRoutes.setPassword,
        AuthRoutes.changePassword,
        AuthRoutes.forgotPassword,
      ]) {
        testWidgets('$location fits 360 dp without overflow ($name, x1.3)',
            (tester) async {
          await open(
            tester,
            location,
            translator: translator,
            size: const Size(360, 640),
            textScale: 1.3,
            direction: direction,
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  });
}
