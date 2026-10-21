import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/channels/presentation/sections_archive.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/create_group_screen.dart';
import 'package:lawbid/features/groups/presentation/find_groups_screen.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/groups/presentation/group_info_screen.dart';
import 'package:lawbid/features/groups/presentation/group_invite_screen.dart';
import 'package:lawbid/features/groups/presentation/join_group_screen.dart';

/// Owner 2026-10-20: the routes of the group chats feature. `/group/new`
/// is declared before `/group/:id` so it is not read as an id.
List<RouteBase> groupRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: GroupRoutes.create,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const CreateGroupScreen()),
      ),
      GoRoute(
        path: GroupRoutes.archive,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const GroupsArchiveScreen()),
      ),
      GoRoute(
        path: GroupRoutes.find,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const FindGroupsScreen()),
      ),
      GoRoute(
        path: GroupRoutes.joinPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          JoinGroupScreen(code: state.pathParameters['code'] ?? ''),
        ),
      ),
      GoRoute(
        path: GroupRoutes.invitePattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          GroupInviteScreen(inviteId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: GroupRoutes.infoPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          GroupInfoScreen(groupId: state.pathParameters['id'] ?? ''),
        ),
      ),
      GoRoute(
        path: GroupRoutes.groupPattern,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          GroupConversationScreen(
            groupId: state.pathParameters['id'] ?? '',
            topicId: state.uri.queryParameters['topic'],
          ),
        ),
      ),
    ];
