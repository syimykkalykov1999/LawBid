import 'package:flutter/widgets.dart';

import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/assistant_join_screen.dart';
import 'package:lawbid/features/team/presentation/assistant_roles_screen.dart';
import 'package:lawbid/features/team/presentation/planner_task_sheet.dart';
import 'package:lawbid/features/team/presentation/tasks_tab.dart';
import 'package:lawbid/features/team/presentation/team_screen.dart';

/// OQ-048 routes: the attorney's Team, a new task, an assistant joining.
abstract final class TeamRoutes {
  static const team = '/team';

  /// Owner 2026-10-22: «Роли помощников» — the 10 duties, open to every
  /// attorney (the Team tab's header).
  static const roles = '/team/roles';
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
        path: TeamRoutes.roles,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const AssistantRolesScreen()),
      ),
      GoRoute(
        path: TeamRoutes.newTask,
        parentNavigatorKey: root,
        pageBuilder: (context, state) {
          final q = state.uri.queryParameters;
          final caseId = q['caseId'];
          final chatId = q['chatId'];
          final personName = q['personName'];
          return _sheetPage(
            state,
            PlannerTaskSheetLauncher(
              caseId: caseId,
              caseTitle: q['caseTitle'],
              conversationId: chatId,
              people: [
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
        pageBuilder: (context, state) => _sheetPage(
          state,
          PlannerTaskSheetLauncher(
            editing: true,
            existing: state.extra is TaskItem ? state.extra! as TaskItem : null,
          ),
        ),
      ),
      GoRoute(
        path: TeamRoutes.assistantJoin,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const AssistantJoinScreen()),
      ),
    ];

/// Owner 2026-10-19: a new / edited planner task is the «Новая задача»
/// sheet: this page is see-through and only opens it over the page below.
Page<bool> _sheetPage(GoRouterState state, Widget child) =>
    CustomTransitionPage<bool>(
      key: state.pageKey,
      opaque: false,
      transitionDuration: Duration.zero,
      reverseTransitionDuration: Duration.zero,
      transitionsBuilder: (_, __, ___, child) => child,
      child: child,
    );
