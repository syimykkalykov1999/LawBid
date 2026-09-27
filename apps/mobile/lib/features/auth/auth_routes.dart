import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';

import 'package:lawbid/features/auth/presentation/screens/otp_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/phone_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/role_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/welcome_screen.dart';

/// Path constants for the auth/onboarding flow (file 07 §6: `/welcome`,
/// `/auth/phone`, `/auth/otp`, `/onboarding/role`). Kept in this file next
/// to the routes themselves rather than folded into `AppRoutes`
/// (core/navigation/app_routes.dart) — see [authRoutes]'s doc comment for
/// why this flow's routes live beside the shell's instead of inside it.
abstract final class AuthRoutes {
  static const welcome = '/welcome';
  static const phone = '/auth/phone';
  static const otp = '/auth/otp';
  static const role = '/onboarding/role';
}

/// 4 flat top-level routes, appended beside (not nested inside) the
/// `StatefulShellRoute.indexedStack` in app_router.dart — per the stage-1.7
/// architecture review (ecc:code-architect, docs/CHANGELOG.md): onboarding
/// isn't a shell tab, has no bottom nav, and nesting it inside the shell
/// would force every onboarding screen to carry a tab's Scaffold/
/// AppBottomNav for no reason.
///
/// `context.push()` is used for forward navigation between these 4 screens
/// (preserves each screen's own widget state on the stack, so the back
/// button returns to exactly where the user was); only the final
/// role→shell transition uses `context.go()`, since file 07 §6.5's flow is
/// one-directional and onboarding screens shouldn't stay on the back stack
/// once the user reaches the main app.
List<RouteBase> authRoutes() => [
      GoRoute(
        path: AuthRoutes.welcome,
        builder: (context, state) => const WelcomeScreen(),
      ),
      // Welcome keeps the platform default transition (not part of the UI
      // modernization pass, 2026-09-27); the rest use LawBid page motion.
      GoRoute(
        path: AuthRoutes.phone,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const PhoneScreen()),
      ),
      GoRoute(
        path: AuthRoutes.otp,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const OtpScreen()),
      ),
      GoRoute(
        path: AuthRoutes.role,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const RoleScreen()),
      ),
    ];
