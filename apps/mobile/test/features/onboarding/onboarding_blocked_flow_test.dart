import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/auth/presentation/screens/role_screen.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/screens/contacts_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/profile_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/tour_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';
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
          OnboardingStepId.tour: () => const TourStepScreen(),
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

CurrentUser _attorney({required Set<MissingRequirement> missing, required OnboardingStepId step}) {
  final base = meFixture(
    role: UserRole.attorney,
    consents: true,
    phone: '+15551234567',
    phoneVerified: true,
    firstName: 'Ann',
    lastName: 'Lee',
    step: step,
  );
  return CurrentUser(
    id: base.id,
    role: base.role,
    status: base.status,
    firstName: base.firstName,
    lastName: base.lastName,
    email: base.email,
    emailVerified: base.emailVerified,
    phone: base.phone,
    phoneVerified: base.phoneVerified,
    uiLanguage: base.uiLanguage,
    theme: base.theme,
    requiredConsentsGranted: true,
    onboarding: base.onboarding,
    missing: missing,
    attorneyProfile: const AttorneyProfile(username: 'ann.lee', languages: ['en'], licensedStates: ['NY']),
  );
}

void main() {
  testWidgets('(a) tour "complete" refused for a missing photo → profile step, reason shown, photo row flagged',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final me = _attorney(missing: {MissingRequirement.photo}, step: OnboardingStepId.tour);
    final repo = FakeOnboardingRepository(me)
      ..completeError = const ApiException(
        code: ApiErrorCodes.onboardingIncomplete,
        message: 'Onboarding requirements are not met.',
        details: {
          'missing': ['photo'],
        },
        statusCode: 403,
      );
    final router = _router(OnboardingRoutes.forStep(OnboardingStepId.tour));
    addTearDown(router.dispose);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: me,
      repo: repo,
      extra: [appRouterProvider.overrideWithValue(router)],
    );
    await tester.pumpWidget(wrap(Router.withConfig(config: router)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    expect(repo.calls, contains('complete'));
    expect(_location(router), OnboardingRoutes.forStep(OnboardingStepId.profile));
    expect(find.byType(ProfileStepScreen), findsOneWidget);
    // The banner carries the localized reason, and the photo row is
    // flagged as required without the user pressing Continue first.
    expect(find.byType(ActionErrorBanner), findsOneWidget);
    expect(find.text('Add a photo — it is required for attorneys.'), findsNWidgets(2));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  });

  testWidgets('(b) role already set: other card disabled, note shown, Continue moves on without an API call',
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

    expect(find.text("Your role is already set and can't be changed."), findsOneWidget);
    expect(find.byKey(const ValueKey('role-card-disabled-client')), findsOneWidget);
    expect(find.byKey(const ValueKey('role-card-disabled-attorney')), findsNothing);
    final opacity = tester.widget<Opacity>(
      find.descendant(of: find.byKey(const ValueKey('role-card-disabled-client')), matching: find.byType(Opacity)),
    );
    expect(opacity.opacity, AppSizes.disabledOpacity);

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(repo.calls, isEmpty);
    expect(_location(router), OnboardingRoutes.forStep(OnboardingStepId.contacts));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  });

  testWidgets('(b) no role yet: no note, both cards enabled', (tester) async {
    final me = meFixture(consents: true, step: OnboardingStepId.role);
    final wrap = await onboardingWrapper(AppTheme.light(), user: me, repo: FakeOnboardingRepository(me));
    await tester.pumpWidget(wrap(const RoleScreen()));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('role-locked-note')), findsNothing);
    expect(find.byKey(const ValueKey('role-card-disabled-client')), findsNothing);
    expect(find.byKey(const ValueKey('role-card-disabled-attorney')), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  });
}
