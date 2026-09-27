import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/guards/auth_guard.dart';
import 'package:lawbid/core/navigation/route_observer.dart';
import 'package:lawbid/core/navigation/shell/main_shell.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/create/presentation/screens/create_screen.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/active_devices_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/delete_account_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'app_router.g.dart';

/// App-wide router (file 01 §5.1: go_router + ShellRoute; stage 1.5 uses
/// `StatefulShellRoute.indexedStack` — see main_shell.dart doc comment).
///
/// `initialLocation` is [AuthRoutes.welcome], not [AppRoutes.feed] (changed
/// in stage 1.7, docs/CHANGELOG.md): before the auth/onboarding screens
/// existed there was nothing else to land on, so `/feed` was the only
/// sensible default. Now that `/welcome` → phone → otp → role exists, a
/// cold start should go through it — see [authGuardRedirect]'s doc comment
/// for what this guard can and can't yet enforce.
@riverpod
GoRouter appRouter(Ref ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AuthRoutes.welcome,
    observers: [routeObserver],
    redirect: (context, state) => authGuardRedirect(context, state, ref),
    routes: [
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
      ...authRoutes(),
    ],
  );
}

final _rootNavigatorKey = GlobalKey<NavigatorState>();
