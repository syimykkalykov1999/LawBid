// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/data/role_switch_repository.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/role_switch_preview.dart';
import 'package:lawbid/features/settings/account/application/account_providers.dart';
import 'package:lawbid/features/settings/account/data/account_repository.dart';
import 'package:lawbid/features/settings/account/domain/account_identifier.dart';
import 'package:lawbid/features/settings/account/presentation/screens/account_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';
import '../../helpers/stub_auth_repository.dart';

/// Owner 2026-11-05: Settings → Account «Сменить профиль»: behind the admin
/// switch, confirmed with the password (no SMS link), blockers shown before
/// the password is asked.
class _Accounts implements AccountRepository {
  @override
  Future<List<AccountIdentifier>> listIdentifiers() async => const [];
}

class _RoleSwitch implements RoleSwitchRepository {
  _RoleSwitch(this.result, {this.onSwitch});

  final RoleSwitchPreview result;
  final Future<CurrentUser> Function(UserRole, String)? onSwitch;
  final tokens = <String>[];

  @override
  Future<RoleSwitchPreview> preview() async => result;

  @override
  Future<CurrentUser> switchTo(UserRole role, String reauthToken) {
    tokens.add(reauthToken);
    return onSwitch!(role, reauthToken);
  }
}

const _toClient = RoleSwitchPreview(
  to: UserRole.client,
  blockers: [],
  needsOnboarding: true,
  retryAfterSeconds: 0,
);

final _attorney = meFixture(
  role: UserRole.attorney,
  consents: true,
  firstName: 'Ann',
  lastName: 'Lee',
  phone: '+15551234567',
  phoneVerified: true,
  completed: true,
);

void main() {
  const row = ValueKey('account-role-switch');

  Future<void> pump(
    WidgetTester tester, {
    required bool enabled,
    _RoleSwitch? repo,
    CurrentUser? user,
  }) async {
    tester.view.physicalSize = const Size(390, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final me = user ?? _attorney;
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: me,
      repo: FakeOnboardingRepository(me),
      extra: <Override>[
        accountRepositoryProvider.overrideWithValue(_Accounts()),
        roleSwitchEnabledProvider.overrideWithValue(enabled),
        authRepositoryProvider.overrideWithValue(const StubAuthRepository()),
        if (repo != null) roleSwitchRepositoryProvider.overrideWithValue(repo),
      ],
    );
    await tester.pumpWidget(wrap(const AccountScreen()));
    await tester.pumpAndSettle();
  }

  Future<void> open(WidgetTester tester) async {
    await tester.ensureVisible(find.byKey(row));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(row));
    await tester.pumpAndSettle();
  }

  testWidgets('switch off (the default): no row', (tester) async {
    await pump(tester, enabled: false);
    expect(find.byKey(row), findsNothing);
  });

  testWidgets('an assistant has no row', (tester) async {
    await pump(
      tester,
      enabled: true,
      user: meFixture(
        role: UserRole.assistant,
        consents: true,
        firstName: 'A',
        lastName: 'B',
        completed: true,
      ),
    );
    expect(find.byKey(row), findsNothing);
  });

  testWidgets('blockers are listed and no password is asked', (tester) async {
    await pump(
      tester,
      enabled: true,
      repo: _RoleSwitch(
        const RoleSwitchPreview(
          to: UserRole.client,
          blockers: ['active_bids', 'assistants'],
          needsOnboarding: false,
          retryAfterSeconds: 0,
        ),
      ),
    );
    await open(tester);
    expect(find.text('• Active bids'), findsOneWidget);
    expect(find.text('• Assistants on your team'), findsOneWidget);
    expect(find.byKey(const ValueKey('step-up-password')), findsNothing);
  });

  testWidgets('the daily limit: no password either', (tester) async {
    await pump(
      tester,
      enabled: true,
      repo: _RoleSwitch(
        const RoleSwitchPreview(
          to: UserRole.client,
          blockers: [],
          needsOnboarding: false,
          retryAfterSeconds: 3600,
        ),
      ),
    );
    await open(tester);
    expect(find.byKey(const ValueKey('step-up-password')), findsNothing);
    expect(find.byKey(const ValueKey('role-switch-close')), findsOneWidget);
  });

  testWidgets('password step: never offers an SMS code', (tester) async {
    await pump(tester, enabled: true, repo: _RoleSwitch(_toClient));
    await open(tester);
    expect(find.byKey(const ValueKey('step-up-password')), findsOneWidget);
    expect(find.byKey(const ValueKey('step-up-use-code')), findsNothing);
    expect(find.text('Next, fill in a short client form.'), findsOneWidget);
  });

  testWidgets('a right password switches with its single-use token',
      (tester) async {
    final repo = _RoleSwitch(
      _toClient,
      onSwitch: (role, token) async => _attorney,
    );
    await pump(tester, enabled: true, repo: repo);
    await open(tester);
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('step-up-password')),
        matching: find.byType(EditableText),
      ),
      'stub-password',
    );
    await tester.tap(find.byKey(const ValueKey('step-up-password-submit')));
    await tester.pump(const Duration(milliseconds: 400));
    // The token refresh has no server here: its time limit ends the wait.
    await tester.pump(const Duration(seconds: 16));
    await tester.pumpAndSettle();
    expect(repo.tokens, ['stub-reauth-token']);
    expect(find.byKey(const ValueKey('step-up-password')), findsNothing);
  });

  testWidgets('a blocker that appeared meanwhile replaces the password step',
      (tester) async {
    final repo = _RoleSwitch(
      _toClient,
      onSwitch: (role, token) async => throw const ApiException(
        code: ApiErrorCodes.roleSwitchBlocked,
        message: 'x',
        statusCode: 409,
        details: {
          'blockers': ['active_cases'],
        },
      ),
    );
    await pump(tester, enabled: true, repo: repo);
    await open(tester);
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('step-up-password')),
        matching: find.byType(EditableText),
      ),
      'stub-password',
    );
    await tester.tap(find.byKey(const ValueKey('step-up-password-submit')));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('• Active cases'), findsOneWidget);
    expect(find.byKey(const ValueKey('step-up-password')), findsNothing);
  });
}
