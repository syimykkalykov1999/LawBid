import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/stories/presentation/story_archive_screen.dart';
import 'package:lawbid/features/stories/presentation/story_creator_screen.dart';
import 'package:lawbid/features/stories/presentation/story_settings_screen.dart';
import 'package:lawbid/features/stories/presentation/story_viewer_screen.dart';

/// Owner 2026-10-20: stories — the viewer, the creator, the privacy
/// settings and the archive. Open them with `openStories(context, userId)`
/// and `openStoryCreator(context)` (story_navigation.dart).
abstract final class StoriesRoutes {
  static const viewPattern = '/stories/view/:userId';
  static String view(String userId) =>
      '/stories/view/${Uri.encodeComponent(userId)}';

  static const create = '/stories/new';
  static const settings = '/stories/settings';
  static const archive = '/stories/archive';
}

List<RouteBase> storiesRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: StoriesRoutes.viewPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          StoryViewerScreen(userId: state.pathParameters['userId'] ?? ''),
        ),
      ),
      GoRoute(
        path: StoriesRoutes.create,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const StoryCreatorScreen()),
      ),
      GoRoute(
        path: StoriesRoutes.settings,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const StorySettingsScreen()),
      ),
      GoRoute(
        path: StoriesRoutes.archive,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const StoryArchiveScreen()),
      ),
    ];
