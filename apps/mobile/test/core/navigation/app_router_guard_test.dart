import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';

GuardSnapshot _signedIn(CurrentUser user) => GuardSnapshot(
      startup: StartupStatus.ready,
      hasSession: true,
      user: CurrentUserState.ready(user),
    );

const _signedOut = GuardSnapshot(
  startup: StartupStatus.ready,
  hasSession: false,
  user: CurrentUserState.idle(),
);

/// A client who has passed consents + role with both contacts verified.
CurrentUser _readyClient({OnboardingStepId? step, bool named = true, bool completed = false}) => meFixture(
      role: UserRole.client,
      consents: true,
      phone: '+15551234567',
      phoneVerified: true,
      email: 'a@b.co',
      emailVerified: true,
      firstName: named ? 'Ann' : null,
      lastName: named ? 'Lee' : null,
      step: step,
      completed: completed,
    );

CurrentUser _readyAttorney({OnboardingStepId? step, bool completed = false}) => meFixture(
      role: UserRole.attorney,
      consents: true,
      phone: '+15551234567',
      phoneVerified: true,
      firstName: 'Tom',
      lastName: 'Ray',
      step: step,
      completed: completed,
    );

class _Case {
  const _Case(this.description, this.location, this.snapshot, this.expected);

  final String description;
  final String location;
  final GuardSnapshot snapshot;
  final String? expected;
}

