import 'package:lawbid/features/cases/presentation/screens/case_comments_screen.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_detail_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_form_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/case_history_screens.dart';
import 'package:lawbid/features/cases/presentation/screens/edit_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/work_case_screen.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/deeplinks/deep_link_routes.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/core/navigation/route_observer.dart';
import 'package:lawbid/core/navigation/shell/main_shell.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/create/presentation/screens/create_screen.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/screens/legal_document_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/splash_screen.dart';
import 'package:lawbid/features/settings/active_devices/presentation/active_devices_screen.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/client_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/delete_account_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/my_contacts_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/practices_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/review_form_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/verification_required_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_screen.dart';
import 'package:lawbid/features/blocks/presentation/blocked_users_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:lawbid/features/settings/account/account_routes.dart';
import 'package:lawbid/features/verification/presentation/screens/verification_status_screen.dart';
import 'package:lawbid/features/verification/presentation/screens/verification_wizard_screen.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/features/settings/data_export/presentation/data_export_screen.dart';
import 'package:lawbid/features/chat/chat_routes.dart';

part 'app_router.g.dart';

/// App-wide router (file 01 §5.1: go_router + ShellRoute; stage 1.5 uses
/// `StatefulShellRoute.indexedStack` — see main_shell.dart doc comment).
///
/// Stage 1.7 mobile: starts on [AppRoutes.splash] (§10.2 A) and delegates
/// EVERY redirect to [AppRouterGuard] (§11). [_GuardRefresh] re-runs the
/// guard whenever the startup status, the session, or `GET /users/me`
/// changes — so onboarding screens only mutate server state and the guard
/// moves the user to the next step (no navigation logic in screens).
@riverpod
GoRouter appRouter(Ref ref) {
  final refresh = _GuardRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.splash,
    observers: [routeObserver],
    refreshListenable: refresh,
    redirect: (context, state) => AppRouterGuard.redirect(
      state.matchedLocation,
      GuardSnapshot(
        startup: ref.read(appStartupProvider),
        hasSession: ref.read(sessionControllerProvider) != null,
        user: ref.read(currentUserControllerProvider),
      ),
    ),
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        pageBuilder: (context, state) =>
            AppPageTransitions.fade(state, const SplashScreen()),
      ),
      StatefulShellRoute.indexedStack(
        // UI modernization pass (2026-09-27): the shell fades in when the
        // user lands on it (e.g. role → feed); see app_page_transitions.dart.
        pageBuilder: (context, state, navigationShell) =>
            AppPageTransitions.fade(
          state,
          MainShell(navigationShell: navigationShell),
        ),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.feed,
                builder: (context, state) => const FeedScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.search,
                builder: (context, state) => const SearchScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.mine,
                builder: (context, state) => const MineScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.profile,
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.create,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.modal(state, const CreateScreen()),
      ),
      GoRoute(
        path: AppRoutes.profileSettings,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const SettingsScreen()),
      ),
      // Phase 4 of the auth networking work (docs/CHANGELOG.md) — pushed
      // on the ROOT navigator, same reasoning as profileSettings above.
      GoRoute(
        path: AppRoutes.activeDevices,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const ActiveDevicesScreen()),
      ),
      GoRoute(
        path: AppRoutes.deleteAccount,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const DeleteAccountScreen()),
      ),
      // docs/03 stage 3.9 — practices, profile editing, contacts, reviews,
      // and the "+" → Post to feed verification gate.
      GoRoute(
        path: AppRoutes.profileEdit,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const ProfileEditScreen()),
      ),
      GoRoute(
        path: AppRoutes.practices,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const PracticesScreen()),
      ),
      GoRoute(
        path: AppRoutes.myContacts,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const MyContactsScreen()),
      ),
      GoRoute(
        path: AppRoutes.reviewForm,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          ReviewFormScreen(
            caseId: state.pathParameters['caseId'] ?? '',
            existing: state.extra is Review ? state.extra! as Review : null,
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.verificationRequired,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.modal(state, const VerificationRequiredScreen()),
      ),
      GoRoute(
        path: AppRoutes.verification,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const VerificationStatusScreen()),
      ),
      GoRoute(
        path: AppRoutes.verificationWizard,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const VerificationWizardScreen()),
      ),
      GoRoute(
        path: AppRoutes.legal,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.modal(
          state,
          LegalDocumentScreen(docType: state.pathParameters['docType'] ?? ''),
        ),
      ),
      // docs/04 cases & bids (stages 4.9/4.10) — ROOT navigator.
      GoRoute(
        path: AppRoutes.myCasePattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          OwnerCaseScreen(caseId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: AppRoutes.myCaseEditPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          EditCaseScreen(caseId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: AppRoutes.bidPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          BidDetailScreen(
            bidId: state.pathParameters['id'] ?? '',
            listed: state.extra is CaseBid ? state.extra! as CaseBid : null,
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.caseCommentsPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          CaseCommentsScreen(caseId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: AppRoutes.placeBidPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          BidFormScreen(caseId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: AppRoutes.workCasePattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          WorkCaseScreen(caseId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: AppRoutes.completedWork,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const CompletedWorkScreen()),
      ),
      GoRoute(
        path: AppRoutes.caseHistory,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const CaseHistoryScreen()),
      ),
      GoRoute(
        path: AppRoutes.dataExport,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const DataExportScreen()),
      ),
      GoRoute(
        path: AppRoutes.blockedUsers,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const BlockedUsersScreen()),
      ),
      GoRoute(
        path: AppRoutes.caseHistoryItemPattern,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          CaseHistoryDetailScreen(caseId: state.pathParameters['id'] ?? ''),
        ),
      ),
      ...authRoutes(),
      ...onboardingRoutes(),
      ...accountRoutes(parentNavigatorKey: _rootNavigatorKey),
      // docs/01_FOUNDATION_AUTH.md §12 content links (/case/:id,
      // /lawyer/:username, /post/:id) — core/deeplinks.
      ...deepLinkRoutes(),
      // docs/05 feed: tag pages, follower lists.
      ...socialRoutes(_rootNavigatorKey),
      // docs/05 chats, notifications, notification settings.
      ...chatRoutes(_rootNavigatorKey),
      // docs/06 §1.7: Settings → Подписка, payments, gate paywall.
      ...subscriptionRoutes(_rootNavigatorKey),
    ],
  );
}

final _rootNavigatorKey = GlobalKey<NavigatorState>();

/// Bridges the guard's inputs (Riverpod) to go_router's
/// `refreshListenable`. Session changes are narrowed to sign-in/sign-out
/// (`sub`), so the 15-minute access-token rotation doesn't re-run the
/// guard for nothing.
class _GuardRefresh extends ChangeNotifier {
  _GuardRefresh(Ref ref) {
    ref
      ..listen(appStartupProvider, (_, __) => notifyListeners())
      ..listen(sessionControllerProvider.select((s) => s?.sub),
          (_, __) => notifyListeners())
      ..listen(currentUserControllerProvider, (_, __) => notifyListeners());
  }
}
