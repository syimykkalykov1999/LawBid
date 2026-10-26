// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/auth/presentation/screens/role_screen.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/screens/contacts_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/profile_step_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';

/// Owner device test 2026-09-27:
/// (a) a 403 ONBOARDING_INCOMPLETE from "Get started" must move the user
///     to the step that owns the missing item, with the reason shown;
/// (b) a role that is already set: the other card is disabled, a note
///     explains it, Continue moves on without an API call.
GoRouter _router(String initial) => GoRouter(
      initialLocation: initial,
      routes: [
        for (final entry in <OnboardingStepId, Widget Function()>{
          OnboardingStepId.role: () => const RoleScreen(),
          OnboardingStepId.contacts: () => const ContactsStepScreen(),
          OnboardingStepId.profile: () => const ProfileStepScreen(),
        }.entries)
          GoRoute(
            path: OnboardingRoutes.forStep(entry.key),
            builder: (_, __) => entry.value(),
          ),
        GoRoute(path: AppRoutes.feed, builder: (_, __) => const SizedBox()),
      ],
    );

String _location(GoRouter r) =>
    r.routerDelegate.currentConfiguration.last.matchedLocation;

void main() {
  testWidgets(
      '(b) role set, onboarding not finished: no lock, Continue with the same role moves on without an API call',
      (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final me = meFixture(
      role: UserRole.attorney,
      consents: true,
      phone: '+15551234567',
      step: OnboardingStepId.role,
    );
    final repo = FakeOnboardingRepository(me);
    final router = _router(OnboardingRoutes.forStep(OnboardingStepId.role));
    addTearDown(router.dispose);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: me,
      repo: repo,
      extra: [appRouterProvider.overrideWithValue(router)],
    );
    await tester.pumpWidget(wrap(Router.withConfig(config: router)));
    await tester.pumpAndSettle();

    // Owner 2026-10-15: the person can still choose again.
    expect(find.byKey(const ValueKey('role-locked-note')), findsNothing);
    expect(
      find.byKey(const ValueKey('role-card-disabled-client')),
      findsNothing,
    );

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(repo.calls, isEmpty);
    expect(
      _location(router),
      OnboardingRoutes.forStep(OnboardingStepId.contacts),
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  });

  testWidgets(
      '(b) role set, onboarding not finished: picking Client asks the server to switch',
      (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final me = meFixture(
      role: UserRole.attorney,
      consents: true,
      phone: '+15551234567',
      step: OnboardingStepId.profile,
    );
    final repo = FakeOnboardingRepository(me);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: me,
      repo: repo,
    );
    await tester.pumpWidget(wrap(const RoleScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Client'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(repo.calls, contains('setRole:client'));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  });

  testWidgets(
      '(b) onboarding finished: the role is final, other card disabled, note shown',
      (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final me = meFixture(
      role: UserRole.attorney,
      consents: true,
      phone: '+15551234567',
      completed: true,
    );
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: me,
      repo: FakeOnboardingRepository(me),
    );
    await tester.pumpWidget(wrap(const RoleScreen()));
    await tester.pumpAndSettle();
    expect(
      find.text("Your role is already set and can't be changed."),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('role-card-disabled-client')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('role-card-disabled-attorney')),
      findsNothing,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  });

  testWidgets('(b) no role yet: no note, both cards enabled', (tester) async {
    final me = meFixture(consents: true, step: OnboardingStepId.role);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: me,
      repo: FakeOnboardingRepository(me),
    );
    await tester.pumpWidget(wrap(const RoleScreen()));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('role-locked-note')), findsNothing);
    expect(
      find.byKey(const ValueKey('role-card-disabled-client')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('role-card-disabled-attorney')),
      findsNothing,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  });
}