void main() {
  // docs/01_FOUNDATION_AUTH.md §11 "Guard-логика навигации" — one group per
  // table row, plus the splash (§10.2 A) and back-navigation refinements.
  final cases = <String, List<_Case>>{
    'splash sequence (§10.2 A) holds every route until startup is ready': [
      const _Case(
        'running → /feed',
        '/feed',
        GuardSnapshot(startup: StartupStatus.running, hasSession: false, user: CurrentUserState.idle()),
        '/splash',
      ),
      const _Case(
        'running → /welcome',
        '/welcome',
        GuardSnapshot(startup: StartupStatus.running, hasSession: false, user: CurrentUserState.idle()),
        '/splash',
      ),
      const _Case(
        'running stays on /splash',
        '/splash',
        GuardSnapshot(startup: StartupStatus.running, hasSession: false, user: CurrentUserState.idle()),
        null,
      ),
      const _Case(
        'offline (stored session, no network) stays on /splash',
        '/feed',
        GuardSnapshot(startup: StartupStatus.offline, hasSession: false, user: CurrentUserState.idle()),
        '/splash',
      ),
    ],
    'row 1: нет токена → /welcome': [
      const _Case('/feed', '/feed', _signedOut, '/welcome'),
      const _Case('/splash', '/splash', _signedOut, '/welcome'),
      const _Case('/onboarding/consents', '/onboarding/consents', _signedOut, '/welcome'),
      const _Case('/profile/settings', '/profile/settings', _signedOut, '/welcome'),
      const _Case('welcome is allowed', '/welcome', _signedOut, null),
      const _Case('phone sign-in is allowed', '/auth/phone', _signedOut, null),
      const _Case('email sign-in is allowed', '/auth/email', _signedOut, null),
      const _Case('code screen is allowed', '/auth/otp', _signedOut, null),
      const _Case('legal docs are public', '/legal/terms', _signedOut, null),
    ],
    'token present, GET /users/me not loaded yet': [
      const _Case(
        'just signed in on /auth/otp: stay (no splash flicker)',
        '/auth/otp',
        GuardSnapshot(startup: StartupStatus.ready, hasSession: true, user: CurrentUserState.loading()),
        null,
      ),
      const _Case(
        'loading elsewhere → /splash',
        '/feed',
        GuardSnapshot(startup: StartupStatus.ready, hasSession: true, user: CurrentUserState.loading()),
        '/splash',
      ),
      _Case(
        'failed → /splash (error + retry)',
        '/feed',
        GuardSnapshot(
          startup: StartupStatus.ready,
          hasSession: true,
          user: CurrentUserState.failed(Exception('x')),
        ),
        '/splash',
      ),
    ],
    'row 2: токен есть, нет согласий/18+ → /onboarding/consents': [
      _Case('fresh account starts at Шаг 1 «Язык»', '/feed', _signedIn(meFixture()), '/onboarding/language'),
      _Case(
        'saved step language → language',
        '/onboarding/consents',
        _signedIn(meFixture(step: OnboardingStepId.language)),
        '/onboarding/language',
      ),
      _Case(
        'saved step consents → consents',
        '/feed',
        _signedIn(meFixture(step: OnboardingStepId.consents)),
        '/onboarding/consents',
      ),
      _Case(
        'cannot skip ahead to role',
        '/onboarding/role',
        _signedIn(meFixture(step: OnboardingStepId.consents)),
        '/onboarding/consents',
      ),
      _Case(
        'back to language is allowed',
        '/onboarding/language',
        _signedIn(meFixture(step: OnboardingStepId.consents)),
        null,
      ),
      _Case(
        'completed account whose consents lapsed (new ToS) → consents, not language',
        '/feed',
        _signedIn(meFixture(step: OnboardingStepId.tour, completed: true)),
        '/onboarding/consents',
      ),
    ],
    'row 3: нет роли → /onboarding/role': [
      _Case('from the feed', '/feed', _signedIn(meFixture(consents: true, step: OnboardingStepId.role)), '/onboarding/role'),
      _Case(
        'cannot skip to contacts',
        '/onboarding/contacts',
        _signedIn(meFixture(consents: true, step: OnboardingStepId.role)),
        '/onboarding/role',
      ),
      _Case('stays on role', '/onboarding/role', _signedIn(meFixture(consents: true, step: OnboardingStepId.role)), null),
    ],
    'row 4: клиент без подтверждённых телефона И email → /onboarding/contacts': [
      _Case(
        'phone only verified',
        '/feed',
        _signedIn(meFixture(role: UserRole.client, consents: true, phone: '+15551234567', phoneVerified: true)),
        '/onboarding/contacts',
      ),
      _Case(
        'email only verified',
        '/feed',
        _signedIn(meFixture(role: UserRole.client, consents: true, email: 'a@b.co', emailVerified: true)),
        '/onboarding/contacts',
      ),
      _Case(
        'neither verified',
        '/onboarding/profile',
        _signedIn(meFixture(role: UserRole.client, consents: true, step: OnboardingStepId.profile)),
        '/onboarding/contacts',
      ),
      _Case(
        'cannot be skipped even with a later saved step',
        '/onboarding/tour',
        _signedIn(meFixture(role: UserRole.client, consents: true, phoneVerified: true, step: OnboardingStepId.tour)),
        '/onboarding/contacts',
      ),
      _Case(
        'cannot be skipped even after completion',
        '/feed',
        _signedIn(meFixture(role: UserRole.client, consents: true, phoneVerified: true, completed: true)),
        '/onboarding/contacts',
      ),
    ],
    'row 5: адвокат без подтверждённого телефона → /onboarding/contacts': [
      _Case(
        'attorney signed in by email',
        '/feed',
        _signedIn(meFixture(role: UserRole.attorney, consents: true, email: 'a@b.co', emailVerified: true)),
        '/onboarding/contacts',
      ),
      _Case(
        'attorney with a verified phone and no email is NOT held on contacts',
        '/feed',
        _signedIn(_readyAttorney(step: OnboardingStepId.push)),
        '/onboarding/push',
      ),
    ],
    'row 6: онбординг не завершён → /onboarding/{текущий шаг}': [
      _Case('saved profile', '/feed', _signedIn(_readyClient(step: OnboardingStepId.profile)), '/onboarding/profile'),
      _Case('saved push', '/welcome', _signedIn(_readyClient(step: OnboardingStepId.push)), '/onboarding/push'),
      _Case('saved tour', '/splash', _signedIn(_readyClient(step: OnboardingStepId.tour)), '/onboarding/tour'),
      _Case(
        'saved step still "role" (role just set) → first step after role',
        '/onboarding/role',
        _signedIn(_readyClient(step: OnboardingStepId.role)),
        null,
      ),
      _Case(
        'no saved step → contacts',
        '/feed',
        _signedIn(_readyClient()),
        '/onboarding/contacts',
      ),
      _Case(
        'attorney-only step saved for a client → tour',
        '/feed',
        _signedIn(_readyClient(step: OnboardingStepId.verification)),
        '/onboarding/tour',
      ),
      _Case(
        'name missing but saved past profile → profile',
        '/onboarding/tour',
        _signedIn(_readyClient(step: OnboardingStepId.tour, named: false)),
        '/onboarding/profile',
      ),
      _Case(
        'back to an earlier step is allowed',
        '/onboarding/contacts',
        _signedIn(_readyClient(step: OnboardingStepId.push)),
        null,
      ),
      _Case(
        'forward past the saved step is not',
        '/onboarding/tour',
        _signedIn(_readyClient(step: OnboardingStepId.push)),
        '/onboarding/push',
      ),
      _Case(
        'attorney verification step',
        '/feed',
        _signedIn(_readyAttorney(step: OnboardingStepId.verification)),
        '/onboarding/verification',
      ),
      _Case(
        '"Verify now" placeholder reachable from the verification step',
        '/verification',
        _signedIn(_readyAttorney(step: OnboardingStepId.verification)),
        null,
      ),
      _Case(
        '…but not from other steps',
        '/verification',
        _signedIn(_readyClient(step: OnboardingStepId.push)),
        '/onboarding/push',
      ),
      _Case(
        'legal docs open from onboarding',
        '/legal/privacy',
        _signedIn(meFixture(step: OnboardingStepId.consents)),
        null,
      ),
    ],
    'row 7: attorney + unverified → главное меню доступно': [
      _Case('mine tab (shows the verification CTA)', '/mine', _signedIn(_readyAttorney(completed: true)), null),
      _Case('feed', '/feed', _signedIn(_readyAttorney(completed: true)), null),
      _Case('verify-now placeholder', '/verification', _signedIn(_readyAttorney(completed: true)), null),
    ],
    'row 8: клиент/адвокат ok → /feed': [
      _Case('splash → feed', '/splash', _signedIn(_readyClient(completed: true)), '/feed'),
      _Case('welcome → feed', '/welcome', _signedIn(_readyClient(completed: true)), '/feed'),
      _Case('sign-in code → feed', '/auth/otp', _signedIn(_readyClient(completed: true)), '/feed'),
      _Case('stale onboarding step → feed', '/onboarding/tour', _signedIn(_readyClient(completed: true)), '/feed'),
      _Case('feed stays', '/feed', _signedIn(_readyClient(completed: true)), null),
      _Case('settings stay', '/profile/settings', _signedIn(_readyClient(completed: true)), null),
      _Case('attorney → feed', '/onboarding/verification', _signedIn(_readyAttorney(completed: true)), '/feed'),
    ],
  };

  for (final entry in cases.entries) {
    group(entry.key, () {
      for (final c in entry.value) {
        test('${c.description}: ${c.location} → ${c.expected ?? 'stay'}', () {
          expect(AppRouterGuard.redirect(c.location, c.snapshot), c.expected);
        });
      }
    });
  }
}
