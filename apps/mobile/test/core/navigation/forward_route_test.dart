import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';

/// Owner bug 2026-09-27: "Continue" on consents / role stayed on the same
/// screen because the guard lets a user stay on an already-saved step.
/// After a successful save the app moves to [AppRouterGuard.forwardRoute].
void main() {
  test('after consents are saved, Continue goes to the role step', () {
    final user = meFixture(consents: true, step: OnboardingStepId.role);
    expect(AppRouterGuard.forwardRoute(user), '/onboarding/role');
  });

  test('after a client picks the role, Continue goes to contacts', () {
    final user = meFixture(
      consents: true,
      role: UserRole.client,
      phone: '+12025551234',
      phoneVerified: true,
      step: OnboardingStepId.contacts,
    );
    expect(AppRouterGuard.forwardRoute(user), '/onboarding/contacts');
  });

  test('when onboarding is complete, Continue goes to the feed', () {
    final user = meFixture(
      consents: true,
      role: UserRole.attorney,
      firstName: 'Tom',
      lastName: 'Ray',
      phone: '+12025551234',
      phoneVerified: true,
      step: OnboardingStepId.tour,
      completed: true,
    );
    expect(AppRouterGuard.forwardRoute(user), '/feed');
  });
}
