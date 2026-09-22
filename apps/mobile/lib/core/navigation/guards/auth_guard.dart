import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../features/auth/application/auth_providers.dart';
import '../../../features/auth/auth_routes.dart';
import '../../../features/auth/domain/onboarding_step.dart';
import '../../session/session_providers.dart';
import '../app_routes.dart';

const _authRoutes = {
  AuthRoutes.welcome,
  AuthRoutes.phone,
  AuthRoutes.otp,
  AuthRoutes.role,
};

/// Route-level redirect guard (file 01 §5.1: "redirect-guards по роли/статусу").
///
/// Real-backend wiring pass (docs/CHANGELOG.md, stage-1.7-auth): this guard
/// now has a real session concept via `sessionControllerProvider`
/// (core/session/session_providers.dart), populated at cold start by
/// `SessionController.bootstrap()` (called before `runApp` — see
/// main.dart) and kept current by `AuthInterceptor`'s silent refresh. Two
/// checks, evaluated in this order:
///
/// 1. Onboarding resume (unchanged from the stage-1.7-screens pass): if
///    `OnboardingLocalStore` has in-progress onboarding saved, redirect to
///    its saved step whenever the user isn't already there. This wins
///    even when a session already exists (e.g. mid-role-selection right
///    after a successful verify, which already applied a session) — the
///    user still needs to finish picking a role before landing in the
///    shell.
/// 2. Session gating: no session and not mid-onboarding → `/welcome`. A
///    session present but the user is sitting on an auth route (e.g. they
///    background-killed the app mid-`/auth/otp` right after a successful
///    verify with nothing left to resume, or navigated back to `/welcome`
///    some other way) → `/feed`.
String? authGuardRedirect(BuildContext context, GoRouterState state, Ref ref) {
  final location = state.matchedLocation;
  final saved = ref.read(onboardingLocalStoreProvider).read();

  if (saved != null) {
    final resumeLocation = switch (saved.step) {
      OnboardingStep.welcome => AuthRoutes.welcome,
      OnboardingStep.phone => AuthRoutes.phone,
      OnboardingStep.otp => AuthRoutes.otp,
      OnboardingStep.role => AuthRoutes.role,
      OnboardingStep.completed => null,
    };
    if (resumeLocation != null) {
      return location == resumeLocation ? null : resumeLocation;
    }
  }

  final session = ref.read(sessionControllerProvider);
  final onAuthRoute = _authRoutes.contains(location);

  if (session == null) {
    return onAuthRoute ? null : AuthRoutes.welcome;
  }
  if (onAuthRoute) {
    return AppRoutes.feed;
  }
  return null;
}
