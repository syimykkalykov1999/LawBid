import 'package:flutter/material.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/auth/presentation/screens/email_screen.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/presentation/screens/attorney_verification_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/consents_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/contacts_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/language_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/profile_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/push_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/splash_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/tour_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/verification_placeholder_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../../helpers/fixtures.dart';
import '../../../helpers/onboarding_harness.dart';

/// Golden coverage for every stage-1.7 onboarding screen in both themes
/// (docs/07_DESIGN_SYSTEM.md §9: "каждый экран × 2 темы").
void main() {
  final client = meFixture(
    role: UserRole.client,
    consents: true,
    phone: '+15551234567',
    phoneVerified: true,
    step: OnboardingStepId.contacts,
  );
  final attorney = meFixture(
    role: UserRole.attorney,
    consents: true,
    phone: '+15551234567',
    phoneVerified: true,
    firstName: 'Tom',
    lastName: 'Ray',
    step: OnboardingStepId.verification,
  );

  final screens = <String, (Widget Function(), CurrentUser?, bool)>{
    // name: (builder, user, hasInfiniteAnimation)
    'splash': (() => const SplashScreen(autoStart: false), null, true),
    'email': (() => const EmailScreen(), null, false),
    'language': (() => const LanguageStepScreen(), meFixture(), false),
    'consents': (() => const ConsentsStepScreen(), meFixture(step: OnboardingStepId.consents), false),
    'contacts_client': (() => const ContactsStepScreen(), client, false),
    'profile_client': (() => const ProfileStepScreen(), client, false),
    'profile_attorney': (() => const ProfileStepScreen(), attorney, false),
    'push': (() => const PushStepScreen(), client, false),
    'verification_attorney': (() => const AttorneyVerificationStepScreen(), attorney, false),
    'tour_client': (() => const TourStepScreen(), client, false),
    'verification_placeholder': (() => const VerificationPlaceholderScreen(), attorney, false),
    'mine_attorney_unverified': (() => const MineScreen(), attorney, false),
  };

  for (final entry in screens.entries) {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      final themeName = brightness == Brightness.light ? 'light' : 'dark';
      final theme = brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();
      final (build, user, infinite) = entry.value;

      testGoldens('${entry.key} - $themeName', (tester) async {
        await tester.pumpWidgetBuilder(
          build(),
          wrapper: await onboardingWrapper(theme, user: user),
          surfaceSize: const Size(390, 844),
        );
        await screenMatchesGolden(
          tester,
          'onboarding_${entry.key}_$themeName',
          customPump: infinite ? (tester) => tester.pump(const Duration(milliseconds: 600)) : null,
        );
        // Let drift's zero-duration stream-cleanup timers fire.
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(Duration.zero);
      });
    }
  }
}
