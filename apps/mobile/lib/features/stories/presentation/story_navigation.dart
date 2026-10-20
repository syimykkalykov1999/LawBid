import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/features/stories/stories_routes.dart';

/// Plays [userId]'s live stories full screen (the tray, an avatar with a
/// ring).
Future<void> openStories(BuildContext context, String userId) =>
    context.push<void>(StoriesRoutes.view(userId));

/// The story creator (photo, video or text).
Future<void> openStoryCreator(BuildContext context) =>
    context.push<void>(StoriesRoutes.create);

/// Story privacy: audience, replies, hidden-from, archive.
Future<void> openStorySettings(BuildContext context) =>
    context.push<void>(StoriesRoutes.settings);
