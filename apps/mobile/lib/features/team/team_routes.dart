import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/assistant_join_screen.dart';
import 'package:lawbid/features/team/presentation/task_editor_screen.dart';
import 'package:lawbid/features/team/presentation/team_screen.dart';

/// OQ-048 routes: the attorney's Team, a new task, an assistant joining.
abstract final class TeamRoutes {
  static const team = '/team';
  static const newTask = '/tasks/new';

  /// Owner 2026-10-01: edit a task (the TaskItem goes as `extra`).
  static const editTask = '/tasks/edit';
  static const assistantJoin = '/assistant/join';
}

List<RouteBase> teamRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: TeamRoutes.team,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const TeamScreen()),
      ),
      GoRoute(
        path: TeamRoutes.newTask,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.modal(
          state,
          TaskEditorScreen(
            initialKind: state.uri.queryParameters['kind'] == null
                ? null
                : TaskKind.parse(state.uri.queryParameters['kind']),
          ),
        ),
      ),
      GoRoute(
        path: TeamRoutes.editTask,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.modal(
          state,
          TaskEditorScreen(existing: state.extra as TaskItem?),
        ),
      ),
      GoRoute(
        path: TeamRoutes.assistantJoin,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const AssistantJoinScreen()),
      ),
    ];
