import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../features/auth/auth_routes.dart';
import '../../features/create/presentation/screens/create_screen.dart';
import '../../features/feed/presentation/screens/feed_screen.dart';
import '../../features/mine/presentation/screens/mine_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/search/presentation/screens/search_screen.dart';
import 'app_routes.dart';
import 'guards/auth_guard.dart';
import 'route_observer.dart';
import 'shell/main_shell.dart';

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
        builder: (context, state, navigationShell) => MainShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.feed, builder: (context, state) => const FeedScreen())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: AppRoutes.search, builder: (context, state) => const SearchScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.mine, builder: (context, state) => const MineScreen())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: AppRoutes.profile, builder: (context, state) => const ProfileScreen()),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.create,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const CreateScreen(),
      ),
      ...authRoutes(),
    ],
  );
}

final _rootNavigatorKey = GlobalKey<NavigatorState>();
