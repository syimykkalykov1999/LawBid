import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/assistant_join_screen.dart';
import 'package:lawbid/features/team/presentation/task_editor_screen.dart';
import 'package:lawbid/features/team/presentation/tasks_tab.dart';
import 'package:lawbid/features/team/presentation/team_screen.dart';

/// OQ-048 routes: the attorney's Team, a new task, an assistant joining.
abstract final class TeamRoutes {
  static const team = '/team';
  static const newTask = '/tasks/new';

  /// Owner 2026-10-05: "+ Task" from a case or a chat — the new task is
  /// linked to it (a chat also brings its person).
  static String newTaskFor({
    String? caseId,
    String? caseTitle,
    String? chatId,
    String? chatTitle,
    String? personId,
    String? personName,
    String? personRole,
  }) =>
      Uri(
        path: newTask,
        queryParameters: {
          if (caseId != null) 'caseId': caseId,
          if (caseTitle != null) 'caseTitle': caseTitle,
          if (chatId != null) 'chatId': chatId,
          if (chatTitle != null) 'chatTitle': chatTitle,
          if (personId != null) 'personId': personId,
          if (personName != null) 'personName': personName,
          if (personRole != null) 'personRole': personRole,
        },
      ).toString();

  /// Owner 2026-10-05: the archive of finished tasks (the "removed soon"
  /// notice opens it).
  static const tasksArchive = '/tasks/archive';

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
        pageBuilder: (context, state) {
          final q = state.uri.queryParameters;
          final caseId = q['caseId'];
          final chatId = q['chatId'];
          final personName = q['personName'];
          return AppPageTransitions.modal(
            state,
            TaskEditorScreen(
              initialKind: q['kind'] == null ? null : TaskKind.parse(q['kind']),
              initialCase: caseId == null
                  ? null
                  : (id: caseId, title: q['caseTitle'] ?? ''),
              initialChat: chatId == null
                  ? null
                  : (id: chatId, title: q['chatTitle'] ?? ''),
              initialPeople: [
                if (personName != null && personName.isNotEmpty)
                  TaskPerson(
                    name: personName,
                    userId: q['personId'],
                    userRole: q['personRole'],
                  ),
              ],
            ),
          );
        },
      ),
      GoRoute(
        path: TeamRoutes.tasksArchive,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const TasksArchiveScreen()),
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
