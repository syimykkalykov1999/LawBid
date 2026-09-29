import 'package:go_router/go_router.dart';

import '../../features/cases/presentation/screens/case_route_screens.dart';
import '../../features/profile/presentation/screens/attorney_profile_screen.dart';
import '../navigation/app_page_transitions.dart';
import 'deep_link.dart';
import 'deep_link_placeholder_screen.dart';

/// Routes the §12 content deep links land on (docs/01_FOUNDATION_AUTH.md:
/// `lawbid.app/case/:id`, `/lawyer/:username`, `/post/:id`).
///
/// `/lawyer/:username` opens the real public attorney profile (docs/03
/// stage 3.9), `/case/:id` the real case screen (docs/04). TODO(docs/05):
/// replace the post placeholder — keep these paths, they are what the
/// published links use.
abstract final class DeepLinkRoutes {
  static const casePath = '/case/:id';
  static const lawyerPath = '/lawyer/:username';
  static const postPath = '/post/:id';
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
              username: state.pathParameters['username'] ?? ''),
        ),
      ),
      GoRoute(
        path: DeepLinkRoutes.postPath,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeepLinkPlaceholderScreen(
              kind: ContentKind.post, id: state.pathParameters['id'] ?? ''),
        ),
      ),
    ];
