import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/features/stories/stories_routes.dart';

/// Plays [userId]'s live stories full screen (the tray, an avatar with a
/// ring).
Future<void> openStories(BuildContext context, String userId) =>
    context.push<void>(StoriesRoutes.view(userId));

/// The story creator (photo, video or text). Owner 2026-10-21 (Instagram
/// «Добавить в историю»): with [postId] it opens with that post as a
/// sticker.
Future<void> openStoryCreator(BuildContext context, {String? postId}) =>
    context.push<void>(StoriesRoutes.createWith(postId: postId));

/// Story privacy: audience, replies, hidden-from, archive.
Future<void> openStorySettings(BuildContext context) =>
    context.push<void>(StoriesRoutes.settings);
