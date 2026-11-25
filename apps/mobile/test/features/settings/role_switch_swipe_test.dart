import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/auth/presentation/widgets/password_step_up.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/data/role_switch_repository.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/role_switch_preview.dart';
import 'package:lawbid/features/settings/account/presentation/widgets/role_switch_sheet.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/ux_harness.dart';

class _Repo implements RoleSwitchRepository {
  @override
  Future<RoleSwitchPreview> preview() async => const RoleSwitchPreview(
        to: UserRole.attorney,
        blockers: [],
        needsOnboarding: false,
        retryAfterSeconds: 0,
      );

  /// The server takes a moment — long enough to swipe the sheet away.
  @override
  Future<CurrentUser> switchTo(UserRole role, String reauthToken) async {
    await Future<void>.delayed(const Duration(seconds: 1));
    return meFixture(role: role);
  }
}

class _Session extends SessionController {
  @override
  SessionState? build() => SessionState(
        accessToken: 'test-access-token',
        sub: 'user-1',
        role: 'client',
        sid: 's1',
        verified: false,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2030),
      );

  @override
  Future<String> refreshAccessToken() async => 'test-access-token';
}

class _User extends CurrentUserController {
  int resets = 0;

  @override
  CurrentUserState build() => CurrentUserState.ready(meFixture());

  @override
  void resetForNewSession() => resets++;
}

/// Round 1 app check 25.11 №11: Account → «Switch profile». The server
/// switched the role, then the sheet waited for the token refresh (up to
/// 15 s) before popping with the new user. A sheet swiped away meanwhile
/// returned nothing, the app was never rebuilt for the new role — the
/// server on the new role, the phone showing the old role's tabs.
void main() {
  testWidgets(
      'the sheet is swiped away during the switch: the app is still '
      'rebuilt for the new role', (tester) async {
    final user = _User();
    CurrentUser? result;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          roleSwitchRepositoryProvider.overrideWithValue(_Repo()),
          sessionControllerProvider.overrideWith(_Session.new),
          currentUserControllerProvider.overrideWith(() => user),
        ],
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: Scaffold(
            body: Consumer(
              builder: (context, ref, _) => TextButton(
                // As the Account screen.
                onPressed: () async {
                  result = await showAppBottomSheet<CurrentUser>(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => const RoleSwitchSheet(),
                  );
                  if (result != null) {
                    ref
                        .read(currentUserControllerProvider.notifier)
                        .resetForNewSession();
                  }
                },
                child: const Text('account'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('account'));
    await tester.pumpAndSettle();
    expect(find.byType(PasswordStepUp), findsOneWidget);

    // The password step answered: the switch starts…
    tester
        .widget<PasswordStepUp>(find.byType(PasswordStepUp))
        .onToken('test-reauth-token')
        .ignore();
    await tester.pump();
    // …and the sheet is swiped away while the server works.
    tester.state<NavigatorState>(find.byType(Navigator).first).pop();
    await tester.pumpAndSettle();
    expect(find.byType(RoleSwitchSheet), findsNothing);

    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(user.resets, 1);
    expect(find.text('account'), findsOneWidget);
  });
}
