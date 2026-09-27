import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/presentation/screens/attorney_verification_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/consents_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/contacts_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/language_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/profile_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/push_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/splash_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/tour_step_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';

Future<void> _settle(WidgetTester tester) async {
  await tester.pumpAndSettle();
}

Future<void> _enterOtp(WidgetTester tester, String code) async {
  final field = find.descendant(of: find.byType(AppOtpField), matching: find.byType(EditableText));
  await tester.enterText(field.first, code);
  await _settle(tester);
}

Future<void> _tearDownDrift(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(Duration.zero);
}

void main() {
  final clientPhoneOnly = meFixture(
    role: UserRole.client,
    consents: true,
    phone: '+15551234567',
    phoneVerified: true,
    step: OnboardingStepId.contacts,
  );

  group('consents step (§10.2 H)', () {
    testWidgets('Continue with required boxes unchecked explains instead of submitting', (tester) async {
      tester.view.physicalSize = const Size(390, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final repo = FakeOnboardingRepository(meFixture(step: OnboardingStepId.consents));
      final wrap = await onboardingWrapper(AppTheme.light(), user: repo.me, repo: repo);
      await tester.pumpWidget(wrap(const ConsentsStepScreen()));
      await _settle(tester);

      await tester.tap(find.text('Continue'));
      await _settle(tester);
      expect(find.text('Please accept the required items above to continue.'), findsOneWidget);
      expect(repo.calls, isEmpty);

      await tester.tap(find.text('I am 18 years of age or older'));
      await tester.tap(find.text('I accept the Terms of Service and Privacy Policy'));
      await tester.tap(find.text('I understand and agree'));
      await tester.tap(find.text('Help improve LawBid with anonymous usage analytics'));
      await _settle(tester);
      await tester.tap(find.text('Continue'));
      await _settle(tester);

      expect(repo.calls, ['saveConsents', 'saveStep:role']);
      final decisions = {for (final c in repo.lastConsents!) c.type: c.granted};
      expect(decisions.length, ConsentType.values.length);
      for (final c in ConsentType.requiredTypes) {
        expect(decisions[c], isTrue, reason: c.wireName);
      }
      expect(decisions[ConsentType.analytics], isTrue);
      expect(decisions[ConsentType.marketingEmail], isFalse);
      expect(decisions[ConsentType.marketingPush], isFalse);
      await _tearDownDrift(tester);
    });
  });

  group('contacts step (§11 Шаг 3A)', () {
    testWidgets('client missing email: shows what is missing and blocks Continue', (tester) async {
      final repo = FakeOnboardingRepository(clientPhoneOnly);
      final wrap = await onboardingWrapper(AppTheme.light(), user: clientPhoneOnly, repo: repo);
      await tester.pumpWidget(wrap(const ContactsStepScreen()));
      await _settle(tester);

      expect(find.text('Verified'), findsOneWidget);
      expect(find.text('Required'), findsOneWidget);
      expect(find.text('Verify your email to continue.'), findsOneWidget);

      await tester.tap(find.text('Continue'));
      await _settle(tester);
      expect(repo.calls, isEmpty);
      await _tearDownDrift(tester);
    });

    testWidgets('first email: code goes straight to the new contact → verified (no reauth)', (tester) async {
      tester.view.physicalSize = const Size(390, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final repo = FakeOnboardingRepository(clientPhoneOnly);
      final wrap = await onboardingWrapper(AppTheme.light(), user: clientPhoneOnly, repo: repo);
      await tester.pumpWidget(wrap(const ContactsStepScreen()));
      await _settle(tester);

      await tester.enterText(find.byType(TextField).first, 'Real.Person@Example.com');
      await tester.tap(find.text('Send code'));
      await _settle(tester);
      // docs/01 §11 step 3A: reauth only when *changing* a verified contact.
      expect(repo.calls, ['requestContactCode:real.person@example.com']);
      expect(find.textContaining("confirm it's you"), findsNothing);
      expect(find.text('Enter the code we sent to real.person@example.com.'), findsOneWidget);

      await _enterOtp(tester, '222222');
      expect(repo.calls.last, 'verifyContact');
      await _tearDownDrift(tester);
    });

    testWidgets('invalid email is rejected locally, nothing is sent', (tester) async {
      final repo = FakeOnboardingRepository(clientPhoneOnly);
      final wrap = await onboardingWrapper(AppTheme.light(), user: clientPhoneOnly, repo: repo);
      await tester.pumpWidget(wrap(const ContactsStepScreen()));
      await _settle(tester);
      await tester.enterText(find.byType(TextField).first, 'not-an-email');
      await tester.tap(find.text('Send code'));
      await _settle(tester);
      expect(find.text('Enter a valid email address'), findsOneWidget);
      expect(repo.calls, isEmpty);
      await _tearDownDrift(tester);
    });
  });

  group('profile step (§11 Шаг 3A/3B)', () {
    testWidgets('required fields are flagged next to the field', (tester) async {
      final repo = FakeOnboardingRepository(clientPhoneOnly);
      final wrap = await onboardingWrapper(AppTheme.light(), user: clientPhoneOnly, repo: repo);
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);
      await tester.tap(find.text('Continue'));
      await _settle(tester);
      expect(find.text('Required'), findsWidgets);
      expect(repo.calls, isEmpty);
      await _tearDownDrift(tester);
    });
  });

  group('200% text scale (file 07 §9): no overflow on any onboarding screen', () {
    final attorney = meFixture(
      role: UserRole.attorney,
      consents: true,
      phoneVerified: true,
      phone: '+15551234567',
      firstName: 'Tom',
      lastName: 'Ray',
      step: OnboardingStepId.verification,
    );
    final screens = <String, Widget Function()>{
      'splash': () => const SplashScreen(autoStart: false),
      'language': () => const LanguageStepScreen(),
      'consents': () => const ConsentsStepScreen(),
      'contacts': () => const ContactsStepScreen(),
      'profile': () => const ProfileStepScreen(),
      'push': () => const PushStepScreen(),
      'verification': () => const AttorneyVerificationStepScreen(),
      'tour': () => const TourStepScreen(),
    };
    for (final entry in screens.entries) {
      testWidgets(entry.key, (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final user = entry.key == 'verification' ? attorney : clientPhoneOnly;
        final wrap = await onboardingWrapper(AppTheme.dark(), user: user, textScale: 2);
        await tester.pumpWidget(wrap(entry.value()));
        await tester.pump(const Duration(seconds: 1));
        expect(tester.takeException(), isNull);
        await _tearDownDrift(tester);
      });
    }
  });
}
