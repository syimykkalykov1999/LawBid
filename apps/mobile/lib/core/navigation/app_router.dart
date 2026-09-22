import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

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
/// `redirect:` already wires in [authGuardRedirect] even though it's a
/// stage-1.5 no-op stub, so stage 1.7's real guard logic is a change inside
/// that one function, not a router restructure.
@riverpod
GoRouter appRouter(Ref ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.feed,
    observers: [routeObserver],
    redirect: authGuardRedirect,
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
    ],
  );
}

final _rootNavigatorKey = GlobalKey<NavigatorState>();
