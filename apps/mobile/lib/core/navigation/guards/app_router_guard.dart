import 'package:flutter/foundation.dart';

import '../../../features/auth/auth_routes.dart';
import '../../../features/onboarding/application/current_user_controller.dart';
import '../../../features/onboarding/domain/current_user.dart';
import '../../../features/onboarding/domain/onboarding_step_id.dart';
import '../../../features/onboarding/onboarding_routes.dart';
import '../../startup/app_startup.dart';
import '../app_routes.dart';

/// Everything the guard decides on — a plain value so the redirect table
/// is unit-testable without a router or providers
/// (test/core/navigation/app_router_guard_test.dart).
@immutable
class GuardSnapshot {
  const GuardSnapshot({
    required this.startup,
    required this.hasSession,
    required this.user,
  });

  final StartupStatus startup;

  /// A token-backed session exists (SessionController state non-null).
  final bool hasSession;

  /// `GET /users/me` state (CurrentUserController).
  final CurrentUserState user;
}

/// The ONLY place navigation redirects are decided (`.cursorrules`:
/// "Гейты навигации только в AppRouterGuard"; docs/01_FOUNDATION_AUTH.md
/// §11 "Guard-логика навигации"):
///
/// ```
/// нет токена                      → /welcome
/// токен есть, нет согласий/18+    → /onboarding/consents
/// нет роли                        → /onboarding/role
/// клиент без подтверждённых
/// телефона И email                → /onboarding/contacts (нельзя пропустить)
/// адвокат без подтверждённого
/// телефона                        → /onboarding/contacts
/// онбординг не завершён           → /onboarding/{текущий шаг}
/// attorney + unverified           → главное меню доступно, «Кейсы» (Моё)
///                                   показывает экран верификации
/// клиент/адвокат ok               → /feed
/// ```
///
/// Decisions come from the server's `missing` list + `onboarding.
/// currentStep` (so closing the app mid-onboarding resumes at the saved
/// step, §15 item 4). Two documented refinements of the table:
/// - Шаг 1 «Язык» precedes consents: a brand-new account (no saved step,
///   or saved step `language`, onboarding never completed) lands on
///   `/onboarding/language` first; afterwards the consents row applies.
/// - Going BACK to an earlier onboarding step (§11: "кнопка «Назад»
///   везде") is allowed; skipping FORWARD past the required step never is.
abstract final class AppRouterGuard {
  /// Routes usable without a session.
  static const publicAuthRoutes = {
    AuthRoutes.welcome,
    AuthRoutes.phone,
    AuthRoutes.email,
    AuthRoutes.otp,
  };

  static String? redirect(String location, GuardSnapshot s) {
    final isLegal = location.startsWith(AppRoutes.legalPrefix);

    // Splash sequence (§10.2 A) must finish before anything else.
    if (s.startup != StartupStatus.ready) {
      return location == AppRoutes.splash ? null : AppRoutes.splash;
    }

    // Row 1: no token → /welcome.
    if (!s.hasSession) {
      if (isLegal || publicAuthRoutes.contains(location)) return null;
      return AuthRoutes.welcome;
    }

    final user = s.user.user;
    if (user == null) {
      // Just signed in, me is loading: stay on the sign-in screen that is
      // finishing (no splash flicker). Otherwise the splash shows loading/
      // error/offline for `GET /users/me`.
      if (s.user.status == CurrentUserStatus.loading &&
          (publicAuthRoutes.contains(location) || isLegal)) {
        return null;
      }
      return location == AppRoutes.splash ? null : AppRoutes.splash;
    }

    if (isLegal) return null;

    final required = requiredStep(user);
    if (required == null) {
      // Rows 7-8: fully onboarded. Auth/onboarding/splash → feed; every
      // app route (incl. the verification placeholder) stays reachable.
      final onEntryRoute = location == AppRoutes.splash ||
          publicAuthRoutes.contains(location) ||
          OnboardingRoutes.stepOf(location) != null;
      return onEntryRoute ? AppRoutes.feed : null;
    }

    final target = OnboardingRoutes.forStep(required);
    if (location == target) return null;
    if (_canRevisit(location, required, user)) return null;
    return target;
  }

  /// Rows 2-6: the onboarding step the user must be on, or null when
  /// onboarding is complete and nothing is missing.
  static OnboardingStepId? requiredStep(CurrentUser user) {
    final missing = user.missing;
    final completed = user.onboarding.isCompleted;
    final saved = user.onboarding.currentStep;

    if (missing.contains(MissingRequirement.consents)) {
      final fresh = saved == null || saved == OnboardingStepId.language;
      return !completed && fresh ? OnboardingStepId.language : OnboardingStepId.consents;
    }
    if (missing.contains(MissingRequirement.role) || user.role == null) {
      return OnboardingStepId.role;
    }
    if (user.isClient &&
        (missing.contains(MissingRequirement.phoneVerified) ||
            missing.contains(MissingRequirement.emailVerified))) {
      return OnboardingStepId.contacts;
    }
    if (user.isAttorney && missing.contains(MissingRequirement.phoneVerified)) {
      return OnboardingStepId.contacts;
    }
    if (completed) return null;

    final order = OnboardingStepId.orderFor(user.role);
    final roleIndex = order.indexOf(OnboardingStepId.role);
    OnboardingStepId effective;
    if (saved == null) {
      effective = OnboardingStepId.contacts;
    } else if (!order.contains(saved)) {
      // A step that doesn't exist for this role (e.g. `verification` saved
      // for a client) → the last step.
      effective = OnboardingStepId.tour;
    } else if (order.indexOf(saved) <= roleIndex) {
      // language/consents/role are already satisfied (rows 2-3 passed).
      effective = OnboardingStepId.contacts;
    } else {
      effective = saved;
    }
    // The name is collected on the profile step — never let the user sit
    // past it without one (the server would refuse to complete anyway).
    if (missing.contains(MissingRequirement.name) &&
        order.indexOf(effective) > order.indexOf(OnboardingStepId.profile)) {
      effective = OnboardingStepId.profile;
    }
    return effective;
  }

  static bool _canRevisit(String location, OnboardingStepId required, CurrentUser user) {
    if (location == AppRoutes.verification) {
      return required == OnboardingStepId.verification;
    }
    final step = OnboardingRoutes.stepOf(location);
    if (step == null) return false;
    final order = OnboardingStepId.orderFor(user.role);
    final index = order.indexOf(step);
    return index >= 0 && index < order.indexOf(required);
  }
}
