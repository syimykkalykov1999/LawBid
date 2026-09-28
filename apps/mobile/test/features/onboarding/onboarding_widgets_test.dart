import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/profile_input.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/presentation/screens/attorney_verification_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/consents_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/contacts_step_screen.dart';
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

      // Owner decision 2026-09-27: required consents are role-style cards;
      // optional consents are neither shown nor sent (Settings, later).
      expect(find.text('Help improve LawBid with anonymous usage analytics'), findsNothing);
      await tester.tap(find.text('I am 18 years of age or older'));
      await tester.tap(find.text('I accept the Terms of Service and Privacy Policy'));
      await tester.tap(find.text('LawBid is not a law firm'));
      await _settle(tester);
      await tester.tap(find.text('Continue'));
      await _settle(tester);

      expect(repo.calls, ['saveConsents', 'saveStep:role']);
      final decisions = {for (final c in repo.lastConsents!) c.type: c.granted};
      expect(decisions.keys.toSet(), ConsentType.requiredTypes.toSet());
      for (final c in ConsentType.requiredTypes) {
        expect(decisions[c], isTrue, reason: c.wireName);
      }
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

  group('profile step sends structured fields (client_profiles / attorney_profiles)', () {
    CurrentUser withProfile(
      CurrentUser base, {
      ClientProfile? client,
      AttorneyProfile? attorney,
      Set<MissingRequirement> missing = const {},
    }) =>
        CurrentUser(
          id: base.id,
          role: base.role,
          status: base.status,
          firstName: 'Ann',
          lastName: 'Lee',
          email: base.email,
          emailVerified: base.emailVerified,
          phone: base.phone,
          phoneVerified: base.phoneVerified,
          uiLanguage: base.uiLanguage,
          theme: base.theme,
          requiredConsentsGranted: base.requiredConsentsGranted,
          onboarding: base.onboarding,
          missing: missing,
          clientProfile: client,
          attorneyProfile: attorney,
        );

    testWidgets('client: saved profile prefills and Continue sends it as ClientProfileInput', (tester) async {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final me = withProfile(
        clientPhoneOnly,
        client: const ClientProfile(
          stateCode: 'NY',
          languages: ['en', 'es'],
          contactMethod: 'in_app_chat',
          contactNote: 'Evenings',
        ),
      );
      final repo = FakeOnboardingRepository(me);
      final wrap = await onboardingWrapper(AppTheme.light(), user: me, repo: repo);
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);

      expect(find.text('New York'), findsOneWidget);
      await tester.tap(find.text('Continue'));
      await _settle(tester);

      expect(repo.calls, ['saveProfileStep:push']);
      final sent = repo.lastProfile! as ClientProfileInput;
      expect(sent.toJson(), {
        'firstName': 'Ann',
        'lastName': 'Lee',
        'stateCode': 'NY',
        'languages': ['en', 'es'],
        'contactMethod': 'in_app_chat',
        'contactNote': 'Evenings',
      });
      await _tearDownDrift(tester);
    });

    testWidgets('attorney: bio/firm/languages/licensed states go as AttorneyProfileInput', (tester) async {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final base = meFixture(
        role: UserRole.attorney,
        consents: true,
        phone: '+15551234567',
        phoneVerified: true,
        step: OnboardingStepId.profile,
      );
      final me = withProfile(
        base,
        attorney: const AttorneyProfile(
          username: 'ann.lee',
          bio: 'Immigration attorney',
          firmName: 'Lee LLP',
          languages: ['en'],
          licensedStates: ['NY', 'CA'],
        ),
      );
      final repo = FakeOnboardingRepository(me);
      final wrap = await onboardingWrapper(AppTheme.light(), user: me, repo: repo);
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);

      await tester.tap(find.text('Continue'));
      await _settle(tester);
      final sent = repo.lastProfile! as AttorneyProfileInput;
      expect(sent.toJson(), {
        'firstName': 'Ann',
        'lastName': 'Lee',
        'bio': 'Immigration attorney',
        'firmName': 'Lee LLP',
        'languages': ['en'],
        'licensedStates': ['CA', 'NY'],
      });
      await _tearDownDrift(tester);
    });
  });

  group('attorney photo is mandatory (docs/03 §4.1, OQ-012)', () {
    testWidgets('no photo: Continue flags the photo row, nothing is sent', (tester) async {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final base = meFixture(
        role: UserRole.attorney,
        consents: true,
        phone: '+15551234567',
        phoneVerified: true,
        firstName: 'Ann',
        lastName: 'Lee',
        step: OnboardingStepId.profile,
      );
      final me = CurrentUser(
        id: base.id,
        role: base.role,
        status: base.status,
        firstName: 'Ann',
        lastName: 'Lee',
        email: base.email,
        emailVerified: base.emailVerified,
        phone: base.phone,
        phoneVerified: base.phoneVerified,
        uiLanguage: base.uiLanguage,
        theme: base.theme,
        requiredConsentsGranted: true,
        onboarding: base.onboarding,
        missing: const {MissingRequirement.photo},
        attorneyProfile: const AttorneyProfile(
          username: 'ann.lee',
          languages: ['en'],
          licensedStates: ['NY'],
        ),
      );
      final repo = FakeOnboardingRepository(me);
      final wrap = await onboardingWrapper(AppTheme.light(), user: me, repo: repo);
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);
      // Before an attempt: the neutral hint, no error.
      expect(find.text('Add a photo — it is required for attorneys.'), findsNothing);

      await tester.tap(find.text('Continue'));
      await _settle(tester);
      expect(find.text('Add a photo — it is required for attorneys.'), findsOneWidget);
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
