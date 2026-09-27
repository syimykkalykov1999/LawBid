import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/data/sms_code_retriever.dart';
import 'package:lawbid/features/auth/domain/onboarding_flow_state.dart';
import 'package:lawbid/features/auth/domain/onboarding_step.dart';
import 'package:lawbid/features/auth/domain/otp_verify_result.dart';
import 'package:lawbid/features/auth/presentation/screens/email_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/otp_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/phone_screen.dart';

import 'auth_test_harness.dart';

const _phone = '+12025550123';
const _token = 'Tk_-0123456789abcdefghijABCDEFGHIJ012345678';
const _verifier = 'Vf_-0123456789abcdefghijABCDEFGHIJ012345678';

void main() {
  late RecordingAuthRepository repo;

  setUp(() => repo = RecordingAuthRepository());

  Future<ProviderContainer> container({SmsCodeRetriever? retriever, String? magicLinkVerifier}) async {
    final c = ProviderContainer(
      overrides: await authOverrides(
        repo: repo,
        retriever: retriever,
        magicLinkVerifier: magicLinkVerifier,
      ),
    );
    addTearDown(c.dispose);
    return c;
  }

  /// The real flow: phone screen → request code → push the code screen.
  Future<GoRouter> openOtpFromPhone(WidgetTester tester, ProviderContainer c) async {
    final router = GoRouter(initialLocation: AuthRoutes.phone, routes: authRoutes());
    addTearDown(router.dispose);
    await tester.pumpWidget(routedApp(c, router));
    await tester.pumpAndSettle();
    final flow = c.read(onboardingFlowProvider.notifier)..goToPhoneStep();
    expect(await flow.submitPhoneNumber(_phone), isTrue);
    router.push(AuthRoutes.otp);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(OtpScreen), findsOneWidget);
    return router;
  }

  group('«Изменить номер» / Change number (docs/01 §10.2 D)', () {
    testWidgets('phone code screen shows "Change number" and it returns to phone entry', (
      tester,
    ) async {
      final c = await container();
      await openOtpFromPhone(tester, c);

      final link = find.byKey(const Key('otp.changeIdentifier'));
      expect(link, findsOneWidget);
      expect(find.text('Change number'), findsOneWidget);
      // 44x44 minimum hit area (.cursorrules).
      final size = tester.getSize(link);
      expect(size.height, greaterThanOrEqualTo(44));
      expect(size.width, greaterThanOrEqualTo(44));

      await tester.tap(link);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      expect(find.byType(OtpScreen), findsNothing);
      expect(find.byType(PhoneScreen), findsOneWidget);
      expect(c.read(onboardingFlowProvider).step, OnboardingStep.phone);
      // The number is kept so the user can correct it.
      expect(c.read(onboardingFlowProvider).identifier, _phone);
    });

    testWidgets('email code opened on its own (magic link) → "Change email" goes to email entry', (
      tester,
    ) async {
      repo.verifyResult = const OtpVerifyResult.invalid();
      final c = await container(magicLinkVerifier: _verifier);
      final router = GoRouter(initialLocation: AuthRoutes.welcome, routes: authRoutes());
      addTearDown(router.dispose);
      await tester.pumpWidget(routedApp(c, router));
      final flow = c.read(onboardingFlowProvider.notifier);
      expect(await flow.submitEmail('Ann@Example.com'), isTrue);
      await flow.verifyEmailMagicLink(_token, show: (_) {});
      router.go(AuthRoutes.otp); // nothing underneath to pop to
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      expect(find.text('Change email'), findsOneWidget);
      await tester.tap(find.byKey(const Key('otp.changeIdentifier')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      expect(find.byType(EmailScreen), findsOneWidget);
      expect(c.read(onboardingFlowProvider).step, OnboardingStep.email);
      // Prefilled with the address the code was requested for.
      expect(find.text('ann@example.com'), findsOneWidget);
    });
  });

  group('Android SMS Retriever autofill (docs/01 §10.2 D)', () {
    testWidgets('listening starts before the SMS is requested; the code is shown and verified', (
      tester,
    ) async {
      final sms = FakeSmsCodeRetriever();
      final c = await container(retriever: sms);
      await openOtpFromPhone(tester, c);

      expect(sms.listens, 1);
      expect(repo.requested, ['phone:$_phone']);
      expect(repo.verified, isEmpty);

      sms.deliver('482913');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(repo.verified.single.code, '482913');
      expect(repo.verified.single.identifier, _phone);
      expect(repo.verified.single.channel, 'phone');
      expect(c.read(onboardingFlowProvider).autofilledCode, '482913');
      // The 6 cells show the digits.
      final field = tester.widget<TextField>(
        find.descendant(of: find.byType(OtpScreen), matching: find.byType(TextField)),
      );
      expect(field.controller!.text, '482913');
    });

    testWidgets('a late SMS for a previous number is ignored', (tester) async {
      final sms = FakeSmsCodeRetriever();
      final c = await container(retriever: sms);
      await openOtpFromPhone(tester, c);
      c.read(onboardingFlowProvider.notifier).changeIdentifier();
      expect(sms.stops, greaterThanOrEqualTo(1));

      sms.deliver('111111');
      await tester.pump();
      expect(repo.verified, isEmpty);
    });

    testWidgets('not started where unsupported (iOS uses oneTimeCode keyboard autofill)', (
      tester,
    ) async {
      final sms = FakeSmsCodeRetriever(isSupported: false);
      final c = await container(retriever: sms);
      await openOtpFromPhone(tester, c);
      expect(sms.listens, 0);
    });

    test('production retriever: Android only, matches exactly a 6-digit code', () {
      expect(SmartAuthSmsCodeRetriever(isAndroid: false).isSupported, isFalse);
      expect(SmartAuthSmsCodeRetriever(isAndroid: true).isSupported, isTrue);
      final matcher = RegExp(SmartAuthSmsCodeRetriever.codeMatcher);
      String? first(String sms) => matcher.firstMatch(sms)?.group(0);
      expect(first('<#> Your LawBid code is 482913\nFA+9qCX9VSu'), '482913');
      expect(first('Call +1 2025550123 — code 004521 FA+9qCX9VSu'), '004521');
      expect(first('no code here 12345'), isNull);
    });
  });

  group('email magic link (docs/01 §10.2 E, security review 2026-09-27)', () {
    testWidgets('stored verifier → verify-link with token + verifier, signed in, verifier cleared', (
      tester,
    ) async {
      final c = await container(magicLinkVerifier: _verifier);
      final shown = <OnboardingStep>[];
      final ok = await c.read(onboardingFlowProvider.notifier).verifyEmailMagicLink(_token, show: shown.add);

      expect(ok, isTrue);
      expect(shown, [OnboardingStep.otp]);
      expect(repo.verifiedLinks.single, (token: _token, verifier: _verifier));
      expect(repo.verified, isEmpty); // never the code endpoint
      final s = c.read(onboardingFlowProvider);
      expect(s.channel, AuthChannel.email);
      expect(s.step, OnboardingStep.role); // new user signed in
      expect(await c.read(magicLinkVerifierStoreProvider).read(), isNull);
      // Flush drift's zero-duration stream timers before teardown.
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 10));
    });

    testWidgets('no verifier on this device → no request, email step with the "other device" hint', (
      tester,
    ) async {
      final c = await container();
      final shown = <OnboardingStep>[];
      final ok = await c.read(onboardingFlowProvider.notifier).verifyEmailMagicLink(_token, show: shown.add);

      expect(ok, isFalse);
      expect(shown, [OnboardingStep.email]);
      expect(repo.verifiedLinks, isEmpty);
      expect(repo.verified, isEmpty);
      final s = c.read(onboardingFlowProvider);
      expect(s.step, OnboardingStep.email);
      expect(s.channel, AuthChannel.email);
      expect(
        s.errorMessage,
        'Open the link on the phone where you requested the code, or enter the code from the email.',
      );
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 10));
    });

    testWidgets('401 AUTH_OTP_INVALID → the invalid-code message (email step when the address is unknown)', (
      tester,
    ) async {
      repo.verifyResult = const OtpVerifyResult.invalid();
      final c = await container(magicLinkVerifier: _verifier);
      final shown = <OnboardingStep>[];
      final ok = await c.read(onboardingFlowProvider.notifier).verifyEmailMagicLink(_token, show: shown.add);

      expect(ok, isFalse);
      expect(shown, [OnboardingStep.otp, OnboardingStep.email]);
      final s = c.read(onboardingFlowProvider);
      expect(s.errorMessage, c.read(translatorProvider).t('error.api.AUTH_OTP_INVALID'));
      expect(s.isSubmitting, isFalse);
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 10));
    });

    testWidgets('401 AUTH_OTP_INVALID with the address known → stays on the code step with the error', (
      tester,
    ) async {
      repo.verifyResult = const OtpVerifyResult.invalid();
      final c = await container(magicLinkVerifier: _verifier);
      final flow = c.read(onboardingFlowProvider.notifier);
      expect(await flow.submitEmail('ann@example.com'), isTrue);
      final shown = <OnboardingStep>[];
      expect(await flow.verifyEmailMagicLink(_token, show: shown.add), isFalse);

      expect(shown, [OnboardingStep.otp]);
      final s = c.read(onboardingFlowProvider);
      expect(s.step, OnboardingStep.otp);
      expect(s.identifier, 'ann@example.com');
      expect(s.errorMessage, c.read(translatorProvider).t('error.api.AUTH_OTP_INVALID'));
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 10));
    });
  });
}
