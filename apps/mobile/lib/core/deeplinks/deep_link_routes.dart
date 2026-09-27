import 'package:go_router/go_router.dart';

import '../navigation/app_page_transitions.dart';
import 'deep_link.dart';
import 'deep_link_placeholder_screen.dart';

/// Routes the §12 content deep links land on (docs/01_FOUNDATION_AUTH.md:
/// `lawbid.app/case/:id`, `/lawyer/:username`, `/post/:id`).
///
/// TODO(docs/03, docs/04, docs/05): replace each placeholder with the real
/// screen when the lawyer profile (file 03), case (file 04) and post
/// (file 05) screens are built — keep these paths, they are what the
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
      DeepLinkPlaceholderScreen(kind: ContentKind.caseItem, id: state.pathParameters['id'] ?? ''),
    ),
  ),
  GoRoute(
    path: DeepLinkRoutes.lawyerPath,
    pageBuilder: (context, state) => AppPageTransitions.push(
      state,
      DeepLinkPlaceholderScreen(
        kind: ContentKind.lawyer,
        id: state.pathParameters['username'] ?? '',
      ),
    ),
  ),
  GoRoute(
    path: DeepLinkRoutes.postPath,
    pageBuilder: (context, state) => AppPageTransitions.push(
      state,
      DeepLinkPlaceholderScreen(kind: ContentKind.post, id: state.pathParameters['id'] ?? ''),
    ),
  ),
];
