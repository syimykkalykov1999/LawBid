import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/role_screen.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/presentation/screens/attorney_verification_step_screen.dart'
    deferred as d_attorney_verification_step_screen;
import 'package:lawbid/features/onboarding/presentation/screens/consents_step_screen.dart'
    deferred as d_consents_step_screen;
import 'package:lawbid/features/onboarding/presentation/screens/contacts_step_screen.dart'
    deferred as d_contacts_step_screen;
import 'package:lawbid/features/onboarding/presentation/screens/finish_onboarding_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/profile_step_screen.dart'
    deferred as d_profile_step_screen;

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
              OnboardingStepId.consents => DeferredScreen(
                  id: 'consents_step_screen',
                  load: d_consents_step_screen.loadLibrary,
                  builder: (_) => d_consents_step_screen.ConsentsStepScreen(),
                ),
              OnboardingStepId.role => const RoleScreen(),
              OnboardingStepId.contacts => DeferredScreen(
                  id: 'contacts_step_screen',
                  load: d_contacts_step_screen.loadLibrary,
                  builder: (_) => d_contacts_step_screen.ContactsStepScreen(),
                ),
              OnboardingStepId.profile => DeferredScreen(
                  id: 'profile_step_screen',
                  load: d_profile_step_screen.loadLibrary,
                  builder: (_) => d_profile_step_screen.ProfileStepScreen(),
                ),
              OnboardingStepId.verification => DeferredScreen(
                  id: 'attorney_verification_step_screen',
                  load: d_attorney_verification_step_screen.loadLibrary,
                  builder: (_) => d_attorney_verification_step_screen
                      .AttorneyVerificationStepScreen(),
                ),
              // No screens any more: finish onboarding.
              OnboardingStepId.push ||
              OnboardingStepId.tour =>
                const FinishOnboardingScreen(),
            },
          ),
        ),
    ];
