import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';

import 'package:lawbid/features/auth/presentation/screens/assistant_code_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/change_password_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/email_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/forgot_password_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/login_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/otp_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/phone_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/set_password_screen.dart';
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

  /// Email sign-in (file 01 §10.2 E/F, stage 1.7 mobile) — same pattern
  /// as phone; the code screen ([otp]) is shared and reads the channel
  /// from `OnboardingFlowState`.
  static const email = '/auth/email';

  /// Owner 2026-10-04: an assistant signs in with the attorney's code.
  static const assistant = '/auth/assistant';

  /// Owner 2026-10-13: sign in with a phone number or e-mail + password
  /// (no SMS), the forgot-password flow, and the screen that asks for a
  /// password right after the one SMS code (shown by the router guard
  /// while `passwordRequired`).
  static const login = '/auth/login';
  static const forgotPassword = '/auth/forgot-password';
  static const setPassword = '/auth/set-password';

  /// Settings → Change password (signed in).
  static const changePassword = '/auth/change-password';

  /// Same path as `OnboardingRoutes.forStep(OnboardingStepId.role)`; the
  /// route itself is registered by onboardingRoutes().
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
        builder: (context, state) => WebPageFrame(
          location: state.matchedLocation,
          child: const WelcomeScreen(),
        ),
      ),
      // Welcome keeps the platform default transition (not part of the UI
      // modernization pass, 2026-09-27); the rest use LawBid page motion.
      GoRoute(
        path: AuthRoutes.phone,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const PhoneScreen()),
      ),
      GoRoute(
        path: AuthRoutes.assistant,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const AssistantCodeScreen()),
      ),
      GoRoute(
        path: AuthRoutes.otp,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const OtpScreen()),
      ),
      GoRoute(
        path: AuthRoutes.login,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          LoginScreen(
            initialIdentifier:
                state.extra is String ? state.extra! as String : '',
          ),
        ),
      ),
      GoRoute(
        path: AuthRoutes.forgotPassword,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          ForgotPasswordScreen(
            initialIdentifier:
                state.extra is String ? state.extra! as String : '',
          ),
        ),
      ),
      GoRoute(
        path: AuthRoutes.changePassword,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const ChangePasswordScreen()),
      ),
      GoRoute(
        path: AuthRoutes.setPassword,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const SetPasswordScreen()),
      ),
      GoRoute(
        path: AuthRoutes.email,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const EmailScreen()),
      ),
    ];
