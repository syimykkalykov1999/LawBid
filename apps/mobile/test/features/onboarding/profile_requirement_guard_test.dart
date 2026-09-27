import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

CurrentUser _user({
  required UserRole role,
  required OnboardingStepId step,
  Set<MissingRequirement> missing = const {},
  bool completed = false,
}) =>
    CurrentUser(
      id: 'u1',
      role: role,
      status: 'active',
      firstName: 'Ann',
      lastName: 'Lee',
      email: 'ann@example.com',
      emailVerified: true,
      phone: '+15551234567',
      phoneVerified: true,
      uiLanguage: 'en',
      theme: null,
      requiredConsentsGranted: true,
      onboarding: OnboardingProgress(
        currentStep: step,
        completedAt: completed ? DateTime.utc(2026, 9, 27) : null,
      ),
      missing: missing,
    );

/// apps/api now reports `state` (client) / `licensed_states` (attorney)
/// in `missing` (docs/01 §11 3A/3B); the guard must not let the user sit
/// past the profile step without them — the server refuses completion.
void main() {
  test("server 'state' / 'licensed_states' parse to MissingRequirement.profile",
      () {
    expect(MissingRequirement.tryParse('state'), MissingRequirement.profile);
    expect(
      MissingRequirement.tryParse('licensed_states'),
      MissingRequirement.profile,
    );
  });

  test('client past the profile step without a state is sent back to it', () {
    final user = _user(
      role: UserRole.client,
      step: OnboardingStepId.tour,
      missing: {MissingRequirement.profile},
    );
    expect(AppRouterGuard.requiredStep(user), OnboardingStepId.profile);
  });

  test('attorney without licensed states is sent back to the profile step', () {
    final user = _user(
      role: UserRole.attorney,
      step: OnboardingStepId.verification,
      missing: {MissingRequirement.profile},
    );
    expect(AppRouterGuard.requiredStep(user), OnboardingStepId.profile);
  });

  test('nothing missing: the saved step stands; completed users are not held',
      () {
    expect(
      AppRouterGuard.requiredStep(
        _user(role: UserRole.client, step: OnboardingStepId.tour),
      ),
      OnboardingStepId.tour,
    );
    expect(
      AppRouterGuard.requiredStep(
        _user(
          role: UserRole.client,
          step: OnboardingStepId.tour,
          missing: {MissingRequirement.profile},
          completed: true,
        ),
      ),
      isNull,
    );
  });
}
