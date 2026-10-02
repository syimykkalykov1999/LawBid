import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/cases/presentation/screens/case_route_screens.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_public_profile_screen.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';

/// Routes the §12 content deep links land on (docs/01_FOUNDATION_AUTH.md:
/// `lawbid.app/case/:id`, `/lawyer/:username`, `/post/:id`).
///
/// `/lawyer/:username` opens the real public attorney profile (docs/03
/// stage 3.9), `/case/:id` the real case screen (docs/04), `/post/:id` the
/// post screen (docs/05). Keep these paths: the published links use them.
abstract final class DeepLinkRoutes {
  static const casePath = '/case/:id';
  static const lawyerPath = '/lawyer/:username';
  static const postPath = '/post/:id';

  /// Not a published deep link; the in-app people/followers rows use it.
  static const clientPath = '/client/:username';
}

List<RouteBase> deepLinkRoutes() => [
      GoRoute(
        path: DeepLinkRoutes.casePath,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          CaseRouteScreen(caseId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: DeepLinkRoutes.lawyerPath,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          AttorneyProfileScreen(
            username: state.pathParameters['username'] ?? '',
          ),
        ),
      ),
      GoRoute(
        path: DeepLinkRoutes.clientPath,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          ClientPublicProfileScreen(
            username: state.pathParameters['username'] ?? '',
          ),
        ),
      ),
      GoRoute(
        path: DeepLinkRoutes.postPath,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          PostScreen(postId: state.pathParameters['id'] ?? ''),
        ),
      ),
    ];
