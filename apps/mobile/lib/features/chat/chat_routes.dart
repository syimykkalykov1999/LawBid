import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/notifications/presentation/notification_settings_screen.dart';

/// docs/05 §8–§9 routes: the Chats/Notifications screen, one chat, and
/// Settings → Notifications.
abstract final class ChatRoutes {
  static const inbox = '/inbox';

  /// OQ-043: message requests sent to me.
  static const requests = '/inbox/requests';
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
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          InboxScreen(
            initialTab: state.uri.queryParameters['tab'] == 'notifications'
                ? InboxTab.notifications
                : InboxTab.chats,
          ),
        ),
      ),
      GoRoute(
        path: ChatRoutes.requests,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const MessageRequestsScreen()),
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
