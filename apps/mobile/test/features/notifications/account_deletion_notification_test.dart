import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// Pack E (25.11, ROUND1): «Аккаунт будет удалён» (day 0 and day 13 of
/// the grace period) used to open nothing. The deletion ended every
/// session, so the phone is signed out; signing in keeps the account (the
/// server cancels the deletion). The tap opens the profile tab, which needs
/// an account, so a signed-out app is shown the sign-in screen.
void main() {
  test('the push opens the profile tab', () {
    for (final kind in ['day0', 'day13']) {
      expect(
        notificationRoute(
          type: 'account_deletion_scheduled',
          payload: {'kind': kind, 'deletesOn': '2026-12-09T00:00:00.000Z'},
          attorney: false,
        ),
        AppRoutes.profile,
      );
    }
  });

  test('signed out (also as a guest), the profile tab leads to sign-in', () {
    for (final guest in [false, true]) {
      expect(
        AppRouterGuard.redirect(
          AppRoutes.profile,
          GuardSnapshot(
            startup: StartupStatus.ready,
            hasSession: false,
            user: const CurrentUserState.idle(),
            guestBrowsing: guest,
          ),
        ),
        AuthRoutes.welcome,
      );
    }
  });
}
