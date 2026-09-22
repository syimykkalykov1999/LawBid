import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../features/auth/application/auth_providers.dart';
import '../../../features/auth/auth_routes.dart';
import '../../../features/auth/domain/onboarding_step.dart';

/// Route-level redirect guard (file 01 §5.1: "redirect-guards по роли/статусу").
///
/// STAGE-1.7-SCREENS SCOPE (docs/CHANGELOG.md — read before extending this):
/// there is still no real `SessionState`/access-token concept in this app —
/// that's part of file 01 §15's full stage-1.7 scope (dio, secure storage),
/// not yet started (see AuthRepository's doc comment). So this guard CANNOT
/// yet answer "is this user actually logged in" and does not try to. What
/// it DOES do, because it was explicitly asked for (file 01 §15 stage-1.7
/// acceptance item 4, "Закрытие приложения на середине онбординга и
/// продолжение с того же шага"): if `OnboardingLocalStore` has in-progress
/// onboarding saved, resume it — redirect to its saved step whenever the
/// user isn't already there, including in from a cold start on any
/// non-auth route.
///
/// KNOWN GAP, stated plainly rather than silently: once `completeOnboarding()`
/// clears that saved progress, this guard has no persisted "is logged in"
/// signal at all, so `initialLocation` (`/welcome`, in app_router.dart)
/// governs cold starts from then on — a real user who finished onboarding
/// yesterday will see `/welcome` again on next cold start, not `/feed`,
/// until the real `AuthRepository`/`SessionState`/secure-token pass lands.
String? authGuardRedirect(BuildContext context, GoRouterState state, Ref ref) {
  final saved = ref.read(onboardingLocalStoreProvider).read();
  if (saved == null) return null;

  final resumeLocation = switch (saved.step) {
    OnboardingStep.welcome => AuthRoutes.welcome,
    OnboardingStep.phone => AuthRoutes.phone,
    OnboardingStep.otp => AuthRoutes.otp,
    OnboardingStep.role => AuthRoutes.role,
    OnboardingStep.completed => null,
  };
  if (resumeLocation == null) return null;

  final location = state.matchedLocation;
  if (location == resumeLocation) return null;
  return resumeLocation;
}
