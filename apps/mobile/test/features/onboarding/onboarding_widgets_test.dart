// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/auth/presentation/screens/role_screen.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/domain/profile_input.dart';
import 'package:lawbid/features/onboarding/presentation/screens/attorney_verification_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/consents_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/contacts_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/profile_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/splash_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/email_flows_overrides.dart';
import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';

Future<void> _settle(WidgetTester tester) async {
  await tester.pumpAndSettle();
}

Future<void> _enterOtp(WidgetTester tester, String code) async {
  final field = find.descendant(
    of: find.byType(AppOtpField),
    matching: find.byType(EditableText),
  );
  await tester.enterText(field.first, code);
  await _settle(tester);
}

Future<void> _tearDownDrift(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(Duration.zero);
}

/// Owner 2026-10-11: a form's button is grey and inert until it is ready.
bool _buttonEnabled(WidgetTester tester, String label) =>
    tester.widget<AppButton>(find.widgetWithText(AppButton, label)).isEnabled;

void main() {
  final clientPhoneOnly = meFixture(
    role: UserRole.client,
    consents: true,
    phone: '+15551234567',
    phoneVerified: true,
    step: OnboardingStepId.contacts,
  );

  group('consents step (§10.2 H)', () {
    testWidgets(
        'Continue is grey with required boxes unchecked and does nothing',
        (tester) async {
      tester.view.physicalSize = const Size(390, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final repo =
          FakeOnboardingRepository(meFixture(step: OnboardingStepId.consents));
      final wrap =
          await onboardingWrapper(AppTheme.light(), user: repo.me, repo: repo);
      await tester.pumpWidget(wrap(const ConsentsStepScreen()));
      await _settle(tester);

      expect(_buttonEnabled(tester, 'Continue'), isFalse);
      await tester.tap(find.text('Continue'));
      await _settle(tester);
      expect(repo.calls, isEmpty);

      // Owner decision 2026-09-27: required consents are role-style cards;
      // optional consents are neither shown nor sent (Settings, later).
      expect(
        find.text('Help improve LawBid with anonymous usage analytics'),
        findsNothing,
      );
      await tester.tap(find.text('I am 18 years of age or older'));
      await tester
          .tap(find.text('I accept the Terms of Service and Privacy Policy'));
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
    testWidgets(
        'owner 2026-10-13: the e-mail is not asked here any more (profile field)',
        (tester) async {
      final repo = FakeOnboardingRepository(clientPhoneOnly);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientPhoneOnly,
        repo: repo,
        extra: emailFlowsOnOverrides(),
      );
      await tester.pumpWidget(wrap(const ContactsStepScreen()));
      await _settle(tester);

      expect(find.text('Verify your email to continue.'), findsNothing);
      await _tearDownDrift(tester);
    });

    testWidgets(
        'first email: code goes straight to the new contact → verified (no reauth)',
        (tester) async {
      tester.view.physicalSize = const Size(390, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final repo = FakeOnboardingRepository(clientPhoneOnly);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientPhoneOnly,
        repo: repo,
        extra: emailFlowsOnOverrides(),
      );
      await tester.pumpWidget(wrap(const ContactsStepScreen()));
      await _settle(tester);

      await tester.enterText(
        find.byType(TextField).first,
        'Real.Person@Example.com',
      );
      await tester.tap(find.text('Send code'));
      await _settle(tester);
      // docs/01 §11 step 3A: reauth only when *changing* a verified contact.
      expect(repo.calls, ['requestContactCode:real.person@example.com']);
      expect(find.textContaining("confirm it's you"), findsNothing);
      expect(
        find.text('Enter the code we sent to real.person@example.com.'),
        findsOneWidget,
      );

      await _enterOtp(tester, '222222');
      expect(repo.calls.last, 'verifyContact');
      await _tearDownDrift(tester);
    });

    testWidgets('invalid email is rejected locally, nothing is sent',
        (tester) async {
      final repo = FakeOnboardingRepository(clientPhoneOnly);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientPhoneOnly,
        repo: repo,
        extra: emailFlowsOnOverrides(),
      );
      await tester.pumpWidget(wrap(const ContactsStepScreen()));
      await _settle(tester);
      await tester.enterText(find.byType(TextField).first, 'not-an-email');
      await tester.tap(find.text('Send code'));
      await _settle(tester);
      expect(find.text('Enter a valid email address'), findsOneWidget);
      expect(repo.calls, isEmpty);
      await _tearDownDrift(tester);
    });
    testWidgets(
        'owner 2026-10-07: «Вход и письма по почте» off → phone only, Continue works',
        (tester) async {
      final me = meFixture(
        role: UserRole.client,
        consents: true,
        phone: '+15551234567',
        phoneVerified: true,
        step: OnboardingStepId.contacts,
        clientEmailRequired: false,
      );
      final repo = FakeOnboardingRepository(me);
      final wrap =
          await onboardingWrapper(AppTheme.light(), user: me, repo: repo);
      await tester.pumpWidget(wrap(const ContactsStepScreen()));
      await _settle(tester);

      expect(
        find.text(
          'To publish cases you need a verified phone. Attorneys see it only after you accept their offer.',
        ),
        findsOneWidget,
      );
      expect(find.text('Email'), findsNothing);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Verify your email to continue.'), findsNothing);

      await tester.tap(find.text('Continue'));
      await _settle(tester);
      expect(repo.calls, isNotEmpty);
      await _tearDownDrift(tester);
    });
  });

  group('profile step (§11 Шаг 3A/3B)', () {
    testWidgets('Continue is grey until the required fields are filled',
        (tester) async {
      final repo = FakeOnboardingRepository(clientPhoneOnly);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientPhoneOnly,
        repo: repo,
      );
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);
      expect(_buttonEnabled(tester, 'Continue'), isFalse);
      await tester.tap(find.text('Continue'));
      await _settle(tester);
      expect(repo.calls, isEmpty);
      await _tearDownDrift(tester);
    });
  });

  group(
      'profile step sends structured fields (client_profiles / attorney_profiles)',
      () {
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
          email: base.email ?? 'ann@example.com',
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

    testWidgets(
        'client: saved profile prefills and Continue sends it as ClientProfileInput',
        (tester) async {
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
      final wrap =
          await onboardingWrapper(AppTheme.light(), user: me, repo: repo);
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);

      expect(find.text('New York'), findsOneWidget);
      await tester.tap(find.text('Continue'));
      await _settle(tester);

      expect(repo.calls, ['saveProfileStep:profile', 'complete']);
      final sent = repo.lastProfile! as ClientProfileInput;
      expect(sent.toJson(), {
        'firstName': 'Ann',
        'lastName': 'Lee',
        'stateCode': 'NY',
        'languages': ['en', 'es'],
        'contactMethod': 'in_app_chat',
        'contactNote': 'Evenings',
        'email': 'ann@example.com',
      });
      await _tearDownDrift(tester);
    });

    testWidgets(
        'attorney: bio/firm/languages/licensed states go as AttorneyProfileInput',
        (tester) async {
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
      final wrap =
          await onboardingWrapper(AppTheme.light(), user: me, repo: repo);
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);

      await tester.tap(find.text('Continue'));
      await _settle(tester);
      final sent = repo.lastProfile! as AttorneyProfileInput;
      expect(sent.toJson(), {
        'firstName': 'Ann',
        'lastName': 'Lee',
        'email': 'ann@example.com',
        'bio': 'Immigration attorney',
        'firmName': 'Lee LLP',
        'languages': ['en'],
        'licensedStates': ['CA', 'NY'],
      });
      await _tearDownDrift(tester);
    });
  });

  group('owner 2026-11-05: a client photo is optional', () {
    final me = meFixture(
      role: UserRole.client,
      consents: true,
      phone: '+15551234567',
      phoneVerified: true,
      firstName: 'Ann',
      lastName: 'Lee',
      step: OnboardingStepId.profile,
    );

    testWidgets('the photo row is there, marked optional', (tester) async {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: me,
        repo: FakeOnboardingRepository(me),
      );
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);
      expect(find.byKey(const ValueKey('client-avatar')), findsOneWidget);
      expect(find.byKey(const ValueKey('avatar-pick')), findsOneWidget);
      expect(find.text('Optional'), findsOneWidget);
      expect(
        find.text('Add a photo — it is required for attorneys.'),
        findsNothing,
      );
      await _tearDownDrift(tester);
    });

    testWidgets('no photo does not hold Continue back', (tester) async {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final filled = CurrentUser(
        id: me.id,
        role: me.role,
        status: me.status,
        firstName: 'Ann',
        lastName: 'Lee',
        email: 'ann@example.com',
        emailVerified: me.emailVerified,
        phone: me.phone,
        phoneVerified: me.phoneVerified,
        uiLanguage: me.uiLanguage,
        theme: me.theme,
        requiredConsentsGranted: true,
        onboarding: me.onboarding,
        missing: const {},
        clientProfile: const ClientProfile(
          stateCode: 'NY',
          languages: ['en'],
        ),
      );
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: filled,
        repo: FakeOnboardingRepository(filled),
      );
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);
      expect(_buttonEnabled(tester, 'Continue'), isTrue);
      await _tearDownDrift(tester);
    });
  });

  group('owner 2026-11-05: numbered stepper instead of the bars', () {
    final client = meFixture(
      role: UserRole.client,
      consents: true,
      phone: '+15551234567',
      phoneVerified: true,
      firstName: 'Ann',
      lastName: 'Lee',
      step: OnboardingStepId.profile,
    );
    final attorney = meFixture(
      role: UserRole.attorney,
      consents: true,
      phone: '+15551234567',
      phoneVerified: true,
      firstName: 'Ann',
      lastName: 'Lee',
      step: OnboardingStepId.profile,
    );
    Finder stepper() => find.byKey(const ValueKey('onboarding-stepper'));

    testWidgets('client: "Step 3 of 3", numbers exactly centred, no bars',
        (tester) async {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: client,
        repo: FakeOnboardingRepository(client),
      );
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);
      expect(find.text('Step 3 of 3'), findsOneWidget);
      expect(find.text('Profile'), findsOneWidget);
      expect(tester.getCenter(stepper()).dx, 195);
      // The back arrow stays on the start side.
      expect(tester.getCenter(find.byType(AppBackButton)).dx, lessThan(60));
      await _tearDownDrift(tester);
    });

    // The numbers one person sees, screen by screen, never skip one. The
    // total changes once, when the attorney's role becomes known.
    final fresh = meFixture(
      consents: true,
      phone: '+15551234567',
      phoneVerified: true,
      step: OnboardingStepId.role,
    );
    for (final (name, chosen, last) in [
      ('client', client, 'Step 3 of 3'),
      ('attorney', attorney, 'Step 3 of 6'),
    ]) {
      testWidgets('$name: 1 → 2 → 3 without a gap', (tester) async {
        tester.view.physicalSize = const Size(390, 1600);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        for (final (me, screen, text) in [
          (fresh, const ConsentsStepScreen() as Widget, 'Step 1 of 3'),
          (fresh, const RoleScreen() as Widget, 'Step 2 of 3'),
          (chosen, const ProfileStepScreen() as Widget, last),
        ]) {
          final wrap = await onboardingWrapper(
            AppTheme.light(),
            user: me,
            repo: FakeOnboardingRepository(me),
          );
          await tester.pumpWidget(wrap(screen));
          await _settle(tester);
          expect(find.text(text), findsOneWidget);
          await _tearDownDrift(tester);
        }
      });
    }

    testWidgets('role screen: back arrow on the start, numbers centred',
        (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: fresh,
        repo: FakeOnboardingRepository(fresh),
      );
      await tester.pumpWidget(wrap(const RoleScreen()));
      await _settle(tester);
      expect(tester.takeException(), isNull);
      expect(tester.getCenter(stepper()).dx, 160);
      expect(tester.getCenter(find.byType(AppBackButton)).dx, lessThan(60));
      await _tearDownDrift(tester);
    });

    testWidgets('attorney: the total is 6 on the profile step too',
        (tester) async {
      tester.view.physicalSize = const Size(390, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: attorney,
        repo: FakeOnboardingRepository(attorney),
      );
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);
      expect(find.text('Step 3 of 6'), findsOneWidget);
      await _tearDownDrift(tester);
    });

    for (final direction in TextDirection.values) {
      testWidgets('320 pt, 6 steps, ${direction.name}: fits and stays centred',
          (tester) async {
        tester.view.physicalSize = const Size(320, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final wrap = await onboardingWrapper(
          AppTheme.light(),
          user: attorney,
          repo: FakeOnboardingRepository(attorney),
        );
        await tester.pumpWidget(
          wrap(
            Directionality(
              textDirection: direction,
              child: const ProfileStepScreen(),
            ),
          ),
        );
        await _settle(tester);
        expect(tester.takeException(), isNull);
        expect(tester.getCenter(stepper()).dx, 160);
        await _tearDownDrift(tester);
      });
    }
  });

  group('attorney photo is mandatory (docs/03 §4.1, OQ-012)', () {
    testWidgets('no photo: Continue is grey, nothing is sent', (tester) async {
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
      final wrap =
          await onboardingWrapper(AppTheme.light(), user: me, repo: repo);
      await tester.pumpWidget(wrap(const ProfileStepScreen()));
      await _settle(tester);
      expect(_buttonEnabled(tester, 'Continue'), isFalse);
      await tester.tap(find.text('Continue'));
      await _settle(tester);
      expect(repo.calls, isEmpty);
      await _tearDownDrift(tester);
    });
  });

  group('200% text scale (file 07 §9): no overflow on any onboarding screen',
      () {
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
      'verification': () => const AttorneyVerificationStepScreen(),
    };
    for (final entry in screens.entries) {
      testWidgets(entry.key, (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final user = entry.key == 'verification' ? attorney : clientPhoneOnly;
        final wrap =
            await onboardingWrapper(AppTheme.dark(), user: user, textScale: 2);
        await tester.pumpWidget(wrap(entry.value()));
        await tester.pump(const Duration(seconds: 1));
        expect(tester.takeException(), isNull);
        await _tearDownDrift(tester);
      });
    }
  });
}
