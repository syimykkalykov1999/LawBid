import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_admins_screen.dart'
    deferred as d_channel_admins_screen;
import 'package:lawbid/features/channels/presentation/channel_composer_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_form_screen.dart'
    deferred as d_channel_form_screen;
import 'package:lawbid/features/channels/presentation/channel_screen.dart'
    deferred as d_channel_screen;
import 'package:lawbid/features/channels/presentation/channels_screen.dart'
    deferred as d_channels_screen;
import 'package:lawbid/features/channels/presentation/sections_archive.dart';

/// Owner 2026-10-20: channels routes. `/c/:username` is the public link
/// (`https://lawbid.dev/c/:username`, core/deeplinks); `/channels/:id` is
/// the in-app one (notifications, lists). `?post=<id>` puts one post first.
abstract final class ChannelsRoutes {
  static const list = '/channels';
  static const newChannel = '/channels/new';

  /// Owner 2026-10-21 (inbox 22c): the Archive of the channels.
  static const archive = '/channels/archive';

  static const channelPattern = '/channels/:id';
  static String channel(String id, {String? postId}) =>
      '/channels/${Uri.encodeComponent(id)}'
      '${postId == null ? '' : '?post=${Uri.encodeComponent(postId)}'}';

  static const byUsernamePattern = '/c/:username';
  static String byUsername(String username, {String? postId}) =>
      '/c/${Uri.encodeComponent(username)}'
      '${postId == null ? '' : '?post=${Uri.encodeComponent(postId)}'}';

  static const editPattern = '/channels/:id/edit';
  static String edit(String id) => '/channels/${Uri.encodeComponent(id)}/edit';

  static const adminsPattern = '/channels/:id/admins';
  static String admins(String id) =>
      '/channels/${Uri.encodeComponent(id)}/admins';

  static const composePattern = '/channels/:id/compose';
  static String compose(String id) =>
      '/channels/${Uri.encodeComponent(id)}/compose';
}

List<RouteBase> channelsRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: ChannelsRoutes.list,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          BackSwipe(
            mode: BackSwipeMode.rows,
            child: DeferredScreen(
              id: 'channels_screen',
              load: d_channels_screen.loadLibrary,
              builder: (_) => d_channels_screen.ChannelsScreen(),
            ),
          ),
        ),
      ),
      // Before `/channels/:id`, so "new" is not read as an id.
      GoRoute(
        path: ChannelsRoutes.newChannel,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'channel_form_screen',
            load: d_channel_form_screen.loadLibrary,
            builder: (_) => d_channel_form_screen.ChannelFormScreen(),
          ),
        ),
      ),
      GoRoute(
        path: ChannelsRoutes.archive,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const ChannelsArchiveScreen()),
      ),
      GoRoute(
        path: ChannelsRoutes.channelPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'channel_screen',
            load: d_channel_screen.loadLibrary,
            builder: (_) => d_channel_screen.ChannelScreen(
              channelRef: state.pathParameters['id'] ?? '',
              focusPostId: state.uri.queryParameters['post'],
            ),
          ),
        ),
      ),
      GoRoute(
        path: ChannelsRoutes.byUsernamePattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'channel_screen',
            load: d_channel_screen.loadLibrary,
            builder: (_) => d_channel_screen.ChannelScreen(
              channelRef: state.pathParameters['username'] ?? '',
              focusPostId: state.uri.queryParameters['post'],
            ),
          ),
        ),
      ),
      GoRoute(
        path: ChannelsRoutes.editPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'channel_form_screen',
            load: d_channel_form_screen.loadLibrary,
            builder: (_) => d_channel_form_screen.ChannelFormScreen(
              channelRef: state.pathParameters['id'],
            ),
          ),
        ),
      ),
      GoRoute(
        path: ChannelsRoutes.adminsPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'channel_admins_screen',
            load: d_channel_admins_screen.loadLibrary,
            builder: (_) => d_channel_admins_screen.ChannelAdminsScreen(
              channelId: state.pathParameters['id'] ?? '',
            ),
          ),
        ),
      ),
      GoRoute(
        path: ChannelsRoutes.composePattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          ChannelComposerScreen(channelId: state.pathParameters['id'] ?? ''),
        ),
      ),
    ];
