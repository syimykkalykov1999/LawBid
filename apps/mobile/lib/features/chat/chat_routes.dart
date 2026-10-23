import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/chat/presentation/archive_screen.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/notifications/presentation/notification_settings_screen.dart';

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
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const ArchiveScreen()),
      ),
      GoRoute(
        path: ChatRoutes.conversationPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          ConversationScreen(conversationId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: ChatRoutes.call,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.modal(state, const CallScreen()),
      ),
      GoRoute(
        path: ChatRoutes.notificationSettings,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          const NotificationSettingsScreen(),
        ),
      ),
    ];
