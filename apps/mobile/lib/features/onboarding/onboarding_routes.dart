import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/auth/presentation/screens/role_screen.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/presentation/screens/attorney_verification_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/consents_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/contacts_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/language_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/profile_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/push_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/tour_step_screen.dart';

/// `/onboarding/<step>` paths (docs/01_FOUNDATION_AUTH.md §11 guard table:
/// "/onboarding/{текущий шаг}"). One route per [OnboardingStepId]; the role
/// step keeps its pre-existing path (`AuthRoutes.role`).
abstract final class OnboardingRoutes {
  static const prefix = '/onboarding/';

  static String forStep(OnboardingStepId step) => '$prefix${step.name}';

  /// Inverse of [forStep]; null for a non-onboarding location.
  static OnboardingStepId? stepOf(String location) {
    if (!location.startsWith(prefix)) return null;
    return OnboardingStepId.tryParse(location.substring(prefix.length));
  }
}

/// Flat top-level routes beside the shell (same reasoning as authRoutes():
/// onboarding has no bottom nav).
List<RouteBase> onboardingRoutes() => [
      for (final step in OnboardingStepId.values)
        GoRoute(
          path: OnboardingRoutes.forStep(step),
          pageBuilder: (context, state) => AppPageTransitions.push(
            state,
            switch (step) {
              OnboardingStepId.language => const LanguageStepScreen(),
              OnboardingStepId.consents => const ConsentsStepScreen(),
              OnboardingStepId.role => const RoleScreen(),
              OnboardingStepId.contacts => const ContactsStepScreen(),
              OnboardingStepId.profile => const ProfileStepScreen(),
              OnboardingStepId.push => const PushStepScreen(),
              OnboardingStepId.verification => const AttorneyVerificationStepScreen(),
              OnboardingStepId.tour => const TourStepScreen(),
            },
          ),
        ),
    ];
