// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/activity_list_envelope.dart';
import '../models/add_assistant_dto.dart';
import '../models/assistant_me_envelope.dart';
import '../models/assistant_request_envelope.dart';
import '../models/assistant_request_list_envelope.dart';
import '../models/assistant_request_status.dart';
import '../models/bulk_tasks_dto.dart';
import '../models/bulk_tasks_result_envelope.dart';
import '../models/create_assistant_request_dto.dart';
import '../models/create_task_dto.dart';
import '../models/decide_request_dto.dart';
import '../models/join_code_dto.dart';
import '../models/task_envelope.dart';
import '../models/task_list_envelope.dart';
import '../models/task_person_suggestion_list_envelope.dart';
import '../models/task_place_suggestion_list_envelope.dart';
import '../models/task_step_input_dto.dart';
import '../models/tasks_sort.dart';
import '../models/tasks_view.dart';
import '../models/team_envelope.dart';
import '../models/update_assistant_dto.dart';
import '../models/update_task_dto.dart';
import '../models/update_task_status_dto.dart';
import '../models/update_task_step_dto.dart';

part 'assistants_client.g.dart';

@RestApi()
abstract class AssistantsClient {
  factory AssistantsClient(Dio dio, {String? baseUrl}) = _AssistantsClient;

  /// The assistant's own team state
  @GET('/assistants/me')
  Future<AssistantMeEnvelope> getAssistantMe({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Join the attorney who added this phone
  @POST('/assistants/join/accept')
  Future<AssistantMeEnvelope> acceptAssistantInvite({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Join with the attorney's one-time code
  @POST('/assistants/join/code')
  Future<AssistantMeEnvelope> joinWithCode({
    @Body() required JoinCodeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Assistants, seats and duties
  @GET('/team')
  Future<TeamEnvelope> getTeam({@Extras() Map<String, dynamic>? extras});

  /// Add an assistant: takes a seat and gives it a one-time code
  @POST('/team')
  Future<TeamEnvelope> addAssistant({
    @Body() required AddAssistantDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A new one-time code for this seat (the old one stops working; for a joined assistant it signs them in on a new phone)
  @POST('/team/{id}/code')
  Future<TeamEnvelope> regenerateAssistantCode({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Rename an assistant or change their duties
  @PATCH('/team/{id}')
  Future<TeamEnvelope> updateAssistant({
    @Path('id') required String id,
    @Body() required UpdateAssistantDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove an assistant (access ends at once)
  @DELETE('/team/{id}')
  Future<TeamEnvelope> removeAssistant({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Everything the assistants did (hidden from them)
  @GET('/team/activity')
  Future<ActivityListEnvelope> getTeamActivity({
    @Query('membershipId') String? membershipId,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Assistant: ask the attorney to publish / apply something
  @POST('/team/requests')
  Future<AssistantRequestEnvelope> createAssistantRequest({
    @Body() required CreateAssistantRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approval requests (an assistant sees only their own)
  @GET('/team/requests')
  Future<AssistantRequestListEnvelope> listAssistantRequests({
    @Query('status') AssistantRequestStatus? status,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approve: published / applied as the attorney
  @POST('/team/requests/{id}/approve')
  Future<AssistantRequestEnvelope> approveAssistantRequest({
    @Path('id') required String id,
    @Body() required DecideRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reject an approval request
  @POST('/team/requests/{id}/reject')
  Future<AssistantRequestEnvelope> rejectAssistantRequest({
    @Path('id') required String id,
    @Body() required DecideRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set a task for the attorney
  @POST('/tasks')
  Future<TaskEnvelope> createTask({
    @Body() required CreateTaskDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The attorney's tasks (calendar order).
  ///
  /// [view] - `done` and `archive` both list the archive.
  ///
  /// [caseId] - Owner 2026-10-05: planner filters.
  ///
  /// [assignee] - An assistant membership id, `me` or `none`.
  ///
  /// [dueFrom] - Due from.
  ///
  /// [dueTo] - Due before.
  ///
  /// [overdue] - Only the ones past their time.
  ///
  /// [q] - Search the text.
  ///
  /// [mine] - Assistant: only the tasks they set (their Results).
  ///
  /// [from] - From this day (YYYY-MM-DD).
  @GET('/tasks')
  Future<TaskListEnvelope> listTasks({
    @Query('view') TasksView? view,
    @Query('caseId') String? caseId,
    @Query('assignee') String? assignee,
    @Query('dueFrom') DateTime? dueFrom,
    @Query('dueTo') DateTime? dueTo,
    @Query('overdue') bool? overdue,
    @Query('q') String? q,
    @Query('sort') TasksSort? sort,
    @Query('mine') bool? mine,
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Addresses already used in this planner
  @GET('/tasks/places')
  Future<TaskPlaceSuggestionListEnvelope> taskPlaces({
    @Extras() Map<String, dynamic>? extras,
  });

  /// People to add to a task (team, chats, contacts, attorneys)
  @GET('/tasks/people')
  Future<TaskPersonSuggestionListEnvelope> taskPeople({
    @Query('q') String? q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Many tasks at once: delete, archive, return, keep forever, assign, status, priority
  @POST('/tasks/bulk')
  Future<BulkTasksResultEnvelope> bulkTasks({
    @Body() required BulkTasksDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One task
  @GET('/tasks/{id}')
  Future<TaskEnvelope> getTask({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit a task
  @PATCH('/tasks/{id}')
  Future<TaskEnvelope> updateTask({
    @Path('id') required String id,
    @Body() required UpdateTaskDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a task (with its steps)
  @DELETE('/tasks/{id}')
  Future<void> deleteTask({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take / done / not done (+ note, + new time) / cancel
  @PATCH('/tasks/{id}/status')
  Future<TaskEnvelope> setTaskStatus({
    @Path('id') required String id,
    @Body() required UpdateTaskStatusDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a step to a task's checklist
  @POST('/tasks/{id}/steps')
  Future<TaskEnvelope> addTaskStep({
    @Path('id') required String id,
    @Body() required TaskStepInputDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Check a step off / move it to another time
  @PATCH('/tasks/{id}/steps/{stepId}')
  Future<TaskEnvelope> updateTaskStep({
    @Path('id') required String id,
    @Path('stepId') required String stepId,
    @Body() required UpdateTaskStepDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a step
  @DELETE('/tasks/{id}/steps/{stepId}')
  Future<TaskEnvelope> removeTaskStep({
    @Path('id') required String id,
    @Path('stepId') required String stepId,
    @Extras() Map<String, dynamic>? extras,
  });
}
