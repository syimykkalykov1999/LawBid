import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/post_insights_screen.dart'
    deferred as d_post_insights_screen;
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';

/// docs/05 feed routes. `/post/:id` is also the published deep link
/// (docs/01 §12) — registered by deep_link_routes.dart with [PostScreen].
abstract final class SocialRoutes {
  /// [fromProfile]: opened from someone's grid — no author row (owner
  /// 2026-10-07).
  static String post(String id, {bool fromProfile = false}) =>
      '/post/${Uri.encodeComponent(id)}${fromProfile ? '?from=profile' : ''}';

  static const tagPattern = '/tag/:tag';
  static String tag(String tag) => '/tag/${Uri.encodeComponent(tag)}';

  static const followersPattern = '/attorney/:id/followers';
  static String followers(String id) =>
      '/attorney/${Uri.encodeComponent(id)}/followers';

  /// Owner 2026-10-18: an own post's statistics; `extra` is the [Post]
  /// when the caller has it (the screen then shows nothing for a post that
  /// is not the viewer's, before any request; the server checks too).
  static const insightsPattern = '/post/:id/insights';
  static String insights(String id) =>
      '/post/${Uri.encodeComponent(id)}/insights';

  static const followingPattern = '/attorney/:id/following';
  static String following(String id) =>
      '/attorney/${Uri.encodeComponent(id)}/following';
}

List<RouteBase> socialRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: SocialRoutes.insightsPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) {
          final extra = state.extra;
          return AppPageTransitions.push(
            state,
            DeferredScreen(
              id: 'post_insights_screen',
              load: d_post_insights_screen.loadLibrary,
              builder: (_) => d_post_insights_screen.PostInsightsScreen(
                postId: state.pathParameters['id'] ?? '',
                post: extra is Post ? extra : null,
              ),
            ),
          );
        },
      ),
      GoRoute(
        path: SocialRoutes.tagPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          TagScreen(tag: state.pathParameters['tag'] ?? ''),
        ),
      ),
      GoRoute(
        path: SocialRoutes.followersPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          FollowListScreen(
            attorneyId: state.pathParameters['id'] ?? '',
            kind: FollowListKind.followers,
          ),
        ),
      ),
      GoRoute(
        path: SocialRoutes.followingPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          FollowListScreen(
            attorneyId: state.pathParameters['id'] ?? '',
            kind: FollowListKind.following,
          ),
        ),
      ),
    ];
