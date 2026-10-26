import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart'
    deferred as d_call_screen;
import 'package:lawbid/features/chat/presentation/archive_screen.dart'
    deferred as d_archive_screen;
import 'package:lawbid/features/chat/presentation/conversation_screen.dart'
    deferred as d_conversation_screen;
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/notifications/presentation/notification_settings_screen.dart'
    deferred as d_notification_settings_screen;

/// docs/05 §8–§9 routes: the Chats/Notifications screen, one chat, and
/// Settings → Notifications.
abstract final class ChatRoutes {
  static const inbox = '/inbox';

  /// OQ-043: message requests sent to me.
  static const requests = '/inbox/requests';

  /// Owner 2026-10-20: my archived chats and groups.
  static const archive = '/inbox/archive';
  static String inboxTab(InboxTab tab) => '/inbox?tab=${tab.name}';

  static const conversationPattern = '/chat/:id';
  static String conversation(String id) => '/chat/${Uri.encodeComponent(id)}';

  static const notificationSettings = '/profile/settings/notifications';

  /// OQ-041: the full-screen call.
  static const call = '/call';
}

List<RouteBase> chatRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: ChatRoutes.inbox,
        parentNavigatorKey: root,
        // Rows with side actions on their edges (docs/ux/GESTURES.md).
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          BackSwipe(
            mode: BackSwipeMode.rows,
            child: InboxScreen(
              initialTab: switch (state.uri.queryParameters['tab']) {
                'notifications' => InboxTab.notifications,
                'requests' => InboxTab.requests,
                'team' => InboxTab.team,
                _ => InboxTab.chats,
              },
            ),
          ),
        ),
      ),
      GoRoute(
        path: ChatRoutes.requests,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          const BackSwipe(
            mode: BackSwipeMode.rows,
            child: InboxScreen(initialTab: InboxTab.requests),
          ),
        ),
      ),
      GoRoute(
        path: ChatRoutes.archive,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'archive_screen',
            load: d_archive_screen.loadLibrary,
            builder: (_) => d_archive_screen.ArchiveScreen(),
          ),
        ),
      ),
      GoRoute(
        path: ChatRoutes.conversationPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'conversation_screen',
            load: d_conversation_screen.loadLibrary,
            builder: (_) => d_conversation_screen.ConversationScreen(
              conversationId: state.pathParameters['id'] ?? '',
            ),
          ),
        ),
      ),
      GoRoute(
        path: ChatRoutes.call,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.modal(
          state,
          DeferredScreen(
            id: 'call_screen',
            load: d_call_screen.loadLibrary,
            builder: (_) => d_call_screen.CallScreen(),
          ),
        ),
      ),
      GoRoute(
        path: ChatRoutes.notificationSettings,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'notification_settings_screen',
            load: d_notification_settings_screen.loadLibrary,
            builder: (_) =>
                d_notification_settings_screen.NotificationSettingsScreen(),
          ),
        ),
      ),
    ];
